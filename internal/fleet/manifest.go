// Package fleet turns an operator's plan into a working agent team.
//
// The generating model NEVER writes files. It proposes a manifest; this package
// validates it and writes the tree. Two reasons that split matters:
//
//   - `.claude/` is a protected path. Writes there are not auto-approved in
//     default or acceptEdits mode and are denied outright in dontAsk, and
//     `permissions.allow` does not pre-approve them. Making it work would mean
//     granting bypassPermissions to a session that just ingested an untrusted
//     operator plan.
//   - Writing from Go makes the namespace contract mechanical: every generated
//     file is recorded, so a later regeneration can tell its own output from
//     something a human edited.
package fleet

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Manifest is what the generator returns.
type Manifest struct {
	Summary string      `json:"summary"`
	Agents  []AgentSpec `json:"agents"`
	Skills  []SkillSpec `json:"skills"`
	Notes   []string    `json:"notes,omitempty"`
}

type AgentSpec struct {
	Slug        string `json:"slug"`
	DisplayName string `json:"display_name"`
	// Description is the delegation trigger — it is what the router matches on,
	// so a vague one makes the agent unreachable.
	Description string   `json:"description"`
	Role        string   `json:"role"`  // orchestrator | builder | advisor | reviewer
	Model       string   `json:"model"` // haiku | sonnet | opus | inherit
	Areas       []string `json:"areas"`
	Tools       []string `json:"tools"`
	Skills      []string `json:"skills"`
	Persona     string   `json:"persona"` // the system prompt body, markdown
}

type SkillSpec struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Body        string `json:"body"`
}

var (
	// No ':' — Claude Code reserves it for plugin scoping and silently refuses
	// to load such a file, which would fail as "the agent just never runs".
	slugRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

	validRoles  = map[string]bool{"orchestrator": true, "builder": true, "advisor": true, "reviewer": true}
	validModels = map[string]bool{"haiku": true, "sonnet": true, "opus": true, "inherit": true}

	// Tools a generated agent may be granted. Anything outside this set is
	// dropped rather than rejected: a plausible-but-unknown tool name should not
	// throw away an otherwise good fleet.
	allowedTools = map[string]bool{
		"Read": true, "Write": true, "Edit": true, "Glob": true, "Grep": true,
		"Bash": true, "WebFetch": true, "WebSearch": true, "Task": true,
	}

	// Reserved for the baseline `.claude/` tree. A generated agent may never
	// take one of these names or it would silently replace a shipped rule-bound
	// agent with an improvised one.
	reserved = map[string]bool{
		"orchestrator": true, "fleet-builder": true, "code-reviewer": true,
		"issue-triage": true, "issue-repro-checker": true, "security-engineer": true,
		"run-auditor": true,
	}
)

// Validate normalizes the manifest and reports every problem at once, so a
// regeneration prompt can be given the full list rather than one error per round.
func (m *Manifest) Validate() []string {
	var problems []string
	seenAgents := map[string]bool{}
	seenSkills := map[string]bool{}

	skillNames := map[string]bool{}
	for i := range m.Skills {
		m.Skills[i].Name = strings.ToLower(strings.TrimSpace(m.Skills[i].Name))
		skillNames[m.Skills[i].Name] = true
	}

	agents := m.Agents[:0]
	for _, a := range m.Agents {
		a.Slug = strings.ToLower(strings.TrimSpace(a.Slug))

		switch {
		case !slugRe.MatchString(a.Slug):
			problems = append(problems, fmt.Sprintf("agent slug %q is not lowercase-hyphenated", a.Slug))
			continue
		case reserved[a.Slug]:
			problems = append(problems, fmt.Sprintf("agent slug %q is reserved by the baseline fleet", a.Slug))
			continue
		case seenAgents[a.Slug]:
			problems = append(problems, fmt.Sprintf("duplicate agent slug %q", a.Slug))
			continue
		case strings.TrimSpace(a.Description) == "":
			// An empty description makes the agent unroutable. Seven agents in
			// the ancestor estate have this defect and can never be delegated to.
			problems = append(problems, fmt.Sprintf("agent %q has no description", a.Slug))
			continue
		case strings.TrimSpace(a.Persona) == "":
			// An agent with an empty system prompt is a different agent, not a
			// degraded one. Fail loud.
			problems = append(problems, fmt.Sprintf("agent %q has no persona", a.Slug))
			continue
		}

		if !validRoles[a.Role] {
			a.Role = "advisor" // safe by default
		}
		if !validModels[a.Model] {
			a.Model = "sonnet"
		}
		if a.DisplayName == "" {
			a.DisplayName = a.Slug
		}

		tools := a.Tools[:0]
		for _, t := range a.Tools {
			if allowedTools[t] {
				tools = append(tools, t)
			}
		}
		a.Tools = tools

		// A referenced skill that was not also generated would render a broken
		// frontmatter reference, so unknown ones are dropped.
		skills := a.Skills[:0]
		for _, s := range a.Skills {
			if skillNames[strings.ToLower(s)] {
				skills = append(skills, strings.ToLower(s))
			}
		}
		a.Skills = skills

		seenAgents[a.Slug] = true
		agents = append(agents, a)
	}
	m.Agents = agents

	skills := m.Skills[:0]
	for _, s := range m.Skills {
		switch {
		case !slugRe.MatchString(s.Name):
			problems = append(problems, fmt.Sprintf("skill name %q is not lowercase-hyphenated", s.Name))
			continue
		case seenSkills[s.Name]:
			problems = append(problems, fmt.Sprintf("duplicate skill %q", s.Name))
			continue
		case strings.TrimSpace(s.Description) == "":
			problems = append(problems, fmt.Sprintf("skill %q has no description", s.Name))
			continue
		}
		seenSkills[s.Name] = true
		skills = append(skills, s)
	}
	m.Skills = skills

	if len(m.Agents) == 0 {
		problems = append(problems, "the manifest contains no usable agents")
	}
	return problems
}

