# What can the `togo-builder` binary do?

```
usage: togo-builder <new|app|doctor|seed|version>
```

Verified: `cmd/togo-builder/main.go:27-44`.

The binary is built as `togo-builder` and dropped on PATH, which is what makes
`togo builder <verb>` work with **no changes to `togo-framework/cli`** — its
`cmd/root.go` `Execute() -> tryExternalPlugin` resolves `togo-<name>`. All three
of these are the same program:

```bash
togo-builder <verb>
togo builder <verb>
npx create-togo-builder@latest <name>   # the `new` path, without Go installed
```

---

## `doctor`

```bash
togo-builder doctor
togo-builder doctor --json
```

Runs 20 preflight probes. `--json` emits the same report the setup wizard
consumes. Verified: `main.go:32-33`, `:110-118`.

`gh auth`, `claude auth` and a **live `claude -p` execution probe** are
non-skippable. The live probe is why `doctor` is not free — it makes a real
model call.

`BUILDER_PREFLIGHT_MODEL` overrides the model used
(`internal/runner/preflight.go:323`).

The same report is served at `GET /api/builder/preflight` (`providers.go:496`).

---

## `new` — scaffold a project

```bash
togo-builder new acme
togo-builder new acme --dir ./work --module github.com/acme/acme --admin you@acme.co
```

```
usage: togo-builder new <name> [--dir D] [--module M] [--admin E]
                               [--plugin-path P] [--skip-db] [--force]
```

Full flag list, verified `main.go:164-181` (two are absent from the usage
string):

| Flag | `scaffold.Options` field |
|---|---|
| `--dir D` | `Dir` |
| `--module M` | `Module` |
| `--admin E` | `AdminEmail` |
| `--db-name N` | `DBName` — **not in the usage string** |
| `--plugin-path P` | `PluginPath` |
| `--skip-db` | `SkipDB` |
| `--skip-tidy` | `SkipTidy` — **not in the usage string** |
| `--force` | `Force` |

Scaffolds from the embedded blueprint: `blueprint.Project`
(`blueprint/_project`) and `blueprint.Claude` (`blueprint/_claude`), both
embedded via `blueprint/embed.go`.

The scaffolder also copies `db/migrations/*.sql` into the new app's
`internal/db/schema/`, because `togo install` does not yet parse the
`migrations:` key in `togo.plugin.yaml`.

---

## `app` — custom apps

```
usage: togo-builder app <new|list> …
```

```bash
togo-builder app new changelog --title "Changelog" --title-ar "سجل التغييرات"
togo-builder app new metrics --go --module github.com/acme/product
togo-builder app list
```

Flags verified `cmd/togo-builder/app.go:15-104`. Full table and the manifest
contract: [`custom-apps.md`](custom-apps.md).

`app list` prints what would load **and what was rejected** — the same
information served at `GET /api/builder/apps/_health`.

---

## `seed`

```bash
togo-builder seed admin [--email you@example.com] [--force]
```

Verified: `main.go:55`. Idempotent — togo ships no way to get a first admin, so
this is it. There is deliberately no default password and no
generated-and-printed password; supply `BUILDER_ADMIN_PASSWORD`, preferably on
stdin.

---

## `version`

```bash
togo-builder version
```

Backed by `version.go`.

---

## Building the binary

From the repository root:

```bash
go build ./...
go build -o togo-builder ./cmd/togo-builder
```

`builderd/` is a separate nested module and does not build from a bare clone
today — see [`run-standalone.md`](run-standalone.md#building-from-a-clone).

The `Makefile` at the repo root and `.goreleaser.yaml` carry the release build.

---

## Tests

```bash
go test ./internal/... ./customapps/
```

The seeder test needs a real database and skips without one:

```bash
createdb builder_dev
psql -d builder_dev -f db/migrations/0001_builder_init.sql
TEST_DATABASE_URL="postgres://$USER@localhost:5432/builder_dev?sslmode=disable" \
  go test ./internal/db/seeders/
```

Do **not** run a real agent or a fleet generation to test something. Both make
real model calls and cost real money.
</content>
</invoke>
