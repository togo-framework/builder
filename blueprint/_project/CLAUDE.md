<!-- builder:baseline:start v{{blueprint_version}} — DO NOT EDIT BY HAND -->
<!--
  This block is owned by the togo builder blueprint and is REPLACED WHOLESALE on
  `togo builder upgrade`. Anything you type between these two markers is lost.
  Your notes go in the builder:operator block at the bottom of this file.

  Three owners, three disjoint blocks, so three writers never collide:
    builder:baseline   the blueprint       (upgrade rewrites it)
    builder:generated  fleet-builder       (fleet regeneration rewrites it)
    builder:operator   you                 (nothing ever rewrites it)
  A writer that cannot find its markers appends a fresh block and warns. It never
  rewrites this file wholesale.
-->

# {{project_name}}

{{one_line}}

## What this is

{{identity}}

## What this is NOT

{{non_goals}}

Non-goals are load-bearing. If a task requires something on this list, that is
not a task — it is a question for a human.

## Stack

togo (Go · sqlc · Atlas · chi · REST/OpenAPI · GraphQL) · TanStack Router + React · {{db}}{{extras}}

- **Plugins self-register** via `init()` + `togo.RegisterProviderFunc(name, priority, fn)`. There is no central wiring file to edit.
- **Generated code** — `*.gen.go`, `**/gen/**`, `web/src/**/*.gen.ts` — is **never hand-edited**. Change the source of truth and regenerate. The next `togo generate` silently reverts a hand-edit; the bug comes back a week later with nothing in the history to explain it.
- **Hand-written SQL lives only in `db/queries/**`.** togo *is* sqlc + Atlas + an ORM; SQL anywhere else is invisible to codegen, untyped and unmigrated.
- **Never `CREATE TABLE IF NOT EXISTS` from service code.** In a framework where every plugin boots itself, this is a one-line habit that makes the migration history a lie. It is the single most likely violation in this codebase.
- **`web/` never opens a database connection.** Everything goes through the generated API client.

## Commands

| | |
|---|---|
| dev | `togo dev` |
| codegen (**the compile gate**) | `togo generate` — sqlc → gqlgen → OpenAPI. Must leave the tree **diff-clean**. |
| migrate | `togo migrate` |
| test | `go test ./... && pnpm -C web test` |
| build | `go build ./... && pnpm -C web build` — **build, not just typecheck** |
| format / lint | `togo format && togo lint` |
| deploy | `{{deploy_command}}` |

## Layout

```
{{tree}}
```

## Environments

{{env_matrix}}

Promotion: **{{promotion_mode}}** · trunk `{{trunk}}` · production ref `{{prod_ref}}` — see Rule 27.

## Autonomy

Level: **{{autonomy_level}}** — the full grant is `.claude/autonomy.yaml`, and that file
is authoritative over everything below.

- **MAY without asking:** {{may_summary}}
- **MUST ask first:** {{must_ask_summary}}
- **Cost ceiling:** {{per_run_budget}}/run · {{daily_budget}}/day. Hitting a ceiling **aborts and reports** — it never quietly retries on a cheaper model.
- **Blast radius:** {{max_files}} files · {{max_lines}} net lines · **one issue per run**.
- Print the active level before your first tool call.

## The rules

`.claude/rules/` — every rule is `alwaysApply`. Read them; they are short. The ones
that cost the most when broken:

| | |
|---|---|
| **22** | never wipe a database — no override, no `--force`, no exceptions |
| **20 / 21 / 23** | all DDL *and* DML via migrations; never hand-author a migration |
| **28** | verify **live** before closing — a green build is not done |
| **31** | never merge your own work |
| **34** | secrets are referenced by name, never read, never printed |
| **35** | blast radius — exceeding a cap is a signal to stop, not a failure to push through |
| **37** | a run with no journal entry is not done, and its PR does not merge |
| **38** | no self-modification of `.claude/**` during a feature run |

Operator overlays live in `.claude/rules/local/` and may only **tighten** a baseline
rule. Any active overlay is printed at session start.

## The team

`.claude/team.yaml` — the roster, with each agent's areas and skills. Delegate by
name. **Never use `general-purpose` for implementation work** (Rule 09); if no
agent fits, stop and say so rather than improvising one mid-run.

## Skills

`.claude/skills/` — {{skill_list}}

<!-- builder:baseline:end -->

<!-- builder:generated:start — owned by fleet-builder -->
<!--
  Project-specific knowledge, generated from the plan you handed the setup wizard:
  the domain model, each surface's boundary, integrations and their gotchas.
  Regenerated when the fleet is regenerated. Do not hand-edit — edit the plan and
  regenerate, or put durable corrections in the operator block below.
-->

{{project_context}}

<!-- builder:generated:end -->

<!-- builder:operator:start — yours, never touched by any agent -->
<!--
  Free-form. Neither the blueprint, the wizard, nor any agent writes here — not on
  upgrade, not on regeneration. Put the things you find yourself repeating: the
  gotcha that costs an hour, the person to ask, the thing that looks broken and
  isn't.
-->

<!-- builder:operator:end -->
