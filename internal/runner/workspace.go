package runner

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Workspace is an isolated git worktree for one agent run.
//
// A worktree, not a branch in the main checkout: two agents working
// concurrently in one directory would overwrite each other, and an operator
// editing the same files while an agent runs would see their work vanish under
// a checkout. Each run gets its own directory and its own branch.
type Workspace struct {
	Repo    string // the main checkout
	Dir     string // the worktree
	Branch  string
	BaseSHA string
}

// Diff is what the runner DERIVED from git — never what the agent claimed.
//
// The agent's verdict is a hint about intent. The facts come from the
// repository, because an agent that believes it changed three files and
// actually changed thirty is exactly the case the caps exist to catch.
type Diff struct {
	Files   []string
	Added   int
	Removed int

	// New files versus existing ones, counted apart.
	//
	// Blast radius is what a change DISTURBS, not what it adds. Two thousand
	// lines across five brand-new files cannot break one line of what already
	// works — nothing imports them yet. Three hundred lines rewritten across
	// twenty existing files can break all twenty. Measured as one number those
	// two are indistinguishable, and the second is by far the more dangerous.
	//
	// So the caps are applied to Touched* only, and the totals serve as a
	// runaway guard rather than as the design limit.
	NewFiles       []string
	TouchedFiles   []string
	TouchedAdded   int
	TouchedRemoved int

	HeadSHA    string
	HasChanges bool
}

// NewWorkspace creates a worktree on a fresh branch off the base ref.
func NewWorkspace(ctx context.Context, repo, base, branch string) (*Workspace, error) {
	if base == "" {
		base = "HEAD"
	}
	baseSHA, err := git(ctx, repo, "rev-parse", base)
	if err != nil {
		return nil, fmt.Errorf("resolve %s: %w", base, err)
	}
	baseSHA = strings.TrimSpace(baseSHA)

	root := os.Getenv("BUILDER_WORKTREE_ROOT")
	if root == "" {
		root = filepath.Join(os.TempDir(), "builder-worktrees")
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, fmt.Errorf("create worktree root: %w", err)
	}
	dir := filepath.Join(root, strings.ReplaceAll(branch, "/", "-"))

	// A leftover worktree from a crashed run would make `worktree add` fail, so
	// clear it first. Removing a stale worktree is safe; its branch survives.
	_, _ = git(ctx, repo, "worktree", "remove", "--force", dir)
	_ = os.RemoveAll(dir)
	_, _ = git(ctx, repo, "branch", "-D", branch)

	if _, err := git(ctx, repo, "worktree", "add", "-b", branch, dir, baseSHA); err != nil {
		return nil, fmt.Errorf("create worktree: %w", err)
	}
	return &Workspace{Repo: repo, Dir: dir, Branch: branch, BaseSHA: baseSHA}, nil
}

// Diff derives what actually changed. This is the only source of truth about a
// run's effect.
func (w *Workspace) Diff(ctx context.Context) (Diff, error) {
	var d Diff

	// Stage everything so new files count too — an untracked file is still a
	// change the agent made, and `git diff` alone would not see it.
	if _, err := git(ctx, w.Dir, "add", "-A"); err != nil {
		return d, fmt.Errorf("stage: %w", err)
	}

	names, err := git(ctx, w.Dir, "diff", "--cached", "--name-only", w.BaseSHA)
	if err != nil {
		return d, fmt.Errorf("diff names: %w", err)
	}
	for _, l := range strings.Split(strings.TrimSpace(names), "\n") {
		if l = strings.TrimSpace(l); l != "" {
			d.Files = append(d.Files, l)
		}
	}
	d.HasChanges = len(d.Files) > 0

	stat, err := git(ctx, w.Dir, "diff", "--cached", "--numstat", w.BaseSHA)
	if err == nil {
		for _, l := range strings.Split(strings.TrimSpace(stat), "\n") {
			f := strings.Fields(l)
			if len(f) < 2 {
				continue
			}
			// "-" appears for binary files; skip rather than fail the run.
			if a, err := strconv.Atoi(f[0]); err == nil {
				d.Added += a
			}
			if r, err := strconv.Atoi(f[1]); err == nil {
				d.Removed += r
			}
		}
	}

	// Split by whether the file existed at base. Asking git with --diff-filter
	// is more reliable than parsing --name-status ourselves, because renames and
	// copies print a similarity score and an arrow form that is easy to
	// mis-split on whitespace.
	d.NewFiles, _, _ = w.filterStat(ctx, "A")
	d.TouchedFiles, d.TouchedAdded, d.TouchedRemoved = w.filterStat(ctx, "MDRCT")

	return d, nil
}

