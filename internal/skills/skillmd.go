package skills

import (
	"strings"
)

// SKILL.md is YAML frontmatter followed by markdown:
//
//	---
//	name: verify
//	description: Collect the evidence bundle before claiming a change is done.
//	---
//
//	# verify — Evidence, not adjectives
//	...
//
// Only `name` and `description` are read, and only the body is stored: keeping
// the frontmatter inside body_md would give `description` two owners that drift
// apart the first time one of them is edited.

type frontmatter struct {
	Name        string
	Title       string
	Description string
}

// parseSkillMD splits a SKILL.md into its frontmatter and its body.
//
// This is a two-key reader, not a YAML parser. A skill's frontmatter is a flat
// block of `key: value` lines; anything more elaborate is ignored rather than
// half-understood, and the body is returned intact either way so nothing is
// lost when a file uses a shape this does not model.
func parseSkillMD(raw string) (frontmatter, string) {
	var fm frontmatter

	// Strip a UTF-8 BOM. A file saved by a Windows editor carries one, and it
	// sits between the start of the file and the opening "---", which would
	// otherwise make the frontmatter invisible.
	raw = strings.TrimPrefix(raw, "\ufeff")
	raw = strings.ReplaceAll(raw, "\r\n", "\n")

	rest, ok := strings.CutPrefix(raw, "---\n")
	if !ok {
		return fm, strings.TrimLeft(raw, "\n")
	}
	end := strings.Index(rest, "\n---")
	if end < 0 {
		// An opening fence with no close is not frontmatter, it is prose that
		// happens to start with a rule. Treat the whole file as the body.
		return fm, strings.TrimLeft(raw, "\n")
	}

	for _, line := range strings.Split(rest[:end], "\n") {
		key, value, found := strings.Cut(line, ":")
		if !found {
			continue
		}
		value = unquoteYAML(strings.TrimSpace(value))
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "name":
			fm.Name = value
		case "title":
			fm.Title = value
		case "description":
			fm.Description = value
		}
	}

	body := rest[end+len("\n---"):]
	// Drop the remainder of the closing fence's line, then the blank line under it.
	if i := strings.IndexByte(body, '\n'); i >= 0 {
		body = body[i+1:]
	} else {
		body = ""
	}
	return fm, strings.TrimLeft(body, "\n")
}

func unquoteYAML(v string) string {
	if len(v) >= 2 {
		if (v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'') {
			v = v[1 : len(v)-1]
		}
	}
	return strings.TrimSpace(v)
}

// firstHeading returns the text of the body's first `# ` heading.
//
// It is the title when the frontmatter has none, because a skill's H1 is what
// its author already wrote as its human name — falling back to the slug gives
// a catalogue where every title is just the name again.
func firstHeading(body string) string {
	for _, line := range strings.Split(body, "\n") {
		if h, ok := strings.CutPrefix(strings.TrimSpace(line), "# "); ok {
			return strings.TrimSpace(h)
		}
	}
	return ""
}

// renderSkillMD writes the file Claude Code reads.
//
// The frontmatter is regenerated from the row rather than round-tripped, so the
// name and description in the file always match the catalogue. Only those two
// keys are emitted: extra keys are not part of the skill format, and a title
// line would be one more thing to keep in step for no gain.
func renderSkillMD(name, description, body string) string {
	var b strings.Builder
	b.WriteString("---\nname: ")
	b.WriteString(name)
	if d := oneLine(description); d != "" {
		b.WriteString("\ndescription: ")
		b.WriteString(yamlQuote(d))
	}
	b.WriteString("\n---\n\n")
	b.WriteString(strings.TrimLeft(body, "\n"))
	if !strings.HasSuffix(body, "\n") {
		b.WriteByte('\n')
	}
	return b.String()
}

// yamlQuote emits a double-quoted YAML scalar.
//
// Descriptions routinely contain colons ("Use when: ..."), which make an
// unquoted scalar parse as a nested mapping and break the file.
func yamlQuote(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}
