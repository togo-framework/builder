package deploy

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
)

// Deploying an agent's branch: verify, merge, and let the watcher restart.
//
// The loop deliberately stops at `in_review` — an agent never merges its own
// work. This is the operator's half of that gate: one button that runs the
// project's own verify command, merges the branch, and reports exactly what
// happened. The API does NOT restart itself; merging changes files on disk and
// the dev watcher picks them up, which avoids a process killing itself in the
// middle of serving the request that asked it to.
//
// Everything here refuses rather than forces. A merge that would conflict, a
// verify that fails, a branch that does not exist — each returns a reason the
// operator can act on, and leaves the tree exactly as it was.

type Service struct {
	db  *sql.DB
	log *slog.Logger
}

func New(db *sql.DB, log *slog.Logger) *Service { return &Service{db: db, log: log} }

func (s *Service) Routes(r chi.Router) {
	r.Get("/issues/{number}/deploy", s.handlePreview)
	r.Post("/issues/{number}/deploy", s.handleDeploy)
}

// repoFor returns the working tree an issue's branch lives in.
//
// Per-agent, because a fleet spans repositories: the branch for a widget issue
// is in the plugin, the branch for a dashboard issue is in the app.
func (s *Service) repoFor(ctx context.Context, agentSlug string) string {
	var dir string
	_ = s.db.QueryRowContext(ctx,
		`SELECT workdir FROM builder_agents WHERE slug = $1`, agentSlug).Scan(&dir)
	if strings.TrimSpace(dir) == "" {
		dir = os.Getenv("BUILDER_WORKDIR")
	}
	if dir == "" {
		dir = "."
	}
	return dir
}

type preview struct {
	Number     int64  `json:"number"`
	Status     string `json:"status"`
	Branch     string `json:"branch"`
	HeadSHA    string `json:"headSha"`
	Agent      string `json:"agent"`
	Repo       string `json:"repo"`
	Deployable bool   `json:"deployable"`
	Merged     bool   `json:"merged"`
	Reason     string `json:"reason,omitempty"`
	// What the agent said it did — the last thing it wrote, so the operator can
	// read the intent next to the diff rather than hunting for it in the thread.
	LastComment string   `json:"lastComment"`
	Files       []string `json:"files"`
	Added       int      `json:"added"`
	Removed     int      `json:"removed"`
	Diff        string   `json:"diff"`
}

