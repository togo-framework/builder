package orchestrator

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/togo-framework/builder/internal/runner"
)

func repoWith(t *testing.T, dirs ...string) string {
	t.Helper()
	root := t.TempDir()
	for _, d := range dirs {
		if err := os.MkdirAll(filepath.Join(root, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// allows asks the REAL guard whether a path survives, by running
// RevertOutside over it — the same call the implement path makes. Testing a
// private helper would prove the helper works; this proves the guard does.
func allows(t *testing.T, allowed []string, path string) bool {
	t.Helper()
	ws := &runner.Workspace{Dir: t.TempDir(), Repo: t.TempDir(), BaseSHA: "HEAD"}
	reverted, err := ws.RevertOutside(context.Background(), allowed, []string{path})
	if err != nil {
		t.Fatalf("RevertOutside: %v", err)
	}
	return len(reverted) == 0
}

// The regression that cost a real run.
//
// The sdk agent edited sdk/src/index.ts and sdk/src/i18n.ts — exactly the files
// the issue named — and the guard reverted all of them, because the allowlist
// was built as internal/sdk and web/src/sdk from a hardcoded layout. The diff
// came back empty and a correct run was recorded as a failure.
func TestAgentCanWriteItsOwnAreaWhereverItLives(t *testing.T) {
	repo := repoWith(t, "sdk/src", "internal", "web/src", "cli", "npm", "blueprint")
	allowed := allowedPaths(repo, []string{"sdk", "widget", "a11y"})

	for _, f := range []string{
		"sdk/src/index.ts",
		"sdk/src/i18n.ts",
		"internal/orchestrator/implement.go",
		"web/src/routes/issues.tsx",
		"cli/main.go",
	} {
		if !allows(t, allowed, f) {
			t.Errorf("%s was NOT writable; allowlist = %v", f, allowed)
		}
	}
}

// The guard must still guard. Discovering the layout must not become "allow
// everything" — these are the paths that make the loop tamper-proof.
func TestGuardsAndSecretsStayUnwritable(t *testing.T) {
	repo := repoWith(t, "internal", ".github/workflows", ".claude/hooks", "node_modules/x", "dist", "vendor/y")
	allowed := allowedPaths(repo, []string{"runner"})

	for _, f := range []string{
		".claude/hooks/guard-db-wipe.sh", // rule 38: cannot edit its own guard
		".claude/settings.json",
		".github/workflows/ci.yml",
		".git/config",
		".env",
		"node_modules/x/index.js",
		"vendor/y/main.go",
		"dist/builder-sdk.js",
	} {
		if allows(t, allowed, f) {
			t.Errorf("%s IS writable but must never be; allowlist = %v", f, allowed)
		}
	}
}

// An area must not be able to smuggle a denied path in through the back door.
func TestAreaNamedLikeADeniedPathIsIgnored(t *testing.T) {
	repo := repoWith(t, "internal", ".claude")
	allowed := allowedPaths(repo, []string{".claude", ".github", "node_modules"})
	for _, f := range []string{".claude/settings.json", ".github/workflows/ci.yml", "node_modules/x/i.js"} {
		if allows(t, allowed, f) {
			t.Errorf("%s became writable via a malicious area name; allowlist = %v", f, allowed)
		}
	}
}

// An unreadable repo must fall back conservatively, never to "allow all".
func TestUnreadableRepoFallsBackConservatively(t *testing.T) {
	allowed := allowedPaths(filepath.Join(t.TempDir(), "does-not-exist"), nil)
	if len(allowed) == 0 {
		t.Fatal("empty allowlist would revert every change")
	}
	if allows(t, allowed, ".claude/settings.json") || allows(t, allowed, "anything/else.txt") {
		t.Errorf("the fallback is too permissive: %v", allowed)
	}
}
