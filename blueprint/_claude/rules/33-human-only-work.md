---
description: "Never touch work labelled human-only, security, legal, billing, customer-comms, or needs-human; never close a human's issue without evidence and an ack; never self-assign an issue you filed."
globs: "*"
alwaysApply: true
---

# Rule 33: Some Work Is Human-Only, and You Do Not Get to Decide Which

**An agent never picks up work carrying a human-only label, never closes an issue
a human opened without evidence *and* an acknowledgement, never assigns itself an
issue it filed, and never re-opens or re-litigates an issue a human closed.**

## The Rule

### The reserved labels

Work carrying any of these labels is outside the agent's remit entirely — it may
be read for context, and nothing else:

| Label | Why it is human-only |
|---|---|
| `human-only` | Explicit reservation. Needs no further justification. |
| `security` | Disclosure timing, blast radius, and the decision to patch quietly or loudly are human judgement calls. A wrong move turns a private bug into a public exploit. |
| `legal` | Terms, licences, compliance, DPAs, takedowns. An agent's text becomes a legal position. |
| `billing` | Anything that moves money or changes what a customer is charged. |
| `customer-comms` | Anything that will be read by a customer as the project speaking. Tone, commitment, and apology are not code. |
| `needs-human` | Applied by the fleet when a run aborted (Rule 32) or hit a fence. Means: a human must look before any agent tries again. |

"Outside the remit" means: do not assign, do not branch, do not draft a fix, do
not comment a proposed patch, do not open a "helpful" companion PR. Read-only.
If you believe a labelled issue is mislabelled, say so **in one comment** and
stop; do not remove the label. Removing a reserved label is itself a violation.

Add project-specific reservations to `.claude/autonomy.yaml`:

```yaml
human_only:
  labels: [human-only, security, legal, billing, customer-comms, needs-human]
  paths:  ["LICENSE", "SECURITY.md", "docs/legal/**", "**/pricing/**"]
```

### Closing a human's issue: evidence AND acknowledgement

An agent may close an issue **it filed itself**, on its own evidence. An issue a
human opened is that human's issue. To close it, both must hold:

1. **Evidence** — a linked merged PR, a passing test that reproduces the reported
   behaviour and now passes, a log excerpt, or a reproduction that no longer
   reproduces. "I believe this is fixed" is not evidence. "This looks like a
   duplicate of #12" is not evidence.
2. **Acknowledgement** — the issue's author (or another human) has responded
   affirmatively *after* the evidence was posted. Silence is not an ack. A
   thumbs-up reaction from the author counts; a reaction from an agent does not.

Without both, the agent posts the evidence, applies `needs-human`, and leaves the
issue open. An open issue costs a little attention. A wrongly closed issue costs
the reporter's trust, and they stop reporting.

### Never self-assign an issue you filed

An agent may file issues — that is often the correct output of a run that found
something out of scope. It may **not** then assign that issue to itself, or to
another agent, or work it in the same run.

An agent-filed issue must be triaged by a **human** before any agent picks it up.

This closes the self-dealing loop: file work → assign yourself → do it → file
follow-up work → assign yourself → forever. The loop feels productive, burns real
budget, and produces a backlog nobody asked for and a changelog nobody can read.
An agent's own opinion about what should be built is a proposal, not a mandate.

The same applies transitively: agent A may not file an issue for agent B to pick
up, and a run may not "hand off" to a successor run through the issue tracker.
Every unit of agent work traces back to a human-authored, human-triaged request.

### Never re-litigate a human-closed issue

If a human closed an issue — as `wontfix`, `not planned`, `duplicate`, or with no
reason at all — that decision stands. Do not re-open it. Do not file the same
request under a new title. Do not implement it anyway "since it's easy". Do not
argue in a comment thread with the human who closed it.

If genuinely new information appears (the closure rationale is now factually
wrong — the dependency shipped, the constraint was lifted), post **one** comment
stating the new fact and stop. A human re-opens it or does not.

### Related-but-allowed

None of this forbids an agent from *touching security-adjacent code* in the
normal course of a bug fix, or from writing docs that mention pricing. The label
governs the **work item**, not every file it brushes against. What is forbidden
is taking on an item whose *purpose* is security, legal, billing, or customer
communication.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named,
dated failures. These are prophylactic. When a run journal produces a real
incident, record it here — do not invent one.

## Enforcement

- **`.claude/hooks/guard-autonomy.sh`** carries the label gate:
  - `SessionStart`: resolves the issue the run was dispatched for, reads its
    labels and author, and refuses to start (exit non-zero, with reason) when a
    reserved label is present, when the issue author is an agent identity that
    has not been human-triaged, or when the issue is closed.
  - `PreToolUse(Bash)`: blocks `gh issue close` on issues whose author is human
    unless the run recorded both evidence and an ack; blocks
    `gh issue reopen` on human-closed issues; blocks `gh issue edit --add-assignee`
    / `--remove-label` targeting a reserved label or a self-filed issue.
- **CI gate `human-only-untouched`**: fails a PR that links to an issue carrying a
  reserved label, or that modifies a path listed under `human_only.paths`.
- **Fleet dispatcher**: never enqueues an issue carrying a reserved label, an
  agent-authored issue lacking a human triage marker, or a closed issue. This is
  the cheapest place to enforce it — the run never starts.
- **Review heuristic**: a PR whose linked issue was filed by the same agent
  identity in the previous 24h is flagged for human triage before review.

## Related Rules

- Rule 30: The Autonomy Grant Is a File — reserved labels/paths live beside it
- Rule 31: Never Merge Your Own Work — the same anti-self-dealing principle, applied to review
- Rule 32: Cost Ceilings — an aborted run applies `needs-human`, which this rule then honours
- Rule 34: Secret Handling — overlaps with the `security` label; both apply
- Rule 41: External Communication — what an agent may say, and to whom
