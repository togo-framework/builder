package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"time"
)

// Session is one headless Claude Code invocation.
type Session struct {
	// ID is minted by us and passed as --session-id, so the mapping from a
	// database row to a running process exists BEFORE the process does. A crash
	// between spawn and first write still leaves a row that can be reconciled.
	ID string
	// Dir is the working tree. For an implement run this is a git worktree
	// isolated from the operator's checkout.
	Dir string
	// Prompt is the full instruction. Untrusted content inside it must already
	// be wrapped by the caller — see orchestrator.wrapUntrusted.
	Prompt string
	// Model: haiku | sonnet | opus. Empty inherits the CLI default.
	Model string
	// AllowedTools restricts the surface. Empty string means NO tools, which is
	// what a classification pass wants.
	AllowedTools string
	// MaxTurns bounds a runaway loop.
	MaxTurns int
	// PermissionMode: acceptEdits for implement runs. Never bypassPermissions.
	PermissionMode string
	Timeout        time.Duration
	// Env is extra environment for the session, as "KEY=value".
	//
	// This is how the control plane tells the in-session guard hooks what the
	// operator configured. Without it the hooks read .claude/autonomy.yaml and
	// nothing else, so a ceiling edited in the agent settings UI had no effect
	// inside the run — the two disagreed and the file silently won.
	Env []string
	// TmuxSession is the name of the tmux session the run is spawned inside, so
	// an operator can `tmux attach -t <name>` and watch the work happen.
	//
	// Empty means "name it for me" — every run gets a session, because the
	// requirement is that every running task is attachable and a per-call-site
	// opt-in would silently miss whichever call site is added next. Set it
	// explicitly where the name should be GUESSABLE: an issue run uses
	// TmuxSessionName(number, attempt) so the operator can type it from the
	// board without looking anything up.
	TmuxSession string
	// Log is where the tmux wrapper reports. nil takes slog.Default().
	Log *slog.Logger
}

