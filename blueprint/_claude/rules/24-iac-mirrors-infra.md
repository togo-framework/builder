---
description: "Any change to live infrastructure must be reflected in the IaC code in the same change set — drift between live state and IaC is forbidden."
globs: "*"
alwaysApply: true
conditional: iac declared
---

# Rule 24: IaC Mirrors Infrastructure — Update the Code in the Same Change Set

> **Conditional rule.** This rule applies only when `{{project_name}}` declares infrastructure-as-code. If the wizard recorded no IaC stack, this file is omitted from the scaffold entirely and Rules 25 and 26 collapse to their configuration-only halves.

**Any change to live infrastructure must be reflected in the IaC code in the same change set, before the work is reported done. Drift between live state and IaC is forbidden.**

## The Rule

If you change anything on a cluster, a database, a cloud project, a secret, a DNS record, a load balancer, an IAM binding, or any other cloud resource — you must update the matching IaC code, or document why an IaC-managed equivalent does not yet exist, **in the same task**.

This applies to changes made through any imperative path:

- Cluster CLIs: `kubectl apply` / `patch` / `delete`, `helm install` / `upgrade` / `uninstall`
- Cloud CLIs: any `create` / `update` / `delete` / `add` / `patch` subcommand
- Cloud console UI clicks
- A vendor dashboard toggle
- Any other tool that mutates a resource without going through the IaC apply

## What "Mirrors" Means

| You did this | You also must do this |
|---|---|
| `kubectl patch <workload> -p ...` | Update the resource definition in the IaC module that owns it, with the same change |
| `helm upgrade <release> ...` | Update the values file **and** the release definition the IaC reads |
| Added a secret version by hand | Update the secret resource, or document the value-only rotation in a comment beside it (value rotation is legitimately IaC-free — see Rule 26) |
| Deleted a cluster / service / project | Mark it removed in the matching env directory, or delete the env definition |
| Created a namespace, bucket, topic, or queue by hand | Add the corresponding resource to the module |
| Added an IAM role binding | Add the binding resource |
| `kubectl apply -f some-new.yaml` | Convert the manifest into an IaC-managed resource or a chart reference, and commit it |

## Why

The single source of truth for `{{project_name}}`'s infrastructure is the IaC code. The contract it exists to uphold is: **a fresh apply against a new, empty account reproduces the running system.** Drift breaks that contract silently.

If you patch live and skip the IaC, you have created a change only the cluster knows about. Either the next apply rolls your fix back, or — worse — the apply succeeds and the new environment quietly gets the old configuration, because the fix was never written down. You find out in the environment where it costs the most.

## When You Cannot Mirror Right Away

If the change is genuinely an emergency — a production outage or a security incident requiring a sub-30-second response:

1. Make the live fix.
2. **Immediately** open a follow-up issue tagged `tech-debt:iac-drift` describing exactly what was changed, on which resource, in which environment.
3. Add a `TODO` comment in the closest existing IaC file pointing at that issue.
4. **The drift must be resolved within the same working day.**

This is the only acceptable form of drift, and it must be visible. An emergency patch that is not immediately followed by steps 2–4 is not an emergency patch; it is a Rule 24 violation with a good excuse.

## Checklist Before Closing

Before closing any issue or reporting done on infrastructure work:

- [ ] Did I run any cluster mutation (`kubectl apply / patch / delete`)?
- [ ] Did I run any `helm install / upgrade / uninstall`?
- [ ] Did I run any cloud-CLI `create / update / delete`?
- [ ] Did I click anything in a cloud console or vendor dashboard?

If yes to ANY → did I update the IaC code? If no → **not done**.

## Anti-patterns

- **"Quick fix, I'll write the IaC later"** — later never comes. Write it now, or open the tech-debt issue now.
- **"The IaC doesn't manage this resource yet, so I'll skip it"** — wrong. Adding the resource *is* part of the fix. The gap is the bug.
- **"It's only dev, production is configured differently"** — production is supposed to be reproducible from the same code. Drift in dev poisons the production apply.
- **"A values-file change is too small to be worth codifying"** — the values file *is* the IaC input. Edit it, commit it, done. It is less work than the argument.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint was distilled from, where reproducible redeploy to a fresh cloud account was a contractual deliverable. Every hour of undocumented drift was an hour the redeploy plan was known-invalid, and the team discovered this the way everyone does: an apply against a new environment produced a stack that booted, passed health checks, and behaved differently from the one it was supposed to clone — because four months of hand-patches had never been written down.

## Related

- Rule 22 — never wipe; database backup and retain policies live in IaC and must not be drifted away
- Rule 25 — the fix-time corollary: repair the source, never hot-patch the running deployment
- Rule 26 — the configuration corollary: the deploy never sets env
- Rule 28 — verify before closing; an apply is not evidence, a live probe is
