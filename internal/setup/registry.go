// Package setup owns the wizard, and the registry that generates it.
//
// # THE RULE THIS FILE EXISTS TO ENFORCE
//
// "Anything you add to .env must show up in the setup as steps that we can move
// on with the correct way."
//
// Before this registry, the builder read 51 environment variables and
// .env.example documented 4. The wizard — welcome, preflight, plan, fleet,
// done — configured none of them. The 47 undocumented ones included every
// switch that decides what the product can actually do: whether agents run at
// all, whether there is a shell on the host, where agents execute, the daily
// budget, the permission mode, and the twelve knobs behind the brain's
// embedding and reranking.
//
// A capability with no setup step gets configured by rumour. That is not
// hypothetical here: operators wanting a terminal on a real server were being
// told to set APP_ENV=development, which also silently widens the feedback
// widget's CORS origins. The advice existed because the honest switch had no
// step to live in.
//
// So a capability is declared ONCE, and the wizard step, the .env.example line,
// the doctor probe and the docs row are all projections of that declaration.
// Two CI gates keep it true: one fails if .env.example drifts from what the
// registry generates, the other walks every os.Getenv/firstEnv call site in the
// repo and fails on any name that is not declared here. The gap cannot reopen
// by forgetting — only by deleting a gate, which is a reviewable act.
package setup

import "context"

// Group buckets capabilities into wizard steps. Order here is step order.
type Group string

const (
	GroupCore        Group = "core"        // DATABASE_URL, ADDR, APP_ENV
	GroupAgents      Group = "agents"      // runner, executor, permissions, budgets
	GroupBrain       Group = "brain"       // embedding + reranking
	GroupConnections Group = "connections" // per-connector credentials
	GroupSDK         Group = "sdk"         // theme, locale, feedback origins, shell mode
	GroupDanger      Group = "danger"      // terminal, live Claude — real blast radius
)

// GroupOrder is the order steps appear in the wizard. Danger is last on
// purpose: an operator should have a working install before being offered the
// switches that can hand out a shell.
var GroupOrder = []Group{GroupCore, GroupAgents, GroupBrain, GroupConnections, GroupSDK, GroupDanger}

// Kind drives the control the wizard renders.
type Kind string

const (
	KindToggle Kind = "toggle" // "1" / unset
	KindChoice Kind = "choice" // one of Choices
	KindText   Kind = "text"
	KindSecret Kind = "secret" // routed to the vault, never written to .env
	KindNumber Kind = "number"
	KindPath   Kind = "path"
	KindURL    Kind = "url"
)

// Danger grades how loudly the wizard warns.
type Danger string

const (
	// Safe: wrong values are inconvenient and reversible.
	Safe Danger = "safe"
	// Sensitive: touches credentials, spend, or data the operator cares about.
	Sensitive Danger = "sensitive"
	// Dangerous: hands someone capability over the host. Shown with the real
	// consequence spelled out, and gated behind RequiresProdAck off localhost.
	Dangerous Danger = "dangerous"
)

// Localized is a bilingual string. Both are required for anything an operator
// reads — a half-translated wizard is worse than an English one, because it
// looks finished.
type Localized struct {
	EN string
	AR string
}

// Choice is one option of a KindChoice capability.
type Choice struct {
	Value string
	Label Localized
}

// ProbeResult is what a capability's verification returned.
type ProbeResult struct {
	OK bool
	// Detail is shown to the operator verbatim. It must say what was tried and
	// what came back — "failed" sends someone to the source; "dial tcp
	// 127.0.0.1:5432: connection refused" sends them to the right place.
	Detail string
	// Fatal marks a failure that should stop the wizard rather than warn.
	Fatal bool
}

// Env is the environment a probe reads. An interface so a probe is testable
// without mutating the process.
type Env interface {
	Get(name string) string
}

// Capability is one thing the builder can be made to do, and the environment
// that turns it on.
//
// This is the SINGLE declaration. The wizard step, the .env.example line, the
// doctor probe and the docs row are projections of it. There is no second list
// to keep in step, which is the entire point — the previous arrangement had
// four lists and only one of them was ever right.
type Capability struct {
	// Env is the variable name, unique across the registry.
	Env string

	// Aliases are older names still read via firstEnv (APP_ENV/ENV/TOGO_ENV).
	// Declared so the call-site gate recognises them, and so the wizard does
	// not offer the same setting twice under two names.
	Aliases []string

	Group Group
	Title Localized
	Help  Localized

	Kind    Kind
	Choices []Choice

	// Default is what ships when the operator skips the step. It MUST be the
	// safe value: every toggle defaults off, every ceiling defaults low. A
	// default that is convenient rather than safe is how an install ends up
	// with a capability nobody chose.
	Default string

	// Placeholder is shown in the input, never submitted.
	Placeholder string

	Danger Danger

	// RequiresProdAck gates the capability behind an explicit "yes, this is a
	// real server" acknowledgement typed by the operator.
	//
	// This is the mechanism that makes lying about APP_ENV pointless. The old
	// guidance — "set APP_ENV=development if this machine really is one" —
	// could only be satisfied by misdescribing the environment, and APP_ENV
	// also controls CORS. A guard satisfiable only by lying teaches operators
	// to lie.
	RequiresProdAck bool

	// Secret routes the value into the vault rather than the environment, and
	// keeps it out of .env.example entirely.
	Secret bool

	// Probe verifies the capability actually works once configured. nil means
	// there is nothing to check beyond it being set.
	//
	// Probes live on the capability, not in a parallel list, because the
	// twenty preflight checks and the settings they verify drifted apart the
	// moment they were maintained separately.
	Probe func(context.Context, Env) ProbeResult

	// Unlocks names what becomes available, for the wizard's summary.
	Unlocks []Localized

	// Deprecated marks a variable that is read but should not be offered. It
	// still has to be DECLARED — the call-site gate does not care about our
	// opinion of a name, only that somebody wrote it down.
	Deprecated string
}

// Registry is the declared set, in wizard order.
type Registry []Capability

// ByEnv returns the capability declaring name, following aliases.
func (r Registry) ByEnv(name string) (Capability, bool) {
	for _, c := range r {
		if c.Env == name {
			return c, true
		}
		for _, a := range c.Aliases {
			if a == name {
				return c, true
			}
		}
	}
	return Capability{}, false
}

// InGroup returns the capabilities of one wizard step, offering order preserved.
func (r Registry) InGroup(g Group) []Capability {
	var out []Capability
	for _, c := range r {
		if c.Group == g && c.Deprecated == "" {
			out = append(out, c)
		}
	}
	return out
}

// Names returns every declared name including aliases — what the call-site gate
// checks against.
func (r Registry) Names() map[string]bool {
	out := make(map[string]bool, len(r)*2)
	for _, c := range r {
		out[c.Env] = true
		for _, a := range c.Aliases {
			out[a] = true
		}
	}
	return out
}
