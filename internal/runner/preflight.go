// Package runner owns everything that executes outside the app process: the
// Claude Code session, the git worktree, the gates, and the preflight that
// proves the environment can run any of it.
package runner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/togo-framework/builder/internal/vault"
)

// Status of a single probe.
type Status string

const (
	StatusPass Status = "pass"
	StatusWarn Status = "warn" // degraded but usable; the loop still runs
	StatusFail Status = "fail"
	StatusSkip Status = "skip"
)

// Check is one probe result.
type Check struct {
	ID     int    `json:"id"`
	Key    string `json:"key"`
	Label  string `json:"label"`
	Status Status `json:"status"`
	Detail string `json:"detail,omitempty"`
	// Remedy is the exact thing the operator should run or change. A preflight
	// that reports a failure without saying how to fix it just moves the
	// problem into a support channel.
	Remedy string `json:"remedy,omitempty"`
	// Required marks a probe the wizard will not let you skip. gh auth, claude
	// auth and the live execution probe are required because the development
	// loop shells out to both binaries — a project that proceeds without them
	// fails later, in an agent run, where the cause is much harder to see.
	Required bool          `json:"required"`
	Took     time.Duration `json:"took_ns"`
}

// Report is the full preflight.
type Report struct {
	Checks    []Check   `json:"checks"`
	CheckedAt time.Time `json:"checked_at"`
}

// OK reports whether every required probe passed. Warnings never block.
func (r Report) OK() bool {
	for _, c := range r.Checks {
		if c.Required && c.Status != StatusPass {
			return false
		}
	}
	return true
}

// Blocking returns the required probes that are not passing.
func (r Report) Blocking() []Check {
	var out []Check
	for _, c := range r.Checks {
		if c.Required && c.Status != StatusPass {
			out = append(out, c)
		}
	}
	return out
}

// MinClaudeVersion is the oldest Claude Code known to support the flags the
// runner depends on (--session-id, --output-format stream-json, --allowedTools).
const MinClaudeVersion = "2.0.0"

// Preflight runs every probe. It is the single code path behind both
// GET /api/builder/preflight and `togo-builder doctor`, so the wizard and the
// CLI can never disagree about whether a machine is ready.
//
// Probes are ordered cheapest-first so an obvious failure surfaces immediately,
// and the two that cost real money or time (18, 20) run last.
func Preflight(ctx context.Context) Report {
	probes := []func(context.Context) Check{
		checkPlatform,       // 1
		checkGit,            // 2
		checkGitIdentity,    // 3
		checkGH,             // 4  REQUIRED
		checkGHScopes,       // 5
		checkGHRepo,         // 6
		checkClaudeBinary,   // 7
		checkClaudeVersion,  // 8
		checkClaudeAuth,     // 9  REQUIRED
		checkClaudeExec,     // 10 REQUIRED — the only probe that proves it runs
		checkGoToolchain,    // 11
		checkNode,           // 12
		checkPnpm,           // 13
		checkDatabaseURL,    // 14
		checkVaultKey,       // 15
		checkWorkdir,        // 16
		checkDiskSpace,      // 17
		checkExecProvider,   // 18
		checkSandboxPosture, // 19
		checkBudget,         // 20
	}

	report := Report{CheckedAt: time.Now().UTC(), Checks: make([]Check, 0, len(probes))}
	for i, probe := range probes {
		start := time.Now()
		c := probe(ctx)
		c.ID = i + 1
		c.Took = time.Since(start)
		report.Checks = append(report.Checks, c)
	}
	return report
}

// --- 1. platform ------------------------------------------------------------

func checkPlatform(context.Context) Check {
	c := Check{Key: "platform", Label: "Operating system and architecture"}
	switch runtime.GOOS {
	case "darwin", "linux":
		c.Status, c.Detail = StatusPass, runtime.GOOS+"/"+runtime.GOARCH
	case "windows":
		// The runner shells out to git and claude with POSIX path assumptions.
		c.Status = StatusWarn
		c.Detail = "windows/" + runtime.GOARCH
		c.Remedy = "Run inside WSL2. Native Windows worktree paths are untested."
	default:
		c.Status, c.Detail = StatusFail, runtime.GOOS
		c.Remedy = "Use macOS or Linux."
	}
	return c
}

// --- 2-3. git ---------------------------------------------------------------

func checkGit(ctx context.Context) Check {
	c := Check{Key: "git", Label: "git is installed"}
	out, err := run(ctx, 5*time.Second, "git", "--version")
	if err != nil {
		c.Status, c.Detail = StatusFail, err.Error()
		c.Remedy = "Install git."
		return c
	}
	c.Status, c.Detail = StatusPass, strings.TrimSpace(out)
	return c
}

