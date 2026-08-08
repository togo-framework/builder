// Package term gives the dashboard a real terminal, attached to a tmux session
// on the machine the builder runs on.
//
// This is remote code execution, on purpose. It exists so an operator can run
// `claude`, `gh pr view`, `git log` or anything else an agent's work needs
// checking with, without leaving the page they are looking at — and every one
// of those is a shell command. There is no version of this feature that is not
// a shell.
//
// So the posture is stated once, here, and enforced structurally:
//
//   - OFF unless BUILDER_TERMINAL=1. This ships inside a blueprint that other
//     people generate applications from. A web shell that turned itself on
//     because the plugin was installed would be indefensible.
//   - Local environments ONLY, by allowlist across APP_ENV, ENV and TOGO_ENV —
//     the same three the auth plugin reads. Anything unrecognised, including
//     unset, denies.
//   - Behind auth.Middleware + RequireRole("admin"), applied at the MOUNT in
//     providers.go, and NOT MOUNTED AT ALL when the auth plugin is absent.
//
//     This comment used to say "bound to the dashboard session, the same admin
//     cookie that can edit personas" — which was false. No builder route is
//     session-authenticated; the global chain is recovery, logging and CORS.
//     An adversarial review caught it: the terminal was an unauthenticated
//     shell, as this process, with its whole environment, on a port that binds
//     to every interface. Stating a control is not implementing one, and this
//     package is the worst possible place to confuse the two.
//   - Same-origin only. A WebSocket ignores CORS, so the Origin header is
//     checked by hand — without that, any page the operator visits while
//     logged in could open a shell on their machine.
//
// tmux rather than a bare PTY because the point is persistence: a session
// keeps running when the tab closes, the API restarts, or a `claude -p` run
// takes twenty minutes. A bare PTY dies with the socket and takes the work
// with it.
package term

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

type Service struct {
	db  *sql.DB
	log *slog.Logger
	// workdir is where a new session starts. The repository the agents work in,
	// so `git status` answers the question the operator actually has.
	workdir string
	// allowed is true when the terminal may run at all. Computed once at
	// construction rather than read per request, so the decision is visible in
	// one place and cannot drift between handlers.
	allowed bool
	why     string
}

func New(db *sql.DB, log *slog.Logger, workdir string) *Service {
	s := &Service{db: db, log: log, workdir: workdir}

	// An ALLOWLIST, across the same three variables the rest of the framework
	// reads.
	//
	// This was `APP_ENV == "production" || "prod"` — a two-string denylist on
	// one variable, where everything else fell through to allowed. Two ways
	// that failed open, both found by review:
	//
	//   - auth's own isProduction() reads APP_ENV, ENV and TOGO_ENV. A host
	//     setting only ENV=production is production to the auth plugin (which
	//     will refuse to boot without a real AUTH_SECRET) and was NOT
	//     production here. One process, two answers.
	//   - "live", "staging", "prd", or an unset variable all meant "not
	//     production", so the backstop was absent on exactly the inputs its own
	//     comment said it existed to catch.
	//
	// A control whose failure mode is a shell denies by default and names the
	// environments it trusts.
	env := strings.ToLower(strings.TrimSpace(firstEnv("APP_ENV", "ENV", "TOGO_ENV")))
	local := env == "local" || env == "development" || env == "dev" || env == "test"
	switch {
	case !local:
		s.why = "the terminal runs only in a local or development environment. " +
			"Set APP_ENV=development if this machine really is one."
	case os.Getenv("BUILDER_TERMINAL") != "1":
		s.why = "the terminal is off. Set BUILDER_TERMINAL=1 to enable it — it gives anyone with dashboard access a shell on this machine."
	default:
		s.allowed = true
	}

	if s.allowed {
		log.Warn("builder.terminal ENABLED — dashboard users can run shell commands on this host")
	}
	return s
}

