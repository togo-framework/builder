package runner

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// These tests pin the one property that a prompt-carrying spawn must have:
// the prompt reaches the process on STDIN and appears NOWHERE in argv.
//
// The bug they exist to prevent shipped once already. `claude -p <prompt>` was
// spawned with the prompt as an argument, so a prompt that began with a dash was
// read as an option and the run died before it started:
//
//	error: unknown option '---'
//
// `---` is not an unusual thing for a prompt to begin with — it opens YAML
// frontmatter, so any skill file, doc or pasted snippet quoted into a prompt
// carries it. The tests below therefore lead with exactly that shape and then
// cover the neighbouring ones: a bare `--`, a lone `-`, newlines, quotes, shell
// metacharacters, and Arabic, because the chat this feeds is bilingual.
//
// No network and no real `claude`: a fake binary records its argv and its stdin
// and prints a canned terminal event, which is enough to assert both halves.

// nastyPrompts is the table. Every prompt carries the sentinel so a leak into
// argv can be spotted no matter which fragment leaked.
const promptSentinel = "SENTINEL_PROMPT_MARKER"

var nastyPrompts = []struct {
	name   string
	prompt string
}{
	{
		// The exact shape that broke production.
		name:   "yaml frontmatter",
		prompt: "---\ntitle: Fix the thing\n---\n\n" + promptSentinel + ": reply OK.",
	},
	{
		// Worse than unknown-option: as argv this is a real flag, so the CLI
		// would print its help text and exit 0 with no result to parse.
		name:   "leading double dash",
		prompt: "--help " + promptSentinel,
	},
	{
		// A lone dash means "stdin" to a great many CLIs.
		name:   "lone dash",
		prompt: "-\n" + promptSentinel + "\n- a bullet\n-",
	},
	{
		// Byte fidelity through the shell layer: quotes, metacharacters and a
		// command substitution that must survive as TEXT, not run.
		name:   "quotes and shell metacharacters",
		prompt: "it's a 'quoted' " + promptSentinel + "\n$(echo pwned) `whoami` \"x\" \\ | & ;\n--flag",
	},
	{
		// The chat is bilingual; RTL text is multi-byte and must arrive intact.
		name:   "arabic with frontmatter",
		prompt: "---\nالعنوان: اختبار\n---\n" + promptSentinel + " — راجع الكود وأجب بكلمة واحدة.\n",
	},
	{
		name:   "long prompt",
		prompt: "---\n" + promptSentinel + "\n" + strings.Repeat("طويل long padding line to push past any argv ceiling\n", 4000),
	},
}

// fakeClaude writes a stand-in for the CLI that records what it was given.
//
// It records argv one element per line and stdin verbatim, then prints a
// terminal `result` event so parseClaudeResult is satisfied and the caller's
// success path is exercised rather than its error path.
func fakeClaude(t *testing.T) (bin, argvPath, stdinPath string, env []string) {
	t.Helper()
	dir := t.TempDir()
	bin = filepath.Join(dir, "fake-claude")
	argvPath = filepath.Join(dir, "argv")
	stdinPath = filepath.Join(dir, "stdin")

	script := "#!/bin/sh\n" +
		": > \"$FAKE_ARGV\"\n" +
		"for a in \"$@\"; do printf '%s\\n' \"$a\" >> \"$FAKE_ARGV\"; done\n" +
		"cat > \"$FAKE_STDIN\"\n" +
		`printf '%s\n' '[{"type":"result","subtype":"success","is_error":false,"result":"ok","total_cost_usd":0}]'` + "\n"
	if err := os.WriteFile(bin, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}

	env = append(os.Environ(),
		"FAKE_ARGV="+argvPath,
		"FAKE_STDIN="+stdinPath,
	)
	return bin, argvPath, stdinPath, env
}

