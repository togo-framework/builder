---
description: "Never close an issue on commit, build, or merge evidence — prove the deployed artifact contains the change and the running system exhibits the new behaviour."
globs: "*"
alwaysApply: true
---

# Rule 28: Verify Before Closing — Evidence, Not Inference

**Never close an issue, or report a change done, on the strength of a commit, a green build, a merged PR, or a successful deploy. Those prove that source compiled and bytes moved. They do not prove the change is live. You close only when you have probed the running system and can paste what it said.**

This is the most expensive rule in the estate to learn and the cheapest to follow. Every layer below is under two minutes.

## The Failure Mode This Rule Prevents

1. A commit lands with a `Closes #NNN` footer referencing a real SHA.
2. The push to `{{trunk}}` succeeds.
3. CI reports SUCCESS for that commit.
4. The issue auto-closes.
5. **The artifact never picked up the change** — build cache, tree-shaking, an unimported file, a service the pipeline did not rebuild because no path filter matched — *or* the code shipped fine and has a bug that only appears when actually executed.
6. The user reports the same problem again. Trust evaporates, and now every subsequent "done" from you is discounted.

The mistake is treating *commit + build SUCCESS* as proof of working software. It is proof that the source compiled. Working software is proven only by the running system doing the new thing.

## The Evidence Contract

Which layers are required depends on what the change touched. Surfaces in this project: `{{surfaces}}`.

### Layer 0 — Contract scan (API changes; free in togo)

togo exports an OpenAPI document as part of `togo generate`, which means the API surface is machine-checkable with one command. Use it. This layer costs three seconds and catches the most common false "done" in a Go backend: the handler was written but never registered on the router.

```bash
# The new route exists in the deployed contract
curl -s {{api_base}}/openapi.json | jq -e '.paths["/widgets/{id}/archive"].post' \
  || echo "NOT LIVE — route missing from the deployed OpenAPI document"

# The new field exists on the schema
curl -s {{api_base}}/openapi.json | jq '.components.schemas.Widget.properties | keys'

# The deployed contract is not stale — compare against the generated one
diff <(curl -s {{api_base}}/openapi.json | jq -S .) <(jq -S . api/openapi.json)
```

If the route is absent from the deployed document, the change is not live — regardless of what the build said. Stop and investigate before claiming anything.

A route that appears in the local `api/openapi.json` but not at `{{api_base}}` means the deployed binary predates your change. A route in neither means you never registered the handler and `togo generate` was never re-run.

### Layer 1 — Artifact scan (frontend changes; mandatory)

For each new component, hook, query key, or literal string the change introduces, prove it is present in the artifact actually being served from `web/`:

```bash
BASE={{api_base}}
for asset in $(curl -s "$BASE/<route-that-uses-it>" | grep -oE '/assets/[^"]+\.js' | sort -u); do
  HITS=$(curl -s "$BASE$asset" | grep -oE 'NewComponentName|useNewHook|new-query-key' | sort -u | tr '\n' ',')
  [ -n "$HITS" ] && echo "$asset → $HITS"
done
```

Empty result means **the change is not in the bundle**. This is a real failure, not deployment lag. Investigate in this order:

1. **Is the new file actually imported by a route?** A component that exists in git but is imported nowhere is tree-shaken out. Check the route.
2. **Is the workspace package wired into `web/`?** A missing workspace dependency makes the package invisible to the bundler.
3. **Did the build cache invalidate?** Force a clean build.
4. **Did the pipeline rebuild this surface at all?** Path-filtered pipelines routinely skip the surface you changed.
5. **Did the deployment actually roll?** Compare the running image tag against your commit SHA.

Each has a different fix. Do not guess.

### Layer 2 — Live render (visual changes; mandatory when the user can see it)

For anything a user sees — a component, a label, a layout, a colour, a badge, an empty state:

- Load the page and assert the new element exists (Playwright, Chrome MCP, or an equivalent driver), **or**
- Fetch the page HTML and grep for a known new string — noting this only catches server-rendered strings, not client-rendered ones, **or**
- Ask the operator to hard-refresh and screenshot.

For a client-rendered surface, Layer 1 is the only *programmatic* proof until an end-to-end harness exists. **Layer 1 is non-negotiable there.**

When the project declares more than one locale (`{{locales}}`), verify the change in **every** declared locale, not just the one you developed in. A string that renders in one locale and falls back to a raw key in another is a shipped bug that Layer 1 will happily confirm as present.

