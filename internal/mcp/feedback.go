package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// The feedback surface: the issue board, for an agent that lives outside this
// process.
//
// Read AND write, deliberately. A read-only board would let an outside agent
// notice a bug and give it nowhere to put it, which is the situation the
// feedback widget exists to fix for humans.

type listIssuesArgs struct {
	Status string `json:"status,omitempty" jsonschema:"filter by status: triage, ready, in_progress, blocked, in_review, done, rejected"`
	Area   string `json:"area,omitempty" jsonschema:"filter by area slug"`
	Query  string `json:"query,omitempty" jsonschema:"match against title and body"`
	Limit  int    `json:"limit,omitempty" jsonschema:"how many to return (default 25, max 100)"`
}

type getIssueArgs struct {
	Number int64 `json:"number" jsonschema:"the issue number, as shown on the board"`
}

type createIssueArgs struct {
	Title     string `json:"title" jsonschema:"one line saying what needs doing"`
	Body      string `json:"body,omitempty" jsonschema:"markdown. What does done look like? Leave empty and triage will ask."`
	Type      string `json:"type,omitempty" jsonschema:"bug, feature, enhancement, question, discussion or chore"`
	Priority  string `json:"priority,omitempty" jsonschema:"low, normal, high or critical"`
	Area      string `json:"area,omitempty" jsonschema:"the surface this touches; leave empty and the lead will route it"`
	HumanOnly bool   `json:"humanOnly,omitempty" jsonschema:"true if no agent should ever claim it"`
}

type commentArgs struct {
	Number int64  `json:"number" jsonschema:"the issue number"`
	Body   string `json:"body" jsonschema:"markdown. Starting with 'approved' or 'rejected' answers an open question and unblocks or closes the issue."`
}

// feedbackServer builds the MCP server for the issue plane.
//
// A new server per request rather than one shared instance: the SDK ties a
// session to a server, and the tools close over the calling token so an audit
// trail can name which credential filed what.
func (s *Service) feedbackServer(c *caller) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{
		Name:    "builder-feedback",
		Version: "1.0.0",
	}, nil)

	mcp.AddTool(srv, &mcp.Tool{
		Name: "list_issues",
		Description: "List issues on the builder board. Use this before filing " +
			"anything, so you comment on the existing issue instead of opening a duplicate.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, a listIssuesArgs) (*mcp.CallToolResult, any, error) {
		return s.listIssues(ctx, a)
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name: "get_issue",
		Description: "Read one issue in full: body, pinned elements, the whole " +
			"discussion, and what each agent did to it.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, a getIssueArgs) (*mcp.CallToolResult, any, error) {
		return s.getIssue(ctx, a.Number)
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name: "create_issue",
		Description: "File an issue on the builder board. It enters triage, which " +
			"classifies it and either queues it for an agent or asks you a question.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, a createIssueArgs) (*mcp.CallToolResult, any, error) {
		return s.createIssue(ctx, c, a)
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name: "comment_on_issue",
		Description: "Add a comment. A comment beginning `approved` releases a " +
			"blocked issue back to the queue; one beginning `rejected` closes it.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, a commentArgs) (*mcp.CallToolResult, any, error) {
		return s.commentOnIssue(ctx, c, a)
	})

	return srv
}

func (s *Service) listIssues(ctx context.Context, a listIssuesArgs) (*mcp.CallToolResult, any, error) {
	limit := a.Limit
	if limit <= 0 || limit > 100 {
		limit = 25
	}

	where := []string{"TRUE"}
	args := []any{}
	// Returns the placeholder for a value, so a clause can name it as many
	// times as it likes. The first version tried to bake the numbering into a
	// format string and produced "$3 OR $%!d(MISSING)" for the one clause that
	// needed its argument twice.
	bind := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}
	if a.Status != "" {
		where = append(where, "i.status = "+bind(a.Status)+"::builder_issue_status")
	}
	if a.Area != "" {
		where = append(where, "i.area = "+bind(a.Area))
	}
	if a.Query != "" {
		q := bind("%" + a.Query + "%")
		where = append(where, "(i.title ILIKE "+q+" OR i.body_md ILIKE "+q+")")
	}

	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
