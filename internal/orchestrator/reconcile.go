package orchestrator

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/togo-framework/builder/internal/runner"
)

// Reconciling runs whose owning process is gone.
//
// builder_runs had exactly one terminal writer: finish(), reachable only from
// the live goroutine holding the *Claim. Kill the process — a deploy, a crash, a
// restart — and the row froze at status='running' forever. Nothing swept it.
//
// That was not merely cosmetic. dispatch() counts running rows against
// maxConcurrentRuns, so three frozen rows deadlock the whole fleet: every tick
// returns early and no agent can ever claim again. The schema anticipated this —
// builder_run_status has an 'expired' member and there is a partial index
// builder_runs_live on (heartbeat_at) WHERE status='running' — but nothing ever
// wrote 'expired' or read heartbeat_at in a predicate.
//
// Two mechanisms, deliberately different, because "is the owner alive?" has an
// exact answer in one case and only a heuristic in the other.

// reconcileOwnRuns closes runs this HOST started under a DIFFERENT pid.
//
// Exact, not a timeout: a fresh process on the same host proves the old pid is
// gone. claimed_by is "host:pid:nonce" — the nonce differs per claim, but the
// host:pid prefix identifies the process. Scoped to this host so that a rolling
// deploy cannot let a booting replica expire another replica's healthy runs,
// which is what an unconditional boot sweep would do.
func (o *Orchestrator) reconcileOwnRuns(ctx context.Context) {
	host, _ := osHostname()
	pid := fmt.Sprintf("%d", osGetpid())

	rows, err := o.db.QueryContext(ctx,
		// tmux_session comes back so the orphaned session can be reaped with the
		// orphaned worktree. A tmux server outlives the builder that created the
		// session, so a crash mid-run is the one path where kill-on-completion
		// never runs — this is where that leak is closed.
		//
		// Deliberately NOT cleared in this statement: RETURNING reports the new
		// row, so setting it to '' here would hand back an empty name and the
		// session would survive. It is cleared per row after the reap.
		`UPDATE builder_runs
		    SET status = 'expired', terminal_reason = 'lease_lost', ended_at = now(),
		        error = 'the owning process is gone (restart or crash)'
		  WHERE status = 'running'
		    AND split_part(claimed_by, ':', 1) = $1
		    AND split_part(claimed_by, ':', 2) <> $2
		  RETURNING id, issue_id, coalesce(worktree_path, ''),
		            coalesce(tmux_session, '')`, host, pid)
	if err != nil {
		o.log.Error("reconcile own runs", "err", err)
		return
	}
	defer rows.Close()

	type orphan struct{ runID, issueID, worktree, tmux string }
	var orphans []orphan
	for rows.Next() {
		var o1 orphan
		if rows.Scan(&o1.runID, &o1.issueID, &o1.worktree, &o1.tmux) == nil {
			orphans = append(orphans, o1)
		}
	}
	rows.Close()

	for _, o1 := range orphans {
		o.releaseOrphanedIssue(ctx, o1.issueID, o1.runID)
		o.removeOrphanedWorktree(o1.worktree)
		if o1.tmux != "" {
			runner.ReapTmuxSession(o.log, o1.tmux)
			_, _ = o.db.ExecContext(ctx,
				`UPDATE builder_runs SET tmux_session = '' WHERE id = $1`, o1.runID)
		}
	}
	if len(orphans) > 0 {
		o.log.Warn("reconciled runs whose process was restarted", "count", len(orphans))
	}
}

