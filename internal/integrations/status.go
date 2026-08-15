package integrations

// Asking a tool whether it is connected, rather than remembering that it was.
//
// A remembered answer goes stale the first time a token expires, is revoked
// somewhere else, or the operator logs the CLI out in their own shell — and a
// stale "connected" is worse than no badge at all, because it sends someone
// looking for the bug anywhere except the credential.

import (
	"context"
	"encoding/json"
	"os/exec"
	"strings"
	"time"
)

// State is what the badge shows.
type State string

const (
	// StateConnected — the tool answered yes.
	StateConnected State = "connected"
	// StateDisconnected — the tool is installed and says it is not signed in.
	StateDisconnected State = "disconnected"
	// StateMissing — the binary is not on PATH. Distinct from disconnected on
	// purpose: one is fixed by signing in, the other by installing, and telling
	// an operator to sign in to something they have not installed is the kind
	// of advice that wastes an afternoon.
	StateMissing State = "missing"
	// StateUnknown — the check itself failed to run or timed out.
	StateUnknown State = "unknown"
)

type Status struct {
	Slug    string `json:"slug"`
	State   State  `json:"state"`
	Version string `json:"version,omitempty"`
	// Detail is a short, already-scrubbed line for the UI.
	Detail string `json:"detail,omitempty"`
	// Install is populated when State is StateMissing.
	//
	// omitzero, not omitempty: omitempty has no effect on a struct, so this
	// would have serialised {"en":"","ar":""} on every status the UI renders —
	// and a truthy-looking empty object is exactly what makes a client show an
	// install hint to someone who has the tool installed.
	Install Text `json:"install,omitzero"`
}

// statusTimeout is short. A status check runs when a screen opens, so it is on
// a human's critical path — and every one of these commands is local.
const statusTimeout = 8 * time.Second

// Probe asks one integration whether it is connected.
//
// Never returns an error: every failure mode is a State the UI can render, and
// an error here would just be turned back into one by the caller.
func Probe(ctx context.Context, i Integration) Status {
	if i.Terminal == nil {
		return Status{Slug: i.Slug, State: StateUnknown, Detail: "no status command for this integration"}
	}
	t := i.Terminal

	if _, err := exec.LookPath(t.Bin); err != nil {
		return Status{Slug: i.Slug, State: StateMissing, Install: t.Install,
			Detail: t.Bin + " is not installed"}
	}

	st := Status{Slug: i.Slug, Version: version(ctx, t)}

	if len(t.Status) == 0 {
		st.State = StateUnknown
		return st
	}
	ctx, cancel := context.WithTimeout(ctx, statusTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, t.Status[0], t.Status[1:]...)
	// Explicitly no stdin. Every one of these commands has an interactive mode,
	// and a status check that blocks on a prompt would hang the screen that
	// called it — indistinguishable from a tool that is broken.
	cmd.Stdin = nil
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))

	switch {
	case ctx.Err() != nil:
		st.State = StateUnknown
		st.Detail = "the status check timed out"
	case err != nil:
		// A non-zero exit from a status command is the tool's way of saying
		// "not signed in". gh and claude both do this.
		st.State = StateDisconnected
		st.Detail = firstLine(text)
	case i.Slug == "claude-code":
		// Claude Code answers in JSON and exits 0 whether or not it is signed
		// in, so the exit code carries no answer and the body has to be read.
		st.State, st.Detail = claudeAuth(text)
	case i.Slug == "gcloud" && text == "":
		// gcloud exits 0 with NO output when nothing is active — the one tool
		// here whose exit code does not carry the answer.
		st.State = StateDisconnected
		st.Detail = "no active account"
	default:
		st.State = StateConnected
		st.Detail = firstLine(text)
	}
	return st
}

// ProbeAll checks every terminal integration concurrently.
//
// Serially this is three subprocess round trips on a screen open; the slowest
// one sets the wait either way, so they run together.
func ProbeAll(ctx context.Context) []Status {
	list := All()
	out := make([]Status, 0, len(list))
	type result struct {
		i int
		s Status
	}
	ch := make(chan result, len(list))
	n := 0
	for idx, i := range list {
		if i.Terminal == nil {
			continue
		}
		n++
		go func(idx int, i Integration) {
			ch <- result{idx, Probe(ctx, i)}
		}(idx, i)
	}
	got := make([]Status, 0, n)
	for k := 0; k < n; k++ {
		got = append(got, (<-ch).s)
	}
	out = append(out, got...)
	return out
}

// claudeAuth reads `claude auth status` output.
//
// Falls back to a substring check rather than failing closed: a future version
// that changes the shape should degrade to "we could not tell", not to a
// confident "disconnected" that sends someone to re-authenticate an account
// that was signed in all along.
func claudeAuth(body string) (State, string) {
	var v struct {
		LoggedIn   bool   `json:"loggedIn"`
		Email      string `json:"email"`
		AuthMethod string `json:"authMethod"`
	}
	if err := json.Unmarshal([]byte(body), &v); err != nil {
		if strings.Contains(strings.ToLower(body), "not logged in") {
			return StateDisconnected, "not signed in"
		}
		return StateUnknown, firstLine(body)
	}
	if !v.LoggedIn {
		return StateDisconnected, "not signed in"
	}
	detail := v.Email
	if detail == "" {
		detail = v.AuthMethod
	}
	return StateConnected, detail
}

func version(ctx context.Context, t *Terminal) string {
	if len(t.Version) == 0 {
		return ""
	}
	ctx, cancel := context.WithTimeout(ctx, statusTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, t.Version[0], t.Version[1:]...)
	cmd.Stdin = nil
	out, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}
	return firstLine(strings.TrimSpace(string(out)))
}

// firstLine keeps the badge to one line and bounds it.
//
// `gh auth status` prints several lines including the account and the scopes;
// `gcloud --version` prints a dozen component versions. The first line is the
// useful one in every case, and an unbounded string here ends up in a tooltip.
func firstLine(s string) string {
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		s = s[:i]
	}
	s = strings.TrimSpace(s)
	if len(s) > 160 {
		s = s[:157] + "…"
	}
	return s
}
