---
description: "When a deployed resource is broken, fix the root cause at its source and redeploy — never patch the running deployment to make it work."
globs: "*"
alwaysApply: true
conditional: iac declared
---

# Rule 25: Fix the Root Cause at the Source — Never Hot-Patch the Live Deploy

> **Conditional rule.** Applies when `{{project_name}}` declares infrastructure-as-code. Without an IaC stack, the "source of truth" for a deployment is the image build plus the configuration store, and the forbidden list below still applies to everything except the IaC rows.

**When a deployed resource is broken, you fix the root cause in the code that owns it — the IaC definition, the manifest that IaC manages, the Dockerfile, or the image build — and then redeploy. You never patch the running cluster or service to "make it work".**

## The Rule

If a pod crashes, a service misbehaves, a configuration value is wrong, or an image is broken:

1. **Diagnose the root cause.** Read the logs. Reproduce it. Inspect the image.
2. **Fix it in the source of truth** — the IaC code, the IaC-managed manifest, the Dockerfile, or the build — whichever actually *owns* the broken thing.
3. **Redeploy** through the sanctioned path: apply the IaC, rebuild and push the image, run the deploy pipeline.
4. **Verify the fix live** (Rule 28).

This is Rule 24 applied to *fixes*: a fix that exists only on the running cluster is drift, and the next deploy erases it. The cruelty of this particular drift is its timing — it erases your fix on the deploy where you were finally confident, and re-presents the original bug as a mysterious regression.

## Forbidden — hot-patching the deployment

- `kubectl edit` / `kubectl patch` / `kubectl set env` on a live workload to fix it
- `kubectl apply -f` with a hand-tweaked manifest that is not the IaC-managed one
- Any cloud-CLI `services update` that changes env, secrets, or image outside the IaC
- `docker exec` into a running container to mutate it (install a package, edit a file, restart a process)
- Editing a ConfigMap or Secret in the cluster instead of in the IaC
- Building and pushing an image containing an ad-hoc local tweak that is not committed to the Dockerfile or the build definition
- Scaling, cordoning, or annotating a workload as a permanent fix rather than a momentary mitigation

## Required — fix at the source

| Symptom | Wrong (hot-patch) | Right (root cause at the source) |
|---|---|---|
| Database pod CrashLoops on a data-directory / mount mismatch | `kubectl edit statefulset` to change the mount | Fix the volume mount and data-dir env in the database IaC module, then apply |
| Container missing a dependency or running the wrong entrypoint | `docker exec` in and install it | Fix the **Dockerfile**, rebuild, push, redeploy |
| A service points at a bad upstream URL | `kubectl set env` | Fix the value in the configuration source of truth (Rule 26), re-apply |
| A deployed service runs the wrong image or secret binding | A CLI `services update` | Fix the module inputs, re-apply |
| `{{project_name}}` returns 500 because a migration never ran | Exec in and run the SQL | Ship the migration (Rule 23), apply it with `togo migrate`, redeploy |
| A plugin fails to register at boot | Comment out the plugin on the live pod | Fix the provider registration in code, rebuild, redeploy |

## Reproduce locally before changing anything

When the cluster's log path is unavailable — a private cluster with a broken control-plane proxy, a crash loop too fast to capture, a slow feedback cycle — **reproduce the failure locally** before touching the IaC. Run the image with `docker run` using the same env and volume shape, or run `{{project_name}}` against a local database with the same configuration, and find the *exact* error.

Then fix it at the source and redeploy.

Do not guess-patch the live resource. A guess-patch that appears to work teaches you a false root cause, and you will carry that false cause into the IaC change, ship it everywhere, and debug the real one later with a wrong hypothesis already committed.

## Why

The entire repository exists so that one apply plus one image build is the single reproducible path to any environment in `{{env_matrix}}`. A live hot-patch:

- Is invisible to the next operator and to the next deploy.
- Breaks parity between environments — the thing you tested is no longer the thing that ships.
- Converts a reproducible system into a snowflake, one small justified exception at a time.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint was distilled from, where the reproducible deploy was a contractual deliverable and every hot-patch invalidated it. The pattern was always the same: a patch applied under time pressure, verified working, never written down, and then silently reverted by the next routine deploy — at which point the original incident recurred and was investigated from scratch, because the fix that had worked was no longer anywhere in the system to be found.

## Related

- Rule 24 — IaC mirrors infrastructure (this is the fix-time corollary)
- Rule 26 — the deploy never sets configuration
- Rule 22 — never wipe; a reset is never an acceptable "fix" for a broken deployment
- Rule 28 — verify before closing; a redeploy is not evidence, a live probe is
