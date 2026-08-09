package runner

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A diff must distinguish what a run ADDED from what it DISTURBED.
//
// This is the measurement three issues were blocked on: each wrote a new source
// connector — almost entirely new files — and was stopped as though it had
// rewritten the codebase. If this test passes, that class of work is measured
// honestly.
func TestDiffSeparatesNewFilesFromTouchedOnes(t *testing.T) {
	repo := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		if out, err := git(context.Background(), repo, args...); err != nil {
			t.Fatalf("git %s: %v: %s", strings.Join(args, " "), err, out)
		}
	}
	write := func(dir, name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	run("init", "-b", "main")
	run("config", "user.email", "t@t.t")
	run("config", "user.name", "t")
	// An existing file with 10 lines.
	write(repo, "existing.go", strings.Repeat("old\n", 10))
	run("add", "-A")
	run("commit", "-m", "base")

	ws, err := NewWorkspace(context.Background(), repo, "HEAD", "t/split")
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Remove(context.Background())

	// 300 lines of brand-new code, and 2 lines changed in the existing file.
	write(ws.Dir, "brand_new.go", strings.Repeat("new\n", 300))
	write(ws.Dir, "existing.go", strings.Repeat("old\n", 8)+"changed\n\n")

	d, err := ws.Diff(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if len(d.NewFiles) != 1 || d.NewFiles[0] != "brand_new.go" {
		t.Errorf("new files = %v, want [brand_new.go]", d.NewFiles)
	}
	if len(d.TouchedFiles) != 1 || d.TouchedFiles[0] != "existing.go" {
		t.Errorf("touched files = %v, want [existing.go]", d.TouchedFiles)
	}
	// The whole point: 300+ lines of churn, but only a couple of them disturb
	// anything that already worked.
	if d.Added+d.Removed < 300 {
		t.Errorf("total churn = %d, want >= 300", d.Added+d.Removed)
	}
	if got := d.TouchedAdded + d.TouchedRemoved; got > 6 {
		t.Errorf("touched churn = %d, want small — the new file must not count", got)
	}
	t.Logf("total=%d/-%d  touched=%d/-%d  new=%d files  touched=%d files",
		d.Added, d.Removed, d.TouchedAdded, d.TouchedRemoved,
		len(d.NewFiles), len(d.TouchedFiles))
}
