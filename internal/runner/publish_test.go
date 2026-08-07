package runner

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// These tests exercise the publish path against REAL git repositories on disk.
// None of them contacts a network: the "remote" is another directory. That is
// deliberate — a test suite for the one code path that can push must never be
// able to push anywhere real.

func newRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t.local",
			"GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t.local")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	run("init", "-q", "-b", "main")
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("hi\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("add", "-A")
	run("commit", "-qm", "init")
	return dir
}

// A push with no remote configured must fail with a clear message, BEFORE git
// is asked to do anything. Discovering this late (or worse, having git prompt
// for credentials on a terminal nobody is watching) is how a run hangs.
func TestPushRefusesWithoutARemote(t *testing.T) {
	dir := newRepo(t)
	w := &Workspace{Dir: dir, Repo: dir}

	err := w.Push(context.Background(), "origin", "main")
	if err == nil {
		t.Fatal("pushed to a repo with no remote")
	}
	if !strings.Contains(err.Error(), "no remote") {
		t.Fatalf("unhelpful error %q — the operator cannot act on it", err)
	}
}

// The happy path, against a bare repo on disk standing in for a remote.
func TestPushSendsTheBranchToTheRemote(t *testing.T) {
	src := newRepo(t)
	bare := t.TempDir()
	if out, err := exec.Command("git", "init", "-q", "--bare", bare).CombinedOutput(); err != nil {
		t.Fatalf("bare init: %v\n%s", err, out)
	}
	git := func(dir string, args ...string) string {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t.local",
			"GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t.local")
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
		return string(out)
	}
	git(src, "remote", "add", "origin", bare)
	git(src, "checkout", "-qb", "builder/issue-7")
	if err := os.WriteFile(filepath.Join(src, "fix.txt"), []byte("fixed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git(src, "add", "-A")
	git(src, "commit", "-qm", "fix")

	w := &Workspace{Dir: src, Repo: src}
	if err := w.Push(context.Background(), "origin", "builder/issue-7"); err != nil {
		t.Fatalf("push: %v", err)
	}

	// Assert against the REMOTE, not the local repo — a push that silently did
	// nothing would still leave the local branch looking correct.
	refs := git(bare, "branch", "--list")
	if !strings.Contains(refs, "builder/issue-7") {
		t.Fatalf("the branch is not on the remote; remote has:\n%s", refs)
	}
}

func TestDefaultBaseFindsTheRealDefaultBranch(t *testing.T) {
	dir := newRepo(t)
	// No remote at all: it must still return something usable rather than "".
	if got := DefaultBase(context.Background(), dir); got == "" {
		t.Fatal("DefaultBase returned empty — a PR would target no branch")
	}

	// With a remote whose default is `trunk`, it must not answer "main".
	bare := t.TempDir()
	exec.Command("git", "init", "-q", "--bare", "-b", "trunk", bare).Run()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t.local",
			"GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t.local")
		cmd.CombinedOutput()
	}
	run("remote", "add", "origin", bare)
	run("push", "-q", "origin", "main:trunk")
	run("remote", "set-head", "origin", "trunk")

	if got := DefaultBase(context.Background(), dir); got != "trunk" {
		t.Fatalf("DefaultBase = %q, want trunk — a hardcoded main opens PRs against a branch that may not exist", got)
	}
}

// gh prints notices on the same stream as the URL, so the parser must not
// assume position.
func TestURLParsingSurvivesGHChatter(t *testing.T) {
	cases := []struct {
		out  string
		url  string
		want int
	}{
		{"https://github.com/o/r/pull/42\n", "https://github.com/o/r/pull/42", 42},
		{"Warning: 3 uncommitted changes\nhttps://github.com/o/r/pull/7\n",
			"https://github.com/o/r/pull/7", 7},
		{"Creating pull request for x into main in o/r\n\nhttps://github.com/o/r/pull/1234",
			"https://github.com/o/r/pull/1234", 1234},
		{"no url here", "", 0},
	}
	for _, c := range cases {
		if got := lastURL(c.out); got != c.url {
			t.Errorf("lastURL(%q) = %q, want %q", c.out, got, c.url)
		}
		if got := prNumber(lastURL(c.out)); got != c.want {
			t.Errorf("prNumber for %q = %d, want %d", c.out, got, c.want)
		}
	}
}
