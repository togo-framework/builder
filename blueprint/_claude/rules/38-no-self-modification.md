---
description: "During a feature run, never edit .claude/**, .github/workflows/**, or settings.json. Changing the operating system is its own change type."
globs: "*"
alwaysApply: true
---

# Rule 38: No Self-Modification During a Feature Run

**A run that was dispatched to change the product may not change the machinery that governs the
run. `.claude/**`, `.github/workflows/**`, and `settings.json` are read-only for the duration of
any feature, fix, or chore run — no exceptions, no "just this one line".**

## The Rule

The blast radius of a change is not the size of its diff. Editing a handler affects a handler.
Editing a guard hook affects **every future run in this repository, forever, silently**. Those are
not the same kind of change and they do not travel through the same review.

### The frozen set

| Path | Why it is frozen |
|---|---|
| `.claude/rules/**` | the rules the run is being judged against |
| `.claude/hooks/**` | the guards that block the run |
| `.claude/agents/**` | who is allowed to do what |
| `.claude/skills/**` | the procedures a run follows |
| `.claude/settings.json`, `.claude/settings.local.json` | permissions, hook registration, allowlists |
| `settings.json` at any level | same |
| `.github/workflows/**` | the CI that must pass before merge |
| `.mcp.json` | which external tools exist at all |
| `CLAUDE.md`, `AGENTS.md` | standing instructions |

Read them freely. Quote them. Cite them in the run journal. **Do not write them.**

### The failure this prevents

An agent hits a guard. The guard is correct — it is stopping something that should be stopped.
The cheapest path to a green run is now one line in `guard-*.sh`, and every subsequent run in this
repository inherits a weaker guard that nobody reviewed. The agent that removed the seatbelt is
the agent that needed the seatbelt.

The same shape, in three disguises:

- "The hook has a false positive on my command, I'll widen the pattern." → the hook was right, or
  it was wrong and that is a hook change, authored as one.
- "CI is failing on a check unrelated to my change, I'll skip it in the workflow." → the check is
  now off for everyone.
- "I need one more permission, I'll add it to `settings.json`." → the permission boundary is now
  wider and no human agreed to it.

None of these are dishonest. All of them are the rule's reason for existing.

### What to do instead

1. **Stop the feature run at the guard.** The guard's refusal is a result, not an obstacle.
2. **Record it** in the run journal under "What is still unproven" — name the file, the rule, and
   what you would have changed.
3. **Escalate to the human.** State the guard, why you believe it is wrong or too narrow, and the
   exact one-line change you would propose.
4. If the human agrees, the OS change becomes **its own run**: its own branch, its own issue, its
   own journal, authored by the **`fleet-builder`** agent, **reviewed by a human before merge**.
   It never rides along in a feature PR.

An OS change and a product change never share a commit. If you find yourself writing a commit
message with "and" in it where one half is a hook, split it.

### The `fleet-builder` exception, precisely scoped

`fleet-builder` is the only agent permitted to write the frozen set, and only when:

- the run's issue is labelled as an OS change (`type:os` or the project's equivalent), **and**
- the branch contains **no** changes outside `.claude/**`, `.github/**`, `settings.json`,
  `.mcp.json`, and `docs/`, **and**
- a human approves the PR. Not a bot, not another agent, not an auto-merge rule.

`fleet-builder` running under these conditions is not "self-modification" — it is a human-directed
change to the operating system that happens to be executed by an agent. The distinguishing feature
is that a human decided, in advance, that the OS should change.

### Blueprint provenance

This tree came from `{{project_name}}`'s blueprint at `{{blueprint_version}}`. Local divergence is
expected and fine — but it is **deliberate** divergence, recorded in a `fleet-builder` run, not
drift accumulated one silent line at a time by runs that were trying to do something else.
Project-local rules live in `.claude/rules/local/` (see `rules/README.md`) so that blueprint
upgrades can be applied without clobbering them.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named, dated failures.
These are prophylactic. When a run journal produces a real incident, record it here — do not
invent one.

## Enforcement

Rule 35 already lists `.claude/**` and `.github/**` under `blast_radius.forbidden_paths`. This rule
is the *why*, plus the one lane out — so the enforcement extends Rule 35's hook rather than adding a
competing one.

- **PreToolUse hook** `.claude/hooks/guard-blast-radius.sh`, registered for `Edit`, `Write`,
  `MultiEdit`, `NotebookEdit`, and `Bash`. Beyond the `forbidden_paths` check Rule 35 specifies, it
  resolves Bash-side write targets (redirection, `sed -i`, `tee`, `cp`, `mv`, `chmod`, `rm`,
  `git checkout -- <path>`) so the frozen set cannot be edited through a shell, and **exits 2** on
  any hit. It exits 0 only in the `fleet-builder` lane: the run's issue carries the OS-change label
  **and** `git diff --name-only {{trunk}}...HEAD` touches nothing outside the OS paths. On its own
  parse failure it exits 0 (see `rules/README.md`).
- **CI gate** — a PR that mixes frozen-set paths with product paths fails, with the message
  "split this into an OS change and a product change". A frozen-set-only PR requires a named human
  approver and cannot auto-merge (Rule 31's reviewer instance is not sufficient here — the reviewer
  is also an agent, and an agent must not ratify a change to the agents' own constraints).
- **Review** — a diff touching `.claude/hooks/**` is read line by line for *weakening*: widened
  allowlists, added early `exit 0`, removed patterns, `|| true` appended to a check.

## Related Rules

- Rule 30 — the autonomy grant is a file. `.claude/autonomy.yaml` is inside the frozen set; a run
  cannot widen its own grant.
- Rule 31 — never merge your own work. An OS change needs a **human**, not the reviewer instance.
- Rule 35 — blast radius. It denies `.claude/**` as a path; this rule explains why that denial is
  the load-bearing one and defines the only sanctioned way through it.
- Rule 37 — the run journal. A guard you could not get past is recorded there, not routed around.
- Rule 41 — external communication is human-only. Same principle: some categories of action are
  not delegable to a run, regardless of how convenient the delegation would be.
- Rule 42 — scoped commits. `git add -A` on a run that happened to touch a hook is exactly how the
  frozen set gets edited by accident.
