#!/usr/bin/env bash
# guard-db-wipe.sh — PreToolUse(Bash) hook enforcing Rule 22 (never wipe a database).
#
# PORTED, NOT REDESIGNED. This is the direct descendant of a guard written after
# a platform-wide production wipe. Every numbered arm below corresponds to a path
# that actually destroyed data, or that an agent proposed and was caught
# proposing. Arms 8 and 9 are the ones nobody writes a priori and the ones that
# cost the most — do not "simplify" them. They are the postmortem.
#
# THE NINE WIPE PATHS
#   1. DROP SCHEMA
#   2. DROP DATABASE
#   3. TRUNCATE against a non-ephemeral target
#   4. The wipe subcommand: `<binary> reset|wipe|drop|purge|nuke|reinit`, and in
#      togo specifically `togo migrate:fresh` / `togo db:reset`
#   5. `supabase db reset` against a non-ephemeral target
#   6. Destroying the data volume: kubectl delete pvc/statefulset, `docker
#      compose down -v`, `togo db:down -v`, docker volume rm/prune
#   7. initdb / pg_ctl initdb — re-initialising a data directory
#   8. Re-arming a destructive boot-time migration by setting an *AUTO_MIGRATE
#      env var true through a deploy (also Rule 26 — a deploy never sets config)
#   9. Restarting a DB StatefulSet into a fresh initdb:
#        9a. kubectl edit/patch/apply/replace/set on a DB StatefulSet pod spec.
#            An agent added args: ["-c","max_connections=200"] to a DB
#            StatefulSet. The pod restarted with the new container args, the
#            image entrypoint re-ran initdb, and the data directory was
#            overwritten. Nothing in the command said "delete".
#        9b. `terraform apply` while the IaC still carries container args on a DB
#            StatefulSet — the same wipe, delivered by Terraform. Inert when
#            hook-config `iac` is null (no IaC in this project).
#
# ALLOWED (passes through)
#   - Read-only SQL and code search
#   - The sanctioned runners from database.migration_runner.allowed_patterns
#   - Destructive ops that EXPLICITLY name a database.ephemeral_targets entry.
#     "It was pointed at local" is not a claim a guard can verify after the fact,
#     so an unqualified destructive command is blocked even if it was harmless.
#
# Exit 0 = allow, exit 2 = block. `set -uo pipefail` deliberately WITHOUT -e:
# a guard must survive its own bugs, and its failure mode is permissiveness.

set -uo pipefail

PAYLOAD="$(cat 2>/dev/null || true)"
[ -z "${PAYLOAD}" ] && exit 0

CMD="$(printf '%s' "${PAYLOAD}" | python3 -c '
import json,sys
try:
    print(str((json.load(sys.stdin).get("tool_input") or {}).get("command") or ""))
except Exception:
    sys.exit(0)
