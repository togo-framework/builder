---
name: push
description: Commit and push finished work on {{trunk}}, scoped to exactly the files the change touched. Submodule-aware — pushes the submodule first, then bumps the pin in the parent. Use after finishing a task, when asked to "push", "commit", "ship this", or "save my work".
---

# push — Ship the change, and only the change

Two hard constraints, both from Rule 42:

1. **Never `git add -A`. Never `git add .`. Never `git commit -a`.** Stage an explicit
   file list, every time, no exceptions, no "but the repo is clean".
2. **Never push a submodule pin to a SHA that is not on the submodule's remote.**
   Push the submodule first; bump the pin second.

## Step 0 — Detect the repo shape

```bash
# A submodule has a .git FILE pointing into the parent's .git/modules/.
test -f .git && echo "submodule" || echo "standalone"
git rev-parse --abbrev-ref HEAD
git status --short
```

If the branch is not `{{trunk}}` and the operator did not ask for a branch push,
**warn and stop**. Do not auto-switch branches. Say which branch you are on and ask.

If `git status --short` is empty and no submodule pin has moved: say
"Nothing to push — working tree is clean" and stop.

## Step 1 — Build the explicit file list

Read the change, do not guess it:

```bash
git status --porcelain
git diff --stat
git diff --cached --stat
```

Now classify every path:

| Path pattern | Action |
|---|---|
| Files you edited for this task | stage |
| `*.gen.go`, generated OpenAPI/GraphQL output | stage — they are the product of `togo generate` and must move with the source |
| `db/migrations/*.sql` you added | stage |
| `.env`, `.env.*`, `*.key`, `*.pem`, `credentials*.json`, `service-accounts/` | **never stage — stop and report** |
| `node_modules/`, `.next/`, `dist/`, `build/`, `*.tsbuildinfo`, `togo-bin`, compiled binaries | never stage |
| Files you did not touch that appear modified | **stop and ask** — something else changed them |

Then stage by name:

```bash
git add internal/api/orders.go internal/db/queries/orders.sql web/app/orders/page.tsx
```

If the list is long, write it out anyway. Length is not a reason to reach for `-A`;
length is a reason to check whether the change should have been two commits.

**Why this rule has teeth:** `git add -A` is how a `.env` reaches a public remote, how
a 200MB build artifact enters history, and how an unrelated half-finished refactor
rides along inside someone else's bug fix. Every one of those is unrecoverable-ish
after a push. The explicit list costs thirty seconds.

## Step 2 — Commit

Match the repo's existing style:

```bash
git log --oneline -5
```

Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `perf:`, `test:`)
with a scope where the repo uses one. Subject in the imperative, under ~72 chars.
Lead the body with *why*, not *what* — the diff already says what.

```bash
git commit -m "$(cat <<'EOF'
feat(orders): add per-tenant order listing

The dashboard was fetching all orders and filtering client-side, which
leaked other tenants' row counts through the response size. Filter in the
sqlc query instead and regenerate.

Refs #<issue>
EOF
)"
```

Do not add trailers the project has not asked for. Check `CONTRIBUTING.md` or an
existing commit before adding any `Co-Authored-By` line.

## Step 3 — Push

```bash
git push origin {{trunk}}
```

Rejected as non-fast-forward:

```bash
git pull --rebase origin {{trunk}}
# then re-run the push
```

If the rebase conflicts: **stop**, list the conflicted paths, and hand back to the
operator. Do not resolve conflicts in files you did not write.

**Never** `--force`. **Never** `--no-verify` — if a hook fails, the hook is right
until proven otherwise; fix the code.

## Step 4 — Submodule flow (only if Step 0 said "submodule")

```bash
SUB=$(basename "$PWD")
# after the submodule push succeeded:
cd .. && git status --short -- "$SUB"
```

If the pin moved:

1. Confirm the submodule SHA is actually on the remote:
   ```bash
   git -C "$SUB" branch -r --contains HEAD
   ```
   If `origin/{{trunk}}` is not listed, the submodule push did not land. Stop.
2. Stage **only** the pin (plus any parent-repo files that genuinely belong to this
   change — list them to the operator before staging):
   ```bash
   git add "$SUB"
   ```
3. Commit and push the parent:
   ```bash
   git commit -m "chore(deps): bump $SUB to $(git -C "$SUB" rev-parse --short HEAD)

   Brings in: <one-line summary of the submodule commit>."
   git push origin {{trunk}}
   ```

## Step 5 — Report

```
Shipped ({{project_name}}):
  <repo>:   <short-sha> <subject>
            {{trunk}} → origin/{{trunk}}  (<old>..<new>)
  files:    <n> staged  (<list, or first 10 + "and N more">)
```

If a submodule was involved, report both repos.

## Flags

| Flag | Behaviour |
|---|---|
| `/push` | Default — explicit staging, commit, push `{{trunk}}` |
| `/push --check` | Run `togo lint` and `togo test` before committing; abort on failure |
| `/push --pr` | Push a `feat/<slug>` branch and open a PR to `{{trunk}}` instead of a direct push |
| `/push --dry` | Print the exact staging list, message, and commands; execute nothing |
| `/push --message "..."` | Use the given subject instead of generating one |

## Hard refusals

- `git add -A` / `git add .` / `git commit -a` — under any framing, including "it's fine, I checked"
- `git push --force` / `--force-with-lease` without the operator explicitly asking, in writing, in this session
- `--no-verify`
- Staging a file matched by the secret patterns above
- Bumping a submodule pin before the submodule is pushed
- Pushing to `{{prod_ref}}` directly — that is `promote`'s job, and it goes through review

## Related

- `promote` — moving `{{trunk}}` to `{{prod_ref}}` under `{{promotion_mode}}`
- `verify` — run this **before** push, not after
