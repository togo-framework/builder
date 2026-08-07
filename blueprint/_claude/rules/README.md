# Rules

The operating rules for `{{project_name}}`. Every rule in this directory is loaded for every run
unless its frontmatter says otherwise. They are numbered, and the number is not decoration — the
**band** a rule sits in tells you what kind of claim it makes and how hard it binds.

Shipped from the togo blueprint at `{{blueprint_version}}`.

---

## The bands

| Band | Name | What lives here | Binding force |
|---|---|---|---|
| **00–09** | **Practice** | How work is conducted: what this repo is, plan first, clarify unknowns, interrupts, small wins, definition of done, progress tracking, evidence-first delivery, parallelism, team-agents-only | Strong. These shape every run's shape. |
| **10–19** | **Engineering** | How this codebase is built: generator-first sequencing, service boundaries, no DB client in `web/`, Go conventions, component/UI design, bilingual content | Strong, and specific. Violating one usually means the change is wrong, not merely impolite. |
| **20–27** | **Safety** | What must never happen: direct DDL, direct DB writes, wiping a database, the schema-change workflow, IaC mirroring infra, fixing in IaC rather than on the deploy, deploys never setting env, the promotion path | **Absolute.** No exceptions clause, no "just this once", and most are backed by a `PreToolUse` guard that blocks before execution. |
| **28–29** | — | Deliberately empty. Headroom between safety and autonomy. |
| **30–42** | **Autonomy** | How an agent runs unattended: the grant, containment, and spend (30–36), then evidence, self-modification, stop conditions, memory, external comms, and provenance (37–42) | Strong. These are what make an autonomous loop auditable instead of merely fast. |
| **43–49** | **Reserved** | Future blueprint rules. Do not claim a number here in a project — a blueprint upgrade will collide with you. |
| **`local/`** | **Project-local** | Rules specific to this project that the blueprint does not and will not ship | Same force as any rule. Never overwritten by an upgrade. |

Filenames are `NN-kebab-case-title.md`; the title line inside is `# Rule NN: Title`. Not every
number in a band is occupied — gaps are headroom, not omissions.

### The autonomy band (30–42)

| File | Contract |
|---|---|
| `30-autonomy-grant.md` | Authority comes only from `.claude/autonomy.yaml`. Default is attended. Every run prints its level before it acts. |
| `31-never-merge-your-own-work.md` | The agent that wrote a change never approves or merges it. |
| `32-cost-ceilings.md` | Per-run, per-issue, per-day ceilings are hard stops — never downgrade the model or raise the cap. |
| `33-human-only-work.md` | Reserved labels and paths are untouchable; never close a human's issue without evidence and an ack. |
| `34-secret-handling.md` | Never read, print, commit, or relocate secret material. Rotation is human-only. |
| `35-blast-radius.md` | One issue per run, inside a path allowlist, under file and net-LoC caps. Exceeding a cap is a stop sign. |
| `36-ship-dark.md` | Net-new user-visible capability lands behind a flag that defaults off. Flipping it on is human-only. |
| `37-run-journal.md` | Every run writes `.runs/<ts>-<issue>.md`. **No journal, no merge.** Makes Rule 07 mechanically checkable. |
| `38-no-self-modification.md` | A feature run may not edit `.claude/**`, `.github/workflows/**`, or `settings.json`. OS changes are their own change type. |
| `39-idempotency-and-stop-conditions.md` | Reproduce before fixing. Hard-stop the queue after N failures. Never auto-retry destructive operations. Park, never close optimistically. |
| `40-memory-discipline.md` | *(conditional)* Recall before acting, cite what you recalled, admit blanks, retain decisions only, scope every write correctly. |
| `41-external-communication.md` | Nothing leaves the org boundary without a human. Draft, hand over, stop. |
| `42-provenance-and-scoped-commits.md` | Agent, model, run id, and issue on every commit. Never `git add -A`. |

Read 30 first — it is the band's root. Every other rule in the band describes a limit on the
authority that 30 grants.

---

## Frontmatter

Every rule file opens with YAML frontmatter:

```yaml
---
description: "One line, imperative, states the contract."
globs: "*"
alwaysApply: true
---
```

| Key | Meaning |
|---|---|
| `description` | The contract in one imperative sentence. This is what a reader sees in an index or a tooltip — it must stand alone. |
| `globs` | Path patterns the rule applies to. `"*"` means everywhere. A rule that only governs `web/` says so here. |
| `alwaysApply` | `true` loads the rule into every run's context. `false` means it is fetched on demand when its `globs` match. |
| `conditional` | Optional. See below. |

### `conditional:` — rules that only exist when a feature does

A blueprint ships rules for capabilities a given project may not have enabled. Rather than shipping
a rule that is false for half its readers, mark it:

```yaml
---
description: "Recall before acting; answer from recall and cite it."
globs: "*"
conditional: brain driver != none
alwaysApply: true
---
```

