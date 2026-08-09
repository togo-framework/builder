---
name: blueprint-scaffold
description: "Triggered when changing what a fresh scaffold produces."
---

# blueprint-scaffold — keep the embedded template, the manifest, and the wizard's promises in sync

This is the procedure for changing anything a fresh `togo-builder new` run produces — the base app overlay, the `.claude/` operating system, or the bookkeeping that ties them together. The blueprint is not just files on disk: it is files on disk *plus* a manifest that claims to describe them exactly, and nothing currently checks that the two agree.

## When to use this

- You're adding, renaming, or deleting a file under `blueprint/_project/` or `blueprint/_claude/` (a rule, an agent persona, a skill, a hook, a config file).
- You're changing a `.tmpl` file's placeholders, or converting a static file to a template (or vice versa).
- You're adding a new Claude Code hook and need it to actually fire.
- You're touring `blueprint/_claude/manifest.json` because a generated project's `doctor`/upgrade story looks wrong.
- You're about to claim "the scaffold now does X" without having run `togo-builder new` against your changes.
- Someone reports a freshly scaffolded project has a `.claude/manifest.json` full of literal `{{...}}` placeholders, or a rule file that doesn't match what `manifest.json` or `rules/README.md` says should exist.

## Steps

1. **Locate the right overlay.** `blueprint/embed.go` embeds two trees: `Project` (`//go:embed all:_project`, applied over `togo new` output — Go/web app code, migrations, `.env.tmpl`) and `Claude` (`//go:embed all:_claude` — rules, agents, skills, hooks, the manifest itself). `internal/scaffold/scaffold.go`'s `New()` renders `Project` before `Claude` and says "files here win" — i.e. `_project` can overwrite anything `togo new` (the external CLI) already wrote, and `_claude` is written wholesale into `.claude/`. Pick the tree that matches what you're changing; do not add project runtime files under `_claude` or vice versa.

2. **Decide static vs. templated.** `render()` in `internal/scaffold/scaffold.go` walks the chosen `fs.FS` and copies every file byte-for-byte *except* ones whose name ends in `.tmpl`, which get parsed with `text/template` and executed against `tmplData{Name, Module, ProjectDir, DatabaseURL, AuthSecret, VaultKey, AdminEmail}` (the `.tmpl` suffix is then stripped from the output path). If your new file needs a project-specific value, name it `foo.md.tmpl` and reference only those seven fields — `{{.Name}}`, `{{.Module}}`, etc. Do **not** invent new placeholder syntax like `{{blueprint_version}}` or `{{sha256:...}}` and assume it will be substituted: `blueprint/_claude/manifest.json` does exactly this today, is *not* named `manifest.json.tmpl`, and as a result every scaffolded project ships the manifest with those braces still literally in it. Confirm this yourself before trusting the manifest's own README, which claims otherwise:
   ```
   go build -o /tmp/togo-builder ./cmd/togo-builder
   /tmp/togo-builder new drift-check --dir /tmp/drift-check --skip-db
   grep -n '{{' /tmp/drift-check/.claude/manifest.json
   ```

3. **Hooks need two edits, not one.** Any file under `blueprint/_claude/hooks/` ending in `.sh` is automatically written with mode `0755` by `render()` — that part is free. But a hook only *runs* if it's wired into the `hooks.<Event>.hooks[].command` array in `blueprint/_claude/settings.json` (each entry is `"$CLAUDE_PROJECT_DIR"/.claude/hooks/<name>.sh`, matching the existing `session-init.sh` / `guard-*.sh` / `post-commit-check.sh` entries). Adding the script alone ships an inert file.

4. **Reconcile `manifest.json` by hand — nothing else will.** `blueprint/_claude/manifest.json`'s own README block asserts that `togo builder doctor --claude` validates every `baseline` path exists and that `togo builder new` re-emits real `sha256` values. Neither exists in this codebase: `internal/runner/preflight.go`'s `doctor` only checks that the `claude` binary is installed and authenticated, and no code computes or substitutes a `sha256:` value anywhere. So the manifest's baseline/generated lists are pure hand-maintained prose, and they are currently **wrong** — verify before you add to the problem:
   ```
   python3 - <<'EOF'
   import json, os
   m = json.load(open('blueprint/_claude/manifest.json'))
   for e in m['baseline']:
       p = e['path']
       if p in ('CLAUDE.md', '.mcp.json'):
           continue  # produced by upstream `togo new`, not this blueprint
       full = os.path.join('blueprint/_claude', p[len('.claude/'):])
       if not os.path.exists(full):
           print('manifest entry with no file:', p)
   EOF
   ```
   When you rename or add a rule/agent/skill/hook file, add or fix its matching entry in the `baseline` (or `generated`) array in the same commit — same literal path, same directory it actually lives in.

5. **Respect the rule-numbering bands.** `blueprint/_claude/rules/README.md` documents the contract: `00–09` practice, `10–19` engineering, `20–27` safety, `28–29` deliberately empty, `30–42` autonomy, `43–49` reserved for the setup wizard (`.claude/rules/4[3-9]-*.md` is a reserved namespace per the manifest — a blueprint rule must never claim one of those numbers), `local/*` for operator overlays. `17`, `18`, `19` are placeholder files, not truly empty — each ships inert frontmatter (`alwaysApply: false`) reserved for wizard-generated project rules; don't repurpose them for a blueprint rule. Filename format is `NN-kebab-case-title.md` with an internal `# Rule NN: Title` heading and frontmatter `description` / `globs` / `alwaysApply`. If you add or rename a rule, update the table in `rules/README.md` too — it is the second place (besides the manifest) that names rule files, and it is currently the *accurate* one.