// WrittenFile records one file the generator produced.
type WrittenFile struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Owner  string `json:"owner"`
}

// Write renders the manifest into `<root>/.claude/`.
//
// Generated files land in their own namespace and are recorded in
// manifest.json, so a later run can distinguish its own previous output from a
// file a human has since edited — and never clobber the latter.
func (m *Manifest) Write(root string) ([]WrittenFile, error) {
	agentsDir := filepath.Join(root, ".claude", "agents")
	skillsDir := filepath.Join(root, ".claude", "skills")
	for _, d := range []string{agentsDir, skillsDir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return nil, fmt.Errorf("create %s: %w", d, err)
		}
	}

	var written []WrittenFile

	for _, a := range m.Agents {
		path := filepath.Join(agentsDir, a.Slug+".md")
		if err := writeIfSafe(path, renderAgent(a), &written, "fleet-builder"); err != nil {
			return written, err
		}
	}
	for _, s := range m.Skills {
		dir := filepath.Join(skillsDir, s.Name)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return written, fmt.Errorf("create %s: %w", dir, err)
		}
		path := filepath.Join(dir, "SKILL.md")
		if err := writeIfSafe(path, renderSkill(s), &written, "fleet-builder"); err != nil {
			return written, err
		}
	}

	sort.Slice(written, func(i, j int) bool { return written[i].Path < written[j].Path })
	if err := recordManifest(root, written, m); err != nil {
		return written, err
	}
	return written, nil
}

// writeIfSafe refuses to overwrite a file the generator does not own.
func writeIfSafe(path, content string, out *[]WrittenFile, owner string) error {
	if prev, err := os.ReadFile(path); err == nil {
		if !strings.Contains(string(prev), generatedMarker) {
			// A human has taken this file over. Losing their edits to a
			// regeneration is worse than skipping the file.
			return nil
		}
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	sum := sha256.Sum256([]byte(content))
	*out = append(*out, WrittenFile{Path: path, SHA256: hex.EncodeToString(sum[:]), Owner: owner})
	return nil
}

const generatedMarker = "<!-- builder:generated — owned by fleet-builder. Remove this line to take ownership. -->"

func renderAgent(a AgentSpec) string {
	var b strings.Builder
	b.WriteString("---\n")
	fmt.Fprintf(&b, "name: %s\n", a.Slug)
	// Quoted: a description containing ':' would otherwise break the YAML.
	fmt.Fprintf(&b, "description: %q\n", oneLine(a.Description))
	fmt.Fprintf(&b, "model: %s\n", a.Model)
	if len(a.Tools) > 0 {
		fmt.Fprintf(&b, "tools: %s\n", strings.Join(a.Tools, ", "))
	}
	if len(a.Skills) > 0 {
		fmt.Fprintf(&b, "skills: %s\n", strings.Join(a.Skills, ", "))
	}
	b.WriteString("---\n\n")
	b.WriteString(generatedMarker + "\n\n")
	fmt.Fprintf(&b, "# %s\n\n", a.DisplayName)
	if len(a.Areas) > 0 {
		fmt.Fprintf(&b, "**Areas:** %s\n\n", strings.Join(a.Areas, ", "))
	}
	b.WriteString(strings.TrimSpace(a.Persona))
	b.WriteString("\n\n## Rules you are bound by\n\n")
	b.WriteString("Read `.claude/rules/`. In particular:\n\n")
	b.WriteString("- **07 client-first** — verify before you claim; evidence, not assurance.\n")
	b.WriteString("- **28 verify before closing** — a change is not done until it is observed working.\n")
	b.WriteString("- **35 blast radius** — stay inside your areas; exceeding a cap means stop and hand back a plan.\n")
	b.WriteString("- **37 run journal** — a run with no journal entry is not done.\n")
	b.WriteString("- **42 scoped commits** — never `git add -A`.\n")
	if a.Role != "builder" {
		b.WriteString("\n**You do not write code.** You advise, review or route. ")
		b.WriteString("Implementation belongs to an agent with the `builder` role.\n")
	}
	return b.String()
}

func renderSkill(s SkillSpec) string {
	var b strings.Builder
	b.WriteString("---\n")
	fmt.Fprintf(&b, "name: %s\n", s.Name)
	fmt.Fprintf(&b, "description: %q\n", oneLine(s.Description))
	b.WriteString("---\n\n")
	b.WriteString(generatedMarker + "\n\n")
	fmt.Fprintf(&b, "# %s\n\n", s.Name)
	b.WriteString(strings.TrimSpace(s.Body))
	b.WriteString("\n")
	return b.String()
}

func oneLine(s string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(s)), " ")
}

// recordManifest merges this run's output into `.claude/manifest.json`.
func recordManifest(root string, written []WrittenFile, m *Manifest) error {
	path := filepath.Join(root, ".claude", "manifest.json")

	doc := map[string]any{}
	if raw, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(raw, &doc)
	}
	doc["generated"] = written
	doc["summary"] = m.Summary
	doc["_contract"] = "Files under `generated` are written by fleet-builder. " +
		"On regeneration a file whose on-disk content no longer carries the generated " +
		"marker is treated as user-owned and left alone."

	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, out, 0o644)
}