SELECT i.number, i.title, i.status::text, i.type::text, i.priority::text,
       coalesce(i.area,''), i.human_only, coalesce(i.assignee_agent_id,''),
       i.comment_count, btrim(to_json(i.created_at)::text,'"')
  FROM builder_issues i
 WHERE %s
 ORDER BY i.created_at DESC
 LIMIT $%d`, strings.Join(where, " AND "), len(args)), args...)
	if err != nil {
		return nil, nil, fmt.Errorf("list issues: %w", err)
	}
	defer rows.Close()

	var b strings.Builder
	n := 0
	for rows.Next() {
		var num int64
		var title, status, typ, prio, area, assignee, created string
		var humanOnly bool
		var comments int
		if rows.Scan(&num, &title, &status, &typ, &prio, &area, &humanOnly,
			&assignee, &comments, &created) != nil {
			continue
		}
		n++
		fmt.Fprintf(&b, "#%d  %s\n    %s · %s · %s", num, title, status, typ, prio)
		if area != "" {
			fmt.Fprintf(&b, " · area %s", area)
		}
		if assignee != "" {
			fmt.Fprintf(&b, " · %s", assignee)
		}
		if humanOnly {
			b.WriteString(" · HUMAN ONLY")
		}
		fmt.Fprintf(&b, " · %d comments\n", comments)
	}
	if n == 0 {
		return textResult("No issues matched."), nil, nil
	}
	return textResult(fmt.Sprintf("%d issue(s):\n\n%s", n, b.String())), nil, nil
}

func (s *Service) getIssue(ctx context.Context, number int64) (*mcp.CallToolResult, any, error) {
	var id, title, body, status, typ, prio, area, assignee, route string
	var humanOnly bool
	if err := s.db.QueryRowContext(ctx,
		`SELECT id, title, body_md, status::text, type::text, priority::text,
		        coalesce(area,''), coalesce(assignee_agent_id,''), human_only,
		        coalesce(route,'')
		   FROM builder_issues WHERE number = $1`, number).
		Scan(&id, &title, &body, &status, &typ, &prio, &area, &assignee,
			&humanOnly, &route); err != nil {
		return textResult(fmt.Sprintf("No issue #%d.", number)), nil, nil
	}

	var b strings.Builder
	fmt.Fprintf(&b, "# #%d %s\n\n", number, title)
	fmt.Fprintf(&b, "status %s · %s · %s", status, typ, prio)
	if area != "" {
		fmt.Fprintf(&b, " · area %s", area)
	}
	if assignee != "" {
		fmt.Fprintf(&b, " · assigned to %s", assignee)
	}
	if humanOnly {
		b.WriteString(" · HUMAN ONLY (no agent will claim it)")
	}
	if route != "" {
		fmt.Fprintf(&b, "\nreported from %s", route)
	}
	fmt.Fprintf(&b, "\n\n## What & why\n\n%s\n", orText(body, "_No description._"))

	// Pins: the reporter physically pointing at what they meant. An outside
	// agent reading the issue needs these as much as the body.
	if rows, err := s.db.QueryContext(ctx,
		`SELECT ordinal, coalesce(tag_name,''), coalesce(aria_name,''),
		        coalesce(text_hint,''), coalesce(css_path,'')
		   FROM builder_issue_pins WHERE issue_id = $1 ORDER BY ordinal`, id); err == nil {
		defer rows.Close()
		first := true
		for rows.Next() {
			var ord int
			var tag, name, hint, css string
			if rows.Scan(&ord, &tag, &name, &hint, &css) != nil {
				continue
			}
			if first {
				b.WriteString("\n## Pinned elements\n\n")
				first = false
			}
			fmt.Fprintf(&b, "%d. <%s> %s\n   css: %s\n", ord+1,
				tag, orText(name, hint), css)
		}
	}

	if rows, err := s.db.QueryContext(ctx,
		`SELECT author_kind::text, coalesce(author_agent_id,''),
		        coalesce(author_email,''), body_md
		   FROM builder_issue_comments WHERE issue_id = $1 ORDER BY created_at`,
		id); err == nil {
		defer rows.Close()
		first := true
		for rows.Next() {
			var kind, agent, email, cbody string
			if rows.Scan(&kind, &agent, &email, &cbody) != nil {
				continue
			}
			if first {
				b.WriteString("\n## Discussion\n")
				first = false
			}
			who := agent
			if who == "" {
				who = email
			}
			if who == "" {
				who = kind
			}
			fmt.Fprintf(&b, "\n**%s:**\n%s\n", who, cbody)
		}
	}

	return textResult(b.String()), nil, nil
}

func (s *Service) createIssue(ctx context.Context, c *caller, a createIssueArgs) (*mcp.CallToolResult, any, error) {
	title := strings.TrimSpace(a.Title)
	if title == "" {
		return nil, nil, fmt.Errorf("an issue needs a title")
	}

	typ := a.Type
	switch typ {
	case "bug", "feature", "enhancement", "question", "discussion", "chore":
	default:
		typ = "bug"
	}
	prio := a.Priority
	switch prio {
	case "low", "normal", "high", "critical":
	default:
		prio = "normal"
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = tx.Rollback() }()

	var number int64
	if err := tx.QueryRowContext(ctx,
		`INSERT INTO builder_issue_counters (scope, next_seq) VALUES ('default', 2)
		 ON CONFLICT (scope) DO UPDATE SET next_seq = builder_issue_counters.next_seq + 1
		 RETURNING next_seq - 1`).Scan(&number); err != nil {
		return nil, nil, fmt.Errorf("allocate number: %w", err)
	}

	var id string
	if err := tx.QueryRowContext(ctx,
		// source 'agent': this came from something automated over MCP, not from
		// the widget and not from a person at the board. Worth being able to
		// tell apart later.
		`INSERT INTO builder_issues
		   (number, title, body_md, status, type, priority, area, human_only,
		    board_rank, source, route, page_url, locale, reporter_kind, reporter_email)
		 VALUES ($1,$2,$3,'triage',$4::builder_issue_type,$5::builder_issue_priority,
		         $6,$7,$8,'agent','','','en','agent',$9)
		 RETURNING id`,
		number, truncate(title, 500), truncate(a.Body, 100000), typ, prio,
		truncate(strings.TrimSpace(a.Area), 120), a.HumanOnly,
		number*1000, "mcp:"+c.name,
	).Scan(&id); err != nil {
		return nil, nil, fmt.Errorf("insert issue: %w", err)
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind, detail)
		 VALUES ($1,'created','agent',$2::jsonb)`, id,
		fmt.Sprintf(`{"via":"mcp","token":%q}`, c.name)); err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}

	s.log.Info("issue filed over mcp", "issue", number, "token", c.name)
	return textResult(fmt.Sprintf(
		"Filed #%d. It is in triage now — triage will either queue it for an agent "+
			"or comment with the one question it needs answered.", number)), nil, nil
}

