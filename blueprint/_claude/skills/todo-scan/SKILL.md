---
name: todo-scan
description: Inventory TODO / FIXME / HACK / XXX / NOTE markers across the repo, grouped by area, with vendor and generated noise excluded. Use when asked to "scan for TODOs", "audit tech debt", "what's left", "list unfinished work", or before filing tracker issues so the count is honest.
---

# todo-scan — An honest inventory of what was left unfinished

Markers are the only tech debt that documents itself. This skill turns them into a
grouped inventory the operator can triage — not a wall of 400 lines.

## When to run it

- The operator asks for a debt sweep
- Before filing tracker issues, so the numbers in them are real
- After finishing a feature, to confirm no scaffolding markers survived
- As a pre-promotion check — a `FIXME: hardcoded for demo` should never reach
  `{{prod_ref}}`

## The scan

```bash
rg --line-number --no-heading \
   -e '\bTODO\b' -e '\bFIXME\b' -e '\bHACK\b' -e '\bXXX\b' \
   --glob '!**/node_modules/**' \
   --glob '!**/vendor/**' \
   --glob '!**/dist/**' \
   --glob '!**/build/**' \
   --glob '!**/.next/**' \
   --glob '!**/*.gen.go' \
   --glob '!**/*_gen.go' \
   --glob '!**/generated/**' \
   --glob '!**/*.lock' \
   --glob '!**/go.sum' \
   --glob '!**/package-lock.json' \
   --glob '!**/*.{svg,png,jpg,jpeg,gif,ico,woff,woff2,pdf,bin}' \
   .
```

If `rg` is unavailable, fall back to `grep -rn` with the same exclusions.

### Why these exclusions

| Excluded | Reason |
|---|---|
| `*.gen.go`, `generated/` | `togo generate` output. A TODO there belongs to the generator template, not this repo. Fixing it in the generated file is erased on the next `togo generate`. |
| `vendor/`, `node_modules/` | Someone else's debt |
| `dist/`, `build/`, `.next/` | Artefacts; duplicates of source markers |
| Lock and checksum files | Never contain real markers, always contain false positives |
| Binary assets | Byte-sequence false positives |

If a marker in generated code is real, the fix goes in the **template or the source
query**, and the marker should be raised there.

## Grouping

Group by area — the first two or three path segments — never one issue per marker.
For a togo project the natural areas are:

```
internal/api            <n>
internal/db/queries     <n>
internal/actions        <n>
internal/plugins        <n>
cmd/                    <n>
web/app                 <n>
web/components          <n>
web/hooks               <n>
db/migrations           <n>
_root_                  <n>
```

Sort descending by count. One issue per *area*, not per marker — a 300-marker repo
becomes 8–12 tracked items instead of 300, which fits in a board a human will
actually read.

## Detail mode

When the operator wants the full list, emit TSV so it can be piped:

```
<area>	<file>:<line>	<marker>	<text after the marker>
```

## Triage

Walk the list with the operator and sort every marker into exactly one bucket:

| Bucket | Meaning | Action |
|---|---|---|
| **Trivial** | One-line fix, obvious, no design decision | Fix it now, in this session |
| **Stale** | Refers to code, a plan, or a constraint that no longer exists | Delete the comment; note the deletion in the report |
| **Track** | Real work, needs its own scope | File an issue; replace the marker with `TODO(#<issue>): …` |
| **Permanent** | An intentional, documented constraint | Rewrite as `NOTE:` — a TODO that will never be done is a lie |

**Never bulk-close or bulk-delete without sign-off.** A marker someone wrote is a
message from a past engineer; deleting 200 of them in one commit destroys the
message and hides the debt rather than paying it.

## Marker hygiene going forward

When you write a marker in this codebase:

```go
// TODO(#142): batch these inserts once the writer supports COPY.
// HACK: the upstream API returns 200 with an error body; unwrap it here.
//       Remove when <vendor> ships the documented status codes.
```

- A bare `// TODO` with no issue and no explanation is worse than no comment
- `FIXME` means "this is wrong and someone will get hurt" — reserve it
- `XXX` is ambiguous across teams; prefer `FIXME` or `HACK` with a sentence

## Report shape

```
TODO inventory — {{project_name}} @ <sha>

  internal/api          26   (14 TODO, 9 FIXME, 3 HACK)
  web/components        15
  internal/db/queries    7
  _root_                 3
  ─────────────────────────
  total                 51   across 4 areas

Oldest marker: internal/api/orders.go:88  (introduced <date>, <sha>)
Suggested: 4 tracking issues (one per area), 11 trivial fixes, 6 stale deletions.
```

Use `git log -S` or `git blame` to date the oldest markers when the operator asks
which debt has been rotting longest.

## Related

- `decompose` — when one area's markers add up to a real feature
- `plan` — a "Track" bucket item large enough to need a design