// filterStat reports the files and line counts for one class of change.
//
// Errors are swallowed deliberately and reported as zero: this feeds a safety
// cap, and a cap that cannot be measured must not be the thing that fails a run
// which otherwise succeeded. A zero here means the caller sees a smaller
// blast radius than reality — which is caught by the total-churn guard that is
// derived from the plain numstat above and cannot silently read as zero.
func (w *Workspace) filterStat(ctx context.Context, filter string) ([]string, int, int) {
	out, err := git(ctx, w.Dir, "diff", "--cached", "--numstat",
		"--diff-filter="+filter, w.BaseSHA)
	if err != nil {
		return nil, 0, 0
	}
	var files []string
	var added, removed int
	for _, l := range strings.Split(strings.TrimSpace(out), "\n") {
		f := strings.Fields(l)
		if len(f) < 3 {
			continue
		}
		if a, err := strconv.Atoi(f[0]); err == nil {
			added += a
		}
		if r, err := strconv.Atoi(f[1]); err == nil {
			removed += r
		}
		// For a rename numstat prints "old => new"; the last field is close
		// enough for a count and a message, and nothing downstream opens it.
		files = append(files, f[len(f)-1])
	}
	return files, added, removed
}

// Commit records the work with provenance in the trailer.
//
// Never `git add -A` at this point — Diff already staged deliberately, and the
// blast-radius check has run against that staged set. Committing a wider set
// than was checked would defeat the check.
func (w *Workspace) Commit(ctx context.Context, msg, agent, model, runID string, issue int64) (string, error) {
	body := fmt.Sprintf("%s\n\nIssue: #%d\nAgent: %s\nModel: %s\nRun: %s\n",
		strings.TrimSpace(msg), issue, agent, model, runID)

	if _, err := gitEnv(ctx, w.Dir,
		[]string{
			"GIT_AUTHOR_NAME=" + agent,
			"GIT_AUTHOR_EMAIL=" + agent + "@agents.local",
			"GIT_COMMITTER_NAME=builder",
			"GIT_COMMITTER_EMAIL=builder@togo.local",
		},
		"commit", "-m", body); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	sha, err := git(ctx, w.Dir, "rev-parse", "HEAD")
	return strings.TrimSpace(sha), err
}

// RevertOutside undoes any change to a path outside the allowlist.
//
// Belt and braces with the guard hooks: a hook constrains the agent's own
// shell, but a subagent, a script the agent ran, or a tool that writes
// indirectly can all land a file the hook never saw. This runs after the fact
// against the real diff, so it catches whatever got through.
func (w *Workspace) RevertOutside(ctx context.Context, allowed []string, files []string) ([]string, error) {
	if len(allowed) == 0 {
		return nil, nil // no allowlist configured: nothing to enforce
	}
	var reverted []string
	for _, f := range files {
		if pathAllowed(f, allowed) {
			continue
		}
		// Restore from the base ref. For a file that did not exist at base this
		// fails, so remove it instead.
		if _, err := git(ctx, w.Dir, "checkout", w.BaseSHA, "--", f); err != nil {
			_, _ = git(ctx, w.Dir, "rm", "-f", "--ignore-unmatch", f)
		}
		reverted = append(reverted, f)
	}
	return reverted, nil
}

// pathAllowed matches a path against prefix patterns. A trailing "/**" or "/"
// means "this directory and everything under it".
func pathAllowed(path string, allowed []string) bool {
	path = filepath.ToSlash(path)
	for _, a := range allowed {
		a = strings.TrimSuffix(strings.TrimSuffix(filepath.ToSlash(a), "**"), "/")
		if a == "" {
			continue
		}
		if path == a || strings.HasPrefix(path, a+"/") {
			return true
		}
	}
	return false
}

// Remove tears the worktree down. The branch survives so a PR can be opened
// from it after the directory is gone.
func (w *Workspace) Remove(ctx context.Context) {
	_, _ = git(ctx, w.Repo, "worktree", "remove", "--force", w.Dir)
	_ = os.RemoveAll(w.Dir)
}

func git(ctx context.Context, dir string, args ...string) (string, error) {
	return gitEnv(ctx, dir, nil, args...)
}

func gitEnv(ctx context.Context, dir string, env []string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	cmd.Env = append(append(os.Environ(), "GIT_TERMINAL_PROMPT=0"), env...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("git %s: %w: %s",
			strings.Join(args, " "), err, firstLine(string(out)))
	}
	return string(out), nil
}
