---
description: "Configuration has exactly one source of truth and the deploy is not it — a deploy ships an image, never environment or secret bindings."
globs: "*"
alwaysApply: true
---

# Rule 26: The Deploy Never Sets Configuration

**Configuration has exactly one source of truth, and the deploy is not it. A deploy of `{{project_name}}` ships an image — a version, a tag, a digest — and nothing else. It must never pass environment variables, secret bindings, feature flags, or connection strings at deploy time. Any deploy step that carries configuration overwrites the real source of truth and causes drift the moment it runs.**

## The Rule

| Operation | Allowed? |
|---|---|
| Deploy that passes **only** an image tag or digest | **YES — the correct and only deploy path** |
| Deploy that also sets env vars (`--set-env-vars`, `-e`, `env:` overrides in the deploy step) | **NO — replaces the managed configuration wholesale** |
| Deploy that *updates* a subset of env vars | **NO — partial overwrite is still drift, and harder to spot** |
| Deploy that binds secrets (`--set-secrets` and equivalents) | **NO — overwrites the managed secret bindings** |
| Changing configuration in its declared source of truth, then applying | **YES — the only path to change configuration** |
| Rotating a secret **value** in the secret store, binding unchanged | **YES — see below** |

## Where configuration actually lives

Exactly one of these owns the environment of a `{{project_name}}` deployment, and the project must pick one and never straddle:

- **IaC-declared** (when an IaC stack is present) — the service's env map and secret-binding map live in the IaC module for each env in `{{env_matrix}}`. Changing configuration means editing the map, planning, applying.
- **Store-declared** (when there is no IaC) — a single configuration store or committed per-env file is authoritative, and the runtime reads it at boot.

Either way, the deploy pipeline reads nothing and writes nothing. It hands over an image and stops.

## Why the deploy is the worst possible place for it

A deploy runs on every push. Configuration changes rarely. Put them in the same step and the frequent operation silently resets the rare one:

- **The deploy is not reviewed as configuration.** A one-line change to a pipeline YAML is reviewed as a pipeline change. It is in fact a production configuration change, applied everywhere, immediately, with no plan output.
- **It overwrites what it does not know about.** A deploy that sets four variables removes the fifth that someone added properly. Nobody notices until the feature that needed it fails, hours later, in a way that looks unrelated to the deploy.
- **It makes configuration a function of pipeline history.** "What is the value of this variable in stage?" becomes answerable only by reading the last pipeline run that touched it, rather than by reading a file.
- **It creates a repair ritual.** Once a pipeline sets configuration, every deploy needs a manual configuration repair afterwards. Teams normalize the repair instead of removing the cause.

## How to change configuration

1. Edit it in its declared source of truth for the target env.
2. Preview the change (`plan`, `diff`, or the store's equivalent) and confirm the diff is only what you intended.
3. Apply it.
4. **Read it back from the running service** and confirm the value landed — describe the service, or hit a health/config endpoint that reports non-secret configuration.
5. Do not redeploy the image for a plain configuration change. Configuration changes and image changes are separate operations with separate blast radii; conflating them is how a bad config change gets blamed on a good image.

## Rotating a secret value

Rotating the *value* of a credential — a signing key, an API token, a database password — is legitimately configuration-free work. The binding does not change; only the stored value does. Write the new version into the secret store, let the runtime pick it up on its next start, and change nothing in the IaC or the deploy.

Adding or removing a secret *binding* is a configuration change and follows the section above.

## Enforcement

Before merging any change to a deploy pipeline (workflow, build config, deploy script):

- [ ] Does the deploy step set environment variables in any form? → **remove it**, and move those values to the declared source of truth
- [ ] Does it bind secrets? → **remove it**, and declare the binding
- [ ] Does it write a `.env` file into the image or the container at deploy time? → **remove it**
- [ ] Does it pass anything other than an image reference and the target service? → justify it in the PR, or remove it

A CI check greps deploy steps for configuration-setting flags and fails the build on a match.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint was distilled from. Deploy triggers there passed inline environment variables, so **every image push reset the service's environment to whatever had been hardcoded in the trigger months earlier** — losing the auth service URL, the message-bus address, the storage key, and every value that had since been set properly. The team's response was to normalize a manual environment repair after every deploy, which worked until the day someone forgot and sign-in returned 500 in production.

The same mechanism made a database wipe worse: a deploy-time `AUTO_MIGRATE=true` set by a pipeline step turned a restart into a destructive re-initialization (Rule 22). The configuration nobody reviewed was the configuration that did the damage.

## Related

- Rule 24 — IaC mirrors infrastructure (this is the configuration-shaped instance of it)
- Rule 25 — fix at the source, never hot-patch
- Rule 22 — never wipe; the flag that worsened the wipe arrived through a deploy step
- Rule 28 — verify before closing; read the configuration back off the running service as evidence
