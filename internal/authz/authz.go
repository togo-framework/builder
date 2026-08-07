// Package authz supplies the permission check that togo's auth plugin does not.
//
// Verified against togo-framework/auth at auth.go:89:
//
//	func (i Identity) Can(perm string) bool { return contains(i.Permissions, perm) }
//
// That is an exact string match. Consequently a user holding permissions=["*"]
// is denied every check — the wildcard everyone reaches for silently means
// "may do exactly the thing literally named *". Any admin seeded with "*" would
// appear correct in the database and be powerless in the app.
//
// Rather than block on an upstream fix, builder does its own checking and
// treats auth.Identity purely as a claims carrier. Upstreaming a HasWildcard is
// worth doing; depending on it is not.
package authz

import "strings"

// Wildcard grants every permission.
const Wildcard = "*"

// Separator between a permission's namespace and its verb: "issues.write".
const Separator = "."

// Can reports whether the granted set satisfies want.
//
// Three forms are honoured, most specific first:
//
//	"issues.write"  exact grant
//	"issues.*"      namespace grant — covers issues.write, issues.read.deep, …
//	"*"             root grant
//
// A namespace wildcard covers arbitrary depth: "a.*" satisfies "a.b.c". An
// empty want is never satisfied, so a caller that forgets to name a permission
// fails closed rather than passing.
func Can(granted []string, want string) bool {
	if want == "" {
		return false
	}
	for _, g := range granted {
		if g == Wildcard || g == want {
			return true
		}
		prefix, ok := strings.CutSuffix(g, Separator+Wildcard)
		if !ok {
			continue
		}
		// "issues.*" covers "issues.write" but must not cover "issuesX.write",
		// hence matching the separator explicitly rather than the bare prefix.
		if strings.HasPrefix(want, prefix+Separator) {
			return true
		}
	}
	return false
}

// CanAll reports whether every wanted permission is satisfied. An empty want
// list is vacuously true — the caller asked for nothing.
func CanAll(granted []string, want ...string) bool {
	for _, w := range want {
		if !Can(granted, w) {
			return false
		}
	}
	return true
}

// CanAny reports whether at least one wanted permission is satisfied. An empty
// want list is false: "any of nothing" is not a grant.
func CanAny(granted []string, want ...string) bool {
	for _, w := range want {
		if Can(granted, w) {
			return true
		}
	}
	return false
}

// Expand returns the concrete permission set implied by a role.
//
// Seeding writes these enumerated strings into the users.permissions CSV rather
// than a bare "*". Two reasons: the column stays readable by a human auditing
// who can do what, and a row remains correct even when read by code that has
// not adopted the wildcard-aware Can above.
func Expand(role string) []string {
	switch role {
	case RoleAdmin:
		return append([]string(nil), adminPermissions...)
	case RoleMaintainer:
		return append([]string(nil), maintainerPermissions...)
	case RoleReporter:
		return append([]string(nil), reporterPermissions...)
	default:
		return nil
	}
}

// Roles recognised by the blueprint.
const (
	RoleAdmin      = "admin"
	RoleMaintainer = "maintainer"
	RoleReporter   = "reporter"
)

// The permission vocabulary. Every plugin surface that guards a route declares
// its key here so the set is enumerable — a permission that exists only as a
// string literal at a call site cannot be granted deliberately.
var (
	adminPermissions = []string{
		"issues.read", "issues.write", "issues.delete", "issues.triage",
		"agents.read", "agents.write", "agents.enable",
		"fleet.read", "fleet.generate",
		"runs.read", "runs.cancel",
		"decisions.read", "decisions.answer",
		"vault.list", "vault.write", "vault.reveal", "vault.rotate",
		"brain.read", "brain.write",
		"budget.read", "budget.write",
		"setup.run",
		"users.read", "users.write",
	}
	maintainerPermissions = []string{
		"issues.read", "issues.write", "issues.triage",
		"agents.read", "fleet.read",
		"runs.read", "runs.cancel",
		"decisions.read", "decisions.answer",
		"brain.read", "budget.read",
	}
	reporterPermissions = []string{
		"issues.read", "issues.write",
	}
)

// AllPermissions returns every known permission key, for the admin UI and for
// tests that assert the vocabulary has not drifted from the routes.
func AllPermissions() []string {
	return append([]string(nil), adminPermissions...)
}