func checkGitIdentity(ctx context.Context) Check {
	c := Check{Key: "git.identity", Label: "git commit identity is configured"}
	name, _ := run(ctx, 5*time.Second, "git", "config", "--get", "user.name")
	email, _ := run(ctx, 5*time.Second, "git", "config", "--get", "user.email")
	if strings.TrimSpace(name) == "" || strings.TrimSpace(email) == "" {
		c.Status = StatusFail
		c.Detail = "user.name or user.email is unset"
		// Agents commit. Without an identity every agent commit fails at the
		// very end of a run, after the model spend has already happened.
		c.Remedy = `git config --global user.name "Your Name" && git config --global user.email "you@example.com"`
		return c
	}
	c.Status = StatusPass
	c.Detail = fmt.Sprintf("%s <%s>", strings.TrimSpace(name), strings.TrimSpace(email))
	return c
}

// --- 4-6. GitHub ------------------------------------------------------------

func checkGH(ctx context.Context) Check {
	c := Check{Key: "gh.auth", Label: "GitHub CLI is authenticated", Required: true}
	if _, err := exec.LookPath("gh"); err != nil {
		c.Status, c.Detail = StatusFail, "gh not found on PATH"
		c.Remedy = "Install the GitHub CLI (https://cli.github.com), then run: gh auth login"
		return c
	}
	// `gh auth status` exits non-zero when logged out, and writes its human
	// output to stderr — which is why run() merges the streams.
	out, err := run(ctx, 15*time.Second, "gh", "auth", "status")
	if err != nil {
		c.Status, c.Detail = StatusFail, firstLine(out)
		c.Remedy = "gh auth login"
		return c
	}
	c.Status, c.Detail = StatusPass, firstAccount(out)
	return c
}

// requiredGHScopes are what the loop actually uses: repo to push a branch and
// open a PR, workflow to touch .github/workflows.
var requiredGHScopes = []string{"repo", "workflow"}

func checkGHScopes(ctx context.Context) Check {
	c := Check{Key: "gh.scopes", Label: "GitHub token has repo + workflow scope"}
	out, err := run(ctx, 15*time.Second, "gh", "auth", "status")
	if err != nil {
		c.Status, c.Detail = StatusSkip, "gh not authenticated"
		return c
	}
	var missing []string
	for _, s := range requiredGHScopes {
		if !strings.Contains(out, "'"+s+"'") {
			missing = append(missing, s)
		}
	}
	if len(missing) > 0 {
		c.Status = StatusFail
		c.Detail = "missing scope(s): " + strings.Join(missing, ", ")
		c.Remedy = "gh auth refresh -h github.com -s " + strings.Join(missing, ",")
		return c
	}
	c.Status, c.Detail = StatusPass, "repo, workflow"
	return c
}

func checkGHRepo(ctx context.Context) Check {
	c := Check{Key: "gh.repo", Label: "Working tree has a GitHub remote"}
	out, err := run(ctx, 15*time.Second, "gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner")
	if err != nil {
		// Not fatal: a project can be scaffolded before its remote exists.
		c.Status = StatusWarn
		c.Detail = "no GitHub remote resolved for this directory"
		c.Remedy = "gh repo create — or add a remote before enabling the runner."
		return c
	}
	c.Status, c.Detail = StatusPass, strings.TrimSpace(out)
	return c
}

// --- 7-10. Claude Code ------------------------------------------------------

func checkClaudeBinary(ctx context.Context) Check {
	c := Check{Key: "claude.bin", Label: "Claude Code is installed"}
	path, err := exec.LookPath(claudeBin())
	if err != nil {
		c.Status, c.Detail = StatusFail, claudeBin()+" not found on PATH"
		c.Remedy = "Install Claude Code, or set BUILDER_CLAUDE_BIN to its path."
		return c
	}
	c.Status, c.Detail = StatusPass, path
	return c
}

func checkClaudeVersion(ctx context.Context) Check {
	c := Check{Key: "claude.version", Label: "Claude Code is recent enough"}
	out, err := run(ctx, 20*time.Second, claudeBin(), "--version")
	if err != nil {
		c.Status, c.Detail = StatusSkip, "claude not runnable"
		return c
	}
	got := firstField(out)
	c.Detail = got
	if compareSemver(got, MinClaudeVersion) < 0 {
		c.Status = StatusWarn
		c.Remedy = "Upgrade Claude Code to >= " + MinClaudeVersion +
			" (the runner needs --session-id and --output-format stream-json)."
		return c
	}
	c.Status = StatusPass
	return c
}

