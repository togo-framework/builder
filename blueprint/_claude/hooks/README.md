# `.claude/hooks/` — the guards

Thirteen guards, two optional helpers, and one shared library. This is the part
of the `.claude/` tree that is not advice: a rule states the contract, a hook
stops you breaking it.

Everything here is generic to the togo blueprint. Project facts live in
`../hook-config.json`, `../autonomy.yaml` and `../forbidden-imports.json` —
never in a `.sh` file.

---

## The five design rules

### 1. Every guard exits 0 on its own parse failure. This is the most important rule here.

A guard that blocks the operator because *its own* JSON parse failed, its config
was missing, `python3` was absent, or a regex would not compile is worse than no
guard at all: it gets switched off within a day, and then nothing is guarded.

Concretely, in every file here:

- `set -uo pipefail`, deliberately **without `-e`** — a failing command inside a
  guard must not abort the guard.
- every `python3` call ends in `|| exit 0` or `|| true`.
- every config read has a hardcoded fallback, and `_lib.py` raises nowhere:
  loaders return `{}`, accessors return their default.
- `_lib.as_list()` treats an un-rendered `{{token}}` as *no data* rather than as
  a literal string, so a half-run wizard produces an inert guard, not a guard
  that matches the word `{{protected_db_hosts}}`.

**The failure mode of everything in this directory is permissiveness. Always.**

### 2. Every block names THE RULE and THE SANCTIONED ALTERNATIVE.

`BLOCKED by Rule 21` is half a message. The other half is *"schema-shaped change?
db/schema.sql → Rule 23 workflow → `togo migrate`. One-off cleanup? That is a
migration too."* A block that does not say what to do instead teaches only how
to route around the guard.

### 3. No hook adds interactive latency — 2s ceiling.

Guards are bash plus at most one `python3` call. Anything touching the network
(`gh`) is wrapped in `timeout 2` and **fails open**. `budget-meter.sh` is the
only hook that reads a large file, and it parses the transcript incrementally
from a stored byte offset, at most once a minute. Measured on the reference
project: `session-init.sh` 0.24s, every guard under 0.1s, throttled
`budget-meter.sh` 0.08s.

### 4. `PreToolUse` exits 2 to block; `Stop` exits 2 to refuse; everything else exits 0.

Exit 2 on `PreToolUse` blocks the call and returns stderr to the model. Exit 2 on
`Stop` refuses the turn-end and returns stderr to the model. `post-commit-check.sh`
and the optional hooks warn only — by the time they run the action has happened,
and failing there would just leave the operator with a commit they cannot
discuss. The payload arrives as JSON on stdin and is parsed with an inline
`python3` block; there is no `jq` dependency.

### 5. Nothing product-specific is hardcoded in a shell script.

The estate this descends from had cloud project ids and customer domains inside
`session-init.sh` — which broke the very rule that file existed to teach, and
made it unshippable to a second project. If you are about to type a hostname, a
project id, an org name or a customer name into a `.sh` file here: stop, and put
it in `../hook-config.json`.

---

## The guards

