package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// The agents surface: who is on this fleet, what they know how to do, and what
// they have learned.
//
// This is the higher-privilege of the two servers. Personas are the system
// prompts the fleet runs on, memory is everything the agents have concluded
// about a codebase, and the vault holds credentials. So: memory is readable and
// writable, personas are readable, and the vault exposes NAMES ONLY — an MCP
// client can discover that a `GITHUB_TOKEN` exists and can never read it.

type getAgentArgs struct {
	Slug string `json:"slug" jsonschema:"the agent's slug, as returned by list_agents"`
}

type recallArgs struct {
	Slug  string `json:"slug" jsonschema:"whose memory to search"`
	Query string `json:"query" jsonschema:"what you want to know; matched by meaning and by keyword"`
	Limit int    `json:"limit,omitempty" jsonschema:"how many memories to return (default 6, max 25)"`
}

type retainArgs struct {
	Slug       string  `json:"slug" jsonschema:"which agent should remember this"`
	Content    string  `json:"content" jsonschema:"a durable, transferable fact — not a restatement of a task"`
	SourceRef  string  `json:"sourceRef,omitempty" jsonschema:"what it is about, e.g. a file path or #42; re-retaining the same ref updates in place"`
	Importance float64 `json:"importance,omitempty" jsonschema:"0 to 1; defaults to 0.5"`
}

type getSkillArgs struct {
	Name string `json:"name" jsonschema:"the skill's name"`
}

func (s *Service) agentsServer(c *caller) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{
		Name:    "builder-agents",
		Version: "1.0.0",
	}, nil)

	mcp.AddTool(srv, &mcp.Tool{
		Name: "list_agents",
		Description: "List the fleet: who each agent is, what surfaces they own, " +
			"which skills they load, and whether they are working right now.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, any, error) {
		return s.listAgents(ctx)
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name: "get_agent",
		Description: "Read one agent in full, including the persona it runs on — " +
			"useful for understanding why it makes the decisions it makes.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, a getAgentArgs) (*mcp.CallToolResult, any, error) {
		return s.getAgent(ctx, a.Slug)
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name: "recall_memory",
		Description: "Search what an agent has learned. Ask before assuming " +
			"something about this codebase — the fleet has usually met the problem already.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, a recallArgs) (*mcp.CallToolResult, any, error) {
		return s.recall(ctx, a)
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name: "retain_memory",
		Description: "Teach an agent something durable. Facts that will still be " +
			"true next month, not notes about the task you are on.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, a retainArgs) (*mcp.CallToolResult, any, error) {
		return s.retain(ctx, c, a)
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name:        "list_skills",
		Description: "List the skill catalogue — the procedures agents load by name.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, any, error) {
		return s.listSkills(ctx)
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name:        "get_skill",
		Description: "Read one skill's full instructions.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, a getSkillArgs) (*mcp.CallToolResult, any, error) {
		return s.getSkill(ctx, a.Name)
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name: "list_secret_names",
		Description: "List the NAMES of credentials in the vault. Values are never " +
			"returned over MCP — read one from the dashboard if you need it.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, any, error) {
		return s.listSecretNames(ctx)
	})

	// Custom apps.
	//
	// On this surface and not the feedback one: an app ships an ES module the
	// dashboard imports and executes in an authenticated origin, which is a very
	// different blast radius from filing a bug. The feedback token is the one
	// documented as safe to wire into a shared editor; it must not also be able
	// to put running code in front of an operator. `agents` and `all` reach
	// these; `feedback` does not.
	mcp.AddTool(srv, &mcp.Tool{
		Name: "list_apps",
		Description: "List the custom apps installed on this builder, and what the " +
			"last scan rejected. Call this before create_app, so you extend the app " +
			"that already exists instead of adding a second tile that does the same job.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, any, error) {
		return s.listApps(ctx)
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name: "create_app",
		Description: "Add a screen to this builder: a tile in the feedback launcher " +
			"and a route at /apps/<slug>. Discovered at boot, so it is live on a rescan " +
			"with no restart and no edit to builder's source. You get a working demo — " +
			"replace apps/<slug>/ui.js with the real screen before calling it done. " +
			"Bilingual strings and logical CSS (ms-/me-, never ml-/mr-) are required.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, a createAppArgs) (*mcp.CallToolResult, any, error) {
		return s.createApp(ctx, c, a)
	})

	return srv
}

