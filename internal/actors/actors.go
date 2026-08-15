// Package actors is the sending half of a connection.
//
// A connection collects (a source, polled on a schedule) or it sends (an actor,
// invoked). This package is the second one: post to Slack, Discord, Telegram,
// send an email, call a webhook.
//
// # What is deliberately NOT here
//
// Credential retrieval. Every actor below needs a secret, and the vault cannot
// currently grant one to a non-agent principal — SF-001 in docs/security-findings.md,
// an authorization path that cannot succeed rather than a leak. Fixing it means
// choosing between three candidate designs, one of which carries a migration,
// and that is a human's call under Rule 33.
//
// So credentials go through ONE seam (secrets.go). It returns the SF-001 error
// today. When a human picks a fix, one function changes and every actor here
// starts working — none of them reference the vault directly.
//
// This is not a workaround. It is the difference between "the feature is blocked
// on a decision" and "the feature does not exist yet": everything that does not
// depend on that decision is built, tested, and demonstrable now. In particular
// DryRun renders the exact payload that WOULD be sent, over no network at all,
// which is most of what makes an outbound integration reviewable.

package actors

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"sync"
	"time"
)

// Text is a localized label. Mirrors the plan's `Text`.
type Text struct {
	EN string `json:"en"`
	AR string `json:"ar"`
}

// ActionSpec describes one thing an actor can do.
//
// One schema, three consumers: the create form renders it, the admin panel turns
// it into a tool definition, and the runner validates against it. Three copies
// of the same shape is how they drift.
type ActionSpec struct {
	Name        string          `json:"name"`
	Title       Text            `json:"title"`
	Description Text            `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`

	// External means it leaves the organisation's boundary. Rule 41: an agent
	// may draft it, only a human may send it. Forces approval — see Run.
	External bool `json:"external"`

	// Idempotent means the same Idem key may be retried safely. Default false,
	// and nothing else is ever auto-retried (Rule 39): "did the first call
	// land?" must be answerable before anything sends twice.
	Idempotent  bool `json:"idempotent"`
	Destructive bool `json:"destructive"`

	// Grant is an exact permission string. togo's Can() is an exact match, so
	// "*" grants nothing — see Rule 16.
	Grant      string `json:"grant"`
	RatePerMin int    `json:"ratePerMin"`
}

// Principal is WHO asked. A connector never picks its own.
type Principal struct {
	Kind string `json:"kind"` // user | agent | connection | system
	Slug string `json:"slug"`
	ID   string `json:"id"`
}

var slugRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Valid reports whether this principal can be stored and audited.
//
// The slug shape is the grants table's, deliberately: a principal that cannot be
// written to an audit row is a principal that cannot be held responsible, and
// SF-001 is what happens when those two drift apart.
func (p Principal) Valid() bool {
	switch p.Kind {
	case "user", "agent", "connection", "system":
	default:
		return false
	}
	return slugRe.MatchString(p.Slug)
}

type ActInput struct {
	Action string          `json:"action"`
	Params json.RawMessage `json:"params"`
	Actor  Principal       `json:"actor"`

	// Idem is mandatory unless DryRun. UNIQUE per effect.
	Idem       string `json:"idem"`
	RunID      string `json:"runId"`
	ApprovalID string `json:"approvalId"`

	// DryRun MUST NOT touch the network. Fill Preview and return.
	DryRun bool `json:"dryRun"`
}

type ActOutput struct {
	ProviderRef string          `json:"providerRef"`
	Preview     string          `json:"preview"`
	Result      json.RawMessage `json:"result"`
	Retryable   bool            `json:"retryable"`
	// RetryAfter is honoured by the CALLER. An actor never sleeps inside Act —
	// a provider that says "wait 30s" must not hold a request goroutine for 30s.
	RetryAfter time.Duration `json:"retryAfter"`
}

// Secrets is how an actor reads its credential. One method, so the blocked
// seam is one function (secrets.go) rather than a vault import in five files.
type Secrets interface {
	Reveal(ctx context.Context, name string) (string, error)
}

// Actor is a connection that sends.
type Actor interface {
	// Kind is the registry key: "slack", "discord", "telegram", "email", "webhook".
	Kind() string
	// Actions is the full set this actor supports.
	Actions() []ActionSpec
	// Act performs one. It must honour DryRun by rendering Preview and
	// returning without touching the network.
	Act(ctx context.Context, in ActInput, cfg json.RawMessage, sec Secrets) (ActOutput, error)
}

var (
	mu       sync.RWMutex
	registry = map[string]Actor{}
)

// Register adds an actor kind. Called from init() in each provider file.
func Register(a Actor) {
	mu.Lock()
	defer mu.Unlock()
	if _, dup := registry[a.Kind()]; dup {
		// A duplicate kind means two providers silently compete for the same
		// rows. Panicking at init is the only moment this is cheap to notice.
		panic("actors: duplicate kind " + a.Kind())
	}
	registry[a.Kind()] = a
}

// Get returns the actor for a kind.
func Get(kind string) (Actor, bool) {
	mu.RLock()
	defer mu.RUnlock()
	a, ok := registry[kind]
	return a, ok
}

// Kinds lists every registered actor kind, sorted so the UI is stable.
func Kinds() []string {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]string, 0, len(registry))
	for k := range registry {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// SpecFor finds one action's spec.
func SpecFor(kind, action string) (ActionSpec, bool) {
	a, ok := Get(kind)
	if !ok {
		return ActionSpec{}, false
	}
	for _, s := range a.Actions() {
		if s.Name == action {
			return s, true
		}
	}
	return ActionSpec{}, false
}

// Errors the runner and the API distinguish between.
var (
	ErrUnknownKind   = errors.New("no such connection kind")
	ErrUnknownAction = errors.New("no such action")
	ErrNeedApproval  = errors.New("this action leaves the organisation and needs a human approval")
	ErrNeedIdem      = errors.New("a live send needs an idempotency key")
	ErrBadPrincipal  = errors.New("the acting principal is not one that can be audited")
	ErrNotConfigured = errors.New("this connection is not configured")
	ErrBlockedSF001  = errors.New("connections cannot read their credential yet — see SF-001 in docs/security-findings.md")
)

// Validate checks an ActInput against the spec BEFORE anything is written or
// sent. Every failure here is one the caller can fix.
func Validate(kind string, in ActInput) (ActionSpec, error) {
	spec, ok := SpecFor(kind, in.Action)
	if !ok {
		if _, kindOK := Get(kind); !kindOK {
			return spec, fmt.Errorf("%w: %q", ErrUnknownKind, kind)
		}
		return spec, fmt.Errorf("%w: %q on %q", ErrUnknownAction, in.Action, kind)
	}
	if !in.Actor.Valid() {
		return spec, fmt.Errorf("%w: %+v", ErrBadPrincipal, in.Actor)
	}
	if in.DryRun {
		// A dry run sends nothing, so it needs neither an idempotency key nor
		// an approval. Requiring them would make the safe path harder than the
		// dangerous one.
		return spec, nil
	}
	if in.Idem == "" {
		return spec, ErrNeedIdem
	}
	if spec.External && in.ApprovalID == "" {
		return spec, fmt.Errorf("%w: %s.%s", ErrNeedApproval, kind, in.Action)
	}
	return spec, nil
}
