---
description: "The agent that wrote a change never approves or merges it. An independent reviewer instance reviews; must_ask classes additionally need a human."
globs: "*"
alwaysApply: true
---

# Rule 31: Never Merge Your Own Work

**The instance that authored a change may never approve it, merge it, or push it
to `{{trunk}}`; an independent reviewer instance must review it, and any change
touching a `must_ask:` class additionally requires a human.**

## The Rule

### Separation of author and reviewer

| Role | Who | May do |
|---|---|---|
| **Author** | the run that produced the diff | commit, push its own branch, open the PR, respond to review comments |
| **Reviewer** | a *different* run, started fresh, with no memory of the authoring session | read the diff, request changes, approve |
| **Human** | a person | everything, including merge of `must_ask:` classes |

"Independent" means a separate run with a separate run id — not a subagent the
author spawned, not a second pass by the same session, not the same session
after `/clear`. A reviewer that inherited the author's context inherits the
author's blind spots; it will confirm the author's reasoning because it *is* the
author's reasoning.

### Identity is stamped, not assumed

Every commit an agent makes already carries provenance trailers under Rule 42:

```
Togo-Agent: <agent-name>
Togo-Model: <model-id>
Togo-Run-Id: 4f8c1a2e-...
Togo-Issue: #123
```

and the PR body carries a machine-readable block:

```
<!-- togo:authorship
run-id: 4f8c1a2e-...
agent: <agent-name>
issue: #123
-->
```

This is what makes the gate checkable. A PR with no authorship block is not
mergeable by any agent — the gate cannot prove independence, so it fails closed.

### Who may merge what

| Change class | Approval needed |
|---|---|
| Ordinary code change inside `paths.allow` | one independent agent review |
| Anything in `must_ask:` (Rule 30) — migrations, schema, deps, CI, `.claude/`, deploy, flag flips | one independent agent review **and** a named human approval |
| Anything labelled `human-only` (Rule 33) | not an agent's work at all |

### Explicitly forbidden

- `gh pr review --approve` on a PR whose authorship block matches this run.
- `gh pr merge` in any form on a PR this run authored — including `--auto`,
  `--squash`, `--admin`, and `--delete-branch`.
- `gh pr merge --admin` on **any** PR, authored or not. Admin merge exists to
  bypass the gate; an agent has no legitimate use for it.
- `git push {{trunk}}` (or any push that lands commits on `{{trunk}}` without a
  PR), including `--force` and `--force-with-lease`.
- Editing branch-protection settings, required-check lists, or CODEOWNERS to
  make a merge pass. That is `ci-change` (Rule 30) and it is `must_ask:`.
- Re-opening, retitling, or force-pushing a PR to shake off a stale review.

### Honest note: the hook is not the control

**`guard-merge-gate.sh` runs on this agent's own machine, in this agent's own
shell. It constrains only the agent that chose to run it.** It cannot stop a
different tool, a different machine, a misconfigured runner, an MCP GitHub call
that never touches Bash, or an agent whose hook registration was dropped from
`settings.json`.

**The real control is server-side: GitHub branch protection on `{{trunk}}`.**
Configure, at minimum:

- Require a pull request before merging.
- Require **at least 1 approving review**, with *"require review from someone
  other than the person who last pushed"* enabled.
- Dismiss stale approvals on new commits.
- Require status checks to pass, including the authorship-independence check.
- Restrict who can push to `{{trunk}}` — agent identities are not on that list.
- Block force pushes and deletions.
- Do **not** grant agent tokens `bypass branch protections`.

The hook is defence-in-depth: it catches the honest mistake early and cheaply,
close to where it happened, with a readable reason. It is not the fence. If you
have to choose between fixing the hook and fixing branch protection, fix branch
protection.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named,
dated failures. These are prophylactic. When a run journal produces a real
incident, record it here — do not invent one.

## Enforcement

- **`.claude/hooks/guard-merge-gate.sh`** (`PreToolUse(Bash)`), defence-in-depth:
  - blocks `gh pr merge`, `gh pr review --approve`, and `gh api` calls to
    `.../merges` or `.../reviews` when the target PR's authorship block carries
    this run's `run-id` or agent identity;
  - blocks `gh pr merge --admin` unconditionally;
  - blocks any `git push` whose target ref resolves to `{{trunk}}` or
    `{{prod_ref}}`;
  - blocks `gh api` writes to `branches/*/protection`.
- **GitHub branch protection on `{{trunk}}`** — the actual control. Required
  review from someone other than the last pusher; stale-review dismissal;
  restricted push list that excludes agent identities; force-push blocked.
- **CI check `authorship-independence`** (required status): fails when the PR has
  no `togo:authorship` block, or when the approving review's actor equals the
  authoring `run-id`/agent, or when a `must_ask:` path is touched and no human
  approval is present.
- **Promotion**: `{{promotion_mode}}` promotion to `{{prod_ref}}` inherits every
  constraint above and adds the human requirement unconditionally.

## Related Rules

- Rule 27: The Promotion Path — one way to `{{prod_ref}}`; this rule gates who walks it
- Rule 30: The Autonomy Grant Is a File — defines the `must_ask:` classes
- Rule 33: Human-Only Work — labels an agent may not touch at all
- Rule 35: Blast Radius — a PR too large to review independently is already over
- Rule 36: Ship Dark — what makes an agent-reviewed merge survivable
- Rule 37: The Run Journal — no journal, no merge; the reviewer reads it first
- Rule 42: Provenance Trailers — supplies the identity this gate checks
