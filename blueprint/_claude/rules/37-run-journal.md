---
description: "Every autonomous run writes .runs/<ts>-<issue>.md. A run with no journal entry is not done and its PR does not merge."
globs: "*"
alwaysApply: true
---

# Rule 37: The Run Journal — No Journal, No Merge

**Every autonomous run writes exactly one journal file at `.runs/<ts>-<issue>.md`, and that file is
the run's deliverable alongside the diff. A run with no journal entry is NOT done, its issue does
NOT close, and its PR does NOT merge.**

## The Rule

Rule 07 (client-first / evidence-first) says a change is real only when it has been observed
working. On its own that is aspirational — an agent can assert "verified live" in chat and nothing
checks the assertion. The run journal is what makes Rule 07 **mechanically checkable**: the
evidence stops being a sentence in a transcript and becomes a committed file that a hook, a
reviewer, and a future run can all read.

| Artifact | Required |
|---|---|
| The diff | yes |
| `.runs/<ts>-<issue>.md` | **yes — same PR, same commit range** |
| A "done" claim with neither | **refused by the Stop hook** |

One run, one file. Do not append a second run to an existing journal; a re-run gets a new
timestamp. Do not write the journal at the start and leave it — it is written as you go and
finalized before the done claim.

### Naming

```
.runs/<UTC-compact-timestamp>-<issue>.md

.runs/20260807T142231Z-142.md      # issue #142
.runs/20260807T151004Z-noissue.md  # unticketed run (allowed; still journalled)
```

`<ts>` is the run's **start** time in UTC, `YYYYMMDDTHHMMSSZ` — sortable, no colons, safe on every
filesystem. `<issue>` is the bare issue number without `#`, or `noissue`.

`.runs/` is committed. It is the project's run history, not scratch space. It is not `.gitignore`d.

### Required sections — all six, in this order, none omitted

```markdown
---
run:      20260807T142231Z-142
issue:    "#142"
agent:    <agent name from .claude/agents/>
model:    <exact model id>
branch:   <working branch>
base:     {{trunk}}
outcome:  done | parked | abandoned
---

# What was asked

Verbatim or near-verbatim restatement of the request, plus the acceptance criteria you are
holding yourself to. If you narrowed or widened the scope, say so here and say why.

# What reproduced

The failing state, observed by you, before you changed anything. Command, input, actual output.
For a bug: the reproduction. For a feature: the absence — the 404, the missing column, the
handler that does not exist. If nothing reproduced, this section says so in those words and the
run's outcome is `parked` (see Rule 39).

# What changed

Files touched, grouped by intent, with one line each on why. Name the generated files separately
(`*.gen.go`) and name the command that produced them (`togo generate`, `togo migrate`). A file
you cannot justify in one line does not belong in the diff.

# What was verified, and how

The evidence block. Every claim is a command plus its real output — pasted, not paraphrased.
See "What counts as evidence" below. "It compiles" is not verification of behaviour.

# What is still unproven

The honest remainder. Paths not exercised, environments not touched, edge cases not tried,
assumptions carried forward. **This section is never empty.** A run that claims to have proven
everything has not thought about what it did not prove.

# Follow-ups

Issues to file, debt taken on deliberately, the next obvious step. Zero or more bullets.
```

### What counts as evidence

Evidence is a command and its output. Nothing else. Ranked, weakest first — a run leans on the
strongest layer available to it:

| Layer | Example | Proves |
|---|---|---|
| Build | `go build ./...` | it compiles — the floor, never the ceiling |
| Codegen clean | `togo generate && git diff --exit-code -- '*.gen.go'` | generated artifacts match their sources |
| Unit | `go test ./internal/<pkg>/... -run TestX -v` | the unit behaves |
| Schema | `togo migrate status` | the migration applied, in order, and the DB agrees |
| Wire | `curl -sS {{api_base}}/<route> -w '%{http_code}'` | the route exists and answers |
| Surface | typecheck + a rendered assertion per surface in `{{surfaces}}` | the user-visible thing changed |
| Behaviour | the reproduction from section 2, re-run, now passing | **the bug is actually fixed** |

The last row is the one that matters. A run that reproduced a failure and cannot show that same
reproduction now passing has not fixed it, whatever else is green.

### Anti-patterns

- "Verified working" with no command → not evidence, refused.
- Output that has been summarized, trimmed to the happy line, or retyped from memory → not
  evidence. Paste what the terminal printed.
- Journal written after the done claim, as paperwork → the journal is the run's thinking, not its
  receipt. Write it while the evidence is in front of you.
- An empty "What is still unproven" → always wrong. Write the honest remainder.
- Six one-word sections → a journal nobody can act on is the same as no journal.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named, dated failures.
These are prophylactic. When a run journal produces a real incident, record it here — do not
invent one.

## Enforcement

- **Stop hook** `.claude/hooks/run-journal.sh` — fires when the agent ends its turn. It scans the
  turn for a done claim (`done`, `complete`, `verified`, `fixed`, `closes #`, `ready to merge`)
  and, if it finds one, requires a `.runs/*.md` file that (a) was created or modified during this
  session, (b) contains all six required headings, and (c) has a non-empty
  "What was verified, and how" section containing at least one fenced block. **It refuses a done
  claim with no evidence block** — it blocks and prints which section is missing. It never blocks
  a turn that made no done claim.
- **CI gate** — a PR whose diff touches anything outside `.runs/` and `docs/` but adds no
  `.runs/*.md` file fails. Journal-only PRs are permitted (correcting a past journal is legal).
- **Review** — the reviewer reads the journal before the diff. If the journal's evidence does not
  support the diff's claims, the PR goes back regardless of how the code looks.
- **Promotion** — under `{{promotion_mode}}`, a candidate whose runs lack journals is not
  promotable to `{{prod_ref}}`. The journal set is the promotion's audit trail across
  `{{env_matrix}}`.

## Related Rules

- Rule 07 — client-first / evidence-first. This rule is its enforcement mechanism.
- Rule 31 — never merge your own work. The reviewer instance has no memory of your session; the
  journal is the only context it gets, which is exactly why every section must stand alone.
- Rule 35 — blast radius. Generated churn that does not count toward the line cap is still declared
  in "What changed".
- Rule 39 — idempotency and stop conditions. Section 2 ("What reproduced") is where the
  reproduce-before-fixing requirement gets recorded, and `outcome: parked` is where a run that
  cannot produce evidence lands.
- Rule 42 — provenance and scoped commits. The commit trailer carries `Run-Id` and `Journal`,
  pointing at the file this rule requires.
