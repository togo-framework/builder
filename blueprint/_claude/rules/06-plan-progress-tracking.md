---
description: "Never continue to the next feature without updating the plan file. Check off completed tasks in .plans/ after each feature is verified."
globs: "*"
alwaysApply: true
---

# Rule 06: Plan Progress Tracking — Update Before Moving On

**Never start the next feature without updating the plan file to reflect completed work.**

This rule is the human-readable half of the run record. Its machine-readable half is the run journal in `.runs/` (Rule 37). A `.plans/` file is what the operator reads; the journal entry is what the next agent replays. **Both are written, and they must agree.**

## The Rule

After completing ANY feature or task from a plan in `.plans/`:

1. **Open the plan file.** Read it to find the feature you just completed.
2. **Check off completed items.** Change `- [ ]` to `- [x]` for every finished task.
3. **Update the status.** If a feature is fully done, mark the feature header.
4. **Report to the operator.** Show what was checked off and what is next.

A task is checked off only when it meets Rule 05's Definition of Done. Checking a box on a task whose gates have not run is a false record, and false records are worse than no records.

## How to Track

### Task level

```markdown
#### Tasks
- [x] Migration written and applied via `togo migrate`   ← DONE
- [x] Query file added, `togo generate` diff-clean       ← DONE
- [ ] Handler registered via init() + RegisterProviderFunc ← NEXT
- [ ] web/ route consumes the endpoint                    ← TODO
```

### Feature level

```markdown
### Feature 1.1: Items API ✅
**Status**: DONE — all Rule 05 gates green
```

### Phase level

```markdown
## Phase 1: Data Layer ✅
> All 3 features complete. Schema applied, sqlc types generated.
```

## When to Update

| Event | Action |
|-------|--------|
| Task completed and gates green | `- [ ]` → `- [x]` |
| Feature fully done | Add ✅ to the feature heading |
| Phase fully done | Add ✅ to the phase heading |
| Blocker found | Add `**BLOCKED**: reason` under the task |
| Scope change | Add a note under the feature explaining the change |
| Assumption made | Add `ASSUMPTION:` under Technical Notes (Rule 02) |

## Progress Summary Format

When the operator asks for status, report **from the plan file**, having just read it:

```
Phase 1: Data Layer — 2/3 features done
  ✅ Feature 1.1: Items schema + migration
  ✅ Feature 1.2: sqlc queries
  🔄 Feature 1.3: chi handlers (in progress — 3/4 tasks done)

Phase 2: Web surface — 0/4 features done (blocked on Phase 1)
```

## Anti-Patterns

- Starting Feature 2.1 while Feature 1.3 has unchecked tasks → **wrong**
- Telling the operator "Phase 1 is done" without opening the plan file → **wrong** (Rule 07)
- Completing five features and then batch-updating the plan → **wrong** — update after each
- Marking tasks done without running the Rule 05 gates → **wrong**
- Plan file and `.runs/` journal entry disagreeing → **wrong** — reconcile before moving on

## Why this rule exists — concrete cost

Inherited from the estate this blueprint derives from, where plan files were written at kickoff and never touched again. Within days, "what is actually done" existed only in the last agent's context window — and that context was gone. Status reports became guesses that sounded confident; work was re-done because nobody could tell it had already landed. The plan file is the single source of truth for progress precisely because it survives the session.

## Enforcement

- The plan file is updated **before** the next feature starts, not at the end of the batch.
- Every status claim to the operator is made after re-reading the plan file, with the discrepancy flagged if the file and the codebase disagree (Rule 07).
- An unattended run keeps both the plan and the journal current at every checkpoint, because there is no human present to hold the state (Rule 30).