| Hook | Event | Rules | Blocks |
|---|---|---|---|
| `guard-db-wipe.sh` | PreToolUse(Bash) | 22 | Nine wipe paths (below) |
| `guard-db-dml.sh` | PreToolUse(Bash) | 21 | Manual INSERT/UPDATE/DELETE/COPY against a non-ephemeral target |
| `guard-direct-ddl.sh` | PreToolUse(Bash **+ Write/Edit**) | 20, 23 | DDL at a live DB, **and runtime DDL added to Go source** |
| `guard-secrets.sh` | PreToolUse(Read\|Write\|Edit\|Bash), PostToolUse | 34 | Secret paths, env dumps, cleartext secret-manager reads, secret *values* written into source |
| `guard-blast-radius.sh` | PreToolUse(Write\|Edit\|MultiEdit) | 35, 38 | `paths.deny`, writes outside `paths.allow`, and the file/LoC/new-file caps |
| `guard-generated-files.sh` | PreToolUse(Write\|Edit\|MultiEdit) | 11 | Hand-edits of `*.gen.go`, `**/gen/**`, `web/src/api/openapi.ts`, DO-NOT-EDIT banners |
| `guard-scoped-add.sh` | PreToolUse(Bash) | 42 | `git add -A/.`, `git commit -a/-am`, `push --force`, `reset --hard`, `clean -f`, `stash -u` |
| `guard-autonomy.sh` | PreToolUse(Bash) | 15, 30 | The kill switch, every `must_ask`, and anything above the granted level |
| `guard-merge-gate.sh` | PreToolUse(Bash) | 31, 37 | Self-merge, merge without a run journal, local merge to trunk, push at the prod ref |
| `budget-meter.sh` | PostToolUse(Bash) | 32 | Continuing past `per_run_usd` / `per_day_usd` |
| `run-journal.sh` | Stop | 37, 28 | Ending the turn on a "done" claim with no evidence |
| `session-init.sh` | SessionStart | — | Nothing. Prints autonomy, repo state, spend, environments, open journal |
| `post-commit-check.sh` | PostToolUse(Bash) | 11, 12, 13 | Nothing. Warns about boundary violations and generated-file drift |
| `capture-learning.sh` | PostToolUse(Bash) | — | *Optional, off.* Logs informative failures to `.runs/learnings.md` |
| `format-on-write.sh` | PostToolUse(Write\|Edit) | — | *Optional, off.* Formats the file just written |
| `_lib.py` | — | — | Shared: config loading, the YAML skim, glob→regex, path normalisation |

---

## What the interesting ones actually know

### `guard-db-wipe.sh` — ported, not redesigned

Descendant of a guard written after a platform-wide production wipe. Every arm
corresponds to a path that actually destroyed data. **The nine wipe paths:**

1. `DROP SCHEMA` 2. `DROP DATABASE` 3. `TRUNCATE` on a non-ephemeral target
4. the wipe subcommand (`<binary> reset|wipe|drop|purge|nuke|reinit`, and in togo
`togo migrate:fresh` / `togo db:reset`) 5. `supabase db reset`
6. volume destruction (`kubectl delete pvc/statefulset`, `docker compose down -v`,
`togo db:down -v`, `docker volume rm/prune`) 7. `initdb`
8. re-arming `*AUTO_MIGRATE=true` through a deploy (also Rule 26)
9. restarting a DB StatefulSet into a fresh `initdb`.

**Arms 8 and 9 are the ones nobody writes a priori, and the ones that cost the most:**

- **9a — a StatefulSet pod-spec patch.** An agent added
  `args: ["-c","max_connections=200"]` to a database StatefulSet. The pod
  restarted with new container args, the image entrypoint re-ran `initdb`, and
  the data directory was overwritten. *Nothing in the command said "delete".*
  So the arm blocks **any** `kubectl edit/patch/apply/replace/set` on a DB
  StatefulSet.
- **9b — the same wipe, delivered by Terraform.** `terraform apply` while the IaC
  still carries container `args` on a DB StatefulSet. The guard greps
  `iac.db_module_paths` for that shape before letting the apply run, and is
  inert when `hook-config.iac` is null.

Do not "simplify" these. They are the postmortem.

The one thing that must *not* be tightened: `git reset` is explicitly excluded
from arm 4. That exclusion is the difference between a guard people keep and one
they disable on day two.

### `guard-direct-ddl.sh` — the Go source scan is the important half

`CREATE TABLE IF NOT EXISTS` inside `db.ExecContext` is the **most likely togo
violation**. togo's own `auth` and `autopilot` plugins do exactly this today
(`auth/auth.go`, `auth/pat.go`, `auth/mfa.go`, `auth/session_stores.go`,
`autopilot/autopilot.go`), and they are among the most-read examples in the
ecosystem. In an architecture where every plugin self-registers from `init()`,
self-migrating on boot is a one-line habit.

It is also the **cheapest violation to catch**, because it is a string literal in
a file being written right now. Patterns come from
`hook-config.database.runtime_ddl.forbidden_source_patterns` — which includes
`AutoMigrate(` and `db.Exec("CREATE`, two shapes no regex written from first
principles would have thought to include.

