---
name: promote
description: Promote {{trunk}} to {{prod_ref}} using this project's declared {{promotion_mode}}, then watch the deploy until it reaches a terminal state and probe the live surface. Use when asked to "release", "promote", "ship to prod", "go live", "cut a release", or "push to {{prod_ref}}".
---

# promote — {{trunk}} → {{prod_ref}}

Rule 27 governs promotion: **`{{prod_ref}}` only ever moves through the declared
`{{promotion_mode}}`.** There is no hand-edit path, no "just this once" direct push,
and no promotion that ends before the deploy is terminal and the live surface has
answered.

`{{promotion_mode}}` is set by the wizard to one of:

| Mode | What promotion means |
|---|---|
| `pr` | Open a PR `{{trunk}} → {{prod_ref}}`, get it approved, merge it |
| `tag` | Cut an annotated tag on `{{trunk}}`; CI deploys the tag |
| `fast-forward` | Fast-forward `{{prod_ref}}` to `{{trunk}}` (single-maintainer projects) |
| `manual` | No automated promotion — print the diff and hand off to a human |

Read `{{promotion_mode}}` before doing anything. If it is `manual`, stop after Step 1
and hand the operator the diff.

## Step 1 — Pre-flight (all modes)

```bash
git fetch origin {{trunk}} {{prod_ref}}
git log --oneline origin/{{prod_ref}}..origin/{{trunk}}
```

- **Zero commits ahead** → abort: "`{{prod_ref}}` is already at `{{trunk}}` HEAD."
- **More than ~30 commits** → summarise merges only:
  `git log --merges --oneline origin/{{prod_ref}}..origin/{{trunk}}`

Check the gates before promoting anything:

- [ ] CI is green on `{{trunk}}` HEAD
- [ ] `togo generate` output is committed — no dirty `*.gen.go` on `{{trunk}}`
- [ ] Every migration in this range has been applied to the `{{prod_ref}}` database's
      staging peer at least once (see `togo-migrate`)
- [ ] No in-flight deploy from the previous `{{prod_ref}}` HEAD. Stacking cascades
      makes failure attribution impossible — wait, or ask.
- [ ] The diff contains no `.env`, key material, or debug flags

Render the commit list to the operator. If the range contains a migration, say so
explicitly and in bold — migrations are the irreversible part of a promotion.

## Step 2 — Execute the declared mode

### `pr`

```bash
gh pr create \
  --base {{prod_ref}} --head {{trunk}} \
  --title "Promote {{trunk}} → {{prod_ref}} ($(date -u +%Y-%m-%dT%H:%MZ))" \
  --body "$(cat <<'EOF'
## Promotion

Brings `{{prod_ref}}` to `{{trunk}}` HEAD. This PR is the single revert handle —
if production breaks, revert this.

## Commits

<list, max 20, then "… and N more">

## Migrations in this range

<list of db/migrations/*.sql, or "none">

## Verification

- [x] CI green on {{trunk}}
- [ ] Deploy terminal
- [ ] `curl {{api_base}}/healthz` returns 200
EOF
)"
```

Do **not** self-merge if the project requires review. If merge is blocked by a failing
check, report the exact check and stop — do not `--admin` your way past a red gate
unless the operator asks for it in this session.

### `tag`

```bash
VERSION=<semver>   # derive from the change: fix→patch, feat→minor, breaking→major
git tag -a "v$VERSION" origin/{{trunk}} -m "Release v$VERSION

<one-paragraph summary>"
git push origin "v$VERSION"
```

Never move an existing tag. If the tag exists, cut the next one.

### `fast-forward`

```bash
git push origin origin/{{trunk}}:{{prod_ref}}
```

This fails loudly if it would not be a fast-forward — that failure is the safety
mechanism. If it fails, `{{prod_ref}}` has commits `{{trunk}}` does not. **Stop and
investigate**; never `--force` past this.

### `manual`

Print the diff, the migration list, and the deploy command the human should run.
Stop.

## Step 3 — Watch the deploy to a terminal state

A merged PR is not a deploy. A pushed tag is not a deploy. Watch until the pipeline
reports success *or* failure — never report from the middle.

```bash
# GitHub Actions
gh run list --branch {{prod_ref}} --limit 5
gh run watch <run-id> --exit-status
```

If deployment is via `togo deploy`, run it explicitly against the production target
declared in `togo.yaml`:

```bash
togo deploy {{prod_ref}} --dry-run    # read the plan first
togo deploy {{prod_ref}}
```

Report progress as data — counts and statuses from the pipeline, not vibes.

## Step 4 — Probe the live surface (Rule 28)

Terminal-green is still not done. Prove it serves:

```bash
curl -s -o /dev/null -w '%{http_code}\n' {{api_base}}/healthz
curl -s {{api_base}}/openapi.json | head -c 200
```

Then hit one real behavioural endpoint — a route that exercises the change you just
promoted, not just the health check. If the promotion touched `web/`, load the page
and confirm the changed element renders.

If a probe fails, the promotion **failed**, regardless of what the pipeline said.
Say that plainly and start rollback.

## Step 5 — Report

```
Promotion complete ({{project_name}}):
  {{trunk}} HEAD:     <sha>
  {{prod_ref}} HEAD:  <sha>   (matched ✓)
  Mode:               {{promotion_mode}}
  Commits promoted:   <n>
  Migrations applied: <n>
  Deploy:             <succeeded | failed> in <duration>
  Live probe:         {{api_base}}/healthz → 200
```

## Rollback

Know the handle before you promote:

- `pr` → revert the promotion PR; the deploy re-fires on the reverted `{{prod_ref}}`
- `tag` → deploy the previous tag
- `fast-forward` → `git push origin <previous-sha>:{{prod_ref}}` (this one needs force,
  and needs the operator to say so)

**Migrations do not roll back with the code.** If the range contained a migration,
say so in the rollback plan and write the down-path before promoting, not after.

## Hard refusals

- Direct commit or push to `{{prod_ref}}` outside `{{promotion_mode}}`
- Promoting with a dirty working tree
- Promoting with uncommitted `togo generate` output
- Reporting success before the deploy is terminal AND the live probe passed
- Blind auto-retry of a failed deploy more than once — a second identical failure is
  information, not noise

## Related

- `push` — get the work onto `{{trunk}}` first
- `verify` — the evidence standard Step 4 implements
- `togo-deploy` — what actually runs the deploy