// assertPromptArrived is the shared assertion for both spawn paths.
func assertPromptArrived(t *testing.T, prompt, argvPath, stdinPath string) {
	t.Helper()

	got, err := os.ReadFile(stdinPath)
	if err != nil {
		t.Fatalf("the fake claude recorded no stdin at all: %v", err)
	}
	if string(got) != prompt {
		t.Errorf("stdin did not match the prompt byte for byte\n got %d bytes: %q\nwant %d bytes: %q",
			len(got), truncateForTest(string(got)), len(prompt), truncateForTest(prompt))
	}

	raw, err := os.ReadFile(argvPath)
	if err != nil {
		t.Fatalf("the fake claude recorded no argv: %v", err)
	}
	// The regression itself: any fragment of the prompt on the command line.
	if strings.Contains(string(raw), promptSentinel) {
		t.Errorf("prompt text leaked into argv — this is the bug:\n%s", truncateForTest(string(raw)))
	}
	for _, a := range strings.Split(strings.TrimRight(string(raw), "\n"), "\n") {
		if strings.HasPrefix(prompt, a) && len(a) > 2 {
			t.Errorf("argv element %q is a leading fragment of the prompt", a)
		}
	}
	// -p must survive the move; without it the CLI is not headless at all.
	if !strings.Contains("\n"+string(raw), "\n-p\n") {
		t.Errorf("-p is missing from argv:\n%s", raw)
	}
}

func truncateForTest(s string) string {
	if len(s) > 300 {
		return s[:300] + "…"
	}
	return s
}

// TestDirectRunPassesPromptOnStdin covers the fallback spawn.
func TestDirectRunPassesPromptOnStdin(t *testing.T) {
	for _, tc := range nastyPrompts {
		t.Run(tc.name, func(t *testing.T) {
			bin, argvPath, stdinPath, env := fakeClaude(t)
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			out, errText, err := directRun(ctx, t.TempDir(), env, tc.prompt, bin,
				[]string{"-p", "--output-format", "json", "--allowedTools", ""})
			if err != nil {
				t.Fatalf("directRun failed: %v (stderr: %s)", err, errText)
			}
			if _, perr := parseClaudeResult(out); perr != nil {
				t.Fatalf("stdout was not parsable: %v (%q)", perr, out)
			}
			assertPromptArrived(t, tc.prompt, argvPath, stdinPath)
		})
	}
}

