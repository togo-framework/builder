package skills

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/togo-framework/builder/internal/runner"
)

// Rewriting one thin skill, against the real repository.
//
// The fleet generator writes every skill in one pass, and for a long time it
// wrote each of them as a single restated sentence: ten skills averaging 46
// words next to hand-written ones averaging 1,100. Regenerating them meant
// re-running the whole fleet, which also rewrites every persona — far too blunt
// an instrument for "this one file is useless".
//
// So: one skill, one bounded read-only session, gated on the same structural
// check the generator now applies.

const regeneratePrompt = `Write one skill for a software project's agent team.

A skill is a procedure an agent LOADS AND FOLLOWS while it works. It is not a
description of the topic, and it is not a summary. Assume the reader is a
competent engineer who has never seen this repository.

The skill:
- name: %s
- topic: %s

The topic line is the SUBJECT, not the answer. Do not restate it. Your job is to
write the procedure it names.

%s

Required structure:

# %s — <short sharp tagline>

One or two sentences on what this procedure is for.

## When to use this
Concrete triggers, as a list. What is the agent about to do, or what has just
gone wrong, that should make it open this file?

## Steps
Numbered. Each step is an action with a real command or a real code change, and
says what a correct result looks like. Put the actual shell commands, file paths
and SQL in fenced code blocks.

## Getting it wrong
The mistakes that are actually made here, and what each one looks like when it
happens. Write this from what the code shows, not from generic advice.

## Related
Other skills or files an agent should read next.

Length: at least 400 words. A short answer here is a failed answer.

Reply with the file body as RAW MARKDOWN. No JSON, no wrapper, no preamble, no
closing remarks, and no YAML front matter — the entire response becomes the
file, and the header is added separately.`

const regenGroundedNote = `You have READ-ONLY tools and your working directory is the repository this skill
is about. Read it before you write — every command, path, table, function and
flag you name must be one you actually found. You must not write or edit any
file.`

const regenUngroundedNote = `There is no repository available to inspect, so do not invent paths or commands.
Keep the procedure general and mark anything only the operator can supply with a
TODO line they will see.`

