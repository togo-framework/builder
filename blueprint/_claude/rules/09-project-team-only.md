---
description: "Delegate implementation only to agents declared in .claude/team.yaml. Never use general-purpose. If no agent fits, build one first — unless the run is unattended, in which case park and ask."
globs: "*"
alwaysApply: true
---

# Rule 09: Project Team Agents Only — Never `general-purpose`

**When delegating implementation work, always use an agent declared in `.claude/team.yaml`. Never use `general-purpose`.**

## The Rule

| Need | Action |
|------|--------|
| The work matches a role declared in `team.yaml` | Use that role's agent |
| The work is partially covered by a declared role (good enough fit) | Use the closest role and brief them on the specifics |
| **No declared role fits the task at all** | **Stop.** Follow the Gap-Filling Procedure below |
| You are tempted to use `general-purpose`, `Explore`, or `Plan` for implementation | **Re-read this rule.** Those are read-only research agents — never for implementation |

`general-purpose`, `Explore`, and `Plan` are reserved for **research only** (search, file reads, web fetches). They never write code or modify the repo.

## The Roster

**`.claude/team.yaml` is the single source of truth for who exists.** It declares, for each role: the agent file under `.claude/agents/`, the surfaces it owns, and whether it may write to the repo.

Do not maintain a duplicate roster in this rule, in `CLAUDE.md`, or in a plan file. A second copy will go stale and agents will route by the stale copy. Read `team.yaml` at dispatch time, every time.

## Gap-Filling Procedure

If no team agent fits the task:

1. Stop the work.
2. Identify the missing specialty (e.g. "Atlas migration reviewer", "plugin registration specialist", "i18n coordinator").
3. Create `.claude/agents/<role>.md` with frontmatter (name, description, tools), background/personality, and a clear scope of expertise.
4. Register the new role in `.claude/team.yaml` — agent file, owned surfaces, write permission.
5. **Then** delegate the task to the new agent.

The cost of one extra file is much lower than the cost of a generic agent producing work that ignores this project's conventions.

## Unattended Runs May Not Invent an Agent

**An unattended run may not create a new agent mid-run. It parks and asks.**

Creating a role is a scope decision about who is trusted to write to this repo, and it is made by the operator — not by an agent that has hit a wall at 3am and wants to keep moving. In an unattended run (Rule 30), when no declared role fits:

1. **Stop the task.** Do not proceed with the closest-fitting agent "just this once", and do not fall back to `general-purpose`.
2. Write the gap to `.requests/` (Rule 03) as `YYYY-MM-DD-agent-gap-<specialty>.md`, stating: the task that needs it, the specialty missing, why no declared role covers it, and a proposed scope for the new role.
3. Record the park in the run journal under `.runs/` (Rule 37) and mark the plan task `**BLOCKED**: no declared role for <specialty>` (Rule 06).
4. Continue with any *independent* remaining work. Stop entirely if everything left depends on the gap.
5. Surface the parked request at the top of the run report.

An unattended run that returns with a new agent nobody approved has expanded the trusted set without review. That is the failure this clause exists to prevent — the run should return with a question, not with a new colleague.

## Multi-Agent Parallelism

When dispatching to the team (see Rule 08):

- Run independent work in parallel — a single message with multiple agent dispatches.
- Partition by file boundary so agents cannot conflict: one agent per file, one agent per plugin, one agent per surface.
- Sequence dependent work explicitly. The togo chain — migration → `togo generate` → handler → `web/` — is never parallelized across its links.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint derives from. Generic agents there produced work that compiled and was wrong in convention: hand-written SQL where a query file belonged, hand-edited generated files, schema created from service code. Every instance passed review at a glance and had to be found later by someone reading carefully. The deeper cost is auditability — knowing which specialist made which call is the difference between a reviewable decision and "the model did it".

## Enforcement

- No `general-purpose` for implementation. Not for "just a small edit", not because the right agent is busy.
- Every dispatch names a role that exists in `team.yaml`. A dispatch to an undeclared role is a bug, not an improvisation.
- Creating an agent is a deliberate, reviewable act with an operator in the loop. Unattended runs park (see above).