Runtime DDL is not a shortcut; it is a second, undeclared schema authority. Atlas
can no longer diff the truth, `togo migrate:status` reports clean while the live
schema differs, and two replicas booting together race into a half-applied
schema. **It works on your machine every single time.**

> **WIRING NOTE.** `settings.json` currently lists this hook under the `Bash`
> matcher only. Under `Bash` it catches DDL typed at a database and DDL written
> into Go through a heredoc or `sed -i`, but **not** a plain `Write`/`Edit` of a
> `.go` file — which is the common case. Add it to the
> `Write|Edit|MultiEdit|NotebookEdit` matcher as well; the hook already handles
> both payload shapes.

### `guard-generated-files.sh`

A hand-edit to generated code **works**: build green, tests green, review clean —
until the next `togo generate` silently reverts it, usually on someone else's
machine, days later, with nothing linking the regression to the edit. The hook
also honours a generator's own `DO NOT EDIT` banner whatever the path, because
that claim outranks any list we maintain.

### `guard-merge-gate.sh` — read the disclaimer in the file

**A client-side hook constrains only this shell.** It stops `gh pr merge` typed by
an agent in this session. It does not stop the same command in another terminal,
from CI, through the GitHub web UI or REST API, or from a session with hooks
disabled.

**The real control is GitHub branch protection** on the trunk and prod refs:
required PR, at least one approving review from someone *other than the author*,
dismiss stale approvals, required status checks, include administrators, restrict
who can push. **If those are not configured, this hook is theatre.** It is a
seatbelt, not a locked door — its job is to catch the mistake early and explain
why.

Arm 1 (self-merge) has no off switch, matching `autonomy.yaml`:
`review.self_merge: forbidden — not configurable to allowed. Ever.`

### `budget-meter.sh` — never downgrades the model

`autonomy.yaml` puts it best: *"a run that ran out of money on a well-specified
issue is telling you the issue is not well-specified, and a quieter, dumber retry
destroys that signal."* Silently switching to a cheaper model converts a visible,
decidable cost problem into an invisible quality problem — the work keeps
flowing, it is just quietly worse, and nobody can tell afterwards which half was
produced under duress. At the ceiling this hook **stops** and makes a human
decide. `budget_raise` is a `must_ask`; it is never self-served.

The figure is an **estimate** priced from `budget.model_prices_per_mtok`. Good
enough to catch a runaway loop, which is the actual failure mode. Not an invoice.

### `session-init.sh` — the autonomy line is the point

The single most useful thing an operator can see at session start is what this
session may do on its own: the level, the kill switch, what stays a `must_ask`,
the blast caps, and which paths are writable. It prints first, and it prints even
when nothing is declared (`AUTONOMY: NOT DECLARED`). Order and content come from
`hook-config.session.show`.

### `post-commit-check.sh` — the diff-range bug it fixes

The hook it descends from used `git diff --name-only HEAD~1 HEAD`. Wrong twice:

- On the **first commit** in a repository `HEAD~1` does not resolve. git errors,
  `|| true` swallows it, the file list comes back empty and the check silently
  passes. The commit most likely to import something forbidden — the initial
  import — was the one commit never scanned.
- On a **merge commit** `HEAD~1` is only the first parent, so the range either
  reports the entire other branch as "this commit's changes" or, with plain
  `diff-tree`, reports nothing at all.

Fixed by counting parents: `--root` diff for the root commit, plain `diff-tree`
for a normal commit, first-parent diff for a merge — the honest answer to "what
did this merge land on this branch". Both cases are covered in the test recipe
below.

---

## Configuration

| File | Owner | Read by |
|---|---|---|
| `../hook-config.json` | wizard | every guard |
| `../autonomy.yaml` | **the operator** | autonomy, blast-radius, merge-gate, budget, run-journal, session-init |
| `../forbidden-imports.json` | wizard | post-commit-check |
| `_lib.py` | this directory | every guard |

`autonomy.yaml` is authoritative wherever the two overlap (budget ceilings, the
journal directory); `hook-config.json` carries the mirror the wizard keeps in
sync. Override the config location with `TOGO_HOOK_CONFIG` /
`TOGO_FORBIDDEN_IMPORTS` — used by the tests below, and by nothing else.