6. **Rebuild and scaffold a throwaway project — every time.** `scaffold.New` shells out to the real `togo` CLI for step 1 (confirm it's on `PATH` with `which togo`), then to `go mod tidy` / `go build ./...` inside the new project (step 5), which is the only gate that would catch a broken template render or an import that doesn't compile. Use `--skip-db` to skip `createdb`/`psql` if you don't need to verify migrations, but do **not** pass `--skip-tidy` for your final check — that's the step that actually proves the scaffold builds:
   ```
   go build -o /tmp/togo-builder ./cmd/togo-builder
   /tmp/togo-builder new smoke-test --dir /tmp/smoke-test --skip-db
   ```
   Read the `Steps` it prints (`base app scaffolded`, `builder overlay applied`, `.claude operating system written`, `go build ./... passes`, ...) and inspect the actual output tree, not just exit code 0.

7. **Run the existing tests and add one if you touched trust/write semantics.** `go test ./internal/scaffold/...` covers `trustWorkspace` (amend-not-replace of `~/.claude.json`, refusing to clobber unparsable JSON) — there is no scaffold-render or manifest-consistency test today, so a change to `render()`'s template/copy logic or to the manifest structure has no regression coverage; if you touch either, that gap is yours to close or explicitly accept.

## Getting it wrong

- **Adding a file to `blueprint/_claude` and forgetting the manifest entry.** This has already happened: `.claude/skills/vault-secrets/SKILL.md` exists on disk, fully written, and has zero entry in `manifest.json`'s `baseline` or `generated` arrays. It ships to every new project invisibly, undocumented by the file whose entire job is to document it.
- **Renaming a rule file without renaming its manifest entry.** Six rule files have already drifted this way — the file on disk and the manifest's `path` disagree only in the filename: `16-security-baseline.md` (manifest says `16-security-checklist.md`), `23-schema-change-workflow.md` (manifest: `23-migration-mirrors-live-db.md`), `26-deploy-never-sets-env.md` (manifest: `...-env-vars.md`), `28-verify-before-closing.md` (manifest: `28-verify-live-before-closing.md`), `33-human-only-work.md` (manifest: `...-work-classes.md`), `41-external-communication.md` (manifest: `...-human-only.md`). `rules/README.md` matches the actual filenames, so the manifest is the stale one — don't assume the manifest is ground truth just because its README says it is.
- **Naming a file `.tmpl` and reaching for a field that isn't in `tmplData`.** `tmplData` only has `Name, Module, ProjectDir, DatabaseURL, AuthSecret, VaultKey, AdminEmail`. `{{blueprint_version}}`, `{{generated_at}}`, `{{sha256:<path>}}` are not template actions this code understands — `text/template` would fail to parse `{{sha256:.claude/foo}}` outright (colon isn't valid inside `{{ }}` without a defined function), so simply appending `.tmpl` to `manifest.json` today would break the scaffold rather than fix it. The rendering logic these placeholders imply does not exist yet; don't build on top of it as if it does.
- **Adding a hook script and stopping there.** The `.sh` → `0755` behavior in `render()` makes people assume dropping a file into `blueprint/_claude/hooks/` is sufficient. It silently does nothing until it's also added to the matching event array in `blueprint/_claude/settings.json`.
- **Claiming the scaffold works from reading the diff.** `scaffold.New` calls out to two external binaries (`togo`, `go`) and, unless `--skip-db`, `createdb`/`psql`. A template that parses fine and a `go vet` that passes on the *blueprint's own* Go files says nothing about whether the *rendered* project compiles — that only happens inside `go build ./...` on the scaffolded output (step 6 above). Skipping that step and reporting success is the most common way this goes wrong.
- **Writing prose into a manifest-owned registry file instead of data.** The manifest's own rule 5 says generators write data into `.claude/project.json`, `.claude/team.yaml`, `.claude/autonomy.yaml`, `.claude/hook-config.json`, `.claude/forbidden-imports.json`, and touch `CLAUDE.md` / `hooks/README.md` only inside their marker blocks. `internal/fleet/manifest.go` is the one place that currently implements a piece of this contract (the `<!-- builder:generated — owned by fleet-builder... -->` marker and `writeIfSafe`, for agents/skills generated *after* scaffold time) — note its marker string is deliberately different from the `builder:baseline` / `builder:generated` / `builder:operator` block markers the manifest's `markerFiles` section describes for `CLAUDE.md`; nothing in this repo currently writes those blocks, since `CLAUDE.md` itself comes from the external `togo new`, not from `blueprint/`. Don't conflate the two marker schemes when extending either.

## Related

- `internal/scaffold/scaffold.go` — `render()`, `trustWorkspace()`, and the numbered step sequence in the package doc comment; read it before editing the overlay.
- `internal/scaffold/trust_test.go` — the only existing scaffold test; extend it (or add a sibling `render_test.go`) if you change write semantics.
- `blueprint/_claude/rules/README.md` — the authoritative band/numbering table; update alongside any rule file change.
- `blueprint/_claude/rules/10-generator-first-sequence.md` — the generated *project's own* generator-first workflow; useful context for what the scaffolded rules are teaching an agent to do next.
- `internal/fleet/manifest.go` and `internal/fleet/generate.go` — the runtime fleet generator that writes into an *already-scaffolded* project's `.claude/agents` and `.claude/skills`; a related but distinct write path from the blueprint itself, worth knowing about if your change touches the generated-file ownership contract.
- `cmd/togo-builder/main.go` — `newProject()`, the CLI entry point that calls `scaffold.New`; check its flag parsing if you're adding a new `Options` field.