// sessionName is what tmux is asked for. Constrained hard because it reaches a
// command line: tmux takes a session name as an argument, and a name containing
// a shell metacharacter in a context that ever became a shell string would be
// an injection. exec.Command does not use a shell, so this is defence in depth
// rather than the only guard — but the only guard is one review away from
// being the wrong assumption.
var sessionName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,40}$`)

// tmuxBin resolves tmux once. Absent tmux is a normal, reportable state — most
// machines do not have it — and the UI says how to install it rather than
// showing a terminal that never connects.
func tmuxBin() (string, error) {
	return exec.LookPath("tmux")
}

type statusOut struct {
	Enabled  bool     `json:"enabled"`
	Reason   string   `json:"reason,omitempty"`
	HasTmux  bool     `json:"hasTmux"`
	Install  string   `json:"install,omitempty"`
	Workdir  string   `json:"workdir"`
	Sessions []string `json:"sessions"`
}

func (s *Service) handleStatus(w http.ResponseWriter, r *http.Request) {
	// Session names and the workdir are not public.
	//
	// This handler deliberately does NOT call guard() — the page needs to hear
	// "disabled, and here is why" in order to render the explanation rather
	// than a dead terminal. But it must still only answer an authenticated
	// caller, which is now the mount's job. Review found it reporting the
	// workdir and every running session name to anyone who asked.
	out := statusOut{
		Enabled:  s.allowed,
		Reason:   s.why,
		Workdir:  s.workdir,
		Sessions: []string{},
	}
	if bin, err := tmuxBin(); err == nil {
		out.HasTmux = true
		out.Sessions = s.listSessions(r.Context(), bin)
	} else {
		// Named per platform rather than a generic "install tmux": the operator
		// is on one machine and wants the one line that works on it.
		out.Install = installHint()
	}
	writeJSON(w, http.StatusOK, out)
}

func installHint() string {
	switch {
	case fileExists("/opt/homebrew/bin/brew"), fileExists("/usr/local/bin/brew"):
		return "brew install tmux"
	case fileExists("/usr/bin/apt-get"):
		return "sudo apt-get install -y tmux"
	case fileExists("/usr/bin/dnf"):
		return "sudo dnf install -y tmux"
	default:
		return "install tmux with your package manager"
	}
}

// firstEnv returns the first of these variables that is set, matching how the
// auth plugin decides the same question. One process must not have two answers
// to "is this production".
func firstEnv(names ...string) string {
	for _, n := range names {
		if v := strings.TrimSpace(os.Getenv(n)); v != "" {
			return v
		}
	}
	return ""
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// listSessions asks tmux what is running. Never an error to the caller: no
// server yet is the normal first state, and tmux reports it as a failure.
func (s *Service) listSessions(ctx context.Context, bin string) []string {
	out, err := exec.CommandContext(ctx, bin, "list-sessions", "-F", "#{session_name}").Output()
	if err != nil {
		return []string{}
	}
	var names []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if n := strings.TrimSpace(line); n != "" {
			names = append(names, n)
		}
	}
	if names == nil {
		return []string{}
	}
	return names
}

var errNotAllowed = errors.New("terminal disabled")

// guard is the single gate every terminal route passes through.
func (s *Service) guard(w http.ResponseWriter) error {
	if !s.allowed {
		httpErr(w, http.StatusForbidden, s.why)
		return errNotAllowed
	}
	if _, err := tmuxBin(); err != nil {
		httpErr(w, http.StatusFailedDependency,
			"tmux is not installed on this machine — "+installHint())
		return errNotAllowed
	}
	return nil
}

// sameOrigin checks the WebSocket handshake's Origin.
//
// A WebSocket is NOT subject to the same-origin policy: the browser will
// happily open one from any page to any host and hand over the session cookie
// with it. Without this check, any site the operator visits while logged in to
// the dashboard could open a shell on their machine. This is the single most
// important line in the package.
func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// A non-browser client (a CLI, a test) sends no Origin. It also cannot
		// be tricked into sending our cookie, which is the attack this defends
		// against — and it still had to present a valid session.
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	// Development runs Vite on :3000 and the API on :8080, so the dashboard's
	// origin is legitimately not the API's. Allowed ONLY for loopback, and
	// only because the terminal itself already refuses to run in production.
	return isLoopback(u.Hostname()) && isLoopback(hostOnly(r.Host))
}

func isLoopback(h string) bool {
	return h == "localhost" || h == "127.0.0.1" || h == "::1" || h == "[::1]"
}

func hostOnly(hostport string) string {
	if i := strings.LastIndex(hostport, ":"); i > 0 && !strings.Contains(hostport[i:], "]") {
		return hostport[:i]
	}
	return hostport
}

func atoiOr(s string, def int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