The condition is evaluated against the project's declared configuration — the same wizard answers
that filled `{{surfaces}}`, `{{locales}}`, `{{env_matrix}}`, `{{promotion_mode}}`, and the rest.
Conditions are written as short unquoted prose predicates (`iac declared`, `locales.length > 1`,
`brain driver != none`), readable by a human and resolvable by the wizard.

- **Condition true** → the rule loads and binds exactly like an unconditional rule. `conditional:`
  weakens nothing.
- **Condition false** → the file is **inert**. Not partially applicable, not aspirational, not
  "follow the spirit of it". It does not apply, and a run must not simulate the capability it
  governs in order to comply with it.

Conditions are written against declared configuration, never against runtime state — `"brain driver
!= none"`, `"locales > 1"`, `"promotion_mode == gated"`. A condition that requires running something
to evaluate is not a condition; it is a rule body.

Every conditional rule states its condition in prose near the top as well, so a human reading the
file alone knows whether it is live. Do not make readers infer it from frontmatter.

---

## Guard hooks

Rules in the safety and autonomy bands are backed by hooks in `.claude/hooks/`. A rule that names a
hook in its **Enforcement** section is asserting that the hook exists and is registered in
`settings.json`. If you are adding such a rule, add the hook in the same change.

Hooks and rules are **many-to-many**. `guard-blast-radius.sh` carries both Rule 35's caps and Rule
38's frozen set; `guard-autonomy.sh` carries Rule 30's grant and Rule 33's reserved labels. When two
rules share a hook, one of them owns the file and the other says so in its Enforcement section —
never fork a second hook to enforce an overlapping constraint, because two hooks with overlapping
patterns drift apart and the weaker one wins.

### Every guard hook must exit 0 on its own parse failure

This is the one law that binds all of them.

A `PreToolUse` guard receives a JSON payload, extracts a field, and matches it against patterns. All
three steps can fail for reasons that have nothing to do with safety: a payload shape changed, `jq`
is missing, a field is absent, the tool input is a form the hook never anticipated.

**When a hook cannot understand its input, it exits 0 and lets the command through.**

```bash
PAYLOAD="$(cat || true)"
CMD="$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "${CMD}" ] && exit 0     # cannot parse → allow. Never block on our own confusion.
```

Why fail open rather than closed:

- A guard that blocks on parse failure **bricks the entire agent** the moment a payload shape
  shifts — every command, including read-only ones, including the ones that would fix it. The
  failure mode is total and its cause is invisible.
- A guard that fails open still blocks **every well-formed dangerous command**, which is every
  dangerous command an agent actually issues. The residual risk is a malformed payload that also
  happens to be destructive — vanishingly rare, and covered by the CI gate and the review layer
  behind the hook.
- Hooks are one layer of defence. Rules, CI gates, tool permissions, and human review are the
  others. A layer that can take the whole system down is worse than a layer with a seam.

The distinction that matters:

| Situation | Exit |
|---|---|
| Cannot read, parse, or extract from the payload | **0** — allow |
| A required tool (`jq`, `python3`) is missing | **0** — allow |
| Parsed successfully, pattern did not match | **0** — allow |
| **Parsed successfully, pattern matched a forbidden operation** | **2** — block, with the rule number and the reason on stderr |

Never widen "cannot parse" to cover "did not match a case I hadn't thought of". Fail open on
*confusion*, never on *coverage*. If a dangerous form is slipping past, the fix is a new pattern in
the hook — authored as a `fleet-builder` OS change (Rule 38), never as a line edited mid-run by the
agent it was about to stop.

Additional hook obligations:

- `set -uo pipefail` — deliberately **without `-e`** — and every extraction guarded with `|| true` so the shell options do not turn
  a parse failure into a non-zero exit.
- Block messages name the rule number, state what was blocked, echo the offending command, and give
  the sanctioned alternative. A refusal with no alternative gets routed around.
- Hooks are fast. They run on every matching tool call; anything slow belongs in CI.
- Hooks never write to the repository, never call the network, and never mutate state. They read,
  decide, and exit.

---

## Adding a rule

1. Pick the band by what kind of claim the rule makes, not by which number is free.
2. Project-specific? It goes in `local/`, not in the numbered blueprint range.
3. Write the frontmatter first — if you cannot state the contract in one imperative sentence, the
   rule is not yet a rule.
4. Body sections, in order: the bold one-sentence contract, `## The Rule`,
   `## Why this rule exists — concrete cost`, `## Enforcement`, and optionally `## Related Rules`.
5. **Do not invent the cost.** A new rule's cost section says it is prophylactic and awaiting a real
   run journal. Fill it in only when an actual incident, with a date, produces it. The ancestor estate's rules
   have teeth because their costs are real; a fabricated incident is a rule that nobody will believe
   when it matters.
6. If the rule names a hook, ship the hook and register it in `settings.json` in the same change.
7. Rule changes are OS changes: `fleet-builder`, own branch, human review (Rule 38).
