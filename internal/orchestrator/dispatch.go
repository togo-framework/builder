package orchestrator

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// dispatch gives each enabled builder agent one chance to claim work per tick.
//
// Only `builder` agents may claim an implement run. The invariant is enforced
// on read here as well as by the database CHECK, because the UI is not a
// security boundary — a row edited to say `advisor` must not be able to write
// code, and one edited to say `builder` must still satisfy the brain
// requirement before it can.
// maxConcurrentRuns bounds how many implement sessions run at once. Each holds a
// git worktree and a model session, so this is a real resource ceiling, not a
// stylistic one.
const maxConcurrentRuns = 3

type agent struct {
	slug, model, persona string
	areas                []string
	// workdir is the repository this agent works in. Empty means the fleet
	// default (BUILDER_WORKDIR).
	workdir string
}

func (o *Orchestrator) dispatch(ctx context.Context) {
	// Concurrency is capped by RUNS IN FLIGHT, not by truncating the agent list.
	//
	// This used to be `LIMIT 4`, which was doing double duty as a concurrency cap
	// and quietly starving the fleet: combined with `ORDER BY last_run_at NULLS
	// FIRST` it selected exactly the agents that had never run. With seven agents
	// enabled, the four never-run ones owned none of the queued areas, so nothing
	// was ever claimed while three agents that DID own the work sat idle.
	var inFlight int
	if err := o.db.QueryRowContext(ctx,
		// Only LIVE runs count. Counting frozen rows meant three crashed runs
		// permanently deadlocked the fleet: every tick saw inFlight >= 3 and
		// returned before asking a single agent.
		`SELECT count(*) FROM builder_runs
		  WHERE status = 'running'
		    AND coalesce(heartbeat_at, started_at) > now() - interval '30 minutes'`).Scan(&inFlight); err != nil {
		o.log.Error("count in-flight runs", "err", err)
		return
	}
	if inFlight >= maxConcurrentRuns {
		return
	}

	// Every eligible agent is considered. Least-recently-run first is still the
	// fair order; it is no longer also a filter.
	rows, err := o.db.QueryContext(ctx,
		`SELECT slug, model, areas, persona_md, workdir
		   FROM builder_agents
		  WHERE enabled = true AND role = 'builder' AND persona_md <> ''
		  ORDER BY last_run_at NULLS FIRST`)
	if err != nil {
		o.log.Error("list builders", "err", err)
		return
	}
	var agents []agent
	for rows.Next() {
		var a agent
		var areas sql.NullString
		if err := rows.Scan(&a.slug, &a.model, &areas, &a.persona, &a.workdir); err != nil {
			continue
		}
		a.areas = parsePGArray(areas.String)
		agents = append(agents, a)
	}
	rows.Close()

	if len(agents) == 0 {
		return // nothing enabled; the queue simply waits
	}
	// Unowned work is NOT reported here any more.
	//
	// This used to post "Needs an owner — no agent owns this surface", listing
	// forty area slugs and asking the operator to pick one. That is not a
	// status; it is the router giving up and handing its job to a person — and
	// it fired on every issue whose triage-guessed area happened not to appear
	// in somebody's list, which for anything phrased in a user's own words is
	// most of them. RouteOne reads the roster and assigns by meaning instead.
	o.flagExhausted(ctx)

	for _, a := range agents {
		if inFlight >= maxConcurrentRuns {
			return
		}
		c, err := o.ClaimFor(ctx, a.slug, a.model, a.areas)
		if errors.Is(err, ErrNoWork) {
			// THIS agent has nothing in its areas. That says nothing about the
			// others — claims are area-scoped. Returning here meant one agent
			// with no matching work silently blocked the whole fleet.
			continue
		}
		if err != nil {
			o.log.Error("claim", "agent", a.slug, "err", err)
			continue
		}
		_, _ = o.db.ExecContext(ctx,
			`UPDATE builder_agents SET last_run_at = now() WHERE slug = $1`, a.slug)
		inFlight++

		// Detached: an implement run takes minutes and must not block the tick.
		go func(c *Claim, persona string, areas []string, workdir string) {
			defer func() {
				if r := recover(); r != nil {
					o.log.Error("implement panicked", "issue", c.Number, "panic", r)
					o.release(context.Background(), c, "runner panicked")
				}
			}()
			o.Implement(context.Background(), c, persona, areas, workdir)
		}(c, a.persona, a.areas, a.workdir)
	}
}

func parsePGArray(s string) []string {
	if len(s) < 2 || s[0] != '{' || s[len(s)-1] != '}' {
		return nil
	}
	s = s[1 : len(s)-1]
	if s == "" {
		return nil
	}
	out := []string{}
	cur := ""
	inQ := false
	for _, r := range s {
		switch {
		case r == '"':
			inQ = !inQ
		case r == ',' && !inQ:
			out = append(out, cur)
			cur = ""
		default:
			cur += string(r)
		}
	}
	return append(out, cur)
}

// flagExhausted says so when an issue has used every attempt.
//
// The claim statement excludes `attempt_count >= max_attempts` — correctly, or a
// mis-specified issue would burn budget forever. But the exclusion is silent:
// the issue keeps its `ready` status and its place on the board while being
// permanently unclaimable. Two issues sat like that for an hour, and the only
// visible symptom was that no agent ever touched them.
//
// Said once per issue, and it moves the issue to `blocked` so the board stops
// claiming the work is queued when it is not.
func (o *Orchestrator) flagExhausted(ctx context.Context) {
	rows, err := o.db.QueryContext(ctx,
		`SELECT id, number, attempt_count, max_attempts
		   FROM builder_issues i
		  WHERE status = 'ready'
		    AND attempt_count >= max_attempts
		    AND NOT EXISTS (
		      SELECT 1 FROM builder_issue_comments c
		       WHERE c.issue_id = i.id AND c.author_kind = 'system'
		         AND c.body_md ILIKE '%every attempt%')
		  LIMIT 20`)
	if err != nil {
		o.log.Error("scan for exhausted issues", "err", err)
		return
	}
	defer rows.Close()

	type stuck struct {
		id             string
		number         int64
		attempts, max_ int
	}
	var list []stuck
	for rows.Next() {
		var s stuck
		if rows.Scan(&s.id, &s.number, &s.attempts, &s.max_) == nil {
			list = append(list, s)
		}
	}
	rows.Close()

	for _, s := range list {
		body := fmt.Sprintf(
			"**Stopped — this issue has used every attempt (%d of %d).**\n\n"+
				"No agent will claim it again until the attempts are reset. Three runs "+
				"that all stopped without a fix usually means the issue is "+
				"under-specified rather than hard: say what the expected result is, "+
				"or narrow it to one change, then press Retry.",
			s.attempts, s.max_)
		if _, err := o.db.ExecContext(ctx,
			`INSERT INTO builder_issue_comments (issue_id, author_kind, body_md)
			 VALUES ($1,'system',$2)`, s.id, body); err != nil {
			o.log.Error("flag exhausted issue", "issue", s.number, "err", err)
			continue
		}
		_, _ = o.db.ExecContext(ctx,
			`UPDATE builder_issues
			    SET comment_count = comment_count + 1,
			        status = 'blocked', status_entered_at = now(), updated_at = now()
			  WHERE id = $1 AND status = 'ready'`, s.id)
		o.log.Warn("issue has used every attempt", "issue", s.number,
			"attempts", s.attempts, "max", s.max_)
	}
}