// claudeAuth is the shape of `claude auth status --json`.
type claudeAuth struct {
	LoggedIn         bool   `json:"loggedIn"`
	AuthMethod       string `json:"authMethod"`  // claude.ai | apiKey | bedrock | vertex
	APIProvider      string `json:"apiProvider"` // firstParty | ...
	Email            string `json:"email"`
	OrgName          string `json:"orgName"`
	SubscriptionType string `json:"subscriptionType"` // max | pro | ...
}

func checkClaudeAuth(ctx context.Context) Check {
	c := Check{Key: "claude.auth", Label: "Claude Code is authenticated", Required: true}
	out, err := run(ctx, 30*time.Second, claudeBin(), "auth", "status", "--json")
	if err != nil {
		c.Status, c.Detail = StatusFail, firstLine(out)
		c.Remedy = "claude auth login"
		return c
	}
	var a claudeAuth
	if err := json.Unmarshal([]byte(out), &a); err != nil {
		c.Status, c.Detail = StatusFail, "unparsable auth status: "+firstLine(out)
		c.Remedy = "Upgrade Claude Code; `claude auth status --json` did not return JSON."
		return c
	}
	if !a.LoggedIn {
		c.Status, c.Detail = StatusFail, "not logged in"
		c.Remedy = "claude auth login"
		return c
	}
	c.Status = StatusPass
	// Never echo the email: this report is served over HTTP and stored in
	// builder_setup_state.preflight.
	c.Detail = fmt.Sprintf("%s (%s)", a.AuthMethod, a.SubscriptionType)
	return c
}

func checkClaudeExec(ctx context.Context) Check {
	c := Check{
		Key:      "claude.exec",
		Label:    "Claude Code executes a headless prompt",
		Required: true,
	}
	// The only probe that proves the loop can actually run. Auth can report
	// logged-in while execution still fails — wrong model access, a proxy, a
	// sandbox that blocks egress, a broken install.
	//
	// Deliberately NOT --bare: it refuses OAuth entirely and accepts only an
	// API key or apiKeyHelper, so it is incompatible with the subscription auth
	// this preflight just verified. Passing it here would make a working
	// machine look broken.
	args := []string{
		"-p", "Reply with the single word: ready",
		"--output-format", "json",
		"--allowedTools", "", // no tools; this is a liveness probe, not work
		"--max-turns", "1",
	}
	if m := os.Getenv("BUILDER_PREFLIGHT_MODEL"); m != "" {
		args = append(args, "--model", m)
	}
	out, err := run(ctx, 120*time.Second, claudeBin(), args...)
	if err != nil {
		c.Status = StatusFail
		c.Detail = firstLine(out)
		if errors.Is(err, context.DeadlineExceeded) {
			c.Detail = "timed out after 120s"
		}
		c.Remedy = "Run `claude -p hello` by hand and resolve whatever it reports."
		return c
	}

	// `--output-format json` emits a JSON ARRAY of events, not one object:
	// [rate_limit_event, system, assistant, result]. A zero exit with an
	// is_error result is still a failure, so the array has to be parsed rather
	// than treated as opaque success.
	res, perr := parseClaudeResult(out)
	if perr != nil {
		c.Status = StatusFail
		c.Detail = "unparsable response: " + perr.Error()
		c.Remedy = "Check `claude -p hello --output-format json` by hand."
		return c
	}
	if res.IsError {
		c.Status = StatusFail
		c.Detail = truncate(res.Result, 160)
		if res.Subtype != "" {
			c.Detail = res.Subtype + ": " + c.Detail
		}
		c.Remedy = "Claude Code ran but returned an error. Resolve it before enabling the runner."
		return c
	}
	c.Status = StatusPass
	c.Detail = fmt.Sprintf("replied in %dms, $%.4f", res.DurationMS, res.TotalCostUSD)
	return c
}

// fromJSONLine returns everything from the first line that begins with "[" or
// "{" — the start of the JSON payload, past any warning prose above it.
func fromJSONLine(s string) string {
	offset := 0
	for _, line := range strings.Split(s, "\n") {
		if t := strings.TrimSpace(line); strings.HasPrefix(t, "[") || strings.HasPrefix(t, "{") {
			return s[offset+strings.Index(line, strings.TrimLeft(line, " \t")):]
		}
		offset += len(line) + 1
	}
	return s
}