State: `budget-meter.sh` writes `budget.ledger` (`.runs/.spend.json`).
`.runs/` should be gitignored except for the journals you intend to keep.

### Environment switches

| Variable | Effect |
|---|---|
| `TOGO_ALLOW_PROTECTED_WRITE=1` | One operator-authorised write to a `paths.deny` path. Dies with the session; visible in the transcript. |
| `TOGO_SPEND_USD` | An outer harness supplying the authoritative run cost. |
| `TOGO_CAPTURE_LEARNING=1` | Turns on `capture-learning.sh`. |
| `TOGO_FORMAT_ON_WRITE=1` | Turns on `format-on-write.sh` (`TOGO_FMT_GO` / `_WEB` / `_SQL` set the commands). |

---

## Testing a guard

Every hook reads a JSON payload on stdin, so testing one is a pipe. **Assert both
directions** — a guard that only ever blocks is untested in the direction that
matters most to a working session.

```bash
# BLOCK (exit 2) — a wipe
echo '{"tool_name":"Bash","tool_input":{"command":"psql -h prod -c \"DROP SCHEMA public CASCADE\""}}' \
  | .claude/hooks/guard-db-wipe.sh; echo "exit=$?"

# BLOCK (exit 2) — runtime DDL in Go, the likeliest togo violation
echo '{"tool_name":"Write","tool_input":{"file_path":"internal/store/init.go","content":"db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS users (id text)`)"}}' \
  | .claude/hooks/guard-direct-ddl.sh; echo "exit=$?"

# BLOCK (exit 2) — the combined-short-flag form
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -am wip"}}' \
  | .claude/hooks/guard-scoped-add.sh; echo "exit=$?"

# ALLOW (exit 0) — the sanctioned path
echo '{"tool_name":"Bash","tool_input":{"command":"togo migrate"}}' \
  | .claude/hooks/guard-db-dml.sh; echo "exit=$?"

# ALLOW (exit 0) — ordinary development must not become a must_ask
echo '{"tool_name":"Bash","tool_input":{"command":"togo generate"}}' \
  | .claude/hooks/guard-autonomy.sh; echo "exit=$?"

# DESIGN RULE 1, verified: garbage in must still exit 0
for f in .claude/hooks/*.sh; do
  echo 'not json {{' | "$f" >/dev/null 2>&1 || echo "REGRESSION: $f blocked on a parse failure"
done
```

Two cases worth keeping in any regression suite, because they are the ones that
were silently broken before:

```bash
# the ROOT commit must be scanned
git init t && cd t && echo 'import {Pool} from "pg"' > web/src/db.ts
git add -- web/src/db.ts && git commit -m "initial import"
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' \
  | .claude/hooks/post-commit-check.sh          # must report web/src/db.ts

# a MERGE commit must report what it landed
git merge --no-ff feature
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' \
  | .claude/hooks/post-commit-check.sh          # must report the branch's files
```

## When a guard is wrong

1. **Narrow the pattern** — in `../hook-config.json` / `../forbidden-imports.json`
   for scope, or in the `.sh` for detection. A narrower regex is the fix.
2. **Use the declared escape hatch**, if one exists — `TOGO_ALLOW_PROTECTED_WRITE=1`
   for a single protected-path edit. It expires with the session and it appears
   in the transcript where a reviewer sees it.
3. **Never disable the hook to get past it.** A disabled guard is not a decision
   anyone recorded; a narrowed regex is. And `.claude/**` is on `paths.deny`
   precisely so that "just turn the guard off" is not available to an agent
   (Rule 38).

## Known gap

`hook-config.git.forbidden_commands` ships
`git[[:space:]]+commit[[:space:]]+.*(-a|--all)([[:space:]]|$)`, which does **not**
match `git commit -am "wip"` — in `-am`, the `-a` is followed by `m`, not by a
space or end-of-string — and `-am` is the single most common way the rule is
actually broken. `guard-scoped-add.sh` therefore carries a small `FLOOR` list of
combined-short-flag patterns that hold even if the config is edited or missing.
Fixing the config pattern is still worth doing; the floor is not a reason to
leave it wrong.