func (s *Service) commentOnIssue(ctx context.Context, c *caller, a commentArgs) (*mcp.CallToolResult, any, error) {
	body := strings.TrimSpace(a.Body)
	if body == "" {
		return nil, nil, fmt.Errorf("a comment needs a body")
	}

	var id string
	if err := s.db.QueryRowContext(ctx,
		`SELECT id FROM builder_issues WHERE number = $1`, a.Number).Scan(&id); err != nil {
		return textResult(fmt.Sprintf("No issue #%d.", a.Number)), nil, nil
	}

	// Attributed as an agent, NOT as a human.
	//
	// This matters beyond bookkeeping: the `approved`/`rejected` contract is
	// deliberately reachable only from the human comment path, so an agent
	// cannot approve its own work. An MCP client is an agent. It can say
	// "approved" here and it will be recorded as a comment and nothing more.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO builder_issue_comments (issue_id, author_kind, author_agent_id, body_md)
		 VALUES ($1,'agent',NULL,$2)`, id, truncate(body, 100000)); err != nil {
		return nil, nil, err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE builder_issues SET comment_count = comment_count + 1, updated_at = now()
		  WHERE id = $1`, id); err != nil {
		return nil, nil, err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind, detail)
		 VALUES ($1,'commented','agent',$2::jsonb)`, id,
		fmt.Sprintf(`{"via":"mcp","token":%q}`, c.name)); err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}

	return textResult(fmt.Sprintf("Commented on #%d.", a.Number)), nil, nil
}

func textResult(s string) *mcp.CallToolResult {
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: s}}}
}

func orText(s, fallback string) string {
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}

// truncate cuts on a rune boundary. Byte-slicing a UTF-8 string mid-character
// produces invalid input that Postgres rejects — the board has already had a
// 500 from exactly that, on an emoji in a pin name.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8RuneStart(s[n]) {
		n--
	}
	return s[:n]
}

func utf8RuneStart(b byte) bool { return b&0xC0 != 0x80 }