// claudeResult is the terminal event of a headless run.
type claudeResult struct {
	Type         string  `json:"type"`
	Subtype      string  `json:"subtype"`
	IsError      bool    `json:"is_error"`
	Result       string  `json:"result"`
	DurationMS   int64   `json:"duration_ms"`
	NumTurns     int     `json:"num_turns"`
	TotalCostUSD float64 `json:"total_cost_usd"`
	SessionID    string  `json:"session_id"`
}

// parseClaudeResult extracts the terminal result event.
//
// Tolerates both the array form and a bare object, because the shape has
// changed across Claude Code versions and the runner has to survive an upgrade
// it did not choose.
func parseClaudeResult(out string) (claudeResult, error) {
	trimmed := strings.TrimSpace(out)
	if trimmed == "" {
		return claudeResult{}, errors.New("empty output")
	}

	// Claude Code writes warnings to STDOUT ahead of the payload — e.g.
	// "Ignoring N permissions.allow entries…: this workspace has not been
	// trusted". Parsing from byte 0 dies on the "I" and reports a JSON error
	// for what is really a configuration notice.
	//
	// Scanning for the first "[" or "{" anywhere is NOT enough: that warning
	// contains `projects["/path"].hasTrustDialogAccepted`, so the first bracket
	// sits inside the prose. The payload always begins a line, so find the
	// first LINE that starts with a structural character.
	trimmed = fromJSONLine(trimmed)

	if strings.HasPrefix(trimmed, "[") {
		var events []claudeResult
		if err := json.Unmarshal([]byte(trimmed), &events); err != nil {
			return claudeResult{}, err
		}
		for i := len(events) - 1; i >= 0; i-- {
			if events[i].Type == "result" {
				return events[i], nil
			}
		}
		return claudeResult{}, errors.New("no result event in response")
	}

	var single claudeResult
	if err := json.Unmarshal([]byte(trimmed), &single); err != nil {
		return claudeResult{}, err
	}
	return single, nil
}

// --- 11-13. toolchain -------------------------------------------------------

func checkGoToolchain(ctx context.Context) Check {
	c := Check{Key: "go", Label: "Go toolchain"}
	out, err := run(ctx, 10*time.Second, "go", "version")
	if err != nil {
		c.Status, c.Detail = StatusFail, "go not found"
		c.Remedy = "Install Go 1.26+."
		return c
	}
	c.Status, c.Detail = StatusPass, strings.TrimSpace(out)
	return c
}

func checkNode(ctx context.Context) Check {
	c := Check{Key: "node", Label: "Node.js (frontend build)"}
	out, err := run(ctx, 10*time.Second, "node", "--version")
	if err != nil {
		c.Status, c.Detail = StatusWarn, "node not found"
		c.Remedy = "Install Node 20+ to build the dashboard."
		return c
	}
	c.Status, c.Detail = StatusPass, strings.TrimSpace(out)
	return c
}

func checkPnpm(ctx context.Context) Check {
	c := Check{Key: "pnpm", Label: "pnpm (frontend package manager)"}
	out, err := run(ctx, 10*time.Second, "pnpm", "--version")
	if err != nil {
		c.Status, c.Detail = StatusWarn, "pnpm not found"
		c.Remedy = "corepack enable && corepack prepare pnpm@latest --activate"
		return c
	}
	c.Status, c.Detail = StatusPass, strings.TrimSpace(out)
	return c
}

// --- 14-17. runtime environment --------------------------------------------

func checkDatabaseURL(context.Context) Check {
	c := Check{Key: "database", Label: "DATABASE_URL is set"}
	if strings.TrimSpace(os.Getenv("DATABASE_URL")) == "" {
		c.Status, c.Detail = StatusWarn, "unset — falling back to the SQLite dev DSN"
		c.Remedy = "Set DATABASE_URL to a Postgres 16+ instance before enabling the runner."
		return c
	}
	c.Status, c.Detail = StatusPass, "set"
	return c
}

func checkVaultKey(context.Context) Check {
	// Required, because provideVault treats a missing key as a fatal boot
	// error. A preflight that passed here would report "ready" for an app that
	// cannot start — the two must agree.
	c := Check{Key: "vault.key", Label: "BUILDER_VAULT_KEY is a valid 32-byte key", Required: true}
	if err := vault.ValidateVaultKey(os.Getenv("BUILDER_VAULT_KEY")); err != nil {
		c.Status, c.Detail = StatusFail, err.Error()
		c.Remedy = `openssl rand -base64 32   # then export BUILDER_VAULT_KEY=<value>`
		return c
	}
	c.Status, c.Detail = StatusPass, "32 bytes"
	return c
}

