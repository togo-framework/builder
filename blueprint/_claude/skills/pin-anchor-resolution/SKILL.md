---
name: pin-anchor-resolution
description: "Triggered when capturing or resolving a pinned page element."
---

# pin-anchor-resolution — capture every signal, trust none alone, keep both ends of the wire in sync

Procedure for touching the pin capture/resolve pipeline: `sdk/src/anchor.ts`, `sdk/src/picker.ts`, `sdk/src/types.ts`'s `PinAnchor`, and the Go handlers that persist and return it. Use it whenever you are the one producing or re-finding a pinned DOM element, not when you are consuming an already-resolved pin to find source code (that's `find-pinned-component`).

## When to use this

- You are adding, renaming, or changing a field on `PinAnchor` (`sdk/src/types.ts`) — a new capture strategy.
- You are changing `capture()`, `selectorsFor()`, `cssPath()`, or `resolve()` in `sdk/src/anchor.ts`.
- `highlight()` (`sdk/src/picker.ts`) is reported as finding nothing, or flashing the wrong element, for a pin that should still exist on the page.
- You are reviewing a PR that touches the pin JSON contract between the SDK and `internal/issues/service.go` / `internal/issues/board.go`.
- A pin's `resolvedState`/`resolveAttempts`/`resolveHits` in the issue detail view look suspicious (always `unknown`, always `0`).
- You are about to change `MIN_CONFIDENCE` or any confidence number in `resolve()`.

## Steps

1. **Read the ladder before touching it.** `capture()` in `sdk/src/anchor.ts` builds a `PinAnchor` with independent re-resolution strategies (`testid`, `domId`, `role`+`name`, `css`, `hint`), then re-queries each candidate selector via `selectorsFor()` and only records a strategy in `anchor.verified` if it uniquely resolves back to `el` right now. `resolve()` walks the same strategies in durability order and returns on the **first** branch that yields exactly one candidate, each with a fixed confidence (`testid`=1, `id`=0.9, `role+name`=0.85, `role+name+geometry`=0.65, `css` agreeing with `hint`=0.6, `css` disagreeing=0.35, `text`=0.45). `highlight()` in `picker.ts` then refuses anything below `MIN_CONFIDENCE` (0.5).

2. **Adding a new strategy — client side.** Add the field to `PinAnchor` in `types.ts`, populate it in `capture()`, and if it is independently queryable add it to `selectorsFor()` so it participates in the verified-uniqueness check. Add a branch to `resolve()` positioned by how durable it actually is, not at the top or bottom for convenience — every branch above it silently demotes, and it changes behavior for pins already stored in the DB the instant you ship it, with no migration involved.

3. **Wire it through the server — four places move together:**
   ```
   internal/issues/service.go   type pin struct { ... }        // inbound JSON
   internal/issues/service.go   INSERT INTO builder_issue_pins (...)  // in create()
   db/migrations/000N_*.sql     ALTER TABLE builder_issue_pins ADD COLUMN ...
   internal/issues/board.go     type pinOut struct { ... }     // outbound JSON
   internal/issues/board.go     SELECT ... FROM builder_issue_pins  // in loadPins()
   ```
   Never edit `0001_builder_init.sql` — it's already applied; add a new numbered migration (next is `0009_*.sql`, following the pattern in `db/migrations/`). Verify the four are in sync with:
   ```bash
   rg -n 'json:"domId' internal/issues/*.go sdk/src/types.ts
   rg -n 'dom_id|domId' db/migrations/*.sql internal/issues/*.go
   ```

4. **Rebuild and typecheck:**
   ```bash
   cd sdk && npm run build && npm run typecheck
   ```
   `build.mjs` compiles the TS; a broken field name here fails silently as `undefined` at runtime otherwise.

5. **Test against jsdom**, following the existing pattern in `sdk/src/markdown.test.mjs` (esbuild-bundles the module, injects a `JSDOM` document, imports the bundle as a data URI). Add or extend a `src/*.test.mjs` covering `capture()`/`resolve()` for the case you changed, then `npm test`.

6. **Verify end-to-end in a real page**: mount the SDK, click the pin button (`index.ts` `pinBtn` handler → `startPicker`), pick an element, reopen the issue detail (`detail.ts`) and click the eye icon, which calls `highlight()`. Confirm the `builder-pin-found` flash (`styles.ts`) fires and `r.by`/`r.confidence` match what you expect.

## Getting it wrong

- **`domId` is captured and never persisted.** `capture()` sets `anchor.domId`, `resolve()` has a branch for it, and `service.go`'s inbound `pin` struct has `DomID string `json:"domId"``` — but `builder_issue_pins` has no `dom_id` column, `create()`'s `INSERT` column list omits it, and `board.go`'s `pinOut`/`loadPins` never select it back. Every `domId` anchor is silently dropped between capture and the issue detail view. This is the concrete reason to grep all four locations for any field you touch, not just the two you remember to edit.
- **Telemetry columns exist but nothing writes them.** `resolved_state`, `resolve_attempts`, `resolve_hits`, `last_resolved_at` are read back in `loadPins` and rendered to callers, but `create()`'s `INSERT` never sets them and `handlePatch` (`board.go`) only touches `status`/`priority`/`type`/`area`. Every pin sits at `resolved_state='unknown'`, 0 attempts, forever. Don't build a feature — or write a skill instruction — that assumes this telemetry is live without adding the write path.
- **Inserting a `resolve()` branch in the wrong slot.** Because `resolve()` returns at the first unique match, adding a check above `testid` or between existing checks changes which strategy wins for pins already stored, retroactively, with no version flag to opt in.
- **Bypassing `qsa()`.** `picker.ts` runs against the *host* document, not the shadow root, on purpose. `resolve()`'s `qsa()` filters out `isOurs()` elements; a new selector wired directly through `document.querySelectorAll` skips that filter and can match the widget's own DOM.
- **Trusting a strategy without verifying it.** `capture()`'s per-strategy uniqueness check populates `anchor.verified` — skip it for a new field and you break the guarantee `find-pinned-component` depends on ("a strategy that is already ambiguous at capture time never gets better later").
- **Changing `cssPath()`'s depth/length caps** (depth 6, 512 chars) without updating the matching `CHECK (length(css_path) <= 512)` constraint in `builder_issue_pins` — a longer path capture succeeds client-side and then fails the insert.
- **Lowering `MIN_CONFIDENCE`** without re-reading `resolve()`'s numbers: the `css`-disagrees (0.35) and `text`-only (0.45) branches are already below 0.5, so `highlight()` always refuses them today. Moving the threshold makes previously-dead branches start surfacing as `found: true`.

## Related

- `find-pinned-component` — consumes a resolved anchor to locate the source component; read it after this one when the task is fixing the underlying bug rather than the anchor mechanism.
- `sdk/src/types.ts`, `sdk/src/anchor.ts`, `sdk/src/picker.ts`, `sdk/src/detail.ts` — the client-side contract and rendering.
- `internal/issues/service.go`, `internal/issues/board.go`, `db/migrations/` — the server-side persistence contract.
