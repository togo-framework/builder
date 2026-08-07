---
name: plan
description: Write an implementation plan to .plans/ before touching code. Use when asked to build, add, refactor, migrate, or redesign anything that spans more than one file or more than one surface — and whenever a request arrives with the words "implement", "build me", "add support for", or "rework". Also use when picking up a queued issue whose scope is not already pinned to a single function.
---

# plan — Write it down before you write it

Rule 01 (plan first) says: no multi-file change starts without a plan file on disk.
A plan in the chat transcript is not a plan — it evaporates when the session ends, and
the next agent re-derives it wrong. A plan in `.plans/` survives compaction, hand-off,
and the operator closing the laptop.

## When a plan is mandatory

Write a plan when **any** of these is true:

- The change touches more than one file
- The change crosses a surface boundary (`{{surfaces}}` — e.g. Go API ↔ `web/`, or app ↔ plugin)
- The change adds or alters a database table, column, or query
- The change adds a dependency, a plugin, or an environment variable
- The change is expected to take more than one gate cycle to verify

## When a plan is overhead — skip it

- Single-function bug fix with an obvious repro
- Typo, copy edit, comment
- Regenerating `*.gen.go` after a query change (that IS the plan — see `togo-generate`)
- The operator explicitly said "just do it"

If you skip the plan, say so in one line and say why. Silence reads as "forgot".

## File location and name

```
.plans/YYYY-MM-DD-<kebab-slug>.md
```

One plan per unit of work. Do not append a second unrelated feature to an existing
plan file — that is how a plan becomes a changelog nobody reads.

## Plan template

```markdown
# <Title>

**Status:** draft | approved | in-progress | done | abandoned
**Owner:** <agent or human>
**Issue:** <builder issue ref or GitHub #N, if any>
**Created:** YYYY-MM-DD

## Goal

One paragraph. What is true after this lands that is not true now. Written so a
reader who has never seen the codebase can tell whether it succeeded.

## Non-goals

The adjacent things this deliberately does NOT do. This section is what stops
scope creep three hours in.

## Current state

What exists today, with file paths. If you had to read code to find out, put what
you found here so the next agent does not read it again.

## Approach

The chosen design, and — in one or two sentences each — the alternatives rejected
and why. If there was no alternative, say "only viable approach" and why.

## Steps

- [ ] 1. <step> — files: `path/a.go`, `path/b.tsx`
- [ ] 2. <step>
- [ ] 3. `togo generate` — regenerates `*.gen.go`
- [ ] 4. `togo migrate` — applies the schema
- [ ] 5. Verify (see below)

Each step must be independently checkable. "Implement the feature" is not a step.

## Verification

The exact commands and the exact expected output. Copy this into the `verify`
skill's evidence bundle when closing. See Rule 28.

## Risks / unknowns

Anything you would have to guess at. If a risk is blocking, stop and ask —
do not encode a guess as a decision.

## Decisions log

- YYYY-MM-DD — <decision> — <who> — <why>
```

## Working the plan

1. Write the plan. Show the operator the **Goal**, **Non-goals**, and **Steps** in chat.
2. Wait for approval if the plan changes schema, adds a dependency, alters auth, or
   touches anything under `{{prod_ref}}`. Otherwise proceed.
3. Tick checkboxes **as you land each step**, not in a batch at the end. The file on
   disk is the progress tracker; an untouched plan with finished work is a lie.
4. When a step turns out to be wrong, edit the plan and add a line to the decisions
   log. Do not silently do something else.
5. On completion set `Status: done` and paste the verification evidence in.

## Anti-patterns

- **A plan written after the code.** That is a report, not a plan. It has no steering value.
- **A plan with no non-goals.** Guaranteed scope creep.
- **A plan that lists "refactor X" as a step with no file list.** Unverifiable.
- **Ten plans open at once.** If `.plans/` has more than a handful of `in-progress`
  files, the work is not being finished. Close or abandon before opening another.
- **Deleting an abandoned plan.** Set `Status: abandoned` with a one-line reason and
  keep it. The reason someone stopped is worth more than the plan was.

## Related

- `decompose` — when the plan is too big for one PR, split it into dependency-ordered issues
- `verify` — the evidence gate the plan's Verification section feeds
- `issue-fix` — the autonomous loop, which writes a plan as its second step
