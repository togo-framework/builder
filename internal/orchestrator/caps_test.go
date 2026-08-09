package orchestrator

import (
	"strings"
	"testing"

	"github.com/togo-framework/builder/internal/runner"
)

func names(prefix string, n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = prefix + string(rune('a'+i%26))
	}
	return out
}

// The cap must tell a new feature apart from a reckless refactor. Measured as
// one total they look identical; that is what blocked issues #38, #39 and #40.
func TestCapsAllowNewCodeAndStillCatchReckless(t *testing.T) {
	cases := []struct {
		name  string
		diff  runner.Diff
		allow bool
	}{
		{
			// The shape that was blocked three times: a new source connector.
			name: "a new connector: 8 files, ~1800 lines, nearly all new",
			diff: runner.Diff{
				Files: names("f", 8), Added: 1790, Removed: 60,
				NewFiles: names("n", 6), TouchedFiles: names("t", 2),
				TouchedAdded: 55, TouchedRemoved: 20,
			},
			allow: true,
		},
		{
			name: "a reckless refactor: fewer lines, but spread across live files",
			diff: runner.Diff{
				Files: names("f", 30), Added: 400, Removed: 400,
				TouchedFiles: names("t", 30), TouchedAdded: 400, TouchedRemoved: 400,
			},
			allow: false,
		},
		{
			name: "a rewrite of a few files, deep",
			diff: runner.Diff{
				Files: names("f", 3), Added: 900, Removed: 900,
				TouchedFiles: names("t", 3), TouchedAdded: 900, TouchedRemoved: 900,
			},
			allow: false,
		},
		{
			name: "a runaway that only writes new files is still stopped",
			diff: runner.Diff{
				Files: names("f", 20), Added: 9000, NewFiles: names("n", 20),
			},
			allow: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := capBreach(tc.diff)
			if tc.allow && got != "" {
				t.Errorf("should have been allowed, was stopped: %s", got)
			}
			if !tc.allow {
				if got == "" {
					t.Error("should have been stopped, was allowed")
				} else if !strings.Contains(got, "limit") {
					t.Errorf("reason must name the limit, got %q", got)
				}
			}
		})
	}
}
