---
description: "Enforces plan-first development. Never start implementation before saving a plan to the .plans/ directory."
globs: "*"
alwaysApply: true
---

# Rule 01: Plan-First Development

**Never start implementation before saving a plan.**

## The Rule

Before writing any code for a task that involves 2+ files or crosses a surface boundary:

1. Create a plan file in `.plans/` at the repo root.
2. Filename: `YYYY-MM-DD-{kebab-case-title}.md`.
3. Present the plan to the operator for approval before starting.

## Plan Template

```markdown
# Plan: {Title}

**Date**: {YYYY-MM-DD}
**Status**: Draft | Approved | In Progress | Done
**Surfaces**: {{surfaces}}  (list only the ones this plan touches)

## Objective
{What are we building and why?}

## Features

### Feature 1: {Name}
**Surface**: {one of {{surfaces}}}
**Role**: {a role declared in .claude/team.yaml — see Rule 09}
**Small Win**: {Minimum deliverable that proves value — see Rule 04}
**DoD**:
- [ ] `togo generate` clean
- [ ] `go test ./...` green
- [ ] `togo lint && togo format` clean
- [ ] `pnpm -C web typecheck && pnpm -C web build` green (if `web/` touched)
- [ ] Verified live (Rule 28)

#### Tasks
- [ ] Task 1
- [ ] Task 2

### Feature 2: {Name}
...

## Cross-Surface Dependencies
{Which features must land before others can start?}
Example: "The Atlas migration must be applied before the sqlc query compiles,
which must land before the chi handler, which must land before the web/ route."

## Technical Notes
{Architecture decisions, risks, trade-offs, plugin registration order}
```

## When to Skip

Single-file bug fixes, typo corrections, and config changes do not need a plan. Use judgment — if it is truly trivial, just do it.

**Never skip the plan** when the change touches schema, plugin registration, auth permissions, or generated code. Those are the changes that are expensive to unwind.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint derives from. Plan-free work there produced features that were 80% built before anyone noticed they duplicated an existing endpoint or contradicted an in-flight change. The plan file is also what Rules 04, 06, and 09 read from — without it, small wins go untracked, progress reporting has no source of truth, and delegation has no brief to hand a subagent.

## Enforcement

- No plan file → no implementation. If an agent starts coding a multi-file change with no `.plans/` entry, stop it and write the plan.
- The plan is a live document, not a submission artifact. Rule 06 governs keeping it current.
- Plans are committed. A plan that exists only in the conversation does not exist.
