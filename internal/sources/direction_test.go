package sources

import "testing"

// Every row that existed before migration 0019 is a collector, and every client
// written before it omits the field. Both must keep working, which means the
// empty string has to mean "source" rather than "invalid".
func TestOmittedDirectionMeansCollector(t *testing.T) {
	for _, in := range []string{"", "source", "SOURCE", "collector", "nonsense", "  "} {
		if got := normalizeDirection(in); got != "source" {
			t.Fatalf("normalizeDirection(%q) = %q, want source", in, got)
		}
	}
}

// Only the exact value opts into the other half. A near-miss must not silently
// create a row no scheduler claims: the symptom of that is silence, which is
// the hardest failure to notice.
func TestOnlyExactActorOptsIn(t *testing.T) {
	if got := normalizeDirection("actor"); got != "actor" {
		t.Fatalf("normalizeDirection(\"actor\") = %q, want actor", got)
	}
	for _, near := range []string{"Actor", "ACTOR", "actors", "act", " actor"} {
		if got := normalizeDirection(near); got == "actor" {
			t.Fatalf("normalizeDirection(%q) = actor; only the exact value may opt in", near)
		}
	}
}
