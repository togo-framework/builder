---
description: "Every net-new user-visible capability lands behind a flag that defaults off, with telemetry wired. Flipping the flag on is human-only."
globs: "*"
alwaysApply: true
---

# Rule 36: Ship Dark — Merge the Code, Not the Behaviour

**Every net-new user-visible capability an agent writes lands behind a feature
flag that is off by default and wired to telemetry; turning the flag on is a
human action and never part of the change that introduced it.**

## The Rule

### This is what makes autonomous merge tolerable

An agent-authored change reviewed by another agent (Rule 31) has never been seen
by a human before it lands. In most projects there is no staging environment
standing between `{{trunk}}` and `{{prod_ref}}` — and even where
`{{promotion_mode}}` inserts one, nobody is watching it at 03:00.

Ship-dark converts merge from a behavioural event into a code event. Merged and
dark, the worst case of a bad change is dead code. Merged and live, the worst
case is unbounded. **The flag is the thing that lets the loop run unattended at
all.** Remove it and every other rule in this band is load-bearing on its own,
which none of them can survive.

### What counts as user-visible

Flag required:

- a new route, page, or view in `web/` across any of `{{surfaces}}`;
- a new HTTP or GraphQL operation exposed on `{{api_base}}`, or a new field on an
  existing response that clients will render;
- a new navigation entry, empty state, or piece of copy in any of `{{locales}}`;
- a new background job, worker, or scheduled task that writes data users see, or
  that sends anything outward (email, push, webhook, notification);
- a new `togo` plugin registered via `init()` + `togo.RegisterProviderFunc` that
  changes runtime behaviour when present — **registration is not activation**, and
  a plugin that does something the moment it is compiled in is a flagless
  capability;
- a behaviour change to an existing capability large enough that a user would
  describe it as different.

No flag required:

- pure refactor with no behavioural delta;
- a bug fix that restores documented, previously-intended behaviour;
- tests, fixtures, docs, comments, tooling;
- internal-only endpoints not reachable by a user;
- generated-file regeneration with no input change.

When it is genuinely unclear: add the flag. A redundant flag costs one merge to
remove. A missing one costs an incident.

### Off by default, and provably so

- The default is the literal `false` **in code**, at the flag's declaration.
  Never `getenvBool("FEATURE_X", true)`, never "off in dev, on in prod", never
  a default that depends on the environment. A reader of the declaration must be
  able to see that it is off without knowing which of `{{env_matrix}}` they are
  in.
- Flags are declared in **one** place (the project's flag registry — e.g.
  `internal/flags/flags.go` or a `flags` plugin), not scattered as ad-hoc env
  lookups at call sites.
- Naming: `{{project_name}}.<surface>.<capability>` — e.g.
  `{{project_name}}.web.saved-views`. The name appears in the PR body.
- Resolution is **server-side**. `web/` asks the API what is on; it never decides
  locally, never ships a hardcoded `true`, and never gates on a build-time
  constant that a bundle can be shipped with flipped.
- The off path must be the *old* path, unchanged. A flag whose off branch is new
  untested code has not been shipped dark.

### Telemetry is part of the change, not a follow-up

A dark capability nobody can observe cannot be safely turned on. The same PR
wires, at minimum:

- an event on capability entry, tagged with the flag name;
- an error/failure counter on the same tag;
- enough dimension to distinguish "nobody used it" from "it broke silently".

The human flipping the flag needs to answer "is it working?" from a dashboard
within minutes, not by reading the diff.

### The flip is human-only

`flag-flip` is permanently `must_ask:` (Rule 30). An agent never:

- changes a flag's default from `false` to `true`;
- adds a rollout percentage, an allowlist, or a targeting rule;
- flips a flag in any of `{{env_matrix}}`, including dev, "just to test" — use a
  local override that is not committed;
- deletes a flag and inlines the on-path, which is a flip wearing a refactor's
  clothes.

Enabling is a product decision with a blast radius the run cannot see: who is
watching, what else is shipping today, whether support has been told.

### Flags are debt, and the PR records how it is paid

Every flag-introducing PR states, in the body:

```
Flag:        {{project_name}}.web.saved-views
Default:     false
Owner:       @handle
Remove when: on by default for 2 weeks with no regressions, OR abandoned by <date>
Telemetry:   <dashboard/metric name>
```

Removing a flag is itself human-gated — it is the second half of a flip. An agent
may open the removal PR **after a human has confirmed the flag has been on by
default**, and the removal PR deletes the flag and the dead off-path together,
touching nothing else.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named,
dated failures. These are prophylactic. When a run journal produces a real
incident, record it here — do not invent one.

## Enforcement

- **`.claude/hooks/guard-ship-dark.sh`** (`PreToolUse(Bash)` on `gh pr create` /
  `git commit`): blocks a diff that adds a route, handler, exposed field,
  scheduled job, or provider registration without a corresponding flag
  declaration and a `Flag:` block in the PR body; blocks any diff that flips a
  declared default from `false` to `true`, adds a rollout/targeting rule, or
  deletes a flag declaration. *If this hook is not registered in your estate, the
  CI gate below is the control — the hook is defence-in-depth, not the fence
  (see Rule 31).*
- **CI gate `ship-dark`** (required status), which is the real control because it
  runs server-side on every PR:
  - new exposed surface without a flag → fail;
  - flag default not a literal `false` at declaration → fail;
  - flag default changed `false` → `true` without a named human approver → fail;
  - `NEXT_PUBLIC_*`/`VITE_*` or any build-time constant used as the flag source →
    fail (client-side resolution);
  - flag declared without the telemetry tag present in the diff → fail;
  - PR body missing the `Flag:` block → fail.
- **Flag registry lint**: every flag in the registry has an owner and a removal
  condition; a flag past its removal date is reported to a human, never
  auto-removed and never auto-flipped.
- **Review heuristic**: a reviewer instance that cannot identify the off-path in
  the diff requests changes. "Where does this do nothing?" is the first review
  question for any capability PR.

## Related Rules

- Rule 30: The Autonomy Grant Is a File — `flag-flip` is permanently `must_ask:`
- Rule 31: Never Merge Your Own Work — dark merge is what makes agent review survivable
- Rule 27: The Promotion Path — dark merge is what makes `{{promotion_mode}}` survivable unattended
- Rule 33: Human-Only Work — a flip that reaches customers is a human's call
- Rule 35: Blast Radius — the size fence; this is the behaviour fence
- Rule 37: The Run Journal — the flag name and telemetry tag are journalled