' 2>/dev/null || true)"
[ -z "${CMD}" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
CONFIG="${TOGO_HOOK_CONFIG:-${HOOK_DIR}/../hook-config.json}"
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

NORM="$(printf '%s' "${CMD}" | tr '\n' ' ' | tr -s ' ')"
LOW="$(printf '%s' "${NORM}" | tr '[:upper:]' '[:lower:]')"

# Pure code search is not a wipe. Searching FOR these strings must not be
# blocked, or the guard is switched off by lunchtime.
if printf '%s' "${LOW}" | grep -qE '^[[:space:]]*(grep|rg|ag|ack|fd|find|cat|less|head|tail|bat|wc)([[:space:]]|$)' \
   && ! printf '%s' "${LOW}" | grep -qE '(psql|mysql|mongosh|kubectl|terraform|tofu|pulumi|docker|togo|atlas|supabase|gcloud|aws|az)'; then
  exit 0
fi

# ---------------------------------------------------------------------------
# One python pass for everything the config decides.
#   line 1: EPHEMERAL 0|1        (does the command explicitly name a scratch target)
#   line 2: RUNNER    0|1        (is it a sanctioned migration runner)
#   line 3: BINS      regex alternation of product+framework binaries
#   line 4: SUBS      regex alternation of destructive subcommands
#   line 5: AMVARS    regex alternation of *AUTO_MIGRATE env var names
#   line 6+: IACDIRS  directories to scan for arm 9b (empty when iac is null)
# ---------------------------------------------------------------------------
FACTS="$(printf '%s' "${CMD}" | python3 -c '
import re, sys, os
sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, get, as_list, ere_to_py
except Exception:
    sys.exit(0)
cmd = sys.stdin.read()
cfg = load_json(sys.argv[2])

def hit(pats, text):
    for p in as_list(pats):
        try:
            if re.search(ere_to_py(p), text, re.I):
                return True
        except Exception:
            continue
    return False

print("1" if hit(get(cfg, "database.ephemeral_targets.url_patterns"), cmd) or
      any(c and c in cmd for c in as_list(get(cfg, "database.ephemeral_targets.container_names")))
      else "0")
print("1" if hit(get(cfg, "database.migration_runner.allowed_patterns"), cmd) else "0")

bins = as_list(get(cfg, "binaries.product")) + as_list(get(cfg, "binaries.framework"))
print("|".join(re.escape(b) for b in bins if b) or "togo")
subs = as_list(get(cfg, "binaries.destructive_subcommands")) or ["reset"]
print("|".join(re.escape(s) for s in subs))
am = as_list(get(cfg, "database.auto_migrate_env_vars.names")) or ["AUTO_MIGRATE"]
print("|".join(re.escape(a) for a in am))
for d in as_list(get(cfg, "iac.db_module_paths")) + as_list(get(cfg, "iac.module_paths")) + as_list(get(cfg, "iac.dir")):
    print("IAC:" + d)
' "${HOOK_DIR}" "${CONFIG}" 2>/dev/null || true)"

IS_LOCAL="$(printf '%s\n' "${FACTS}" | sed -n 1p 2>/dev/null || echo 0)"
IS_RUNNER="$(printf '%s\n' "${FACTS}" | sed -n 2p 2>/dev/null || echo 0)"
BINS="$(printf '%s\n' "${FACTS}" | sed -n 3p 2>/dev/null || echo togo)"
SUBS="$(printf '%s\n' "${FACTS}" | sed -n 4p 2>/dev/null || echo reset)"
AMVARS="$(printf '%s\n' "${FACTS}" | sed -n 5p 2>/dev/null || echo AUTO_MIGRATE)"
IACDIRS="$(printf '%s\n' "${FACTS}" | grep '^IAC:' 2>/dev/null | cut -c5- || true)"

[ -z "${IS_LOCAL}" ] && IS_LOCAL=0
[ -z "${BINS}" ] && BINS="togo"
[ -z "${SUBS}" ] && SUBS="reset|wipe|drop|purge|nuke|reinit"
[ -z "${AMVARS}" ] && AMVARS="AUTO_MIGRATE"

# A sanctioned migration runner is never a wipe. Check it before anything else.
[ "${IS_RUNNER}" = "1" ] && ! printf '%s' "${LOW}" | grep -qE 'fresh|reset|drop' && exit 0

BINS_LOW="$(printf '%s' "${BINS}" | tr '[:upper:]' '[:lower:]')"
SUBS_LOW="$(printf '%s' "${SUBS}" | tr '[:upper:]' '[:lower:]')"
AMVARS_LOW="$(printf '%s' "${AMVARS}" | tr '[:upper:]' '[:lower:]')"

block() {
  {
    echo "BLOCKED by Rule 22 (never wipe a database) — .claude/rules/22-never-wipe-database.md"
    echo "  Wipe path: $1"
    echo "  Command  : ${NORM}"
    echo ""
    echo "  There is always a non-destructive alternative:"
    echo "    - Need a clean database?  Bring up a FRESH ephemeral container on a scratch"
    echo "                              volume. Never reset a shared one."
    echo "    - Need a schema change?   db/schema.sql -> the Rule 23 workflow -> 'togo migrate'."
    echo "                              Forward-only, always."
    echo "    - Need to fix data?       An idempotent migration: DELETE ... WHERE <bad>,"
    echo "                              INSERT ... ON CONFLICT DO UPDATE."
    echo "    - Need more DB memory?    Change it by a method that does NOT restart the"
    echo "                              pod into a fresh initdb."
    echo ""
    echo "  destructive_database_operation is on autonomy.yaml's must_ask list, and the"
    echo "  expected answer is no. If you believe a wipe is genuinely unavoidable, STOP"
    echo "  and put the case to the operator in chat — do not find another route."
  } >&2
  exit 2
}

# --- 1. DROP SCHEMA --------------------------------------------------------
printf '%s' "${LOW}" | grep -qE 'drop[[:space:]]+schema[[:space:]]' && block "DROP SCHEMA"

# --- 2. DROP DATABASE ------------------------------------------------------
printf '%s' "${LOW}" | grep -qE 'drop[[:space:]]+database[[:space:]]' && block "DROP DATABASE"

# --- 3. TRUNCATE against a non-ephemeral target ----------------------------
if [ "${IS_LOCAL}" -ne 1 ] 2>/dev/null; then
  printf '%s' "${LOW}" | grep -qE '(^|[^a-z])truncate[[:space:]]+(table[[:space:]]+)?[a-z]' \
    && block "TRUNCATE without an explicitly ephemeral target"
fi

# --- 4. The wipe subcommand ------------------------------------------------
if [ "${IS_LOCAL}" -ne 1 ] 2>/dev/null; then
  printf '%s' "${LOW}" | grep -qE "(^|[^a-z:/-])(${BINS_LOW})[[:space:]]+(migrate:)?(fresh|${SUBS_LOW})([[:space:]]|$)" \
    && block "<binary> <${SUBS_LOW}> — the wipe subcommand. This is the exact shape of the command that dropped a production schema."
  printf '%s' "${LOW}" | grep -qE "(^|[^a-z:/-])(${BINS_LOW})[[:space:]]+(migrate:fresh|db:reset|db:drop|db:nuke)" \
    && block "togo migrate:fresh / db:reset (drops the schema and re-applies from zero)"
  # A `<something>db reset` that is not one of our binaries. `git reset` is
  # explicitly NOT this — excluding it is the difference between a guard people
  # keep and one they disable on day two.
  if ! printf '%s' "${LOW}" | grep -qE '(^|[^a-z/])(git|jj|hg)[[:space:]]+reset'; then
    printf '%s' "${LOW}" | grep -qE '(^|[^a-z/])([a-z][a-z0-9_-]*(db|sql)|database|postgres|psql|mysql|mongo)[[:space:]]+(db[[:space:]]+)?reset([[:space:]]|$)' \
      && block "<bin> reset against a database"
  fi
fi

# --- 5. supabase db reset --------------------------------------------------
if [ "${IS_LOCAL}" -ne 1 ] 2>/dev/null; then
  printf '%s' "${LOW}" | grep -qE 'supabase[[:space:]]+db[[:space:]]+reset' \
    && block "supabase db reset without an explicitly ephemeral target"
fi

# --- 6. Destroying the data volume ----------------------------------------
printf '%s' "${LOW}" | grep -qE 'kubectl[[:space:]]+delete[[:space:]]+(pvc|persistentvolumeclaim)' \
  && block "kubectl delete pvc (destroys the DB data volume)"
printf '%s' "${LOW}" | grep -qE 'kubectl[[:space:]]+delete[[:space:]]+(statefulset|sts)[[:space:]]' \
  && printf '%s' "${LOW}" | grep -qE '(postgres|pg-|mysql|mariadb|mongo|-db|_db|[[:space:]]db)' \
  && block "kubectl delete statefulset on a database"
printf '%s' "${LOW}" | grep -qE "(docker[[:space:]]+compose|docker-compose|(${BINS_LOW})[[:space:]]+db:down)[[:space:]].*(-v([[:space:]]|$)|--volumes)" \
  && block "docker compose down -v / <bin> db:down -v (deletes the named DB volume)"
printf '%s' "${LOW}" | grep -qE 'docker[[:space:]]+volume[[:space:]]+(rm|prune)' \
  && block "docker volume rm/prune (deletes the DB data volume)"

# --- 7. initdb -------------------------------------------------------------
printf '%s' "${LOW}" | grep -qE '(^|[^a-z])initdb([[:space:]]|$)' \
  && block "initdb (re-initialises a postgres data directory)"

# --- 8. Re-arming a destructive auto-migrate ------------------------------
printf '%s' "${LOW}" | grep -qE "(update-env-vars|set-env-vars|set-secrets|--env|-e)[= ].*(${AMVARS_LOW})[[:space:]]*=[[:space:]]*(true|1|yes|on)" \
  && block "re-enabling *AUTO_MIGRATE=true through a deploy (also Rule 26 — a deploy never sets configuration)"
printf '%s' "${LOW}" | grep -qE "(^|[[:space:]])(${AMVARS_LOW})[[:space:]]*=[[:space:]]*(true|1|yes|on)" \
  && block "setting *AUTO_MIGRATE=true (a boot-time migration is how a schema drops itself)"

# --- 9a. Modifying a DB StatefulSet pod spec ------------------------------
printf '%s' "${LOW}" | grep -qE 'kubectl[[:space:]]+(edit|patch|apply|replace|set)[[:space:]].*(statefulset|sts|petset)' \
  && printf '%s' "${LOW}" | grep -qE '(postgres|pg-|mysql|mariadb|mongo|-db|_db|[[:space:]]db[[:space:]]|/db)' \
  && block "kubectl edit/patch/replace on a DB StatefulSet (pod-spec change -> pod restart -> initdb wipe)"

# --- 9b. terraform apply with container args on a DB StatefulSet ----------
# Inert when hook-config.iac is null: a project with no IaC has no arm 9b.
if [ -n "${IACDIRS}" ] && printf '%s' "${LOW}" | grep -qE '(terraform|tofu|pulumi)[[:space:]].*(apply|up|-auto-approve)'; then
  while IFS= read -r d; do
    [ -z "${d}" ] && continue
    HITS="$(cd "${ROOT}" 2>/dev/null && grep -rlniE 'stateful_?set|petset' \
              --include='*.tf' --include='*.yaml' --include='*.yml' "${d}" 2>/dev/null | head -50 || true)"
    while IFS= read -r f; do
      [ -z "${f}" ] && continue
      grep -qE '^[[:space:]]*(args|pg_extra_args|extra_args|command)[[:space:]]*(=|:)' "${ROOT}/${f}" 2>/dev/null \
        && grep -qiE '(postgres|mysql|mariadb|mongo|-db|_db)' "${ROOT}/${f}" 2>/dev/null \
        && block "terraform apply with container args/command on a DB StatefulSet (${f}) — pod restart -> initdb. Remove the args block from the DB StatefulSet first."
    done <<< "${HITS}"
  done <<< "${IACDIRS}"
fi

exit 0
