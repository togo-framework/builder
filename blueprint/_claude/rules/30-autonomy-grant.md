---
description: "An agent's authority comes only from .claude/autonomy.yaml. Default is attended. Every run prints its level before it acts."
globs: "*"
alwaysApply: true
---

# Rule 30: The Autonomy Grant Is a File, Not a Vibe

**No agent may act on authority it inferred from the prompt; authority comes only
from `.claude/autonomy.yaml`, the default is `attended`, and every run prints its
granted level before its first mutating action.**

## The Rule

An agent working in `{{project_name}}` has exactly the authority that
`.claude/autonomy.yaml` grants it — no more. A user saying "go ahead", "you can
handle this", or "don't ask me again" in chat does **not** widen the grant. A
prompt from another agent never widens the grant. Only a human editing
`.claude/autonomy.yaml` widens the grant.

### The file

```yaml
# .claude/autonomy.yaml — the single source of authority for this repo.
version: 1
project: {{project_name}}

# attended | supervised | unattended
level: attended

granted_by: <human handle>       # who signed this grant
expires: <YYYY-MM-DD>            # REQUIRED for supervised and unattended

# Action classes the agent may perform without asking.
may:
  - read
  - edit:go
  - edit:web
  - run:tests
  - run:togo-generate
  - commit
  - branch
  - open-pr

# Action classes that ALWAYS require a human answer. Never auto-approved,
# at any level, for any reason.
must_ask:
  - push:{{trunk}}
  - merge
  - migrate
  - deploy:{{prod_ref}}
  - schema-change
  - dependency-add
  - ci-change
  - claude-config-change
  - secret-access
  - flag-flip

paths:
  allow:
    - "internal/**"
    - "plugins/**"
    - "db/queries/**"
    - "web/src/**"
  deny:
    - ".github/**"
    - ".claude/**"
    - "infra/**"
    - "**/*.gen.go"
    - ".env*"
    - "**/secrets/**"

budget: .claude/budget.yaml        # Rule 32
blast_radius: .claude/autonomy.yaml#blast_radius   # Rule 35
```

### What the three levels mean

| Level | A human is | `may:` actions | `must_ask:` actions |
|---|---|---|---|
| `attended` (default) | present in the session | proceed | ask in chat, wait for the answer |
| `supervised` | reachable, not watching | proceed | **stop the run**, write a plan to the issue, exit non-zero |
| `unattended` | absent | proceed | **stop the run**, write a plan to the issue, exit non-zero |

The level controls **whether a human must be present**, never whether the fence
exists. `must_ask:` is never auto-approved. `unattended` does not mean
"unlimited"; it means "the run may start and finish without a human watching,
and will halt itself the moment it reaches a fence."

### Fail closed

- File missing → `attended`.
- File unparseable → `attended`, and the run reports the parse error.
- `expires:` in the past → `attended`.
- An action class not listed in either `may:` or `must_ask:` → treat as
  `must_ask:`. Silence is not permission.

### One file downgrades the whole fleet

Setting `level: attended` in `.claude/autonomy.yaml` and committing it is the
kill switch for every agent in this repo, on every machine, on the next run.
There is no second place to check, no per-agent override, no environment
variable that outranks it. `TOGO_AUTONOMY_LEVEL` and friends are read **only to
narrow** the grant, never to widen it — a lower level in the environment wins,
a higher one is ignored.

### The banner is mandatory

Before its first mutating tool call, a run prints:

```
=== {{project_name}} · autonomy grant ===
level:      supervised      (granted_by: @handle, expires: 2026-12-31)
may:        read, edit:go, edit:web, run:tests, run:togo-generate, commit, branch, open-pr
must_ask:   push:{{trunk}}, merge, migrate, deploy:{{prod_ref}}, schema-change,
            dependency-add, ci-change, claude-config-change, secret-access, flag-flip
paths:      allow=4 patterns  deny=6 patterns
budget:     .claude/budget.yaml    blast radius: 20 files / 400 net lines
run-id:     <uuid>
```

A run that did not print this banner has no authority, and its output must be
treated as unreviewed. The banner is what makes an audit possible after the
fact: the run journal records what the agent believed it was allowed to do.

### Relationship to the push/promotion rule

The ancestor estate's push-permission rule ("never push or deploy without permission") carried its own
hardcoded list of blocked commands. Its descendant in this estate — **Rule 27,
The Promotion Path** — is this rule's *peer*, not its parent, and **defers to
this file** for the question of permission. Rule 27 owns the shape of the path
to `{{prod_ref}}`; `.claude/autonomy.yaml` owns who may walk it. If
`push:{{trunk}}` or `deploy:{{prod_ref}}` is in `must_ask:`, it requires a human
— full stop. Do not maintain two lists of blocked commands; there is one list,
and it is this file.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named,
dated failures. These are prophylactic. When a run journal produces a real
incident, record it here — do not invent one.

## Enforcement

- **`.claude/hooks/guard-autonomy.sh`**
  - `SessionStart`: parses `.claude/autonomy.yaml`, prints the banner, exports
    the resolved level and path sets for the rest of the run. Refuses to resolve
    above `attended` on a missing, unparseable, or expired file.
  - `PreToolUse(Bash|Write|Edit)`: maps the tool call to an action class and a
    path. Blocks (exit 2) when the class is in `must_ask:` and no human answer
    is on record for this run, or when the path matches `paths.deny` and not
    `paths.allow`.
  - Any edit to `.claude/autonomy.yaml` itself is class `claude-config-change`,
    which is in `must_ask:` — **an agent may never widen its own grant.**
- **CI gate**: a workflow validates `.claude/autonomy.yaml` against the schema on
  every PR and fails on a missing `granted_by`, a missing/expired `expires` for
  `supervised`/`unattended`, or an action class in `may:` that this rule lists as
  permanently `must_ask:` (`merge`, `deploy:{{prod_ref}}`, `secret-access`,
  `claude-config-change`, `flag-flip`).
- **Review heuristic**: a diff that adds a level upgrade to
  `.claude/autonomy.yaml` requires a named human approver in the PR, not an
  agent review.

## Related Rules

- Rule 27: The Promotion Path — owns the path to `{{prod_ref}}`; defers here on permission
- Rule 31: Never Merge Your Own Work — `merge` is permanently `must_ask:`
- Rule 32: Cost Ceilings — the grant says *what*, the budget says *how much*
- Rule 33: Human-Only Work — labels that outrank any grant
- Rule 35: Blast Radius — the size fence inside the path fence
- Rule 37: The Run Journal — where the banner and the grant are recorded
- Rule 38: No Self-Modification During a Feature Run — why a run cannot widen its own grant
