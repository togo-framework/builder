---
name: feedback-sdk
description: "Triggered when changing the embeddable widget or its bundle."
---

# feedback-sdk — rebuild, retest, recommit: the widget ships as a checked-in bundle, not source

The embeddable feedback widget (`sdk/`) compiles to a single IIFE (`sdk/dist/builder-sdk.js`) that is committed to git and embedded straight into the Go binary via `//go:embed all:sdk/dist` in `sdk_embed.go`. Editing `sdk/src/*.ts` changes nothing a running app serves until that bundle is rebuilt and the diff to `dist/builder-sdk.js` is part of the commit.

## When to use this

- About to edit anything under `sdk/src/` (`index.ts`, `anchor.ts`, `capture.ts`, `detail.ts`, `i18n.ts`, `icons.ts`, `markdown.ts`, `picker.ts`, `styles.ts`, `transport.ts`, `types.ts`).
- About to change `sdk/build.mjs`, `sdk/tsconfig.json`, or `sdk/package.json` (esbuild options, target, globalName, dependencies).
- About to touch anything that mirrors a value across the browser/server boundary: the per-kind attachment size caps, the accepted MIME list, or the `/api/builder/*` request shapes `transport.ts` sends.
- About to change `sdk_embed.go` or `providers.go`'s `/sdk/*` route (the `BUILDER_SDK_DIR` dev override, the embedded-FS fallback).
- Debugging a report that a widget change "isn't showing up" in a running app, or that a scaffolded project's feedback button 404s.
- About to add or rename anything the host page could collide with — this widget must be safe to drop into a customer's page with one `<script>` tag, with zero coordination.

## Steps

1. **Read `sdk/package.json` before assuming a package manager.** This package uses `pnpm` (`pnpm-lock.yaml` is committed) via `corepack enable`, not `npm`. Confirm before running install commands.

2. **Make the source change**, then typecheck it in isolation — `tsc` here only emits declarations, it does not bundle:
   ```
   cd sdk && pnpm typecheck
   ```
   `noUnusedLocals` and `strict` are both on in `sdk/tsconfig.json`; an unused import or an implicit `any` fails this step, not the bundler.

3. **Rebuild the bundle** and commit the result — this is the step that is easy to skip:
   ```
   cd sdk && pnpm build
   ```
   This runs `node build.mjs`, which bundles `src/index.ts` as a minified IIFE with `globalName: "BuilderIssues"` into `dist/builder-sdk.js`, and prints its size in kB. `git status` should now show `sdk/dist/builder-sdk.js` modified — if it doesn't, the source change had no runtime effect (dead code, or you edited a file that isn't reachable from `index.ts`'s import graph) and that is worth double-checking before moving on.

4. **Run the SDK test suite**, which recompiles `markdown.ts` on the fly and executes it under `jsdom`:
   ```
   cd sdk && pnpm test
   ```
   `sdk/src/markdown.test.mjs` exists specifically to assert `renderMarkdown` never uses `innerHTML` — issue bodies are attacker-controlled text rendered inside the HOST page's origin and session, so any change to `markdown.ts` that introduces raw HTML insertion is a stored-XSS regression, not a style nit. If you touch `markdown.ts`, read this test file first; the CI job's own comment states this is the reason the job exists (`.github/workflows/ci.yml`, the `sdk` job).

5. **Stage `sdk/dist/builder-sdk.js` alongside the source diff.** The Go side has no build step that regenerates it — `sdk_embed.go` embeds whatever bytes are on disk at `go build` time, and the CI `sdk` job builds its own throwaway copy inside the Actions runner; it never diffs that output against what's committed. A stale `dist/builder-sdk.js` next to fresh `src/*.ts` will pass CI and still ship the old widget.

6. **If you changed a client-visible attachment limit or accepted MIME type**, update the server mirror in the same change. `sdk/src/capture.ts`'s `LIMITS` (`image: 10 MB`, `video: 100 MB`, `file: 25 MB`) and `ACCEPT` list must match `maxImageBytes` / `maxVideoBytes` / `maxFileBytes` and `allowedMIME` in `internal/issues/attachments.go`. The comment at the top of that file names the exact bug this guards against: the reference widget capped browser uploads at 5 MB while the server accepted 25 MB from the board, so the SDK's own message ("the limit is X") lied in one direction. Grep both files for the value you're changing before you change either alone:
   ```
   grep -n "LIMITS\|ACCEPT" sdk/src/capture.ts
   grep -n "maxImageBytes\|maxVideoBytes\|maxFileBytes\|allowedMIME" internal/issues/attachments.go
   ```

