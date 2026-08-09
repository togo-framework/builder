package orchestrator

import (
	"context"
	"fmt"
	"strings"
)

// Applying what an agent proposed about OTHER agents' work.
//
// An agent declares a handoff or a spinoff in its verdict; nothing it says is
// acted on until it has been checked here. The agent proposes, the orchestrator
// decides — the same shape as every other verdict field, and the reason none of
// this is exposed to the session as a writable tool.

// applyHandoff reassigns the issue to another agent.
//
// Refused when the target does not exist, is disabled, or is the agent itself.
// A handoff to a disabled colleague is worse than none: the issue looks owned
// and is never claimed.
func (o *Orchestrator) applyHandoff(ctx context.Context, c *Claim, h *handoff) bool {
	if h == nil {
		return false
	}
	to := strings.TrimSpace(h.Agent)
	if to == "" || to == c.Agent {
		return false
	}

	var enabled bool
	if err := o.db.QueryRowContext(ctx,
		`SELECT enabled FROM builder_agents WHERE slug = $1`, to).Scan(&enabled); err != nil {
		o.comment(ctx, c, fmt.Sprintf(
			"**Tried to hand this to `%s`, who is not on the fleet.** Leaving it with me.", to))
		o.log.Warn("handoff to an unknown agent", "issue", c.Number, "to", to)
		return false
	}
	if !enabled {
		o.comment(ctx, c, fmt.Sprintf(
			"**Tried to hand this to `%s`, who is disabled.** Leaving it with me — "+
				"an issue assigned to an agent that never runs is worse than one nobody has claimed.", to))
		return false
	}

	// Reassign and return to the queue in one statement, fenced by the claim
	// token so a run that already lost its lease cannot reroute the new
	// holder's issue.
	//
	// attempt_count resets: the next agent is starting from scratch on a surface
	// it owns, and inheriting a burned budget would refuse it before it began.
	res, err := o.db.ExecContext(ctx,
		`UPDATE builder_issues
		    SET assignee_agent_id = $1,
		        status = 'ready'::builder_issue_status,
		        attempt_count = 0,
		        claim_token = NULL, claimed_by_run_id = NULL, lease_expires_at = NULL,
		        status_entered_at = now(), updated_at = now()
		  WHERE id = $2 AND claim_token = $3`, to, c.IssueID, c.Token)
	if err != nil {
		o.log.Error("handoff", "issue", c.Number, "to", to, "err", err)
		return false
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return false // lease lost; the new holder owns it
	}

	o.comment(ctx, c, fmt.Sprintf(
		"**Handed to `%s`.**\n\n%s\n\n_Reassigned by `%s`, which is why this is back in the queue._",
		to, orDefault(h.Why, "Closer to their surface than mine."), c.Agent))
	_, _ = o.db.ExecContext(ctx,
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind, actor_agent_id, run_id, detail)
		 VALUES ($1,'moved','agent',$2,$3,$4::jsonb)`,
		c.IssueID, c.Agent, c.RunID,
		fmt.Sprintf(`{"by":"handoff","to":%q}`, to))

	o.log.Info("handed off", "issue", c.Number, "from", c.Agent, "to", to)
	return true
}

// maxSpinoffs bounds one run's output. A run that files thirty issues has not
// decomposed the work, it has lost track of it — and the board is the operator's
// to read.
const maxSpinoffs = 5

// applySpinoffs files the new issues a run proposed.
func (o *Orchestrator) applySpinoffs(ctx context.Context, c *Claim, list []spinoff) {
	if len(list) == 0 {
		return
	}
	if len(list) > maxSpinoffs {
		o.log.Warn("run proposed more spinoffs than allowed",
			"issue", c.Number, "proposed", len(list), "cap", maxSpinoffs)
		list = list[:maxSpinoffs]
	}

	var filed []string
	for _, s := range list {
		title := strings.TrimSpace(s.Title)
		if title == "" {
			continue
		}

		// An assignee is verified, or dropped. assignee_agent_id is a foreign
		// key, so an invented slug fails the insert — and silently losing the
		// whole issue because one field was wrong is the wrong trade.
		assignee := strings.TrimSpace(s.Agent)
		if assignee != "" {
			var enabled bool
			if err := o.db.QueryRowContext(ctx,
				`SELECT enabled FROM builder_agents WHERE slug = $1`, assignee).Scan(&enabled); err != nil || !enabled {
				o.log.Warn("spinoff named an agent that cannot take work",
					"issue", c.Number, "agent", assignee)
				assignee = "" // the lead routes it instead
			}
		}

		n, err := o.fileSpinoff(ctx, c, title, s.Body, s.Area, assignee)
		if err != nil {
			o.log.Error("file spinoff", "issue", c.Number, "title", title, "err", err)
			continue
		}
		if assignee != "" {
			filed = append(filed, fmt.Sprintf("#%d %s → `%s`", n, title, assignee))
		} else {
			filed = append(filed, fmt.Sprintf("#%d %s", n, title))
		}
	}

	if len(filed) > 0 {
		o.comment(ctx, c, "**Filed follow-up work:**\n\n- "+strings.Join(filed, "\n- ")+
			"\n\n_Opened by `"+c.Agent+"` while working on this issue. Each goes through triage like any other._")
	}
}

func (o *Orchestrator) fileSpinoff(
	ctx context.Context, c *Claim, title, body, area, assignee string,
) (int64, error) {
	tx, err := o.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	var number int64
	if err := tx.QueryRowContext(ctx,
		// The same counter as everything else: one sequence, or two issues end
		// up called #12.
		`INSERT INTO builder_issue_counters (scope, next_seq) VALUES ('default', 2)
		 ON CONFLICT (scope) DO UPDATE SET next_seq = builder_issue_counters.next_seq + 1
		 RETURNING next_seq - 1`).Scan(&number); err != nil {
		return 0, err
	}

	// Traceable to its parent. An issue that appears on the board with no
	// explanation of where it came from is indistinguishable from one somebody
	// filed and forgot.
	full := truncateText(strings.TrimSpace(body), 60000)
	full += fmt.Sprintf("\n\n---\n\n_Filed by `%s` while working on #%d._", c.Agent, c.Number)

	var id string
	if err := tx.QueryRowContext(ctx,
		`INSERT INTO builder_issues
		   (number, title, body_md, status, type, priority, area, human_only,
		    board_rank, source, route, page_url, locale, reporter_kind, assignee_agent_id)
		 VALUES ($1,$2,$3,'triage','chore','normal',$4,false,$5,'agent','','','en','agent',NULLIF($6,''))
		 RETURNING id`,
		number, truncateText(title, 500), full,
		truncateText(strings.TrimSpace(area), 120), number*1000, assignee,
	).Scan(&id); err != nil {
		return 0, err
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind, actor_agent_id, detail)
		 VALUES ($1,'created','agent',$2,$3::jsonb)`,
		id, c.Agent, fmt.Sprintf(`{"via":"spinoff","from":%d}`, c.Number)); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}

	o.log.Info("spinoff filed", "issue", number, "from", c.Number,
		"agent", c.Agent, "assignee", orDefault(assignee, "(unrouted)"))
	return number, nil
}
