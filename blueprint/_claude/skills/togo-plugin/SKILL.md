---
name: togo-plugin
description: Install, build, and debug togo plugins — self-registering kernel providers wired by init() and togo.RegisterProviderFunc. Use when asked to "install a plugin", "add a provider", "write a plugin", "why isn't my plugin loading", or when working with togo.plugin.yaml, internal/plugins/plugins.gen.go, or a provider's boot order.
---

# togo-plugin — Providers that wire themselves

## How a plugin becomes active

There is no registry file you edit, no `Register()` call you add to `main`. The chain is:

1. `togo install <owner>/<repo>` fetches the plugin and reads its `togo.plugin.yaml`
2. The installer adds a **blank import** of the plugin's backend package to
   `internal/plugins/plugins.gen.go`
3. Importing the package runs its `init()`
4. `init()` calls `togo.RegisterProviderFunc(name, priority, fn)`
5. The kernel calls `fn(k)` at boot, in priority order

```go
package plugin

import "github.com/togo-framework/togo"

const Name = "example"

func init() {
	togo.RegisterProviderFunc(Name, togo.PriorityLate, func(k *togo.Kernel) error {
		svc := example.New(k)
		k.Router.Get("/api/example/ping", svc.Ping)  // mount routes on the kernel router
		k.Set(Name, svc)                             // expose via the kernel container
		if k.Log != nil {
			k.Log.Info("plugin active", "plugin", Name)
		}
		return nil
	})
}
```

**`plugins.gen.go` is generated.** Do not hand-edit it — see `togo-generate`. If a
plugin needs to be present, install it; if it needs to be gone, uninstall it.

## Installing

```bash
togo install <owner>/<repo>      # a Go plugin from GitHub
togo install agent:<name>        # an agent  → .claude/agents/<name>.md
togo install skill:<name>        # a skill   → .claude/commands/<name>.md
togo install <name>              # bare name: auto-detects agent/skill, else plugin
togo install claude              # the togo Claude Code plugin
togo install --list              # everything installable
togo plugin:list                 # what this project has installed
```

`togo install` also merges the plugin's `.claude/` tree (agents, skills, hooks, rules)
into this project's `.claude/`. **Read what it merged before trusting it** — an
installed rule now governs your agents.

## The manifest

```yaml
name: example
description: One line.
priority: 92            # boot order — higher runs later

backend:
  package: github.com/owner/example

frontend:
  dir: web              # injected into the host project's frontend

claude: .claude         # the agent kit merged into the host's .claude/

commands:
  - example             # built as togo-example on PATH → enables `togo example <verb>`

env:
  - DATABASE_URL
  - EXAMPLE_API_KEY
```

The installer currently unmarshals only `name`, `backend.package`, `frontend.dir`,
`claude`, and `env`. Other keys — including a `migrations:` block — are declared for
forward compatibility and are **not** honoured yet. Do not rely on the installer to
apply your plugin's migrations; ship them so the host applies them via `togo migrate`.

## Boot order and priority

Priority decides when your provider function runs relative to everyone else's.

- Register **late** when you depend on something else being mounted first — auth
  middleware, for example, must exist before you mount routes that use it.
- Register **early** when you *are* the thing others depend on.
- A provider that reads another provider out of the kernel container must boot after
  it. If `k.Get("auth")` returns nil, your priority is wrong — do not defensively
  nil-check your way around a boot-order bug.

Return an error from the provider function for anything that makes the plugin
structurally unusable — a missing or malformed encryption key, an unreachable required
dependency. **Fail at boot, loudly.** Booting green with a broken subsystem means the
failure surfaces later, at the worst possible moment, to someone who did not cause it.

Register the provider's *name* and health surface from day one even if the behaviour
lands in a later phase — that way boot order, disable-by-env, and the metadata
contract are exercised from the first commit rather than being discovered wrong at
integration time.

## Writing a plugin

```bash
togo make:plugin <name>
```

Shape it like a mini app: a self-registering backend provider, an injectable frontend
under `web/`, its own `internal/` packages, and a `.claude/` kit.

Rules that apply inside a plugin exactly as they do in an app:

- **No DDL from the provider function.** A plugin that `CREATE TABLE IF NOT EXISTS`es
  its own tables at boot is the exact failure this project's migration rule exists to
  prevent — and it is what togo's own auth and autopilot plugins do today. Ship
  migrations; let the host apply them with `togo migrate`.
- **No SQL outside query files.** sqlc applies inside the plugin too.
- **No database connection from `web/`.** The injected frontend calls `{{api_base}}`.
- **Namespace everything.** Routes under `/api/<plugin>/…`, tables prefixed
  `<plugin>_`, container keys prefixed with the plugin name. You are sharing a router,
  a database, and a container with every other plugin.
- **Make it disableable.** An env flag that turns the provider into a no-op (registered,
  inert) is worth more than a clean uninstall path when something is on fire.

## Authorization inside a plugin

togo auth's `Can()` is an **exact string match**. `permissions = ["*"]` grants the
literal permission `"*"` and nothing else — it denies everything, which reads as a
broken plugin rather than as a permissions bug.

Grant concrete permission strings (`example.read`, `example.write`). If you need
wildcard semantics, implement the wildcard expansion yourself in the plugin's authz
layer and test the denial path explicitly — a permission check that has only ever been
tested with an allowed call has not been tested.

## Debugging

| Symptom | Cause |
|---|---|
| Plugin does nothing, no log line | Not blank-imported. Check `internal/plugins/plugins.gen.go`; re-run `togo install` |
| `init()` runs, provider never called | Registration name collides with another plugin |
| `k.Get("<dep>")` is nil | Your priority is too early |
| Routes 404 | Mounted after the router was sealed, or path collides with another plugin |
| Every authorized call is denied | `permissions=["*"]` — exact match, see above |
| Works locally, missing in the deployed build | The generated import file was not committed |

Confirm what is loaded:

```bash
togo plugin:list
curl -s {{api_base}}/openapi.json | jq '.paths | keys' | grep example
```

## Hard refusals

- Hand-editing `internal/plugins/plugins.gen.go`
- DDL from a provider function or any boot path
- A provider that swallows a fatal dependency error and boots anyway
- Un-namespaced routes, tables, or container keys
- A database connection in a plugin's `web/`

## Related

- `togo-generate` — the generated import file
- `togo-migrate` — shipping a plugin's schema correctly
- `togo-deploy` — plugin-provided deploy drivers