// TestTmuxRunPassesPromptOnStdin covers the detached spawn, which is the one
// with no stdin to write to after the fact.
func TestTmuxRunPassesPromptOnStdin(t *testing.T) {
	if _, err := tmuxPath(); err != nil {
		t.Skipf("tmux unavailable: %v", err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	for i, tc := range nastyPrompts {
		t.Run(tc.name, func(t *testing.T) {
			bin, argvPath, stdinPath, env := fakeClaude(t)
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()

			name := TmuxSessionName(int64(900000+i), 1)
			out, errText, err, ok := tmuxRun(ctx, log, name, t.TempDir(), env, tc.prompt, bin,
				[]string{"-p", "--output-format", "json", "--allowedTools", ""})
			if !ok {
				t.Skip("tmux refused the run; the direct path covers this case")
			}
			if err != nil {
				t.Fatalf("tmuxRun failed: %v (stderr: %s)", err, errText)
			}
			if _, perr := parseClaudeResult(out); perr != nil {
				t.Fatalf("stdout was not parsable: %v (%q)", perr, out)
			}
			assertPromptArrived(t, tc.prompt, argvPath, stdinPath)
		})
	}
}

// TestSessionRunPassesPromptOnStdin exercises the wiring in Run itself, so a
// future edit that rebuilds args cannot put the prompt back without failing.
func TestSessionRunPassesPromptOnStdin(t *testing.T) {
	bin, argvPath, stdinPath, _ := fakeClaude(t)
	t.Setenv("BUILDER_CLAUDE_BIN", bin)
	t.Setenv("FAKE_ARGV", argvPath)
	t.Setenv("FAKE_STDIN", stdinPath)

	prompt := "---\ntitle: frontmatter\n---\n" + promptSentinel + " — رد بكلمة OK."
	res, err := Session{
		Dir:          t.TempDir(),
		Prompt:       prompt,
		AllowedTools: "",
		MaxTurns:     1,
		Timeout:      60 * time.Second,
		Log:          slog.New(slog.NewTextHandler(io.Discard, nil)),
	}.Run(context.Background())
	if err != nil {
		t.Fatalf("Run failed: %v (raw: %q)", err, truncateForTest(res.Raw))
	}
	if res.Text != "ok" {
		t.Fatalf("result text = %q, want \"ok\"", res.Text)
	}
	assertPromptArrived(t, prompt, argvPath, stdinPath)
}

// TestLiveClaudeAcceptsADashLeadingPrompt is the proof against the real CLI.
//
// Skipped unless BUILDER_LIVE_CLAUDE=1, because it spends money and needs
// working auth — neither belongs in a default `go test ./...`. It is here
// because the fake binary above proves the plumbing and nothing else: whether
// `claude -p` really reads stdin is a fact about the CLI, and the only honest
// way to know it still holds after a CLI upgrade is to ask the CLI.
//
// Which path it exercises follows BUILDER_TMUX, so run it twice to cover both:
//
//	BUILDER_LIVE_CLAUDE=1 go test ./internal/runner -run LiveClaude -v
//	BUILDER_LIVE_CLAUDE=1 BUILDER_TMUX=0 go test ./internal/runner -run LiveClaude -v
func TestLiveClaudeAcceptsADashLeadingPrompt(t *testing.T) {
	if os.Getenv("BUILDER_LIVE_CLAUDE") != "1" {
		t.Skip("set BUILDER_LIVE_CLAUDE=1 to run this against the real CLI (costs money)")
	}
	// The prompt opens with YAML frontmatter, contains a bare `--`, a lone `-`,
	// newlines and Arabic — every shape that used to be unspawnable.
	prompt := "---\ntitle: regression\n---\n\n" +
		"- a bullet\n--\n" +
		"أجب بكلمة واحدة فقط. Reply with the single word: OK\n"

	res, err := Session{
		Dir:          t.TempDir(),
		Prompt:       prompt,
		Model:        "haiku",
		AllowedTools: "",
		MaxTurns:     1,
		Timeout:      3 * time.Minute,
		Log:          slog.New(slog.NewTextHandler(os.Stderr, nil)),
	}.Run(context.Background())
	if err != nil {
		t.Fatalf("the real claude rejected the prompt: %v", err)
	}
	if res.IsError {
		t.Fatalf("claude reported an error result: %q", res.Text)
	}
	path := "direct"
	if res.TmuxSession != "" {
		path = "tmux(" + res.TmuxSession + ")"
	}
	t.Logf("path=%s cost=$%.4f turns=%d text=%q", path, res.CostUSD, res.NumTurns, res.Text)
	if !strings.Contains(strings.ToUpper(res.Text), "OK") {
		t.Fatalf("the model did not answer; got %q", res.Text)
	}
}

// TestRunScriptKeepsPromptOffTheCommandLine reads the generated shell directly.
//
// The other tests prove the prompt ARRIVES; this one proves it does not also
// travel somewhere it should not. The script is world-visible for the life of
// the run and is echoed into a pane any local user can attach to, so a prompt
// pasted into it would be the `ps` leak in a different costume.
func TestRunScriptKeepsPromptOffTheCommandLine(t *testing.T) {
	promptPath := "/tmp/builder-tmux/x/prompt"
	sh := runScript("/tmp/x/env.sh", "/tmp/x/rc", "/tmp/x/stdout", "/tmp/x/stderr",
		promptPath, "claude", []string{"-p", "--output-format", "json"})

	if strings.Contains(sh, promptSentinel) {
		t.Error("the sentinel is not even passed to runScript; this test is wrong")
	}
	// The redirect must attach to claude inside the group, ahead of the exit-code
	// capture — outside it, it would be the group's stdin and the tee pipeline's
	// shape would change. Searched from the group onwards, because the header
	// line legitimately reads the same file to report its size.
	cmdIdx := strings.Index(sh, "{ 'claude'")
	if cmdIdx < 0 {
		t.Fatalf("the command group is not where this test expects it:\n%s", sh)
	}
	rest := sh[cmdIdx:]
	redirIdx := strings.Index(rest, "< '"+promptPath+"'")
	rcIdx := strings.Index(rest, `"$?"`)
	if redirIdx < 0 {
		t.Errorf("the prompt file is not redirected into the command:\n%s", sh)
	} else if rcIdx < redirIdx {
		t.Errorf("the redirect lands after the exit-code capture (redirect=%d rc=%d):\n%s",
			redirIdx, rcIdx, sh)
	}
	if !strings.Contains(sh, "rm -f '"+promptPath+"'") {
		t.Errorf("the prompt file is never removed:\n%s", sh)
	}
	// The stdout/stderr split the parser depends on must be untouched.
	if !strings.Contains(sh, "2>&1 1>'/tmp/x/stdout' | tee '/tmp/x/stderr'") {
		t.Errorf("the stream split was altered:\n%s", sh)
	}
}