// Result is the terminal `result` event plus what we derived from it.
type Result struct {
	Text         string  `json:"text"`
	IsError      bool    `json:"is_error"`
	Subtype      string  `json:"subtype"`
	CostUSD      float64 `json:"cost_usd"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	NumTurns     int     `json:"num_turns"`
	DurationMS   int64   `json:"duration_ms"`
	SessionID    string  `json:"session_id"`
	// TmuxSession is the session the run actually executed in, or empty when
	// tmux was unavailable and the process was spawned directly. Returned so a
	// caller that did not choose the name can still persist and display it.
	TmuxSession string        `json:"tmux_session,omitempty"`
	Raw         string        `json:"-"`
	Took        time.Duration `json:"-"`
}

type rawEvent struct {
	Type       string  `json:"type"`
	Subtype    string  `json:"subtype"`
	IsError    bool    `json:"is_error"`
	Result     string  `json:"result"`
	DurationMS int64   `json:"duration_ms"`
	NumTurns   int     `json:"num_turns"`
	TotalCost  float64 `json:"total_cost_usd"`
	SessionID  string  `json:"session_id"`
	Usage      struct {
		InputTokens  int64 `json:"input_tokens"`
		OutputTokens int64 `json:"output_tokens"`
	} `json:"usage"`
}

// Run executes the session and returns its terminal result.
//
// Never passes --bare: it refuses OAuth entirely and accepts only an API key,
// so it is incompatible with the subscription auth the preflight verifies. A
// working machine would look broken.
func (s Session) Run(ctx context.Context) (Result, error) {
	if s.Timeout == 0 {
		s.Timeout = 10 * time.Minute
	}
	ctx, cancel := context.WithTimeout(ctx, s.Timeout)
	defer cancel()

	// The prompt travels on STDIN, never in argv.
	//
	// `claude -p <prompt>` parses the prompt as an option when it begins with a
	// dash, and a prompt beginning with `---` is not exotic — YAML frontmatter
	// starts that way, so every skill file, doc and pasted snippet carries it.
	// The operator-visible symptom was `error: unknown option '---'` and a run
	// that died before it began. `-p` reads the prompt from stdin when stdin is
	// piped, so the flag stays and the text leaves argv entirely.
	//
	// Two things fall out of that for free, and both are worth keeping:
	// argv is no longer bounded by ARG_MAX, so a long prompt cannot fail to
	// spawn; and the prompt no longer appears in `ps`, where until now the full
	// instruction of every running agent was readable by any local user.
	args := []string{"-p", "--output-format", "json"}
	if s.ID != "" {
		args = append(args, "--session-id", s.ID)
	}
	if s.Model != "" {
		args = append(args, "--model", s.Model)
	}
	// An empty AllowedTools is meaningful — it means "no tools at all" — so it
	// is always passed rather than treated as unset.
	args = append(args, "--allowedTools", s.AllowedTools)
	if s.MaxTurns > 0 {
		args = append(args, "--max-turns", fmt.Sprint(s.MaxTurns))
	}
	if s.PermissionMode != "" {
		args = append(args, "--permission-mode", s.PermissionMode)
	}

	log := s.Log
	if log == nil {
		log = slog.Default()
	}
	dir := s.Dir
	if dir == "" {
		// tmux needs a real start directory, and the process used to inherit
		// this one implicitly.
		if wd, err := os.Getwd(); err == nil {
			dir = wd
		}
	}
	env := append(append(os.Environ(), "NO_COLOR=1", "CLICOLOR=0"), s.Env...)

	// tmux FIRST, direct spawn as the fallback. The two paths agree on their
	// contract — stdout, stderr, and an error that is non-nil exactly when the
	// command failed — so everything below this block is shared.
	name := s.sessionLabel()
	start := time.Now()
	out, errText, err, viaTmux := tmuxRun(ctx, log, name, dir, env, s.Prompt, claudeBin(), args)
	if !viaTmux {
		name = ""
		out, errText, err = directRun(ctx, dir, env, s.Prompt, claudeBin(), args)
	}
	took := time.Since(start)

	res, perr := parseClaudeResult(out)
	if perr != nil {
		if err != nil {
			return Result{Raw: out, Took: took, TmuxSession: name},
				fmt.Errorf("claude failed: %w: %s", err, firstLine(errText))
		}
		return Result{Raw: out, Took: took, TmuxSession: name},
			fmt.Errorf("unparsable response: %w", perr)
	}

	return Result{
		Text:        res.Result,
		IsError:     res.IsError,
		Subtype:     res.Subtype,
		CostUSD:     res.TotalCostUSD,
		NumTurns:    res.NumTurns,
		DurationMS:  res.DurationMS,
		SessionID:   res.SessionID,
		TmuxSession: name,
		Raw:         out,
		Took:        took,
	}, nil
}

// directRun is the pre-tmux spawn, kept intact as the fallback path.
//
// stdin is the prompt. It is the easy half of the stdin move: an
// exec.Cmd takes a reader and the kernel hands it to the child as fd 0, with
// no file, no shell and no race. The tmux half is the interesting one — see
// tmuxRun.
func directRun(ctx context.Context, dir string, env []string, stdin, bin string, args []string) (string, string, error) {
	cmd := exec.CommandContext(ctx, bin, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Env = env
	cmd.Stdin = strings.NewReader(stdin)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

// JSON extracts a JSON object from the model's text.
//
// Models wrap JSON in prose or fences however firmly you ask them not to, so
// the first balanced object is taken rather than the whole string parsed.
func (r Result) JSON(v any) error {
	s := strings.TrimSpace(r.Text)
	if i := strings.Index(s, "```"); i >= 0 {
		s = s[i+3:]
		if j := strings.IndexByte(s, '\n'); j >= 0 {
			s = s[j+1:]
		}
		if k := strings.Index(s, "```"); k >= 0 {
			s = s[:k]
		}
		s = strings.TrimSpace(s)
	}
	start := strings.IndexByte(s, '{')
	if start < 0 {
		return fmt.Errorf("no JSON object in response")
	}
	depth, inStr, esc := 0, false, false
	for i := start; i < len(s); i++ {
		c := s[i]
		switch {
		case esc:
			esc = false
		case c == '\\' && inStr:
			esc = true
		case c == '"':
			inStr = !inStr
		case inStr:
		case c == '{':
			depth++
		case c == '}':
			depth--
			if depth == 0 {
				return json.Unmarshal([]byte(s[start:i+1]), v)
			}
		}
	}
	// Reaching the end with depth > 0 means the response was CUT OFF, not
	// malformed. Saying "unbalanced" sends the reader hunting for a syntax bug
	// that does not exist; the real fix is to ask for less in one response.
	return fmt.Errorf("response truncated at %d bytes with %d unclosed brace(s) — "+
		"the model hit its output ceiling; ask for less per call", len(s), depth)
}
