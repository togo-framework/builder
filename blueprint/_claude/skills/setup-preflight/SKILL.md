---
name: setup-preflight
description: "Triggered when running or extending the wizard's connectivity checks."
---

# setup-preflight — extending and running the wizard's environment probes

Procedure for running `togo-builder doctor` / the wizard's tooling-check step, and for adding or modifying a probe in `internal/runner/preflight.go` without breaking the two callers that depend on its exact shape.

## When to use this

- You are about to add, remove, or reorder a probe in the `probes` slice inside `Preflight()` (`internal/runner/preflight.go:88`).
- A user reports the wizard's "Tooling" step (`blueprint/_project/web/src/routes/setup.tsx`) blocking them, or `togo-builder doctor` exiting 1, and you need to reproduce and diagnose it.
- You're changing anything a probe shells out to (`gh`, `claude`, `git`, `go`, `node`, `pnpm`) — a flag rename or output-format change upstream can silently break parsing here.
- You're touching `Check`, `Report`, `Status`, or their `json` tags — these are hand-mirrored in `blueprint/_project/web/src/lib/setup.ts` with no shared schema or codegen.
- You need to verify a probe's Required/Warn/Fail classification actually matches what should block setup.

## Steps

1. Reproduce locally before changing anything:
   ```
   make doctor            # go run ./cmd/togo-builder doctor
   go run ./cmd/togo-builder doctor --json | jq .
   ```
   This is the exact code path both the CLI and `POST /api/builder/setup/preflight` (`internal/setup/wizard.go:153`) call — there's no separate wizard-only implementation to keep in sync.

2. To add a probe, write a `func(context.Context) Check` following the existing shape:
   ```go
   func checkFoo(ctx context.Context) Check {
       c := Check{Key: "foo", Label: "Foo is configured"}
       out, err := run(ctx, 10*time.Second, "foo", "--version")
       if err != nil {
           c.Status, c.Detail = StatusFail, err.Error()
           c.Remedy = "Install foo: https://..."
           return c
       }
       c.Status, c.Detail = StatusPass, strings.TrimSpace(out)
       return c
   }
   ```
   Always use the `run()` helper (`internal/runner/preflight.go:579`), never `exec.Command` directly — it applies the timeout, merges stdout/stderr (both `gh` and `claude` report failures on stderr), and forces `NO_COLOR=1 CLICOLOR=0` so `Detail` doesn't fill with ANSI codes.

3. Register it in the `probes` slice in `Preflight()`, positioned by cost: local/cheap checks first, anything that spends money or hits a network/API last. Today only `checkClaudeExec` (position 10) actually spends real cost — it runs a live `claude -p` prompt. Don't move a new network-dependent probe ahead of the free ones.

4. Decide `Required: true` deliberately. `Report.OK()` and `Report.Blocking()` (lines 57–75) only look at `Required` checks, and `OK()` gates whether the wizard advances past `StepPreflight` to `StepPlan` (`internal/setup/wizard.go:158`) and whether `doctor` exits 0 or 1. If failure is recoverable or the check can't yet run (e.g. `checkGHRepo` uses `StatusWarn` because a remote may not exist yet in a fresh project), don't mark it Required.

5. Always set `Remedy` on any non-pass path — it's the literal command or fix the operator runs, rendered as a `<code>` block in `setup.tsx` and printed to stderr by `doctor`. A Fail with no Remedy just pushes the operator to a support channel.

6. If the probe parses `claude`'s output, reuse `parseClaudeResult`/`fromJSONLine` rather than a raw `json.Unmarshal`: Claude Code can print warning prose (e.g. a trust-dialog notice) to stdout before the JSON payload, and `--output-format json` returns a JSON *array* of events, not one object.

7. Run the existing test suite and add a table-driven test alongside `parse_test.go` if you introduce new pure-logic parsing (like `compareSemver` or `parseClaudeResult`) — the probes themselves aren't unit-tested (they shell out), only their parsing helpers are:
   ```
   go test ./internal/runner/...
   ```

8. If you changed `Check`/`Report` JSON shape, update the mirrored TypeScript in `blueprint/_project/web/src/lib/setup.ts` (`Check`, `PreflightReport`) by hand — there is no shared schema between the Go struct and the TS interface.

9. Update the probe count if it changed: `README.md` says "run the 20 preflight probes" and the `doctor` Makefile comment says the same.

## Getting it wrong

- **Writing the check function but forgetting to add it to the `probes` slice.** It compiles, it's dead code, `doctor` never runs it, and the report silently doesn't include it. There's no registry or reflection — the slice literal at `preflight.go:88` is the only place probes are wired in.
- **Marking a recoverable check `Required: true`.** This blocks the entire wizard — the operator cannot reach the plan step — and flips the CLI exit code to 1. `checkGHRepo` and `checkNode` are intentionally `Warn`, not `Fail`/`Required`, for exactly this reason.
- **Using `exec.Command` instead of `run()`.** You lose the timeout (a hung subprocess blocks the wizard's HTTP request indefinitely) and the stdout/stderr merge, and a check that only reads stdout will silently report empty output for tools that write errors to stderr.
- **Hardcoding a `Check.ID`.** IDs are assigned by slice position (`c.ID = i + 1` at line 115) after every probe runs — never set it inside the probe function, and remember inserting a probe shifts every later ID, which changes what old `builder_setup_state.preflight` JSON rows mean (there's no versioning on that column).
- **Echoing secrets in `Detail`.** `checkClaudeAuth` deliberately never echoes the email because the report is stored in the database and served over HTTP; a new probe touching credentials or tokens must follow the same restraint.
- **Reordering a network/paid probe ahead of the cheap ones.** The comment on `Preflight()` explains the ordering exists so an obvious local failure (missing `git`, no commit identity) surfaces before the run pays for a live `claude -p` call.

## Related

- `internal/setup/wizard.go` — how `Report` gets persisted (`builder_setup_state.preflight` jsonb column) and how `step` gating uses `OK()`.
- `cmd/togo-builder/main.go` (`doctor` function) — the CLI's text/JSON rendering of the same `Report`.
- `blueprint/_project/web/src/lib/setup.ts` and `routes/setup.tsx` — the hand-mirrored TS types and the UI that lists checks with status color, remedy, and the "required" badge.
- `internal/runner/parse_test.go` — the pattern to follow for testing any new parsing logic pulled out of a probe.
- `db/migrations/0001_builder_init.sql` (`builder_setup_state` table) — the storage shape the report round-trips through.
