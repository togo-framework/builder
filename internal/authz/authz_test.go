package authz

import "testing"

func TestCan(t *testing.T) {
	cases := []struct {
		name    string
		granted []string
		want    string
		ok      bool
	}{
		// The defect this package exists to fix: upstream Can() is an exact
		// match, so "*" denies everything.
		{"root wildcard grants anything", []string{"*"}, "issues.write", true},
		{"exact grant", []string{"issues.write"}, "issues.write", true},
		{"exact grant does not leak", []string{"issues.read"}, "issues.write", false},

		{"namespace wildcard", []string{"issues.*"}, "issues.write", true},
		{"namespace wildcard is depth-agnostic", []string{"issues.*"}, "issues.read.deep", true},
		{"namespace wildcard does not cross namespaces", []string{"issues.*"}, "agents.write", false},

		// The prefix trap: "issues.*" must not satisfy "issuesX.write".
		{"namespace wildcard respects the separator", []string{"issues.*"}, "issuesX.write", false},

		// Fail closed.
		{"empty want is never granted", []string{"*"}, "", false},
		{"no grants", nil, "issues.read", false},

		{"one of several grants matches", []string{"a.read", "issues.*", "b.x"}, "issues.write", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Can(tc.granted, tc.want); got != tc.ok {
				t.Fatalf("Can(%q, %q) = %v, want %v", tc.granted, tc.want, got, tc.ok)
			}
		})
	}
}

func TestCanAllAny(t *testing.T) {
	g := []string{"issues.read", "agents.*"}

	if !CanAll(g, "issues.read", "agents.write") {
		t.Fatal("CanAll should satisfy both")
	}
	if CanAll(g, "issues.read", "vault.reveal") {
		t.Fatal("CanAll must fail when one is missing")
	}
	if !CanAll(g) {
		t.Fatal("CanAll of nothing is vacuously true")
	}

	if !CanAny(g, "vault.reveal", "issues.read") {
		t.Fatal("CanAny should match the second")
	}
	if CanAny(g, "vault.reveal") {
		t.Fatal("CanAny must fail when none match")
	}
	if CanAny(g) {
		t.Fatal("CanAny of nothing must be false, not vacuously true")
	}
}

func TestExpandEnumeratesRatherThanWildcards(t *testing.T) {
	admin := Expand(RoleAdmin)
	if len(admin) == 0 {
		t.Fatal("admin role expanded to nothing")
	}
	// Seeding must never write a bare "*": the row has to stay correct when
	// read by code that has not adopted the wildcard-aware Can above.
	for _, p := range admin {
		if p == Wildcard {
			t.Fatal("admin permissions contain a bare wildcard; enumerate instead")
		}
	}
	// An admin must actually satisfy the checks the routes make.
	for _, want := range []string{"issues.write", "vault.reveal", "fleet.generate", "setup.run"} {
		if !Can(admin, want) {
			t.Fatalf("seeded admin cannot %q", want)
		}
	}

	if Can(Expand(RoleReporter), "vault.reveal") {
		t.Fatal("reporter must not reach the vault")
	}
	if Expand("nonexistent") != nil {
		t.Fatal("unknown role must expand to nothing, not to a default grant")
	}
}
