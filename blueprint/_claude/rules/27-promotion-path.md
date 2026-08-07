---
description: "Production is reached by exactly one path — the declared promotion mode — and never by a direct write to the production ref."
globs: "*"
alwaysApply: true
---

# Rule 27: The Promotion Path — One Way to Production, No Direct Writes

**Code reaches production in `{{project_name}}` by exactly one path: the declared promotion mode `{{promotion_mode}}`, from `{{trunk}}` to `{{prod_ref}}`. Nothing is ever written directly to `{{prod_ref}}` — no push, no commit, no cherry-pick, no force, no hotfix branch that skips `{{trunk}}`.**

`{{promotion_mode}}` is one of `pr`, `fast-forward`, or `merge-is-deploy`. The prohibitions below are identical in all three. Only the mechanics of the promotion step differ.

## The Rule — identical in every mode

| Operation on `{{prod_ref}}` | Allowed? |
|---|---|
| `git push origin {{prod_ref}}` (direct) | **NO** |
| `git push origin <feature>:{{prod_ref}}` | **NO** |
| `git push origin {{prod_ref}} --force` (any flavour) | **NO** |
| Committing while checked out on `{{prod_ref}}` | **NO** |
| Cherry-picking onto `{{prod_ref}}` | **NO** |
| Hotfix branch → `{{prod_ref}}`, skipping `{{trunk}}` | **NO** |
| Updating the `{{prod_ref}}` ref via the forge API to a SHA that is not `{{trunk}}` HEAD | **NO** |
| The declared promotion step for `{{promotion_mode}}` | **YES — the only path** |

Everything that runs in production must be reachable from `{{trunk}}`. That single invariant is what every mode below is protecting.

## Mode: `pr`

`{{trunk}}` → `{{prod_ref}}` through a pull request that is reviewed and merged.

```
1. Work on a feature branch → PR into {{trunk}} → review → merge
2. Open a PR: {{trunk}} → {{prod_ref}}
3. Review it. It is a real review, even when the diff is "everything since last time".
4. Merge it. This triggers the production deploy.
5. Re-align {{prod_ref}} to {{trunk}} HEAD if the merge created a merge commit (see below).
```

The promotion PR is the revert handle. When production breaks, you revert that PR and the deploy pipeline rolls back to the previous images. That handle only works if `{{prod_ref}}` contains nothing that `{{trunk}}` does not.

## Mode: `fast-forward`

`{{prod_ref}}` is advanced to a known-good `{{trunk}}` SHA, with no merge commit and no independent history.

```bash
git fetch origin {{trunk}} {{prod_ref}} --quiet
TRUNK_SHA=$(git rev-parse origin/{{trunk}})
# Advance the production ref to exactly that SHA — via the forge API or a
# fast-forward-only push. This is the ONLY acceptable form of "force" on
# {{prod_ref}}, and it must target exactly origin/{{trunk}} HEAD.
```

Targeting any other SHA is a Rule 27 violation. A fast-forward to a cherry-picked or hand-built commit is a direct write wearing a costume.

## Mode: `merge-is-deploy`

**When merge IS the deploy, the rule collapses to a single sentence: the PR review is the only gate, and there is no second chance.**

There is no `{{prod_ref}}` distinct from `{{trunk}}` — merging into `{{trunk}}` ships to production. Say this plainly to yourself before every merge, because every safety property the other two modes get from a second step, this mode must get from the review:

- **There is no staging soak.** Whatever the review missed, users get.
- **There is no promotion PR to revert.** Rollback means a revert commit merged into `{{trunk}}`, which is itself a deploy, which is itself unreviewed under time pressure — the most dangerous merge you will make that day. Know before you merge how you would roll this back, and be able to say it in one sentence.
- **Therefore the review carries the whole load.** No self-merge without an approving review. No merging a PR whose CI is red, pending, or skipped. No merging a PR you have not read because it is "just a version bump" — a version bump is a deploy.
- **Batch size is a safety control.** Small, frequent merges are not a style preference in this mode; they are how you keep the blast radius of an unreviewed mistake small enough to diagnose.
- **Merge queues and required checks are not optional.** They are the only enforcement layer this mode has.

Direct pushes to `{{trunk}}` are forbidden with exactly the force of the direct-write prohibitions above, because in this mode a direct push *is* an unreviewed production deploy.

## Verifying there is no drift

Run this before any production action, in `pr` and `fast-forward` modes:

```bash
git fetch origin {{trunk}} {{prod_ref}} --quiet
PROD=$(git rev-parse origin/{{prod_ref}})
TRUNK=$(git rev-parse origin/{{trunk}})
[ "$PROD" = "$TRUNK" ] && echo "OK — {{prod_ref}} = {{trunk}}" \
  || echo "DRIFT — {{prod_ref}}=$PROD {{trunk}}=$TRUNK"
```

If drift is detected:

1. **STOP.** Do not deploy, promote, or "fix it quickly".
2. Surface it to the operator with the divergent commits: `git log --oneline origin/{{trunk}}..origin/{{prod_ref}}`.
3. Get explicit approval before proceeding.
4. Recover by cherry-picking the orphan commits **back onto `{{trunk}}`** and promoting them properly — never by force-pushing `{{prod_ref}}` to make the symptom disappear.
5. Record what happened and how it got there.

In `merge-is-deploy` mode the equivalent check is that no commit on `{{trunk}}` lacks an associated merged PR.

## Anti-patterns

- **"It's a one-line hotfix, I'll push straight to `{{prod_ref}}`"** — no. Every fix goes through `{{trunk}}`, even when that costs four extra minutes. The four minutes is the audit trail.
- **"CI is faster on the production branch"** — it is the same CI. Whatever would pass there passes on `{{trunk}}`.
- **Tagging a release on `{{prod_ref}}`** — tag on `{{trunk}}`, then promote. A tag that exists only on the production ref points at a commit nobody reviewed.
- **Configuring a deploy to watch some other branch, then pushing to that branch** — there is exactly one production-deploying ref.
- **`--force-with-lease` to "clean up" drift** — that is not cleanup, it is deletion of the evidence. Cherry-pick the orphans to `{{trunk}}` first.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint was distilled from. The operator discovered that the production branch carried commits that were not on trunk. Nobody could say when they had been pushed or by whom. Every one had to be identified, cherry-picked back to trunk, and re-promoted properly, and until that finished **the revert handle did not work** — a rollback would have discarded live changes that existed nowhere else.

The cost was not the untangling. The cost was the window: for the entire period the drift went unnoticed, the team believed it had a one-click rollback and did not.

## Related

- Rule 24 — IaC mirrors infrastructure; the same "one source of truth" invariant applied to infra
- Rule 26 — the deploy never sets configuration
- Rule 28 — verify before closing; a merged promotion is not a shipped feature until it is probed live
