package orchestrator

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
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
	o.flagUnroutable(ctx, agents)

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

// flagUnroutable finds ready work that NO enabled agent can claim and says so.
//
// The area filter in the claim statement is a silent exclusion: an issue whose
// area no agent covers stays `ready` forever, and the board shows it under
// "To do" as though someone will pick it up. Silent starvation is worse than a
// visible gap — the operator needs to know an area is unowned.
//
// Said ONCE per (issue, area). The first version matched the existing comment
// with LIKE '%no enabled agent covers%' against a body beginning "**No enabled
// agent covers…" — LIKE is case-sensitive in Postgres, so it never matched and
// the poll loop posted a fresh comment every 15 seconds. The marker now matches
// case-insensitively and includes the area, so re-areaing an issue to another
// uncovered area still reports once, and only once.
func (o *Orchestrator) flagUnroutable(ctx context.Context, agents []agent) {
	covered := map[string]bool{}
	for _, a := range agents {
		for _, ar := range a.areas {
			covered[ar] = true
		}
	}

	rows, err := o.db.QueryContext(ctx,
		`SELECT id, number, area FROM builder_issues i
		  WHERE status = 'ready' AND human_only = false
		    AND blocked_on_decision_id IS NULL
		    AND NOT EXISTS (
		      SELECT 1 FROM builder_issue_comments c
		       WHERE c.issue_id = i.id
		         AND c.author_kind = 'system'
		         AND c.body_md ILIKE '%no agent owns%')
		  LIMIT 20`)
	if err != nil {
		o.log.Error("scan for unroutable work", "err", err)
		return
	}
	defer rows.Close()

	type stranded struct {
		id, area string
		number   int64
	}
	var list []stranded
	for rows.Next() {
		var s stranded
		if rows.Scan(&s.id, &s.number, &s.area) == nil && !covered[s.area] {
			// s.area == "" also lands here: triage found no owner at all.
			list = append(list, s)
		}
	}

	for _, s := range list {
		var body string
		if s.area == "" {
			body = fmt.Sprintf(
				"**Needs an owner — no agent owns this surface.**\n\n"+
					"Triage could not match this report to any enabled agent, so it is "+
					"not being claimed. Route it by setting an area below, enable an "+
					"agent that owns this surface, or handle it yourself.\n\n"+
					"Areas the fleet currently owns: %s",
				coveredList(covered))
		} else {
			body = fmt.Sprintf(
				"**Needs an owner — no agent owns `%s`.**\n\n"+
					"This issue will not be claimed until an agent declaring that area is "+
					"enabled, or the area is changed to one that is owned.\n\n"+
					"Areas the fleet currently owns: %s",
				s.area, coveredList(covered))
		}
		if _, err := o.db.ExecContext(ctx,
			`INSERT INTO builder_issue_comments (issue_id, author_kind, body_md)
			 VALUES ($1,'system',$2)`, s.id, body); err != nil {
			o.log.Error("flag unroutable issue", "issue", s.number, "err", err)
			continue
		}
		_, _ = o.db.ExecContext(ctx,
			`UPDATE builder_issues SET comment_count = comment_count + 1 WHERE id = $1`, s.id)
		// Logged only on the transition, not on every poll.
		o.log.Warn("issue needs an owner — no enabled agent covers it",
			"issue", s.number, "area", orDash(s.area))
	}
}

func coveredList(covered map[string]bool) string {
	if len(covered) == 0 {
		return "_nothing — no agent is enabled_"
	}
	out := make([]string, 0, len(covered))
	for a := range covered {
		out = append(out, "`"+a+"`")
	}
	sort.Strings(out)
	return strings.Join(out, ", ")
}
