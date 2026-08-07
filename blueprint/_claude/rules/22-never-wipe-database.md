---
description: "No operation may drop, wipe, reset, truncate, or re-initialize any database, in any environment, for any reason."
globs: "*"
alwaysApply: true
---

# Rule 22: NEVER Wipe a Database — No Destructive Resets, Ever, For Any Reason

**No operation may drop, wipe, reset, truncate, or re-initialize the schema or data of ANY database in `{{env_matrix}}` — dev, stage, or production — for ANY reason. There is no acceptable justification. Production data is irreplaceable; dev and stage data is expensive to rebuild. A database wipe is a catastrophic, trust-destroying event and is categorically forbidden.**

This rule and the incident behind it are carried forward verbatim from the estate this blueprint was distilled from. It is the one rule in the band that was written in the aftermath rather than in anticipation, and it is kept word-for-word because the specificity is the point.

## The Absolute Prohibition

These operations are **forbidden** against any database that holds real schema or data — that is, anything other than a throwaway ephemeral test container you created seconds ago and will destroy seconds later:

| Forbidden operation | Why |
|---|---|
| `DROP SCHEMA public CASCADE` (or any schema holding app objects) | Wipes every table at once |
| `DROP DATABASE` | Total destruction |
| `DROP TABLE` / `DROP MATERIALIZED VIEW` / `DROP TYPE` / `DROP ROUTINE` in bulk | Mass destruction |
| `TRUNCATE` on any shared or production table | Data loss |
| Any `db reset` that drops and re-applies | Destructive by construction |
| `atlas schema apply` (declarative) that computes a destructive diff | Can `DROP` tables to "match" a smaller desired schema |
| Any `reset` subcommand on a product binary listed in `.claude/hook-config.json` → `destructive.product_binaries` | This is exactly the shape that caused the incident below |
| Re-running `initdb` / re-initializing a Postgres data directory on an existing volume | The StatefulSet-replacement trigger of the 2026-06-21 wipe |
| `kubectl delete pvc` / deleting a database volume | Destroys the data directory |
| Any `*_AUTO_MIGRATE` / `*_RESET` flag that performs a reset on startup | Turns every restart into a wipe |

## The Specific Dangers That Caused The 2026-06-21 Wipe

1. **A `reset` subcommand on the product CLI.** It dropped all public tables, views, types, routines and sequences, then `DROP SCHEMA <migrations-schema> CASCADE`, then re-applied migrations. Its wipe fingerprint — only Postgres extension tables surviving — matched the incident exactly. **A command of this shape must NEVER be reachable from any deploy, container entrypoint, startup path, CI job, or auto-migrate flag.** It must stay gated behind an interactive `--yes` **and** a hard *refuse-if-prod* / *refuse-unless-`$LOCAL_DATABASE_URL`* guard. The binaries carrying such a subcommand in this project are enumerated in `.claude/hook-config.json` → `destructive.product_binaries`.

2. **An `AUTO_MIGRATE` environment flag.** It was intended to apply *forward* migrations only. It must be **migrate-only, never reset**. It was set to `false` on every environment after the incident, in IaC and in CI. It may only be re-enabled after proving the migrate path contains zero destructive operations and cannot fall back to a reset when it finds an inconsistent migration state.

3. **StatefulSet pod replacement → fresh `initdb` on an existing volume.** A config/env change that altered the database StatefulSet's pod spec caused the Postgres pod to be recreated, which re-initialized the data directory. **Database pod-spec changes must be decoupled from application env changes** — `lifecycle { ignore_changes = [...] }` on the database resource, or apply database infrastructure in a separate stack — and the image entrypoint must NEVER run `initdb` when a data directory is already present. Volume snapshot/backup jobs must exist *before* any apply that can touch a database StatefulSet. The IaC module paths that own database resources in this project are listed in `.claude/hook-config.json` → `destructive.iac_db_module_paths`.

## Required Safeguards (all must hold)

- **No destructive operation from automation.** Deploys, entrypoints, CI, cron, and auto-migrate paths run forward migrations only — never reset, drop, or `initdb`.
- **Reset commands are guarded.** Any `reset` / `db reset` command refuses to run unless (a) the target is a local or ephemeral database (`$LOCAL_DATABASE_URL`), **and** (b) an explicit interactive `--yes` was given, **and** (c) a refuse-if-prod host check passes. It is never wired into a Makefile target, script, or Job that a deploy can trigger.
- **Volume protection.** Every database volume has a backup/snapshot schedule and a `prevent_destroy` / retain policy in IaC.
- **Pre-flight backup.** Before ANY migration apply against stage or production, take a logical dump (`pg_dump`) or a volume snapshot first.
- **Decouple database infrastructure from application config.** Never let an application env change ripple into a database pod replacement.

## Enforcement

- **PreToolUse(Bash) hook** `.claude/hooks/guard-db-wipe.sh` (registered in `settings.json`) blocks any Bash command matching destructive database patterns — `DROP SCHEMA`, `DROP DATABASE`, `TRUNCATE`, `db reset`, `<product-binary> reset`, `initdb`, `kubectl delete pvc`, `--update-env-vars=*AUTO_MIGRATE=true` — before it executes. Read-only and forward-migration commands pass through. The product-binary list and database module paths it matches on come from `.claude/hook-config.json`.
- **CI gate** rejects any PR that wires a reset, drop, or `initdb` into a deploy, entrypoint, Makefile, Job, or workflow.
- **Code-review heuristic** blocks any diff adding `(?i)(DROP\s+(SCHEMA|DATABASE)|db\s+reset|initdb|TRUNCATE)` to a non-test, non-guarded path.

## If You Think You Need To Wipe

You don't. There is always a non-destructive alternative:

- Need a clean schema in dev? Use a **fresh ephemeral container**, never reset a shared database.
- Need to fix drift? Write a **forward migration**, never a reset.
- Need to re-seed? **Upsert** (`ON CONFLICT DO UPDATE`), never `TRUNCATE` + insert.
- A migration is stuck? Fix the migration. Never `db reset` to "start over" on a shared database.

If you genuinely believe a destructive operation is unavoidable, **STOP and ask the operator explicitly**, in chat, describing exactly what would be lost. Never proceed on your own judgment. The default is always: do not wipe.

## Why This Rule Exists — Concrete Cost

2026-06-21: a single destructive path wiped **12 databases** (6 products × dev + stage) plus a live replica. Hours of restoration across multiple specialists. Permanent loss of historical pipeline data, admin-panel configuration, and integration-key registrations that lived only in the database and had never been written down as artifacts (see Rule 21). The operator's production data was put at risk.

No feature, fix, or convenience is worth that. **The database is sacred. Never wipe it.**

## Related

- Rule 20 — no direct DDL; all schema via generated migrations
- Rule 21 — no direct DML; the un-migrated data changes lost in this wipe are why that rule exists
- Rule 23 — schema change workflow; forward migrations only
- Rule 24 — IaC mirrors infrastructure; database backups and retain policies are codified there
- Rule 25 — fix at the source, never hot-patch; the reset path must be fixed in code, not routed around live
- Rule 26 — the deploy never sets env; the `AUTO_MIGRATE=true` that worsened this wipe was itself a Rule 26 violation
