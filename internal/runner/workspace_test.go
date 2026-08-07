package runner

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func repo(t *testing.T) string {
	t.Helper()
	d := t.TempDir()
	run := func(a ...string) {
		c := exec.Command("git", a...)
		c.Dir = d
		c.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t",
			"GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
		if out, err := c.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v: %s", a, err, out)
		}
	}
	run("init", "-q", "-b", "main")
	os.MkdirAll(filepath.Join(d, "internal"), 0o755)
	os.MkdirAll(filepath.Join(d, "secrets"), 0o755)
	os.WriteFile(filepath.Join(d, "internal", "a.go"), []byte("package a\n"), 0o644)
	os.WriteFile(filepath.Join(d, "secrets", "key.txt"), []byte("original\n"), 0o644)
	run("add", "-A")
	run("commit", "-qm", "init")
	return d
}

func TestWorkspaceDerivesFactsFromGit(t *testing.T) {
	r := repo(t)
	ctx := context.Background()
	t.Setenv("BUILDER_WORKTREE_ROOT", t.TempDir())

	ws, err := NewWorkspace(ctx, r, "HEAD", "builder/issue-1")
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Remove(ctx)

	// Nothing changed yet.
	d, err := ws.Diff(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if d.HasChanges {
		t.Fatalf("clean tree reported changes: %v", d.Files)
	}

	// Edit in-scope, add a NEW file (untracked must still count), and touch
	// something out of scope.
	os.WriteFile(filepath.Join(ws.Dir, "internal", "a.go"), []byte("package a\n\nfunc F() {}\n"), 0o644)
	os.WriteFile(filepath.Join(ws.Dir, "internal", "b.go"), []byte("package a\n"), 0o644)
	os.WriteFile(filepath.Join(ws.Dir, "secrets", "key.txt"), []byte("LEAKED\n"), 0o644)

	d, err = ws.Diff(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !d.HasChanges {
		t.Fatal("changes not detected")
	}
	if len(d.Files) != 3 {
		t.Fatalf("want 3 changed files, got %d: %v", len(d.Files), d.Files)
	}
	if d.Added == 0 {
		t.Fatal("added lines not counted")
	}

	// The out-of-scope write must be undone.
	rev, err := ws.RevertOutside(ctx, []string{"internal"}, d.Files)
	if err != nil {
		t.Fatal(err)
	}
	if len(rev) != 1 || rev[0] != "secrets/key.txt" {
		t.Fatalf("want secrets/key.txt reverted, got %v", rev)
	}
	if b, _ := os.ReadFile(filepath.Join(ws.Dir, "secrets", "key.txt")); string(b) != "original\n" {
		t.Fatalf("out-of-scope file not restored: %q", b)
	}

	d, _ = ws.Diff(ctx)
	if len(d.Files) != 2 {
		t.Fatalf("after revert want 2 files, got %v", d.Files)
	}

	sha, err := ws.Commit(ctx, "fix the thing", "impl-bot", "sonnet", "run-1", 42)
	if err != nil {
		t.Fatal(err)
	}
	if len(sha) < 7 {
		t.Fatalf("bad sha %q", sha)
	}

	msg, err := git(ctx, ws.Dir, "log", "-1", "--pretty=%B")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Issue: #42", "Agent: impl-bot", "Run: run-1"} {
		if !contains(msg, want) {
			t.Fatalf("commit message missing %q:\n%s", want, msg)
		}
	}
	// The main checkout must be untouched.
	if b, _ := os.ReadFile(filepath.Join(r, "internal", "a.go")); string(b) != "package a\n" {
		t.Fatalf("the agent's work leaked into the main checkout: %q", b)
	}
}

func TestPathAllowed(t *testing.T) {
	cases := []struct {
		p  string
		ok bool
	}{
		{"internal/a.go", true}, {"internal/deep/b.go", true},
		{"web/src/App.tsx", true},
		{"secrets/key.txt", false},
		{".claude/agents/x.md", false},
		{".github/workflows/ci.yml", false},
		{"internalX/a.go", false}, // prefix trap
	}
	for _, c := range cases {
		if got := pathAllowed(c.p, []string{"internal", "web/src"}); got != c.ok {
			t.Errorf("pathAllowed(%q) = %v, want %v", c.p, got, c.ok)
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
