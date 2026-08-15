package integrations

// The model client behind smart connect.
//
// One bounded, tool-less Claude call: the job is to turn a sentence into a JSON
// plan, and everything that EXECUTES the plan lives in smart.go, on the same
// validated path the form uses.
//
// Deliberately not the agent loop. A run with shell access could genuinely
// "just set the connection up", and that is exactly what must not happen here:
// the operator would be handing filesystem and network access to a model in
// order to fill in four form fields. The narrow version is both safer and
// faster.

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/togo-framework/builder/internal/runner"
)

// SessionPlanner runs the plan prompt through the Claude Code CLI.
type SessionPlanner struct {
	Log *slog.Logger
	// Model is optional; empty uses whatever the CLI is configured with.
	Model string
	// Dir is where the session runs. It reads nothing, but the CLI wants a
	// working directory that exists.
	Dir string
}

// Plan asks the model for a connection plan and returns its raw reply.
func (p SessionPlanner) Plan(ctx context.Context, prompt string) (string, error) {
	dir := p.Dir
	if dir == "" {
		dir = os.TempDir()
	}
	res, err := runner.Session{
		Prompt: prompt,
		Model:  p.Model,
		Dir:    dir,
		// NO TOOLS. The model returns text; this package does the acting.
		//
		// An empty allowlist is the difference between "a model that reads a
		// sentence and proposes a configuration" and "a model with a shell on
		// the machine hosting the vault". The whole design of smart.go assumes
		// the former.
		AllowedTools: "",
		// One turn. There is nothing to iterate on: the prompt carries every
		// schema the model could need, and a second turn means it is trying to
		// use a tool it does not have.
		MaxTurns: 1,
		// Well under the HTTP handler's own 90s budget, so the caller reports a
		// timeout rather than having its context cancelled out from under it.
		Timeout: 75 * time.Second,
		Log:     p.Log,
	}.Run(ctx)
	if err != nil {
		return "", err
	}
	if res.IsError {
		return "", fmt.Errorf("the planner failed: %s", res.Subtype)
	}
	if p.Log != nil {
		// The cost is worth a line: this endpoint spends money on somebody
		// else's behalf, and an operator who wires it into a script should be
		// able to find out what it costs from the log rather than a bill.
		p.Log.Info("smart connect planned",
			"cost_usd", res.CostUSD, "turns", res.NumTurns, "ms", res.DurationMS)
	}
	return res.Text, nil
}