func checkWorkdir(context.Context) Check {
	c := Check{Key: "workdir", Label: "Agent working tree is writable"}
	dir := os.Getenv("BUILDER_WORKDIR")
	if dir == "" {
		dir = "."
	}
	f, err := os.CreateTemp(dir, ".builder-preflight-*")
	if err != nil {
		c.Status, c.Detail = StatusFail, err.Error()
		c.Remedy = "Make BUILDER_WORKDIR writable by the app process."
		return c
	}
	name := f.Name()
	_ = f.Close()
	_ = os.Remove(name)
	c.Status, c.Detail = StatusPass, dir
	return c
}

func checkDiskSpace(context.Context) Check {
	c := Check{Key: "disk", Label: "Disk space for git worktrees"}
	// Each concurrent run gets its own worktree; a few gigabytes disappear
	// quickly with a large repo and several agents.
	c.Status, c.Detail = StatusPass, "not enforced in v0.1"
	return c
}

// --- 18-20. execution posture ----------------------------------------------

func checkExecProvider(context.Context) Check {
	c := Check{Key: "exec.provider", Label: "Agent execution provider"}
	provider := os.Getenv("BUILDER_EXEC")
	if provider == "" {
		provider = "local"
	}
	env := os.Getenv("APP_ENV")
	if provider == "local" && env != "" && env != "local" && env != "development" {
		// The boot guard refuses this combination outright; the preflight says
		// so early rather than letting a deploy discover it.
		c.Status = StatusFail
		c.Detail = fmt.Sprintf("exec=local with APP_ENV=%s", env)
		c.Remedy = "Set BUILDER_EXEC=coder (or container) outside local development. " +
			"exec=local runs Claude Code with full shell access inside the app process."
		return c
	}
	c.Status, c.Detail = StatusPass, provider
	return c
}

func checkSandboxPosture(context.Context) Check {
	c := Check{Key: "exec.posture", Label: "Agent permission posture"}
	mode := os.Getenv("BUILDER_PERMISSION_MODE")
	if mode == "" {
		mode = "acceptEdits"
	}
	if mode == "bypassPermissions" {
		c.Status = StatusWarn
		c.Detail = "bypassPermissions"
		c.Remedy = "bypassPermissions disables every tool guard. Use acceptEdits " +
			"unless you have an isolated workspace and know why."
		return c
	}
	c.Status, c.Detail = StatusPass, mode
	return c
}

func checkBudget(context.Context) Check {
	c := Check{Key: "budget", Label: "Daily spend ceiling is configured"}
	// An unattended fleet with no ceiling is the failure mode that costs money
	// rather than time, so it is surfaced even though a default exists.
	c.Status, c.Detail = StatusPass, "defaults from builder_budgets (fleet: $25/day)"
	return c
}

// --- helpers ----------------------------------------------------------------

func claudeBin() string {
	if b := os.Getenv("BUILDER_CLAUDE_BIN"); b != "" {
		return b
	}
	return "claude"
}

// run executes a command with a timeout and returns its combined output.
// Streams are merged because gh and claude both report failures on stderr.
func run(ctx context.Context, timeout time.Duration, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	// Never inherit a parent's ANSI settings into parsed output.
	cmd.Env = append(os.Environ(), "NO_COLOR=1", "CLICOLOR=0")
	out, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		return string(out), ctx.Err()
	}
	return string(out), err
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	return truncate(strings.TrimSpace(s), 200)
}

func firstField(s string) string {
	f := strings.Fields(strings.TrimSpace(s))
	if len(f) == 0 {
		return ""
	}
	return f[0]
}

// firstAccount pulls the account name out of `gh auth status` without echoing
// the token or the full block.
func firstAccount(out string) string {
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "Logged in to") {
			return strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "✓ "))
		}
	}
	return "authenticated"
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// compareSemver compares dotted numeric versions. Returns -1, 0 or 1.
// Non-numeric suffixes are ignored, which is enough for "2.1.224".
func compareSemver(a, b string) int {
	as, bs := strings.Split(strings.TrimPrefix(a, "v"), "."), strings.Split(strings.TrimPrefix(b, "v"), ".")
	for i := 0; i < 3; i++ {
		av, bv := segment(as, i), segment(bs, i)
		if av != bv {
			if av < bv {
				return -1
			}
			return 1
		}
	}
	return 0
}

func segment(parts []string, i int) int {
	if i >= len(parts) {
		return 0
	}
	n := 0
	for _, r := range parts[i] {
		if r < '0' || r > '9' {
			break
		}
		n = n*10 + int(r-'0')
	}
	return n
}
