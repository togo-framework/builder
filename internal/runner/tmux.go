package runner

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// This file makes every agent run watchable.
//
// A headless `claude -p` is a black box: the operator sees a verdict minutes
// later and has no way to look at the work while it happens. So the process is
// spawned inside a tmux session with a name the operator can guess —
// `builder-issue-<number>-<attempt>` — and `tmux attach -t <name>` shows the
// run live.
//
// The wrapper is a WRAPPER, not a rewrite: stdout still has to be parsed for
// the terminal JSON event, and the exit status still has to be observed. tmux
// gives neither, because the process it starts is a grandchild of a server we
// do not own. So the pane runs a small POSIX script that captures stdout,
// stderr and the exit code to files, and the Go side polls for the exit-code
// file. `rc` appears only after the pipeline has drained, so its presence is
// the completion signal AND the guarantee that the output files are whole.
//
// tmux is OPTIONAL. Missing tmux, a tmux that fails to start a session, a
// pane that dies without writing rc — every one of those falls back to (or
// reports through) the direct spawn that existed before. An agent run must
// never fail because a terminal multiplexer is not installed.

// sessionNameRE constrains what may be handed to tmux as a target.
//
// A tmux target is parsed: `:` selects a window, `.` a pane, and a name
// containing either addresses something other than the session we meant.
// Beyond that it reaches a command line, and although exec.Command never uses
// a shell, the name is also pasted by an operator into one — so it is kept to
// characters that mean nothing to any shell. Deliberately the same shape the
// term package enforces on operator-created sessions.
var sessionNameRE = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,40}$`)

// TmuxSessionName builds the deterministic name for an issue run.
//
// Deterministic on purpose: an operator watching issue 412's second attempt
// can type the name without looking it up. Unique on purpose too — the attempt
// number is part of it, and an issue is only ever claimed by one runner at a
// time, so two live sessions cannot collide.
func TmuxSessionName(issue int64, attempt int) string {
	if attempt < 1 {
		attempt = 1
	}
	return fmt.Sprintf("builder-issue-%d-%d", issue, attempt)
}

// ReapTmuxSession kills a session left behind by a run this process did not
// finish.
//
// The one leak the kill-on-completion policy cannot close by itself is a
// builder that dies mid-run: the tmux server outlives it and keeps the session,
// and nothing in the finished-run path ever executes. The reconciler, which
// already adopts those orphans to expire their rows and remove their worktrees,
// calls this to reap the session too.
//
// Silent when tmux is absent or the session is already gone. Both are the
// normal case, not a fault.
func ReapTmuxSession(log *slog.Logger, name string) {
	if name == "" || !sessionNameRE.MatchString(name) {
		return
	}
	tmux, err := tmuxPath()
	if err != nil {
		return
	}
	if log == nil {
		log = slog.Default()
	}
	killTmuxSession(log, tmux, name, 0)
}

// tmuxState caches the tmux lookup for the life of the process.
//
// Detected ONCE, as the spec requires: an exec.LookPath per run would be a
// pointless syscall on every dispatch, and — worse — a fleet with no tmux would
// log the same warning a hundred times an hour and bury everything else.
var tmuxState struct {
	once sync.Once
	bin  string
	err  error
}

func tmuxPath() (string, error) {
	tmuxState.once.Do(func() {
		if os.Getenv("BUILDER_TMUX") == "0" {
			tmuxState.err = errors.New("disabled by BUILDER_TMUX=0")
			return
		}
		tmuxState.bin, tmuxState.err = exec.LookPath("tmux")
	})
	return tmuxState.bin, tmuxState.err
}

// tmuxLinger is how long a finished session is kept for post-mortem reading.
//
// Zero — kill on completion — is the default, and the reasoning is in the
// package docs above the kill call. An operator who wants to read the pane
// after the fact sets BUILDER_TMUX_LINGER to a number of seconds.
func tmuxLinger() time.Duration {
	n, err := strconv.Atoi(strings.TrimSpace(os.Getenv("BUILDER_TMUX_LINGER")))
	if err != nil || n <= 0 {
		return 0
	}
	if n > 3600 {
		n = 3600 // an hour is already generous; beyond it this is a leak
	}
	return time.Duration(n) * time.Second
}

// sessionLabel resolves the tmux name for a session, generating one when the
// caller did not care.
//
// Every call site gets a session, including the short classification runs that
// have no issue number, because "every running task must be over tmux" is the
// requirement and a per-call-site opt-in would silently miss the next one
// somebody adds.
func (s Session) sessionLabel() string {
	if n := strings.TrimSpace(s.TmuxSession); n != "" && sessionNameRE.MatchString(n) {
		return n
	}
	// The run id is a UUID, so its first eight hex characters are unique enough
	// to name a session and short enough to type. An empty id (the ad-hoc calls
	// that do not mint one) gets randomness instead — never a fixed name, which
	// two concurrent runs would fight over.
	suffix := strings.Map(func(r rune) rune {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			return r
		}
		return -1
	}, s.ID)
	if len(suffix) >= 8 {
		return "builder-run-" + suffix[:8]
	}
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Never fatal: a clock-derived suffix is worse but still unique enough
		// for a name, and no run should fail because the CSPRNG hiccuped.
		return "builder-run-" + strconv.FormatInt(time.Now().UnixNano()%1e8, 16)
	}
	return "builder-run-" + hex.EncodeToString(b[:])
}

// tmuxRun executes cmdline inside a tmux session and returns stdout, stderr and
// the command's exit status.
//
// ok is false when tmux could not be used at all, which tells Run to spawn
// directly instead. An error with ok=true is a real failure of the wrapped
// command (or of the run itself) and is reported as such.
func tmuxRun(ctx context.Context, log *slog.Logger, name, dir string, env []string,
	bin string, args []string) (stdout, stderr string, exitErr error, ok bool) {

	tmux, err := tmuxPath()
	if err != nil {
		log.Info("tmux unavailable — agent runs will not be attachable",
			"err", err, "hint", "install tmux to watch runs with: tmux attach -t <session>")
		return "", "", nil, false
	}
	if !sessionNameRE.MatchString(name) {
		log.Warn("refusing an unusable tmux session name; running directly", "name", name)
		return "", "", nil, false
	}

	// One directory per run holds the script, the captured streams and the
	// exit-code marker. 0o700 because the env file inside it is the process
	// environment, which on this machine includes credentials.
	root := filepath.Join(os.TempDir(), "builder-tmux")
	runDir := filepath.Join(root, name)
	_ = os.RemoveAll(runDir) // a leftover from a crashed run of the same name
	if err := os.MkdirAll(runDir, 0o700); err != nil {
		log.Warn("could not create the tmux run directory; running directly", "err", err)
		return "", "", nil, false
	}
	defer func() { _ = os.RemoveAll(runDir) }()

	outPath := filepath.Join(runDir, "stdout")
	errPath := filepath.Join(runDir, "stderr")
	rcPath := filepath.Join(runDir, "rc")
	envPath := filepath.Join(runDir, "env.sh")
	shPath := filepath.Join(runDir, "run.sh")

	// The environment travels in a FILE, not in `tmux -e` flags and not on the
	// command line.
	//
	// It has to travel somehow: a tmux session inherits the environment of the
	// SERVER, and the server may have been started minutes ago by the dashboard
	// terminal or by the operator's own shell. Anything this process was given
	// that the server was not — an API key from a .env file, a PATH entry that
	// finds `claude` — would simply be absent inside the pane, and the run would
	// fail with an auth error that has nothing to do with the change that caused
	// it.
	//
	// A file rather than argv because argv is world-readable through `ps` for
	// as long as the command runs. The file is 0o600 inside a 0o700 directory
	// and the script's SECOND act is to delete it, so it exists for about as
	// long as it takes `.` to read it.
	if err := os.WriteFile(envPath, []byte(envScript(env)), 0o600); err != nil {
		log.Warn("could not write the tmux env file; running directly", "err", err)
		return "", "", nil, false
	}
	if err := os.WriteFile(shPath, []byte(runScript(envPath, rcPath, outPath, errPath, bin, args)), 0o700); err != nil {
		log.Warn("could not write the tmux run script; running directly", "err", err)
		return "", "", nil, false
	}

	// -d: detached. Nothing is attached yet and nothing needs to be — the point
	// is that the operator MAY attach, not that anyone is watching.
	//
	// The tmux client inherits this process's environment, so if no server is
	// running yet the one this starts gets the right global environment too.
	start := exec.CommandContext(ctx, tmux, "new-session", "-d", "-s", name, "-c", dir, "--", "/bin/sh", shPath)
	start.Env = env
	if out, err := start.CombinedOutput(); err != nil {
		// A failure here is not the run's failure. Report it and let the caller
		// spawn directly — an unusable multiplexer must not cost a run.
		log.Warn("could not start the tmux session; running directly",
			"session", name, "err", err, "out", firstLine(string(out)))
		return "", "", nil, false
	}
	log.Info("agent run started in tmux", "session", name, "attach", "tmux attach -t "+name)

	waitErr := waitForRC(ctx, tmux, name, rcPath)

	// Read the streams BEFORE the session is torn down. They are ordinary files
	// so the pane's death does not remove them, but the deferred RemoveAll does.
	stdout = readFileString(outPath)
	stderr = readFileString(errPath)

	killTmuxSession(log, tmux, name, tmuxLinger())

	if waitErr != nil {
		return stdout, stderr, waitErr, true
	}

	code := exitCode(rcPath)
	if code != 0 {
		// Shaped like exec.ExitError's message so callers that only print it read
		// the same as they did before this wrapper existed.
		return stdout, stderr, fmt.Errorf("exit status %d", code), true
	}
	return stdout, stderr, nil, true
}

// waitForRC blocks until the run has finished, the context is done, or the
// session has disappeared without leaving a result.
//
// The session dying is checked as well as the marker file because otherwise a
// tmux server that was killed out from under us would hang the caller until its
// ten-minute timeout, with nothing running and nothing to wait for.
func waitForRC(ctx context.Context, tmux, name, rcPath string) error {
	t := time.NewTicker(250 * time.Millisecond)
	defer t.Stop()
	gone := false
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.C:
			if fileExists(rcPath) {
				return nil
			}
			if sessionLive(tmux, name) {
				gone = false
				continue
			}
			// One more tick before believing it: the pane exits the instant the
			// script's last line runs, so "session gone, rc not visible yet" is a
			// normal race rather than a failure.
			if !gone {
				gone = true
				continue
			}
			if fileExists(rcPath) {
				return nil
			}
			return fmt.Errorf("tmux session %s ended without a result", name)
		}
	}
}

// sessionLive answers whether tmux still has the session.
//
// A short timeout of its own, detached from the run's context: this is a
// liveness probe, and it must still answer after the run's context has been
// cancelled so the teardown path can tell "finished" from "killed".
func sessionLive(tmux, name string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, tmux, "has-session", "-t", "="+name).Run() == nil
}

// killTmuxSession is the cleanup policy, in one place.
//
// KILL ON COMPLETION, with an opt-in linger.
//
// The alternative — retain every finished session — was rejected because the
// session list is the discovery mechanism. An operator finds the run they want
// by name in `tmux ls`; a hundred dead sessions from this morning's dispatches
// make the one live session impossible to spot, which breaks the very thing the
// feature exists for. The run's output is not lost either way: stdout, the
// verdict, the cost and the error are all persisted on the run row.
//
// BUILDER_TMUX_LINGER=<seconds> keeps the session for post-mortem reading. The
// delayed kill is deliberately fire-and-forget on a background context; if the
// builder exits first the session outlives it, and the next run with the same
// deterministic name clears it before starting (see the RemoveAll and the
// `-s` reuse above).
func killTmuxSession(log *slog.Logger, tmux, name string, linger time.Duration) {
	kill := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		// "=" anchors the target to an exact name. Without it tmux matches by
		// prefix, so killing `builder-issue-4-1` could kill `builder-issue-4-10`.
		if out, err := exec.CommandContext(ctx, tmux, "kill-session", "-t", "="+name).CombinedOutput(); err != nil {
			// Already gone is the common case — the pane's process exiting ends
			// the session on its own. Not worth more than a debug line.
			log.Debug("tmux session already gone", "session", name, "out", firstLine(string(out)))
			return
		}
		log.Info("tmux session reaped", "session", name)
	}
	if linger <= 0 {
		kill()
		return
	}
	log.Info("tmux session retained for post-mortem", "session", name, "for", linger)
	time.AfterFunc(linger, kill)
}

// runScript is the POSIX shell the pane runs.
//
// The redirection is the interesting part:
//
//	{ cmd; echo $? >rc.tmp; } 2>&1 1>stdout | tee stderr
//
// Inside the group, `2>&1` points stderr at the group's stdout — the pipe —
// and only THEN does `1>stdout` send stdout to a file. So stdout is captured
// cleanly for the JSON parser, while stderr goes through tee: written to a file
// AND drawn in the pane, live. That split is the whole point. Sending both to
// the pane would be friendlier to watch but would interleave progress chatter
// into the payload, and parseClaudeResult scans for the first line that starts
// a JSON value — one stray `{` on stderr and the run's verdict is unreadable.
//
// The exit code is captured inside the group so `$?` is the command's, not
// tee's, and is moved into place only after the pipeline has drained. The Go
// side waits on that file, so seeing it means every byte is on disk.
func runScript(envPath, rcPath, outPath, errPath, bin string, args []string) string {
	var b strings.Builder
	b.WriteString("#!/bin/sh\n")
	b.WriteString(". " + shQuote(envPath) + "\n")
	b.WriteString("rm -f " + shQuote(envPath) + "\n")
	// A header, because an operator attaching to a bare pane cannot tell which
	// run they are looking at. Printed before anything else so it survives at
	// the top of the scrollback.
	b.WriteString("printf '%s\\n' '── builder agent run ──────────────────────────────'\n")
	b.WriteString("printf 'cmd: %s\\n' " + shQuote(bin+" "+strings.Join(args, " ")) + " | cut -c1-400\n")
	b.WriteString("printf 'dir: %s\\n' \"$PWD\"\n")
	b.WriteString("printf '%s\\n' 'stderr is streamed below; stdout is captured for the runner.'\n")
	b.WriteString("printf '%s\\n' '──────────────────────────────────────────────────'\n")

	b.WriteString("{ " + shQuote(bin))
	for _, a := range args {
		b.WriteString(" " + shQuote(a))
	}
	b.WriteString("; printf '%s\\n' \"$?\" > " + shQuote(rcPath+".tmp") + "; }")
	b.WriteString(" 2>&1 1>" + shQuote(outPath) + " | tee " + shQuote(errPath) + "\n")
	b.WriteString("mv -f " + shQuote(rcPath+".tmp") + " " + shQuote(rcPath) + "\n")
	return b.String()
}

// envScript renders an environment as sourceable shell.
//
// Anything without a usable name is dropped rather than escaped: a variable
// whose name is not a shell identifier cannot be exported by `export` anyway,
// and inventing a way to smuggle it through would be inventing an injection.
func envScript(env []string) string {
	var b strings.Builder
	for _, kv := range env {
		i := strings.IndexByte(kv, '=')
		if i <= 0 {
			continue
		}
		name, val := kv[:i], kv[i+1:]
		if !validEnvName(name) {
			continue
		}
		b.WriteString("export " + name + "=" + shQuote(val) + "\n")
	}
	return b.String()
}

func validEnvName(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c == '_':
		case c >= '0' && c <= '9' && i > 0:
		default:
			return false
		}
	}
	return s != ""
}

// shQuote wraps a value in single quotes, which suppress every shell
// expansion, and closes/reopens them around any embedded quote. The result is
// safe for any byte sequence, including newlines — which prompts contain.
func shQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func readFileString(p string) string {
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	return string(b)
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// exitCode reads the marker. An unreadable or nonsense marker is reported as a
// failure rather than as success — the one thing that must never happen is a
// broken capture being mistaken for a clean run.
func exitCode(p string) int {
	s := strings.TrimSpace(readFileString(p))
	n, err := strconv.Atoi(s)
	if err != nil {
		return 1
	}
	return n
}
