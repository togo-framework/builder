---
name: togo-deploy
description: Deploy a togo app with togo deploy — the built-in ssh push-and-build path or a plugin-routed provider (docker, kubernetes, gcp, aws, …) — read from the deploy block in togo.yaml. Use when asked to "deploy", "ship to the server", "release to staging", "set up deployment", or when debugging a deploy that ran green but did not serve.
---

# togo-deploy — Provider-routed deployment

```bash
togo deploy                      # the inline/default target
togo deploy staging              # a named target under deploy.targets
togo deploy --provider docker    # override the provider for this run
togo deploy --dry-run            # print the plan, change nothing
togo deploy --no-build           # (ssh) ship the existing build
togo deploy --remote-build       # (ssh) rsync the source and build on the server
```

**Always `--dry-run` first** on any target you have not deployed to in this session.
The plan tells you which target resolved, which provider will run, and what will be
overwritten. Reading it costs ten seconds; discovering you deployed to the wrong
target costs the rest of the afternoon.

## How the target resolves

`togo deploy` reads the `deploy:` block in `togo.yaml`. With no provider set — or
`provider: ssh` / `vps` — it uses the built-in push-and-build: build locally (frontend
+ Go binary), rsync the artefact to the server, run the restart command over ssh.

```yaml
# built-in ssh provider (default)
deploy:
  host: <ip-or-host>
  user: root
  path: /opt/{{project_name}}
  restart: systemctl restart {{project_name}}
```

Set `deploy.provider` (or `--provider`) to anything else and the deploy routes through
the `togo-framework/deploy` plugin and its matching `deploy-<provider>` driver —
docker, kubernetes, terraform, gcp, aws, digitalocean, azure, vultr, hetzner, ovh,
ubuntu, centos, debian. **Install the driver first:**

```bash
togo install togo-framework/deploy-docker
```

```yaml
deploy:
  provider: docker
  image: ghcr.io/<owner>/{{project_name}}:latest
  domain: <domain>
  options:
    compose: docker-compose.yml
```

Named targets for the environment matrix (`{{env_matrix}}`):

```yaml
deploy:
  default: staging
  targets:
    staging:    { host: …, user: …, path: …, restart: … }
    production: { host: …, user: …, path: …, restart: … }
```

Resolution order: an explicit `[env]` argument → `deploy.default` → the inline block →
a single target if only one exists → error. If none resolve, the error says exactly
that; add the block rather than guessing.

Environment overrides: `TOGO_DEPLOY_HOST`, `TOGO_DEPLOY_USER`, `TOGO_DEPLOY_PATH`,
`TOGO_DEPLOY_SSH_KEY`. Useful in CI. **Dangerous interactively** — an exported
`TOGO_DEPLOY_HOST` from an earlier experiment silently redirects your deploy. Check
the dry-run plan, which shows the resolved values.

## Before you deploy

- [ ] `verify` passed on the code being deployed — bundle scan, live render,
      behavioural assertion, OpenAPI probe
- [ ] `togo generate` output committed; `*.gen.go` clean
- [ ] Migrations for this release are known, and you know whether they have been
      applied to this target's database
- [ ] Secrets are in the target's environment, **not** in the artefact. Never bake a
      key into an image or rsync a `.env`.
- [ ] For production: this is `promote`'s job, and `{{promotion_mode}}` governs it.
      Do not `togo deploy {{prod_ref}}` around the promotion path.

## Migrations and deploys are separate steps

The deploy ships code. `togo migrate` changes the schema. Sequence them deliberately:

- **Additive migration** (new nullable column, new table) → migrate first, then deploy.
  Old code ignores the addition.
- **Destructive migration** (drop, rename, tighten a constraint) → deploy code that no
  longer uses the old shape first, confirm it is serving, migrate second.

A deploy that runs a destructive migration in the same step as the code change has no
safe rollback: reverting the code does not un-drop the column. Say so out loud before
doing it.

## Deploy is not done when the command exits

The command exiting zero means the artefact moved and the restart command ran. It does
not mean the service is serving. Probe it (Rule 28):

```bash
curl -s -o /dev/null -w '%{http_code}\n' <target-base>/healthz
curl -s <target-base>/openapi.json | jq '.paths | keys | length'
```

Then one behavioural call against the deployed target that exercises the change you
just shipped. If it fails, the deploy failed — regardless of the exit code.

## Debugging

| Symptom | Likely cause |
|---|---|
| `no deploy target configured` | No `deploy:` block, or the named target does not exist |
| Deployed to the wrong host | A `TOGO_DEPLOY_*` env var is set — check the dry-run plan |
| Green deploy, old code serving | Restart command did not restart, or the binary path differs from `deploy.path` |
| Green deploy, 502 | Service crashed on boot — check the unit/container logs. A provider that returns an error at boot (missing key, unreachable dependency) is failing correctly. |
| Green deploy, endpoint 404 | Route missing from the deployed build — check `openapi.json` on the target |
| `relation does not exist` after deploy | Migration not applied to this target's database |
| Provider not found | The `deploy-<provider>` driver plugin is not installed |
| Frontend serves stale assets | `--no-build` was used, or the build did not run before rsync |

## Rollback

Know the handle before you deploy:

- **ssh provider** — redeploy the previous commit: `git checkout <sha> && togo deploy <target>`
- **image-based providers** — redeploy the previous image tag. This is why tags must be
  immutable; never overwrite one.
- **Migrations do not roll back with the code.** Write the down-path before shipping a
  destructive migration, or accept that rollback is forward-only and say so.

## Hard refusals

- Deploying to `{{prod_ref}}` outside `{{promotion_mode}}`
- Deploying code that has not passed `verify`
- Baking secrets into an artefact or image
- Running a destructive migration inside the deploy step
- Reporting a deploy as successful before probing the live surface
- `--no-build` on a release deploy — that ships whatever happened to be in the build
  directory, which is not necessarily what is in git

## Related

- `promote` — the governed path to `{{prod_ref}}`
- `verify` — the pre-deploy gate and the post-deploy probe
- `togo-migrate` — sequencing schema changes around a deploy
- `togo-plugin` — installing the `deploy-<provider>` driver
