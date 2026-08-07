---
name: decompose
description: Wave-decomposition protocol for umbrella tracker issues that have grown past a complexity threshold. Auto-trigger when a single tracker has more than ~50 enumerable work units, more than ~10 sub-tasks, or spans multiple owner specialties. Use when asked to "break this down", "split the tracker", "turn this into issues", or when a plan is too large for one PR.
---

# decompose — Wave decomposition for oversized trackers

When an umbrella tracker grows past a complexity threshold, a single PR can no longer
represent one reviewable unit of work. This skill encodes the protocol for decomposing
such trackers into per-owner, dependency-ordered sub-issues.

---

## 1. When to decompose

Decompose when **any** of the following is true:

**Complexity threshold (hard triggers)**

- The tracker describes **more than 50** endpoints, files, components, or other
  enumerable work units
- The tracker has **more than 10** distinct sub-tasks that each need a PR of their own
- The acceptance criteria reference **more than one owner specialty** — e.g. Go handler
  work AND frontend hook work AND a migration are all in the same tracker

**Dependency structure (soft triggers — combine with at least one hard trigger)**

- Some sub-tasks must land before others can start (non-trivial dependency chain)
- Multiple sub-tasks can run in parallel if broken out, but must run sequentially if
  kept together

**PR scope (rule of thumb)**

- The tracker represents more than one day of work for a single agent dispatch
- Landing everything in one PR would exceed ~500 LoC of meaningful logic (excluding
  generated code — `*.gen.go` does not count toward the budget)

**Recognising these in practice**

Flag trackers that meet the threshold; do **not** auto-decompose. Decomposition
requires operator awareness: either explicit instruction, or the threshold check
running as part of the planning step before a new tracker is opened.

---

## 2. When NOT to decompose

**Stale assumptions.** Do not decompose if the sub-tasks would encode assumptions that
are not yet finalised. If the decomposition axis relies on a schema, an API shape, or a
runtime topology that is still in a spike, the sub-issues will be wrong before they are
opened. A tracker blocked on an unapplied migration is the canonical case: every
sub-issue would reference columns that do not exist. Keep it as one blocked tracker
until the gate clears.

**No independent value.** Do not decompose if the sub-tasks have no individual value
and must all land in the same merge. Auth middleware + route registration + health
check can live in one PR because none of them is meaningful alone.

**Small trackers.** Fewer than 5 sub-tasks and less than a day of work: the overhead of
opening, linking, and dispatching exceeds the parallelism benefit.

**Unapproved scope.** Do not decompose a draft tracker. Decomposing before scope is
locked generates sub-issues that all need closing and reopening when scope moves.

**Explicit KEEP-AS-TRACKER signal.** If a prior agent or the operator has tagged the
issue `KEEP-AS-TRACKER` (label or comment), skip it. The reasoning is already encoded;
do not re-litigate it.

---

## 3. The decomposition recipe

Follow in order. Do not parallelise — each step produces the input for the next.

### Step 1 — Read the umbrella tracker

Extract every enumerable work unit from the issue body. For an API tracker that is the
endpoint list; for a frontend tracker, the route list; for a plugin tracker, the plugin
list. **Write them down before proceeding.** If you cannot enumerate them, the tracker
is not ready to decompose — it is ready for a `plan`.

### Step 2 — Group by owner specialty and dependency chain

Partition the units into groups. Each group must:

- Belong to a single owner specialty (one agent type per group, ideally one sub-issue
  per agent dispatch)
- Have a coherent dependency relationship with the other groups

Each group becomes exactly one sub-issue.

### Step 3 — Assign waves

Map each group to a wave using the dependency graph (Section 4). Label the wave
**explicitly in the sub-issue body** — that is how a future agent knows dispatch order
without re-deriving the whole graph.

### Step 4 — Write each sub-issue

Title:

```
Phase <X>: <work-unit-description> (Refs #<parent>)
```

Body must contain:

- **Scope** — the exact list of endpoints / files / components covered
- **Acceptance criteria** — a specific, verifiable checklist
- **Wave** — A / B / C / D / E, and what it depends on
- **Blocked by** — issue numbers that must be **fully landed** (not merely opened)
- **Refs** — the parent tracker
- **Definition of done** — including the `verify` evidence bundle

Labels: `type:feature`, `status:queued`, `area:<surface>`, `priority:<wave-letter>`.
Use the highest priority for Wave A and B items on the critical path.

### Step 5 — Open sub-issues one at a time

Open them individually and verify each one before opening the next. **Do not batch
them in a script loop.** A loop fails silently on a missing label, a body-encoding
error, or a rate limit, and leaves a partial decomposition that is painful to audit.
Record each issue number — you need the full range for the parent comment.

### Step 6 — Post a superseded-by comment on the parent, then close it

```
Superseded by <count> sub-issues #<first>–#<last>. Each tracks one independent unit of
work with its own wave assignment and DOD. Dispatch order is in <playbook path>.
```

**Do not change the parent's existing labels.** They carry its history — when it was
opened, its original priority, its area. The closed state and the superseded-by comment
are the only changes made to the parent.

### Step 7 — Write the dispatch playbook

Non-negotiable. Do not close the parent without one.

Location: `docs/phase-<X>-dispatch-playbook.md`

It must contain:

1. **Purpose** — what this phase does and which parent it supersedes
2. **Pre-flight gates** — named blockers to clear before any sub-issue is dispatched
   (credentials, database reachability, spike verdicts, an applied migration)
3. **Wave tables** — one per wave: issue number, unit, size, priority, notes
4. **Per-wave dispatch protocol** — how to dispatch, implement, and close each sub-issue
5. **Drift detection** — how a future agent verifies the source spec has not changed
   since the sub-issue was filed
6. **What not to do** — hard refusals specific to this phase

---

## 4. Wave ordering pattern

A guideline. Adjust labels and membership to the actual dependency graph.

**Wave A — Foundation (no business-logic dependencies).** Auth, health, config,
connectivity probes. No upstream service dependencies; everything downstream needs
authenticated, reachable infrastructure. Lands first.

**Wave B — Core domain (depends on A).** The primary data resources — the tables and
endpoints that analytics and real-time layers build on.

**Wave C — Analytics reads (depends on B).** Aggregations, dashboards, timeseries,
rollups. Require the primary resources to exist and be populated.

**Wave D — Real-time and event layer (depends on C).** WebSocket upgrades,
subscriptions, notifications, async task tracking. Require the layer beneath to
produce events to fan out.

**Wave E — External integrations (depends on D and any pending spikes).** Third-party
APIs, AI surfaces, protocol bridges. Most external dependencies, most likely to be
blocked on something outside the repo.

**Adapting the pattern**

For a **frontend** decomposition:

- A: shared layout, auth guard, error boundaries, loading skeletons (no data dependency)
- B: primary entity routes (list, detail)
- C: analytics routes (charts, rollups)
- D: transactional routes (approvals, assignments, alerts)
- E: export, report generation, embedded/external routes

For a **plugin** decomposition:

- A: the shared contract — the envelope shape, the publish helper, the config reader
- B: the simplest adapters, no rate-limit complexity
- C: authenticated API adapters (upstream auth + rate limits)
- D: platform-specific adapters with complex contracts
- E: aggregators, which depend on B+C patterns being stable

For a **schema-first** decomposition in a togo project, Wave A is always the migration
plus `togo generate`, because every other wave codes against the generated types. A
decomposition that puts the migration in Wave C is wrong.

---

## 5. Worked shape

**Source:** one tracker enumerating 112 endpoints across 20 API tags.

**Threshold hit:** 112 ≫ 50. Twenty tags spanning handler work, authorization policy,
JWT middleware, WebSocket upgrade, and retrieval — five distinct owner specialties.

**Result:** 20 sub-issues, 5 waves.

| Wave | Sub-issues | Units | Gate |
|---|---|---|---|
| A | 2 | 26 | credentials + database reachable |
| B | 5 | 37 | Wave A |
| C | 4 | 18 | Wave B core resource |
| D | 5 | 16 | Wave C |
| E | 4 | 15 | spike verdicts + Wave D |

The critical path is the auth sub-issue in Wave A: every other wave gates on it. That
was identified by reading the dependency note in the tracker body and encoding it in
the Wave A table's Notes column — not by guessing.

**The counter-example:** a tracker enumerating 7 source plugins was *not* decomposed.
Seven is below the >10 trigger, and two gates were open — the config table had not been
applied to the database, and the message bus was not yet reachable. Decomposing would
have produced 7 issues referencing a schema that did not exist. It stayed one blocked
tracker until both gates cleared. That is the KEEP-AS-TRACKER case.

---

## 6. Auto-recognise / auto-skip

**Decompose when:**

- A single issue body lists more than 50 endpoints / components / files
- A single issue body references more than two distinct owner specialties
- A single issue's acceptance criteria span multiple repos or surfaces

**Skip when:**

- The issue has a `KEEP-AS-TRACKER` label or a comment containing that phrase
- The issue's `Blocked by` section lists an open issue whose resolution would change
  the decomposition axis
- The issue is a draft — scope is not locked

Check for the signal before deciding:

```bash
gh issue view <N> --json labels --jq '.labels[].name' | grep -i keep
gh issue view <N> --json comments --jq '.comments[].body' | grep -i keep-as-tracker
```

If either matches, skip and record why in the status report.

---

## 7. Anti-patterns — hard refusals

**Do not decompose without operator awareness.** Decomposition closes the parent
tracker — a visible, auditable action. Do not close a tracker the operator filed
without explicit instruction or a clear threshold breach. When in doubt, flag the
threshold and ask.

**Do not decompose along arbitrary axes.** Alphabetical order, file count, and
commit-log order are not decomposition axes. The only valid axes are **owner specialty**
and **dependency chain**. If the resulting sub-issues have no ordering constraint and
the same owner, the decomposition added nothing but bookkeeping.

**Do not open sub-issues without acceptance criteria and a DOD.** A sub-issue without
acceptance criteria is a wish. A future agent picking it up has no way to know when it
is done.

**Do not close the parent without a dispatch playbook.** The playbook is the handoff
document. Writing it costs fifteen minutes; re-triaging twenty orphaned sub-issues
costs a full planning pass.

**Do not change the parent's labels.** They are its history.

**Do not batch-open via a script loop.** One at a time, verified.

---

## Related

- `plan` — write the plan first; decompose it when it exceeds one PR
- `issue-fix` — the loop that consumes the sub-issues this produces
- `verify` — the evidence standard every sub-issue's DOD must reference
