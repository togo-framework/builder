package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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
}

// Result is the terminal `result` event plus what we derived from it.
type Result struct {
	Text         string        `json:"text"`
	IsError      bool          `json:"is_error"`
	Subtype      string        `json:"subtype"`
	CostUSD      float64       `json:"cost_usd"`
	InputTokens  int64         `json:"input_tokens"`
	OutputTokens int64         `json:"output_tokens"`
	NumTurns     int           `json:"num_turns"`
	DurationMS   int64         `json:"duration_ms"`
	SessionID    string        `json:"session_id"`
	Raw          string        `json:"-"`
	Took         time.Duration `json:"-"`
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

	args := []string{"-p", s.Prompt, "--output-format", "json"}
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

	cmd := exec.CommandContext(ctx, claudeBin(), args...)
	if s.Dir != "" {
		cmd.Dir = s.Dir
	}
	cmd.Env = append(os.Environ(), "NO_COLOR=1", "CLICOLOR=0")

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err := cmd.Run()
	took := time.Since(start)

	out := stdout.String()
	res, perr := parseClaudeResult(out)
	if perr != nil {
		if err != nil {
			return Result{Raw: out, Took: took},
				fmt.Errorf("claude failed: %w: %s", err, firstLine(stderr.String()))
		}
		return Result{Raw: out, Took: took}, fmt.Errorf("unparsable response: %w", perr)
	}

	return Result{
		Text:       res.Result,
		IsError:    res.IsError,
		Subtype:    res.Subtype,
		CostUSD:    res.TotalCostUSD,
		NumTurns:   res.NumTurns,
		DurationMS: res.DurationMS,
		SessionID:  res.SessionID,
		Raw:        out,
		Took:       took,
	}, nil
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
