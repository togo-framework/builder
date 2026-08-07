---
description: "One issue per run, inside a path allowlist, under a file and net-LoC cap, with no new deps and no CI/IaC/.claude edits. Exceeding a cap means stop and hand a plan to a human."
globs: "*"
alwaysApply: true
---

# Rule 35: Blast Radius Is Capped, and the Cap Is a Stop Sign

**A run touches one issue, inside its path allowlist, under a hard file and
net-line cap, with no new dependencies, no cross-repo writes, and no changes to
CI, infrastructure, or `.claude/` — and a run that would exceed any cap stops and
hands a plan to a human instead of shrinking the work to fit.**

## The Rule

### The caps

```yaml
# .claude/autonomy.yaml
blast_radius:
  max_files_changed: 20
  max_new_files: 8
  max_net_lines: 400          # additions minus deletions, generated files excluded
  one_issue_per_run: true
  cross_repo_writes: false

  new_dependencies: allowlist  # deny | allowlist
  dependency_allowlist: []     # exact module paths / package names, no wildcards

  forbidden_paths:
    - ".github/**"
    - ".claude/**"
    - "infra/**"
    - "terraform/**"
    - "Dockerfile*"
    - "docker-compose*.y*ml"
    - "**/*.gen.go"
    - ".env*"
    - "**/secrets/**"
```

`paths.allow` in the autonomy grant (Rule 30) says where a run *may* write.
`blast_radius` says how much. Both must pass.

### One issue per run

A run is dispatched for exactly one issue and produces exactly one branch and
one PR. If, while working, the run finds a second problem:

- **file it** as a separate issue (and do not assign it to yourself — Rule 33),
- **do not fix it in this branch**, however small, however tempting, however
  "obviously related".

A drive-by fix bundled into an unrelated PR is the single most reliable way to
make a diff unreviewable, and unreviewable diffs are the thing this whole band
exists to prevent. The reviewer instance (Rule 31) has no memory of your session;
everything in the diff must be explicable from the issue alone.

### Line counting in a togo project

- **Generated files do not count** toward `max_net_lines`, and must not be
  hand-edited: `*.gen.go` and everything else `togo generate` produces (sqlc,
  gqlgen, OpenAPI) is an output. If a generated file is wrong, fix its input —
  the query file, the schema, the spec — and re-run `togo generate`. A hand-edit
  to a `.gen.go` is reverted on the next generate and is a review-blocking
  finding on its own.
- **Generated churn still counts as blast radius even when it does not count as
  lines.** A one-line change to a query file that regenerates 3,000 lines is a
  large change. Say so in the PR body, and expect a human.
- **Migrations count.** A run may add **at most one forward migration**. If the
  work needs two, it needs a human plan first.
- Lockfile churn (`go.sum`, `package-lock.json`) does not count as lines, but a
  changed lockfile with no corresponding allowlisted dependency change is a
  finding.
- Vendored or third-party trees do not count and must not be modified.

### No new dependencies

Adding a module to `go.mod` or a package to `web/package.json` is a
`dependency-add`, which is `must_ask:` (Rule 30), unless the exact name appears
in `dependency_allowlist`. This holds for transitively-pulled direct
requirements, for `replace` directives, and for tool dependencies.

A dependency is a permanent commitment to somebody else's release cadence,
licence, and security posture. That is a human's call, not a run's. The correct
move when a dependency looks necessary: stop, write the case for it in the issue
(what it does, what the stdlib/`togo` alternative costs, licence, maintenance
signal), and hand it over.

### No CI, no infra, no self-modification

- `.github/**` — a run that can edit its own CI can edit away the checks that
  constrain it. Permanently `must_ask:`.
- `infra/**`, `terraform/**`, `Dockerfile*`, deployment manifests across
  `{{env_matrix}}` — the blast radius of an infrastructure change is not visible
  in the diff.
- `.claude/**` — the rules, hooks, autonomy grant, and budget. **An agent never
  edits the constraints it runs under.** This is the load-bearing one; every
  other cap in this file is enforceable only because this one holds. Rule 38
  states it in full; it is repeated here because it is also a blast-radius cap.

### No cross-repo writes

A run writes to the repo it was dispatched into. It does not clone a sibling
repo and push to it, does not `gh api` a write to another repository, does not
update a submodule pin, and does not open a PR elsewhere. Cross-repo work is a
coordination problem with a human in the middle by definition.

### Exceeding a cap is a signal, not a failure

This is the part that matters. When a run projects that it will cross a cap, the
correct behaviour is **not** to:

- squeeze the change (drop the tests, skip the error paths, narrow the fix to the
  symptom) so the numbers fit;
- split one coherent change across three PRs to launder the file count;
- rewrite formatting to make deletions offset additions.

It is to **stop and hand over a plan**: what the change actually requires, why it
is bigger than the cap, the proposed decomposition into human-triaged issues, and
what is already done on the branch. Then apply `needs-human` and exit.

A cap that is hit is information about the work, not about the agent. Most often
it means the issue bundled several changes, or the change needs a refactor
somebody must agree to first. Both of those are worth knowing early and cheaply.
Raising the cap to make the run finish converts a five-minute conversation into
an unreviewable PR.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named,
dated failures. These are prophylactic. When a run journal produces a real
incident, record it here — do not invent one.

## Enforcement

- **`.claude/hooks/guard-blast-radius.sh`**
  - `SessionStart`: reads `blast_radius` from `.claude/autonomy.yaml`, records the
    base commit, and prints the caps under the Rule 30 banner.
  - `PreToolUse(Write|Edit)`: blocks (exit 2) any target matching
    `forbidden_paths`, any target outside `paths.allow`, any `*.gen.go`, and any
    write that would push the run past `max_files_changed` / `max_new_files`.
  - `PreToolUse(Bash)`: blocks `go get`, `go mod edit -require`, `npm|pnpm|yarn
    add`, and lockfile-mutating commands for names outside
    `dependency_allowlist`; blocks `git push` to any remote other than this
    repo's `origin`; blocks a second `git checkout -b` in one run
    (`one_issue_per_run`).
  - `PreToolUse(Bash)` on `git commit` / `gh pr create`: computes
    `git diff --numstat <base>...HEAD`, excludes generated and lockfile paths, and
    blocks with the hand-over template when `max_net_lines` is exceeded.
- **CI gate `blast-radius`** (required status): recomputes every cap server-side
  from the PR diff, so a bypassed local hook still fails the merge. Also fails a
  PR that touches `.github/**`, `.claude/**`, or `infra/**` without a named human
  approver, or that contains more than one migration.
- **Review heuristic**: a PR that references two issue numbers, or whose title
  contains "and", is bounced for decomposition before review.

## Related Rules

- Rule 30: The Autonomy Grant Is a File — `paths.allow`/`deny` and `must_ask:`
- Rule 31: Never Merge Your Own Work — an oversized diff cannot be independently reviewed
- Rule 32: Cost Ceilings — the same stop-and-report posture, applied to spend
- Rule 34: Secret Handling — `.env*` and `**/secrets/**` are denied in both
- Rule 36: Ship Dark — how a capped, merged change stays safe until a human says go
- Rule 38: No Self-Modification During a Feature Run — owns the `.claude/**` prohibition
- Rule 42: Provenance and Scoped Commits — `git add -A` is how file counts silently blow past the cap