// handleRegenerate rewrites one skill's body with Claude Code.
func (s *Service) handleRegenerate(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	var desc, body string
	err := s.db.QueryRowContext(r.Context(),
		`SELECT description, body_md FROM builder_skills WHERE name = $1`, name).Scan(&desc, &body)
	if errors.Is(err, sql.ErrNoRows) {
		httpErr(w, http.StatusNotFound, "no such skill")
		return
	}
	if err != nil {
		s.log.Error("read skill for regeneration", "skill", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not read the skill")
		return
	}

	topic := oneLine(desc)
	if topic == "" {
		// Fall back to whatever the stub says. It is thin by definition — that is
		// why this endpoint was called — but it is the only statement of intent
		// the skill has.
		topic = oneLine(stripGeneratedMarker(body))
	}
	if topic == "" {
		topic = name
	}

	dir := strings.TrimSpace(os.Getenv("BUILDER_WORKDIR"))
	grounding := regenUngroundedNote
	if dir != "" {
		grounding = regenGroundedNote
	}

	sess := runner.Session{
		Dir:    dir,
		Prompt: fmt.Sprintf(regeneratePrompt, name, topic, grounding, name),
		Model:  "sonnet",
		// Read-only. This runs on the operator's real checkout, not an isolated
		// worktree, so it must not be able to change anything it reads.
		AllowedTools:   "Read,Glob,Grep",
		MaxTurns:       20,
		PermissionMode: "acceptEdits",
		// Long enough to read a repository and write a page. Past this something
		// is looping and the operator is watching a spinner.
		Timeout: 5 * time.Minute,
	}

	res, err := sess.Run(r.Context())
	if err != nil {
		s.log.Warn("skill regeneration failed", "skill", name, "err", err)
		httpErr(w, http.StatusBadGateway, "the writing session did not finish: "+err.Error())
		return
	}
	if res.IsError {
		s.log.Warn("skill regeneration errored", "skill", name, "text", truncate(res.Text, 300))
		httpErr(w, http.StatusBadGateway, "the writing session failed: "+truncate(res.Text, 300))
		return
	}

	next := stripWrapper(res.Text)
	if why := checkBody(next); why != "" {
		// Reported, not silently saved. Overwriting a stub with a different stub
		// looks like success and is the exact failure this endpoint exists to
		// fix, so the old body is left alone and the reason is shown.
		s.log.Warn("regenerated skill rejected", "skill", name, "why", why)
		httpErr(w, http.StatusUnprocessableEntity, "what came back was not usable: "+why)
		return
	}

	if _, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_skills SET body_md = $1, updated_at = now() WHERE name = $2`,
		next, name); err != nil {
		s.log.Error("save regenerated skill", "skill", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not save the skill")
		return
	}

	// Disk is best-effort and deliberately after the row: the database is what
	// the dashboard reads, and a read-only checkout must not lose the rewrite.
	path := s.materialise(r.Context(), name, desc, next)

	s.log.Info("regenerated a skill", "skill", name,
		"words", len(strings.Fields(next)), "cost", res.CostUSD)

	writeJSON(w, http.StatusOK, map[string]any{
		"name":          name,
		"words":         len(strings.Fields(next)),
		"costUsd":       res.CostUSD,
		"installedPath": path,
		"grounded":      dir != "",
	})
}

// stripWrapper removes what models add despite being told not to: a fence
// around the whole answer, and their own YAML front matter.
func stripWrapper(text string) string {
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
			if i := strings.IndexByte(rest, '\n'); i >= 0 {
				s = rest[i+1:]
			} else {
				s = ""
			}
		}
	}

	// Conversational preamble before the document.
	//
	// "No preamble" is in the prompt and is still ignored: one skill shipped
	// with "That's fine — the file and directory removal already ran. Here is
	// the skill as raw markdown, per the actual instructions:" as its opening
	// line, sitting above the H1 in the editor. The required structure starts
	// with "# <name>", so anything above the first H1 is chatter by definition.
	//
	// Only applied when an H1 exists — a response with no heading at all is
	// already failing checkBody, and truncating it to nothing would replace a
	// useful error with an empty one.
	if i := indexH1(s); i > 0 {
		s = s[i:]
	}

	// A closing fence orphaned by the step above.
	//
	// When a response opens with chatter AND wraps the document in a fence, the
	// opening fence sits below the chatter, so the leading-fence branch never
	// fires — it only matches at position zero. Removing the preamble then takes
	// the opener with it and leaves the closer stranded on the last line. Found
	// by the test, not in review.
	s = strings.TrimSpace(s)
	if strings.HasSuffix(s, "\n```") {
		s = strings.TrimSpace(strings.TrimSuffix(s, "```"))
	}

	return strings.TrimSpace(s)
}

// indexH1 returns the offset of the first line beginning "# ", or -1.
func indexH1(s string) int {
	if strings.HasPrefix(s, "# ") {
		return 0
	}
	if i := strings.Index(s, "\n# "); i >= 0 {
		return i + 1
	}
	return -1
}

func stripGeneratedMarker(body string) string {
	out := []string{}
	for _, line := range strings.Split(body, "\n") {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "<!--") || strings.HasPrefix(t, "#") || t == "" {
			continue
		}
		out = append(out, t)
	}
	return strings.Join(out, " ")
}

// checkBody is the same structural gate the fleet generator applies, kept here
// so a skill rewritten one at a time is held to the standard as one written in
// a batch.
const minWords = 250

func checkBody(body string) string {
	b := strings.TrimSpace(body)
	if b == "" {
		return "the response was empty"
	}
	if n := len(strings.Fields(b)); n < minWords {
		return fmt.Sprintf("it was %d words — a skill needs at least %d, and yours read as a restatement of the topic rather than a procedure", n, minWords)
	}
	// Structure, not exact wording: the hand-written skills in this repository
	// number their own sections or name them, so requiring a particular heading
	// would reject good work.
	if strings.Count(b, "\n## ") < 2 {
		return "it had fewer than two sections — a procedure is divided into steps, not written as one block"
	}
	if !strings.Contains(b, "```") {
		return "it contained no fenced code block — a procedure for this repository has real commands in it"
	}
	return ""
}