func (s *Service) listAgents(ctx context.Context) (*mcp.CallToolResult, any, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT a.slug, coalesce(a.display_name,''), coalesce(a.description,''),
       a.role::text, a.model, a.enabled,
       coalesce(a.areas,'{}')::text, coalesce(a.skills,'{}')::text,
       coalesce((SELECT count(*) FROM builder_memories m
                  JOIN builder_brains b ON b.namespace = m.namespace
                 WHERE b.id = a.brain_id AND m.invalid_at IS NULL), 0),
       EXISTS (SELECT 1 FROM builder_issues i
                WHERE i.assignee_agent_id = a.slug AND i.status = 'in_progress')
  FROM builder_agents a ORDER BY a.slug`)
	if err != nil {
		return nil, nil, fmt.Errorf("list agents: %w", err)
	}
	defer rows.Close()

	var b strings.Builder
	for rows.Next() {
		var slug, name, desc, role, model, areas, skills string
		var enabled, busy bool
		var memories int
		if rows.Scan(&slug, &name, &desc, &role, &model, &enabled,
			&areas, &skills, &memories, &busy) != nil {
			continue
		}
		fmt.Fprintf(&b, "## %s", slug)
		if name != "" {
			fmt.Fprintf(&b, " — %s", name)
		}
		b.WriteString("\n")
		if desc != "" {
			fmt.Fprintf(&b, "%s\n", desc)
		}
		fmt.Fprintf(&b, "role %s · model %s · %s · %d memories%s\n",
			role, model, map[bool]string{true: "enabled", false: "disabled"}[enabled],
			memories, map[bool]string{true: " · WORKING NOW", false: ""}[busy])
		if a := pgArray(areas); len(a) > 0 {
			fmt.Fprintf(&b, "owns: %s\n", strings.Join(a, ", "))
		}
		if sk := pgArray(skills); len(sk) > 0 {
			fmt.Fprintf(&b, "skills: %s\n", strings.Join(sk, ", "))
		}
		b.WriteString("\n")
	}
	if b.Len() == 0 {
		return textResult("No agents on this fleet yet."), nil, nil
	}
	return textResult(b.String()), nil, nil
}

func (s *Service) getAgent(ctx context.Context, slug string) (*mcp.CallToolResult, any, error) {
	var name, desc, role, model, persona, areas, skills, workdir string
	var enabled bool
	if err := s.db.QueryRowContext(ctx,
		`SELECT coalesce(display_name,''), coalesce(description,''), role::text, model,
		        coalesce(persona_md,''), coalesce(areas,'{}')::text,
		        coalesce(skills,'{}')::text, coalesce(workdir,''), enabled
		   FROM builder_agents WHERE slug = $1`, slug).
		Scan(&name, &desc, &role, &model, &persona, &areas, &skills, &workdir, &enabled); err != nil {
		return textResult("No agent called " + slug + "."), nil, nil
	}

	var b strings.Builder
	fmt.Fprintf(&b, "# %s", slug)
	if name != "" {
		fmt.Fprintf(&b, " — %s", name)
	}
	fmt.Fprintf(&b, "\n\n%s\n\nrole %s · model %s · %s\n", desc, role, model,
		map[bool]string{true: "enabled", false: "disabled"}[enabled])
	if workdir != "" {
		fmt.Fprintf(&b, "works in: %s\n", workdir)
	}
	if a := pgArray(areas); len(a) > 0 {
		fmt.Fprintf(&b, "owns: %s\n", strings.Join(a, ", "))
	}
	if sk := pgArray(skills); len(sk) > 0 {
		fmt.Fprintf(&b, "skills: %s\n", strings.Join(sk, ", "))
	}
	fmt.Fprintf(&b, "\n## Persona\n\n%s\n", orText(persona, "_None set._"))
	return textResult(b.String()), nil, nil
}

func (s *Service) recall(ctx context.Context, a recallArgs) (*mcp.CallToolResult, any, error) {
	limit := a.Limit
	if limit <= 0 || limit > 25 {
		limit = 6
	}

	var ns string
	if err := s.db.QueryRowContext(ctx,
		`SELECT namespace FROM builder_brains WHERE agent_slug = $1`, a.Slug).Scan(&ns); err != nil {
		return textResult(a.Slug + " has no brain."), nil, nil
	}

	// Keyword recall over the stored text.
	//
	// NOT the vector path: the embedder in this build is a hashed bag of words
	// with no semantic meaning, so a cosine ranking over it would look like
	// relevance and be noise. ILIKE over content is honest about what it does.
	rows, err := s.db.QueryContext(ctx, `
SELECT content, coalesce(source_kind,''), coalesce(source_ref,''), importance,
       btrim(to_json(created_at)::text,'"')
  FROM builder_memories
 WHERE namespace = $1 AND invalid_at IS NULL
   AND ($2 = '' OR content ILIKE '%' || $2 || '%')
 ORDER BY importance DESC, created_at DESC
 LIMIT $3`, ns, strings.TrimSpace(a.Query), limit)
	if err != nil {
		return nil, nil, fmt.Errorf("recall: %w", err)
	}
	defer rows.Close()

	var b strings.Builder
	n := 0
	for rows.Next() {
		var content, kind, ref, created string
		var imp float64
		if rows.Scan(&content, &kind, &ref, &imp, &created) != nil {
			continue
		}
		n++
		fmt.Fprintf(&b, "%d. %s\n", n, content)
		if ref != "" || kind != "" {
			fmt.Fprintf(&b, "   (%s %s · importance %.1f)\n", kind, ref, imp)
		}
	}
	if n == 0 {
		return textResult(fmt.Sprintf("%s remembers nothing matching %q.", a.Slug, a.Query)), nil, nil
	}
	return textResult(fmt.Sprintf("%s remembers:\n\n%s", a.Slug, b.String())), nil, nil
}

func (s *Service) retain(ctx context.Context, c *caller, a retainArgs) (*mcp.CallToolResult, any, error) {
	content := strings.TrimSpace(a.Content)
	if content == "" {
		return nil, nil, fmt.Errorf("a memory needs content")
	}
	imp := a.Importance
	if imp <= 0 || imp > 1 {
		imp = 0.5
	}

	var ns string
	if err := s.db.QueryRowContext(ctx,
		`SELECT namespace FROM builder_brains WHERE agent_slug = $1`, a.Slug).Scan(&ns); err != nil {
		return textResult(a.Slug + " has no brain to write to."), nil, nil
	}

	if _, err := s.db.ExecContext(ctx,
		// source_kind records that this came from outside the fleet, so an
		// operator reading the brain can tell what the agent concluded itself
		// from what an external client told it.
		`INSERT INTO builder_memories (namespace, content, source_kind, source_ref, importance)
		 VALUES ($1,$2,'mcp',$3,$4)`,
		ns, truncate(content, 20000), truncate("mcp:"+c.name+" "+a.SourceRef, 400), imp); err != nil {
		return nil, nil, fmt.Errorf("retain: %w", err)
	}

	s.log.Info("memory written over mcp", "agent", a.Slug, "token", c.name)
	return textResult(a.Slug + " will remember that."), nil, nil
}

func (s *Service) listSkills(ctx context.Context) (*mcp.CallToolResult, any, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT s.name, coalesce(s.description,''), s.enabled,
		        coalesce((SELECT count(*) FROM builder_agents a WHERE s.name = ANY(a.skills)),0)
		   FROM builder_skills s ORDER BY s.name`)
	if err != nil {
		return nil, nil, fmt.Errorf("list skills: %w", err)
	}
	defer rows.Close()

	var b strings.Builder
	for rows.Next() {
		var name, desc string
		var enabled bool
		var agents int
		if rows.Scan(&name, &desc, &enabled, &agents) != nil {
			continue
		}
		fmt.Fprintf(&b, "- %s — %s (%d agent(s)%s)\n", name, orText(desc, "no description"),
			agents, map[bool]string{true: "", false: ", disabled"}[enabled])
	}
	if b.Len() == 0 {
		return textResult("The skill catalogue is empty."), nil, nil
	}
	return textResult(b.String()), nil, nil
}

