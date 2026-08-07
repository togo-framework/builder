---
description: "During planning, ask the operator immediately about anything unclear. Do not guess or assume."
globs: "*"
alwaysApply: true
---

# Rule 02: Clarify Unknowns Early

**Ask three focused questions upfront rather than redo the work later.**

## The Rule

During planning, if anything is unclear — requirements, scope, priorities, which surface owns the logic, technical approach — **ask the operator immediately**.

## When to Ask

- The requirement could be read two different ways.
- You are unsure which surface owns a piece of logic (`internal/` vs a plugin vs `web/`).
- The feature might need a new table, a new column, or a change to an existing sqlc query.
- You do not know whether the operator wants a quick prototype or production-grade code.
- The scope is ambiguous ("make the dashboard better" — better how?).
- A permission string is implied but not named. togo auth's `Can()` is an exact string match; guessing the string produces a silent deny, and `["*"]` denies everything rather than granting it.
- The change would require editing a `*.gen.go` file. That is never the answer — ask what the real intent is.

## How to Ask

Ask specific questions with clear options and a stated trade-off:

```
"Should the entity search run server-side as a sqlc query with a WHERE filter,
or client-side in TanStack Query over an already-fetched list?
Server-side scales and paginates; client-side is instant for small datasets
and adds no endpoint."
```

Not vague questions:

```
"How should we handle search?"   // Too vague — this is not a question, it is a shrug
```

## Why this rule exists — concrete cost

Inherited from the estate this blueprint derives from. Guessed requirements there were not caught at review — they were caught in production, after the guess had been built on top of. The asymmetry is the whole argument: a clarifying question costs one message; a wrong assumption costs the feature, the review cycle, and the operator's confidence in every other answer given that day.

## Enforcement

- Do not guess. Do not assume. Ask.
- An assumption you choose to proceed on anyway must be written down in the plan file under **Technical Notes**, marked `ASSUMPTION:`, so it can be challenged.
- If the operator is unavailable and the run is unattended, park the question rather than guessing — see Rule 30 (autonomy) and Rule 03 (interrupt handling).
