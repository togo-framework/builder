package fleet

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/togo-framework/builder/internal/runner"
)

// Drafting a persona with Claude Code, so hiring produces a usable agent rather
// than a template.
//
// defaultPersona() fills in the slug and the areas and leaves every sentence
// that matters — what this agent owns, what it must not touch, how it verifies
// its work — as an instruction to the operator. An agent hired that way is
// enabled with a persona that describes nothing, and the dispatcher happily
// routes real work to it. Drafting from the operator's own brief, against the
// actual repository, is the difference between an agent and a placeholder.

// personaRequest is what the operator has typed into the hire form so far. All
// of it is optional except the slug — the drafter works with whatever exists,
// because the point is to run BEFORE the form is finished.
type personaRequest struct {
	Slug        string
	DisplayName string
	Title       string
	Description string
	Model       string
	Areas       []string
	Workdir     string
}

const personaDraftPrompt = `Write the system prompt for one agent joining a software team.

The agent:
- slug: %s
- name: %s
- title: %s
- areas it owns: %s
- what the operator wants from it: %s

%s

Reply with the persona as RAW MARKDOWN. No JSON, no code fence around the whole
answer, no preamble, and no YAML front matter — the entire response becomes the
body of the file, and anything you write above the first heading ships with it.

The persona must state, concretely: who this agent is, the file globs it owns,
what it must never touch because another agent owns it, how it verifies a change
(the real build and test commands), and when it stops and asks the operator
instead of guessing. A persona that would fit any project is a failed persona.`

const personaGroundedNote = `You have READ-ONLY tools and your working directory is the repository this agent
will work in. Read it before you write — name real paths, real commands and the
real stack. You must not write or edit any file.`

const personaUngroundedNote = `There is no repository available to inspect, so do not invent paths or commands.
Keep the persona specific to the areas above, and mark anything only the operator
can supply with a TODO line they will see and fill in.`

// draftPersona runs one bounded Claude Code session and returns a complete
// persona file.
//
// The response is RAW MARKDOWN, not JSON. generate.go paid for that lesson: a
// markdown document inside a JSON string field fails three ways — a code fence
// containing braces derails the extractor, an unescaped newline breaks the
// string, and the JSON overhead pushes a long body past the output ceiling
// mid-object.
//
// The YAML front matter is built here rather than asked for. Every field in it
// is already known from the form, and a model that mangles the `name:` or drops
// the fence produces a spec file Claude Code will not load — so there is nothing
// to gain by delegating it and a working agent to lose.
//
// Returns an error rather than a partial persona: a half-written system prompt
// that looks plausible is worse than none, because the operator will hire on it.
func draftPersona(ctx context.Context, log *slog.Logger, in personaRequest) (string, float64, error) {
	// Same resolution order as writeSpec: the agent's own repo, else the fleet
	// default. An unset workdir is not fatal — it only costs the session its
	// grounding, and the prompt says so instead of inviting invented paths.
	dir := strings.TrimSpace(in.Workdir)
	if dir == "" {
		dir = strings.TrimSpace(os.Getenv("BUILDER_WORKDIR"))
	}
	grounding := personaUngroundedNote
	if dir != "" {
		grounding = personaGroundedNote
	}

	model := in.Model
	if model == "" || !allowedModels[model] {
		model = "sonnet"
	}
	name := orDefault(in.DisplayName, in.Slug)
	areas := strings.Join(cleanList(in.Areas, 40), ", ")
	if areas == "" {
		areas = "(the operator has not named any yet — say so and ask)"
	}
	brief := oneLine(in.Description)
	if brief == "" {
		brief = "(nothing beyond the name and areas above)"
	}

	sess := runner.Session{
		ID:  newUUID(),
		Dir: dir,
		Prompt: fmt.Sprintf(personaDraftPrompt, in.Slug, name,
			orDefault(in.Title, "(none given)"), areas, brief, grounding),
		Model: model,
		// Read-only. Drafting a persona must never be able to change the
		// repository it is reading, and this session runs on the operator's real
		// checkout, not an isolated worktree.
		AllowedTools:   "Read,Glob,Grep",
		MaxTurns:       10,
		PermissionMode: "acceptEdits",
		// One drafting call, not a build. Three minutes is long enough to read a
		// repository and write a page; past that something is looping and the
		// operator is staring at a spinner in a modal.
		Timeout: 3 * time.Minute,
	}

	res, err := sess.Run(ctx)
	if err != nil {
		log.Warn("persona draft failed", "slug", in.Slug, "err", err)
		return "", res.CostUSD, fmt.Errorf("the drafting session did not finish: %w", err)
	}
	if res.IsError {
		log.Warn("persona draft returned an error", "slug", in.Slug, "text", trunc(res.Text, 300))
		return "", res.CostUSD, fmt.Errorf("the drafting session failed: %s", trunc(res.Text, 300))
	}

	body := stripPersonaWrapper(res.Text)
	if body == "" {
		return "", res.CostUSD, fmt.Errorf("the drafting session returned nothing to use")
	}

	log.Info("drafted a persona", "slug", in.Slug, "model", model,
		"bytes", len(body), "cost", res.CostUSD, "grounded", dir != "")
	return personaFrontMatter(in, name, model) + body + "\n", res.CostUSD, nil
}

// stripPersonaWrapper removes the two things models add despite being told not
// to: a fence around the whole answer, and their own YAML front matter — which
// would otherwise sit above ours and give the file two conflicting headers.
func stripPersonaWrapper(text string) string {
	s := strings.TrimSpace(text)

	if strings.HasPrefix(s, "```") {
		if i := strings.IndexByte(s, '\n'); i >= 0 {
			s = s[i+1:]
		}
		s = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(s), "```"))
	}

	if strings.HasPrefix(s, "---\n") {
		// The closing fence is the next line that is exactly "---", so the search
		// starts after the opener rather than at the first occurrence.
		if end := strings.Index(s[4:], "\n---"); end >= 0 {
			rest := s[4+end+len("\n---"):]
			// No newline after the closing fence means the response was header and
			// nothing else. Returning "" makes the caller report a failed draft,
			// which is the truth — there is no persona in it.
			if i := strings.IndexByte(rest, '\n'); i >= 0 {
				s = rest[i+1:]
			} else {
				s = ""
			}
		}
	}

	return strings.TrimSpace(s)
}

// personaFrontMatter is the header Claude Code reads to load the agent. It is
// built from the form, never from the model — see draftPersona.
func personaFrontMatter(in personaRequest, name, model string) string {
	// Double quotes would close the YAML string early and take the rest of the
	// header with them; the description is a free-text field an operator types.
	desc := strings.ReplaceAll(oneLine(in.Description), `"`, `'`)
	if desc == "" {
		desc = "Owns " + strings.Join(cleanList(in.Areas, 40), ", ") + "."
	}
	return fmt.Sprintf(`---
name: %s
description: "%s"
model: %s
tools: Read, Write, Edit, Grep, Glob, Bash
---

# %s

**Areas:** %s

`, in.Slug, desc, model, name, strings.Join(cleanList(in.Areas, 40), ", "))
}