func (s *Service) getSkill(ctx context.Context, name string) (*mcp.CallToolResult, any, error) {
	var desc, body string
	if err := s.db.QueryRowContext(ctx,
		`SELECT coalesce(description,''), coalesce(body_md,'')
		   FROM builder_skills WHERE name = $1`, name).Scan(&desc, &body); err != nil {
		return textResult("No skill called " + name + "."), nil, nil
	}
	return textResult(fmt.Sprintf("# %s\n\n%s\n\n%s", name, desc, body)), nil, nil
}

func (s *Service) listSecretNames(ctx context.Context) (*mcp.CallToolResult, any, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT name, coalesce(scope,''), coalesce(hint,'')
		   FROM builder_secrets ORDER BY name`)
	if err != nil {
		// The vault is optional — an install without BUILDER_VAULT_KEY has no
		// table content to speak of, and that is not an error worth surfacing
		// as a tool failure.
		return textResult("No vault on this install."), nil, nil
	}
	defer rows.Close()

	var b strings.Builder
	for rows.Next() {
		var name, scope, hint string
		if rows.Scan(&name, &scope, &hint) != nil {
			continue
		}
		fmt.Fprintf(&b, "- %s", name)
		if scope != "" {
			fmt.Fprintf(&b, " (scope %s)", scope)
		}
		if hint != "" {
			fmt.Fprintf(&b, " — %s", hint)
		}
		b.WriteString("\n")
	}
	if b.Len() == 0 {
		return textResult("The vault is empty."), nil, nil
	}
	return textResult("Values are never returned over MCP. Names only:\n\n" + b.String()), nil, nil
}

// pgArray reads Postgres's text-array wire form: {a,b,"c d"}.
func pgArray(s string) []string {
	s = strings.TrimSpace(s)
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