func (s *Service) load(ctx context.Context, num int64) (*preview, error) {
	p := &preview{Number: num}
	var agent sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT status::text, coalesce(branch,''), coalesce(head_sha,''), assignee_agent_id
		   FROM builder_issues WHERE number = $1`, num).
		Scan(&p.Status, &p.Branch, &p.HeadSHA, &agent)
	if err != nil {
		return nil, err
	}
	p.Agent = agent.String
	p.Repo = s.repoFor(ctx, p.Agent)

	// c.body_md, not body_md: builder_issues has a body_md too, so the bare name
	// is ambiguous and the query errors. The error was being discarded, so the
	// agent's account of its own work silently came back empty — the one thing
	// this panel exists to show.
	if err := s.db.QueryRowContext(ctx,
		`SELECT c.body_md FROM builder_issue_comments c
		   JOIN builder_issues i ON i.id = c.issue_id
		  WHERE i.number = $1 AND c.author_kind = 'agent'
		  ORDER BY c.created_at DESC LIMIT 1`, num).Scan(&p.LastComment); err != nil && err != sql.ErrNoRows {
		s.log.Warn("could not read the agent's last comment", "issue", num, "err", err)
	}

	switch {
	case p.Branch == "":
		p.Reason = "this issue has no branch — no agent has produced a change for it yet"
	case p.Status != "in_review":
		p.Reason = fmt.Sprintf("the issue is %s; only work in review can be deployed", p.Status)
	case s.alreadyMerged(ctx, p.Repo, p.Branch):
		// Without this the preview shows `git diff HEAD..branch` on a branch
		// that is already an ancestor of HEAD, which is the REVERSE diff — it
		// reads as "this deploy will re-add everything the branch removed".
		p.Reason = "already merged into the working tree — nothing left to deploy"
		p.Merged = true
	default:
		p.Deployable = true
	}
	return p, nil
}

func (s *Service) handlePreview(w http.ResponseWriter, r *http.Request) {
	num, err := strconv.ParseInt(chi.URLParam(r, "number"), 10, 64)
	if err != nil {
		httpErr(w, http.StatusBadRequest, "not an issue number")
		return
	}
	p, err := s.load(r.Context(), num)
	if err != nil {
		httpErr(w, http.StatusNotFound, "no such issue")
		return
	}
	if p.Branch != "" {
		if st, err := git(r.Context(), p.Repo, "diff", "--numstat", "HEAD.."+p.Branch); err == nil {
			for _, line := range strings.Split(strings.TrimSpace(st), "\n") {
				f := strings.Fields(line)
				if len(f) < 3 {
					continue
				}
				add, _ := strconv.Atoi(f[0])
				del, _ := strconv.Atoi(f[1])
				p.Added += add
				p.Removed += del
				p.Files = append(p.Files, f[2])
			}
		}
		// Capped: a preview is for reading, and a 4000-line diff in a JSON
		// response helps nobody.
		if d, err := git(r.Context(), p.Repo, "diff", "HEAD.."+p.Branch); err == nil {
			p.Diff = truncate(d, 60000)
		}
	}
	writeJSON(w, http.StatusOK, p)
}

type deployResult struct {
	OK       bool     `json:"ok"`
	Step     string   `json:"step"`
	Message  string   `json:"message"`
	Output   string   `json:"output,omitempty"`
	MergeSHA string   `json:"mergeSha,omitempty"`
	Files    []string `json:"files,omitempty"`
}

func (s *Service) handleDeploy(w http.ResponseWriter, r *http.Request) {
	num, err := strconv.ParseInt(chi.URLParam(r, "number"), 10, 64)
	if err != nil {
		httpErr(w, http.StatusBadRequest, "not an issue number")
		return
	}
	p, err := s.load(r.Context(), num)
	if err != nil {
		httpErr(w, http.StatusNotFound, "no such issue")
		return
	}
	if !p.Deployable {
		writeJSON(w, http.StatusConflict, deployResult{Step: "check", Message: p.Reason})
		return
	}

	// A dirty tree means someone is mid-edit. Merging into it mixes their work
	// with the agent's and makes "what did this deploy change?" unanswerable.
	if out, err := git(r.Context(), p.Repo, "status", "--porcelain"); err != nil {
		writeJSON(w, http.StatusInternalServerError,
			deployResult{Step: "check", Message: "could not read the repository state"})
		return
	} else if strings.TrimSpace(out) != "" {
		writeJSON(w, http.StatusConflict, deployResult{
			Step:    "check",
			Message: "the working tree has uncommitted changes — commit or stash them first",
			Output:  truncate(out, 2000),
		})
		return
	}

	// Verify BEFORE merging. Merging first and reverting on failure leaves the
	// operator's tree touched by work that did not pass.
	if cmdline := verifyCommand(p.Repo); cmdline != "" {
		out, err := shell(r.Context(), p.Repo, cmdline, 8*time.Minute)
		if err != nil {
			s.log.Warn("deploy verify failed", "issue", num, "err", err)
			writeJSON(w, http.StatusUnprocessableEntity, deployResult{
				Step:    "verify",
				Message: "the project's verify command failed — nothing was merged",
				Output:  tail(out, 4000),
			})
			return
		}
	}

	msg := fmt.Sprintf("Merge #%d via deploy\n\nImplemented by %s on %s.\nDeployed by the operator from the issue page.",
		num, orDash(p.Agent), p.Branch)
	if out, err := git(r.Context(), p.Repo, "merge", "--no-ff", "-m", msg, p.Branch); err != nil {
		// Leave nothing half-merged.
		_, _ = git(r.Context(), p.Repo, "merge", "--abort")
		writeJSON(w, http.StatusConflict, deployResult{
			Step:    "merge",
			Message: "the merge conflicted and was aborted — the tree is unchanged",
			Output:  tail(out, 3000),
		})
		return
	}

	sha, _ := git(r.Context(), p.Repo, "rev-parse", "HEAD")
	sha = strings.TrimSpace(sha)

	_, _ = s.db.ExecContext(r.Context(),
		`UPDATE builder_issues
		    SET status = 'done', status_entered_at = now(), updated_at = now()
		  WHERE number = $1`, num)
	var issueID string
	_ = s.db.QueryRowContext(r.Context(),
		`SELECT id FROM builder_issues WHERE number = $1`, num).Scan(&issueID)
	if issueID != "" {
		_, _ = s.db.ExecContext(r.Context(),
			`INSERT INTO builder_issue_comments (issue_id, author_kind, body_md)
			 VALUES ($1,'system',$2)`,
			issueID, fmt.Sprintf(
				"**Deployed.** `%s` merged into the working tree as `%s`.\n\n"+
					"Frontend changes are live immediately; Go changes rebuild on the watcher's next pass.",
				p.Branch, short(sha)))
		_, _ = s.db.ExecContext(r.Context(),
			`UPDATE builder_issues SET comment_count = comment_count + 1 WHERE id = $1`, issueID)
	}

	s.log.Info("deployed", "issue", num, "branch", p.Branch, "sha", short(sha))
	writeJSON(w, http.StatusOK, deployResult{
		OK: true, Step: "done", MergeSHA: sha, Files: p.Files,
		Message: fmt.Sprintf("Merged %s. Frontend changes are live now; Go changes rebuild shortly.", p.Branch),
	})
}

// verifyCommand is the project's own gate, read from BUILDER_VERIFY_CMD.
//
// Empty means no gate — deliberate, because a blueprint cannot know how every
// project verifies itself, and inventing a command that fails on a fresh
// checkout would make the button useless on day one.
func verifyCommand(repo string) string {
	if c := strings.TrimSpace(os.Getenv("BUILDER_VERIFY_CMD")); c != "" {
		return c
	}
	return ""
}

func git(ctx context.Context, dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func shell(ctx context.Context, dir, cmdline string, d time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, d)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sh", "-c", cmdline)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "CI=1", "NO_COLOR=1")
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// truncate cuts to at most n BYTES without splitting a character.
//
// Plain s[:n] cuts mid-rune when the boundary lands inside a multi-byte
// character, leaving invalid UTF-8 that Postgres refuses to store. See the
// note in internal/issues — an emoji in a pin failed every report from that
// element, and Arabic is multi-byte throughout.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n] + "\n… truncated"
}

// tail keeps the END of command output. A failing build puts the reason in the
// last lines; truncating from the front throws away the only useful part.
func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return "… earlier output trimmed\n" + s[len(s)-n:]
}

func short(sha string) string {
	if len(sha) > 8 {
		return sha[:8]
	}
	return sha
}

func orDash(s string) string {
	if s == "" {
		return "an agent"
	}
	return s
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// alreadyMerged reports whether the branch is an ancestor of HEAD.
//
// `git merge-base --is-ancestor` exits 0 when it is. Anything else — including
// an unknown branch — is treated as not merged, so the deploy attempt fails
// loudly at the merge step rather than being silently skipped here.
func (s *Service) alreadyMerged(ctx context.Context, repo, branch string) bool {
	_, err := git(ctx, repo, "merge-base", "--is-ancestor", branch, "HEAD")
	return err == nil
}