### Layer 3 — Behavioural assertion (backend, data, and schema changes)

The system must be observed *doing* the new thing:

```bash
# The endpoint behaves, not just exists
curl -s -o /dev/null -w '%{http_code}\n' -X POST {{api_base}}/widgets/<id>/archive
curl -s {{api_base}}/widgets/<id> | jq '.archived_at'

# The schema change is real and the ledger agrees
togo db migrate:status
psql "$DATABASE_URL" -c '\d+ widget'
psql "$DATABASE_URL" -c 'SELECT count(*) FROM widget WHERE archived_at IS NOT NULL'

# The running binary is the one you built
# (compare the deployed image tag / build info endpoint against your commit SHA)
```

For a data change, the assertion is a `SELECT` that returns rows only if the change landed. `count(*) > 0` on the new condition. Not "the migration ran" — what the migration *did*.

For a permissions change, remember that togo auth's `Can()` is an **exact string match**: `permissions=["*"]` grants nothing and denies everything. A permissions change is verified by calling the endpoint as a user who should be allowed **and** as one who should be denied, and asserting both outcomes. A single 200 proves half of it.

## The Closing Checklist

| Step | When required |
|---|---|
| Commit pushed to `{{trunk}}` | always |
| CI SUCCESS for that commit | always |
| Promotion to `{{prod_ref}}` complete per Rule 27 | when closing against production |
| Running image / build identifier matches the commit | always |
| **Layer 0** — new route or field present in the deployed OpenAPI | any API change |
| **Layer 1** — new symbols found in the served bundle | any frontend change |
| **Layer 2** — page renders the new behaviour, in every locale in `{{locales}}` | any visual change |
| **Layer 3** — endpoint / query / permission asserts the new behaviour | any backend, data, or schema change |
| Close comment contains the evidence table below | always |

If any required step is incomplete, **the issue stays open**. No exceptions. An issue that stays open costs a follow-up. An issue closed wrongly costs the operator's trust in every issue you ever close.

## Required Close Comment

```
**Verified live**

| | |
|---|---|
| Commit | `<short SHA>` on `{{trunk}}` |
| CI | SUCCESS — `<run id or url>` |
| Deployed build | `<image tag / build id>` at `<timestamp>` |
| OpenAPI | `curl {{api_base}}/openapi.json` → `POST /widgets/{id}/archive` present |
| Bundle scan | `<asset>` contains `<symbol1>, <symbol2>` |
| Render | `<url>` shows `<observed behaviour>` — `{{locales}}` both checked |
| Behaviour | `curl <endpoint>` → `<status> <abbreviated body>` |
| Data | `SELECT count(*) ... → <n>` |
```

Omit rows that do not apply. Never omit a row that does. **A close comment without this block is an incomplete close**, and should be treated by reviewers as if the issue were still open.

## Anti-patterns

- **"Shipped via `<SHA>`. Verified live."** with no commands and no output → **incomplete**. "Verified" is a claim; the paste is the evidence.
- **A `Closes #NNN` footer with no comment** → **incomplete**. Auto-close is a convenience, not a verification mechanism.
- **Closing a batch of related issues together with one shared evidence block** → **wrong**. Each issue gets its own probe. They fail independently and they must be proven independently.
- **Trusting a subagent's report verbatim** → agents report success in good faith for changes that never reached the artifact. Re-run the probe yourself. The probe is two minutes; the reopening cycle is hours.
- **"The build is green, it'll be live in a minute, I'll close it now"** → close it in a minute, then, with the probe output.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint was distilled from, where it was the single most valuable rule written. In one session: **14 issues filed, 14 closed on commit-and-build evidence, 11 reopened within the hour** when the user noticed none of the changes were actually visible. The code was correct. The commits were real. The builds were green. The bundle simply never contained the changes, because the new components were imported nowhere.

Hours of agent runtime and an entire user review cycle, lost. **A two-minute bundle scan per issue would have prevented every single reopening.**

## Related

- Rule 21 — a verified direct write is still a violation; verification proves state, not durability
- Rule 23 — the schema workflow ends in this rule's Layer 3
- Rule 25 — a redeploy is not evidence
- Rule 26 — read configuration back off the running service
- Rule 27 — a merged promotion is not a shipped feature
