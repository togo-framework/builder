// Package builder is the togo day-0 agentic development harness: a feedback
// widget, an issue plane, an orchestrator that claims issues under a fenced
// database lease and delegates them to a fleet of Claude Code agents, per-agent
// memory, and an audited secret vault.
//
// On `togo install togo-framework/builder` this package is blank-imported into
// the host app, so init() registers the providers with the kernel.
//
// Six providers register independently so each can be disabled at boot
// (BUILDER_DISABLE=vault,brain) and extracted to its own repo later without
// touching the others. That property — independently disableable today,
// independently extractable tomorrow — is why they are separate providers
// rather than one monolithic Provide().
package builder

import (
	"os"
	"strings"

	"github.com/togo-framework/togo"
)

// Name is the plugin's stable identifier.
const Name = "builder"

// Provider names. Each is a separate kernel provider with its own priority so
// boot order is explicit rather than emergent.
const (
	ProviderVault        = "builder.vault"        // no deps; secrets other providers read
	ProviderBrain        = "builder.brain"        // reads vault for driver tokens
	ProviderIssues       = "builder.issues"       // the issue plane + HTTP surface
	ProviderFleet        = "builder.fleet"        // agent registry + .claude/ sync
	ProviderOrchestrator = "builder.orchestrator" // claim/lease/route/triage
	ProviderNotify       = "builder.notify"       // realtime + push + sound
	ProviderSources      = "builder.sources"      // scheduled ingestion into the brain
	ProviderApps         = "builder.apps"         // user-supplied screens, discovered at boot
	ProviderWeb          = "builder.web"          // the dashboard itself, from the embedded bundle
)

// Boot order. togo runs providers ascending, and a later provider overwrites an
// earlier one's kernel bindings, so dependencies must register first.
//
// The floor is not arbitrary. chi panics on `Use()` after any route is mounted
// on a mux, and togo's own plugins mount middleware late:
//
//	PriorityService      50   cache · storage · realtime · i18n
//	PriorityLate         90   queue
//	PriorityLate + 5     95   auth        — calls k.Router.Use()
//	PriorityLate + 10   100   dashboard   — mounts routes
//
// So any plugin that mounts a route must sort *after* 95, or it will make
// auth's middleware registration panic at boot — a failure that surfaces as a
// chi stack trace naming auth, with nothing pointing at the real culprit.
// Starting at +11 also clears dashboard, which keeps the ordering obvious
// rather than merely correct.
const (
	priVault        = togo.PriorityLate + 11
	priBrain        = togo.PriorityLate + 12
	priNotify       = togo.PriorityLate + 13
	priIssues       = togo.PriorityLate + 14
	priFleet        = togo.PriorityLate + 15
	priOrchestrator = togo.PriorityLate + 16
	// After the orchestrator so both loops start last, and after brain and
	// vault because a source cannot be constructed without either.
	priSources = togo.PriorityLate + 17
	// Last of all. Custom apps are third-party code; they register after every
	// first-party surface exists, so an app can read the kernel container and
	// so nothing builder ships can be shadowed by one.
	priApps = togo.PriorityLate + 18
	// The dashboard, last. It depends on nothing — it is a file server over an
	// embedded bundle — and mounting it after every API surface keeps the route
	// table readable: the pages sit below the endpoints they call.
	priWeb = togo.PriorityLate + 19
)

func init() {
	register(ProviderVault, priVault, provideVault)
	register(ProviderBrain, priBrain, provideBrain)
	register(ProviderNotify, priNotify, provideNotify)
	register(ProviderIssues, priIssues, provideIssues)
	register(ProviderFleet, priFleet, provideFleet)
	register(ProviderOrchestrator, priOrchestrator, provideOrchestrator)
	register(ProviderSources, priSources, provideSources)
	register(ProviderApps, priApps, provideApps)
	register(ProviderWeb, priWeb, provideWeb)
}

// register wires one provider unless it is named in BUILDER_DISABLE.
//
// Disabling is by short name — BUILDER_DISABLE=vault,brain — because that is
// what an operator will type. Unknown names are ignored rather than fatal: a
// typo should not stop an app from booting.
func register(name string, priority int, fn func(*togo.Kernel) error) {
	if disabled(name) {
		return
	}
	togo.RegisterProviderFunc(name, priority, fn)
}

func disabled(providerName string) bool {
	raw := strings.TrimSpace(os.Getenv("BUILDER_DISABLE"))
	if raw == "" {
		return false
	}
	short := strings.TrimPrefix(providerName, "builder.")
	for _, part := range strings.Split(raw, ",") {
		if strings.EqualFold(strings.TrimSpace(part), short) {
			return true
		}
	}
	return false
}