// sweepStaleRuns closes runs from ANOTHER host that stopped heartbeating.
//
// A remote process cannot be proven dead, so this is a timeout — and the
// threshold is derived from LeaseTTL rather than hardcoded. The heartbeat ticker
// runs every LeaseTTL/3, so anything shorter than LeaseTTL would kill healthy
// runs mid-session. coalesce(heartbeat_at, started_at) is what protects a run
// that has not beaten yet; testing `heartbeat_at IS NULL` would expire every run
// the instant it was claimed.
func (o *Orchestrator) sweepStaleRuns(ctx context.Context) {
	host, _ := osHostname()
	secs := int(o.cfg.LeaseTTL.Seconds())

	rows, err := o.db.QueryContext(ctx,
		`UPDATE builder_runs
		-- tmux_session is cleared but NOT reaped: this sweep only ever touches
		-- runs owned by a different host, and that host's tmux server is not
		-- reachable from here. Clearing it at least stops the dashboard offering
		-- an attach command for a session on a machine the operator is not on.
		    SET status = 'expired', terminal_reason = 'lease_lost', ended_at = now(),
		        error = 'no heartbeat within the lease window', tmux_session = ''
		  WHERE status = 'running'
		    AND split_part(claimed_by, ':', 1) <> $1
		    AND coalesce(heartbeat_at, started_at) < now() - ($2 * interval '1 second')
		  RETURNING id, issue_id`, host, secs)
	if err != nil {
		o.log.Error("sweep stale runs", "err", err)
		return
	}
	defer rows.Close()
	type orphan struct{ runID, issueID string }
	var orphans []orphan
	for rows.Next() {
		var o1 orphan
		if rows.Scan(&o1.runID, &o1.issueID) == nil {
			orphans = append(orphans, o1)
		}
	}
	rows.Close()
	for _, o1 := range orphans {
		o.releaseOrphanedIssue(ctx, o1.issueID, o1.runID)
	}
	if len(orphans) > 0 {
		o.log.Warn("swept runs with no heartbeat", "count", len(orphans))
	}
}

// releaseOrphanedIssue returns the issue that a dead run was holding.
//
// Guarded by claimed_by_run_id so it can only release the issue THIS run owned;
// if the issue has since been re-claimed by someone else, this affects no rows.
// assignee_agent_id is deliberately preserved — operators now set it by hand,
// and the lease reaper wiping it silently undid their routing.
func (o *Orchestrator) releaseOrphanedIssue(ctx context.Context, issueID, runID string) {
	// The attempt is REFUNDED. It is charged at claim time, which is right when
	// an agent gets its turn and fails — and wrong when the process was killed
	// out from under it. The agent never ran; it did not get a turn to fail.
	//
	// Without this, every restart of the API silently spends one attempt on
	// every in-flight issue, and three restarts exhaust an issue that has never
	// once been worked on. Issue #37 died exactly that way: three "starting
	// work" comments, zero files changed, two runs closed as "the owning process
	// is gone", and then "this issue has used every attempt (3 of 3)" — advising
	// a human to re-specify an issue whose agent had never finished a sentence.
	//
	// Safe against a poison-pill loop: a subagent runs in a child process and
	// cannot kill this one, so a run only lands here when the operator or the
	// host stopped us — and a host that restarts in a loop is a problem the
	// warning below is for, not one to hide by burning issue attempts.
	_, err := o.db.ExecContext(ctx,
		`UPDATE builder_issues
		    SET status = 'ready', claim_token = NULL, claimed_by_run_id = NULL,
		        lease_expires_at = NULL, attempt_count = GREATEST(attempt_count - 1, 0),
		        status_entered_at = now(), updated_at = now()
		  WHERE id = $1 AND claimed_by_run_id = $2 AND status = 'in_progress'`,
		issueID, runID)
	if err != nil {
		o.log.Error("release orphaned issue", "issue", issueID, "err", err)
	}
}

// removeOrphanedWorktree collects the directory a dead run left behind.
//
// worktree_path is recorded at claim time precisely so this is possible. Without
// it the directories accumulate on disk and `git worktree list` fills with
// entries whose branches cannot be checked out anywhere else.
func (o *Orchestrator) removeOrphanedWorktree(dir string) {
	if dir == "" {
		return
	}
	// Only ever inside the harness's own worktree root — never a path that
	// happens to be in the column.
	if !strings.Contains(dir, "builder-worktrees") {
		o.log.Warn("refusing to remove an unexpected worktree path", "path", dir)
		return
	}
	if err := os.RemoveAll(dir); err != nil {
		o.log.Warn("could not remove orphaned worktree", "path", dir, "err", err)
	}
}
