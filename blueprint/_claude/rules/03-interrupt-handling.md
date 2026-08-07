---
description: "Never stop mid-flow. Save unrelated requests to .requests/ and continue the current work."
globs: "*"
alwaysApply: true
---

# Rule 03: Interrupt Handling — Never Stop Mid-Flow

**An unrelated request is parked in `.requests/`, not served immediately.**

## The Rule

If the operator asks about something unrelated while you are working on a plan or task:

1. **Save the request** to `.requests/` as a markdown file.
2. Filename: `YYYY-MM-DD-{kebab-case-summary}.md`.
3. Acknowledge: "Saved to `.requests/` — I'll address it after the current task."
4. **Continue the current flow** without stopping.
5. After completing the current task, review `.requests/` and address pending items.

## Request Template

```markdown
# Request: {Summary}

**Date**: {YYYY-MM-DD HH:MM}
**Status**: Pending | Done
**Context**: {What were we working on when this came in?}

## Request
{The exact request, verbatim}

## Notes
{Initial read on effort, which surface, which role from .claude/team.yaml}
```

## Exception

If the operator says "stop", "drop everything", or "this is urgent" — stop immediately and handle the new request. Save the **current work state** to `.requests/` instead, so the interrupted task can be resumed without re-deriving where it was.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint derives from. Context-switching mid-task left half-applied changes: a migration written but not applied, a handler added but not registered, generated code stale against a schema that had already moved. The half-state is worse than either finished state, and the cost lands on whoever picks the work up next — usually a fresh agent with no memory of why the repo is inconsistent.

## Enforcement

- A parked request is a real deliverable. `.requests/` is reviewed at the end of every task, not at the end of the day.
- Never leave the repo in a half-applied state to chase an interrupt. Reach a compiling, generate-clean checkpoint first (Rule 05), or write the work state down.
- Parked requests that are still `Pending` after the current plan completes get raised to the operator explicitly — silence is not triage.
