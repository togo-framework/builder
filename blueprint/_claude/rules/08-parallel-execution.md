---
description: "Use sub-agents for parallel work. The main agent coordinates and talks to the client — sub-agents write code, run tests, and explore."
globs: "*"
alwaysApply: true
---

# Rule 08: Parallel Execution — Never Block the Client

**The main agent is a conductor, not a worker.**

## The Rule

Delegate implementation work to sub-agents. The main agent plans, routes, collects results, and stays available to the client.

```
Client: "Build feature X"
  │
  ├→ You: Create the plan, discuss it with the client (Rules 01, 02)
  ├→ You: Break it into features, identify the surfaces
  │
  ├→ Dispatch sub-agents in PARALLEL where independent:
  │   ├→ data role:     resource declaration + sqlc queries + migrate
  │   ├→ backend role:  chi handler + provider registration (after codegen)
  │   ├→ web role:      TanStack route + query hook (after the endpoint)
  │   └→ qa role:       tests at each layer
  │
  ├→ You: Report progress to the client as results land
  └→ You: Collect results, run the Rule 05 gates, present for review
```

## Agent Routing

**The roster lives in `.claude/team.yaml`. Read it — do not hardcode a routing table here.**

`team.yaml` declares, per role: the agent file, the surfaces it owns, and whether it may write. Route by matching the work to a declared role:

1. Read `.claude/team.yaml`.
2. Match the work to a role by its declared surface and scope.
3. Dispatch to that role's agent.
4. If nothing matches → **stop**. Rule 09 governs what happens next; do not fall back to a generic agent.

Read-only research agents (`Explore`, `Plan`, `general-purpose`) are for search and strategy only. They never write to the repo. See Rule 09.

## When to Parallelize

- Independent features on different surfaces → parallel.
- Research and planning → always parallel with each other.
- Test writing for a layer that is already built → parallel with the next layer's implementation.

## When to Stay Serial

- The generator-first chain (Rule 10): **declare → scaffold → `togo generate` → `togo migrate` → hand-edited fragments → tests**, then `web/`. Each rung consumes the previous rung's output. Parallelizing it produces agents compiling against types that do not exist yet, and regenerating over each other's work.
- Anything touching the same file. Partition dispatch by file boundary — one agent per file, always.
- Plugin registration order changes, permission-string changes, and schema changes: one at a time, verified between.
- Single-file changes, obvious bug fixes, config edits — the coordination costs more than the work.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint derives from. Two failure modes recurred: the main agent disappearing into implementation for an hour while the client sat with no information, and parallel agents dispatched onto the same file, whose edits silently clobbered each other. Partitioning by file boundary and keeping the conductor free of implementation work fixes both.

## Enforcement

- The main agent stays reachable. If it is deep in an edit loop, it is doing a sub-agent's job.
- Every parallel dispatch declares its file boundary. Overlapping boundaries are a dispatch bug — fix the partition, do not "be careful".
- Dependent work is sequenced explicitly, with the dependency named in the plan file (Rule 01).