7. **If you changed anything under `transport.ts`'s request/response shape**, confirm the matching handler still agrees: `create()` posts multipart to `POST /api/builder/feedback` with an `issue` JSON field (snake_case keys: `page_url`, `reporter_email`) plus repeated `attachments`/`attachment_kinds` fields; `listByRoute()` reads `GET /api/builder/issues?route=`. Both are mounted in `providers.go` under `k.Router.Route("/api/builder", svc.Routes)`. A field rename on one side without the other fails silently — `transport.ts` swallows a non-OK `listByRoute` response into an empty array rather than throwing.

8. **To iterate against a running app without a rebuild loop**, use the dev override instead of repeatedly running `pnpm build`:
   ```
   cd sdk && pnpm dev   # esbuild --watch, unminified, sourcemapped
   BUILDER_SDK_DIR=/path/to/repo/sdk/dist <run the app>
   ```
   `providers.go` checks `BUILDER_SDK_DIR` first and serves straight from that filesystem path, falling back to the embedded copy with a logged warning if the directory doesn't exist. This only works in this repo's own dev loop — a scaffolded project has no `sdk/` source tree at all, which is exactly why the embed exists (see the comment on `sdkFS` in `sdk_embed.go`).

## Getting it wrong

- **Editing `src/`, running `pnpm test`, and stopping there.** Tests pass, typecheck passes, and the commit still ships the old `dist/builder-sdk.js` because nothing in this workflow forces a rebuild — you have to run `pnpm build` and stage the output yourself. This is the single most likely mistake given the current repo layout (`dist/` is not gitignored and is not a CI-generated artifact; it's a first-class tracked file).
- **Assuming CI would catch a stale bundle.** It won't. The `sdk` job in `.github/workflows/ci.yml` runs `pnpm typecheck && pnpm build` in its own checkout and throws that build away — it never compares it to the committed `dist/builder-sdk.js`, and the `go` job just compiles whatever `go:embed` finds on disk. A stale bundle is a green build.
- **Changing one side of a mirrored constant.** The attachment size caps and MIME allowlist are declared twice on purpose (browser rejects early with a friendly message, server rejects authoritatively) — see step 6. `internal/orchestrator/allowlist_test.go` separately asserts `dist/builder-sdk.js` is never agent-writable at all, which is a different guard (against an agent hand-editing the compiled output) but is a sign of how deliberately this file's provenance is treated — it comes from `pnpm build`, never from a direct edit.
- **Reaching for `innerHTML` in `markdown.ts`.** `markdown.test.mjs`'s first test statically greps the source for the string `innerHTML` (comments stripped) and fails the build if it's present. This isn't a lint preference; issue bodies are rendered in the host page's origin with the host page's cookies, so unescaped HTML from a bug report is stored XSS against whoever is running the widget.
- **Forgetting the widget must not touch the host page's cascade.** `index.ts` mounts everything into a shadow root specifically so a React portal-style leak can't happen (see the comment above `host.attachShadow` — "a React portal inherits the host's cascade"). Adding a style or a DOM node outside `root` (the shadow root) — anything appended to `document.body` or `document.head` directly — needs the `OWN_MARKER` (`data-builder-sdk`) attribute from `anchor.ts`, or it becomes pinnable, screenshottable, and visible to `onOutsideClick`'s "is this inside our host" check, all of which assume `OWN_MARKER` is exhaustive.
- **Bundling a second copy of a large dependency.** `esbuild` bundles `html-to-image` straight into the IIFE (`build.mjs` has `bundle: true`, no externals). Adding another heavyweight dependency inflates every host page's `<script>` tag; check `build.mjs`'s printed kB size before and after a dependency change, not just that the build succeeded.

## Related

- `sdk_embed.go`, `providers.go` (`/sdk/*` route and `BUILDER_SDK_DIR`) — the Go side that serves this bundle.
- `internal/issues/attachments.go`, `internal/issues/service.go` — the server half of every limit and endpoint this SDK talks to.
- `internal/orchestrator/allowlist_test.go` — asserts agents can never write `dist/builder-sdk.js` directly.
- `.github/workflows/ci.yml`'s `sdk` job — the exact commands CI runs; mirror them locally before pushing.
