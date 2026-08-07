package runner

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// Publishing an agent's branch: push, then open a pull request.
//
// This is the ONLY outward-facing thing the loop does. Everything else —
// worktree, diff, commit — stays on the operator's disk and can be thrown away
// with `git worktree remove`. A push cannot be taken back: it reaches a remote,
// it can trigger CI, it can notify reviewers, and on a public repository it is
// permanent even after a force-delete.
//
// So it is off unless the operator turns it on (BUILDER_OPEN_PR=1), and every
// function here refuses rather than guesses when something is ambiguous.

// PublishResult is what the operator gets back. Pushed can be true while URL is
// empty: the branch reached the remote but `gh` could not open the PR. Those are
// genuinely different states and the caller reports them differently — a branch
// on the remote with no PR still needs a human to know it is there.
type PublishResult struct {
	Pushed bool
	URL    string
	Number int
}

// Push sends the branch to the remote.
//
// --force-with-lease, never --force: if someone else moved the branch since we
// last saw it, this fails instead of overwriting their work. For a branch the
// agent just created the distinction rarely matters; on a retry of an issue
// whose branch a human has already edited, it is the difference between a
// failed push and lost work.
func (w *Workspace) Push(ctx context.Context, remote, branch string) error {
	if remote == "" {
		remote = "origin"
	}
	if _, err := git(ctx, w.Dir, "remote", "get-url", remote); err != nil {
		return fmt.Errorf("no remote %q is configured", remote)
	}
	out, err := git(ctx, w.Dir, "push", "--force-with-lease", "-u", remote, branch)
	if err != nil {
		return fmt.Errorf("push %s: %w", branch, err)
	}
	_ = out
	return nil
}

// OpenPR creates the pull request with gh and returns its URL and number.
//
// The body is passed via a file rather than -b: a verdict containing backticks,
// $(...) or a newline is ordinary prose from a model, and interpolating it into
// a shell would make an agent's summary able to run commands. exec.Command does
// not use a shell, but the file also sidesteps ARG_MAX on a long diff summary.
func OpenPR(ctx context.Context, dir, base, branch, title, body string) (PublishResult, error) {
	var res PublishResult

	f, err := os.CreateTemp("", "builder-pr-*.md")
	if err != nil {
		return res, fmt.Errorf("pr body: %w", err)
	}
	defer os.Remove(f.Name())
	if _, err := f.WriteString(body); err != nil {
		f.Close()
		return res, fmt.Errorf("pr body: %w", err)
	}
	f.Close()

	args := []string{"pr", "create", "--head", branch, "--title", title, "--body-file", f.Name()}
	if base != "" {
		args = append(args, "--base", base)
	}

	cctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "gh", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GH_PROMPT_DISABLED=1", "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		return res, fmt.Errorf("gh pr create: %s", orEmpty(firstLine(text)))
	}

	res.URL = lastURL(text)
	res.Number = prNumber(res.URL)
	if res.URL == "" {
		// gh exited 0 without printing a URL. Report the raw output rather than
		// inventing success — a PR we cannot link to is not a usable result.
		return res, fmt.Errorf("gh pr create printed no URL: %s", orEmpty(firstLine(text)))
	}
	return res, nil
}

// DefaultBase asks the remote which branch a PR should target.
//
// Hardcoding "main" is wrong on any repo that uses master, develop or trunk,
// and a PR opened against a branch that does not exist fails late and
// confusingly. Falls back to the local HEAD's upstream, then to main.
func DefaultBase(ctx context.Context, dir string) string {
	if out, err := git(ctx, dir, "symbolic-ref", "refs/remotes/origin/HEAD"); err == nil {
		if s := strings.TrimSpace(out); s != "" {
			if i := strings.LastIndex(s, "/"); i >= 0 {
				return s[i+1:]
			}
		}
	}
	for _, guess := range []string{"main", "master"} {
		if _, err := git(ctx, dir, "rev-parse", "--verify", "origin/"+guess); err == nil {
			return guess
		}
	}
	return "main"
}

// GHReady reports whether gh exists AND is authenticated.
//
// Checked before pushing, not before opening the PR: discovering that gh is not
// logged in AFTER the branch is already on the remote leaves a dangling branch
// nobody asked for.
func GHReady(ctx context.Context) error {
	if _, err := exec.LookPath("gh"); err != nil {
		return fmt.Errorf("gh is not installed")
	}
	cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "gh", "auth", "status")
	cmd.Env = append(os.Environ(), "GH_PROMPT_DISABLED=1")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("gh is not authenticated: %s", orEmpty(firstLine(string(out))))
	}
	return nil
}

// orEmpty keeps a bare error message readable when a command fails silently.
// firstLine already lives in this package (preflight.go).
func orEmpty(s string) string {
	if s == "" {
		return "no output"
	}
	return s
}

// lastURL picks the PR URL out of gh's output. gh prints warnings to the same
// stream, so the URL is not reliably the first token — the last http(s) URL is.
func lastURL(s string) string {
	var found string
	for _, f := range strings.Fields(s) {
		if strings.HasPrefix(f, "https://") || strings.HasPrefix(f, "http://") {
			found = strings.TrimRight(f, ".,)")
		}
	}
	return found
}

func prNumber(url string) int {
	i := strings.LastIndex(url, "/")
	if i < 0 {
		return 0
	}
	n, err := strconv.Atoi(url[i+1:])
	if err != nil {
		return 0
	}
	return n
}
