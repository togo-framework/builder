---
description: "Every agent commit carries agent, model, run id, and issue as trailers. Never git add -A, git add ., or git commit -a — stage explicit paths only."
globs: "*"
alwaysApply: true
---

# Rule 42: Provenance Trailers and Explicitly Scoped Commits

**Every commit an agent authors records who made it, with which model, in which run, against which
issue — as git trailers. And every commit stages named paths only: `git add -A`, `git add .`, and
`git commit -a` are forbidden, without exception, and blocked by a hook.**

The ancestor estate recorded the second half of this as a bare "NEVER" with nothing behind it. Here it
is a hook.

## The Rule

Two halves. The first makes every agent-authored commit answerable — who, which model, which run,
which issue. The second makes every commit's contents deliberate, which is the only condition under
which the first half means anything.

### Part 1 — Provenance

An autonomous fleet produces commits faster than anyone can remember producing them. Six months on,
`git log` is the only account of what happened, and "the LLM did it" is not an account. Every
agent-authored commit answers four questions in its trailer block.

#### The trailer format

Trailers are `Key: Value` lines in the **last paragraph** of the commit message, separated from the
body by exactly one blank line, no blank lines among them — the shape `git interpret-trailers`
parses.

```
fix(auth): reject tokens whose permissions list is exactly ["*"]

Can() is an exact string match, so ["*"] matches no permission at all and
denies everything. Reject it at registration with a clear error rather than
letting it fail open-looking at call time.

Run-Id: 20260807T142231Z-142
Agent: go-service-developer
Model: claude-opus-5[1m]
Issue: #142
Journal: .runs/20260807T142231Z-142.md
Co-Authored-By: <agent display name> <noreply@anthropic.com>
```

| Trailer | Required | Value |
|---|---|---|
| `Run-Id` | **yes** | the run identifier — identical to the `.runs/` filename stem |
| `Agent` | **yes** | the agent's name as it appears in `.claude/agents/` |
| `Model` | **yes** | the exact model id, not a family name |
| `Issue` | **yes** | `#NNN`, or `none` for a deliberately unticketed run |
| `Journal` | **yes** | path to the Rule 37 journal |
| `Co-Authored-By` | yes | conventional attribution line |

Rules, exactly:

- One `Run-Id` per commit. Several commits may share a `Run-Id` — that is a run with multiple
  scoped commits, which is good. A commit with **no** `Run-Id` was not produced by a governed run.
- `Model` is the exact id. "Opus" is not a model id; a model id is reproducible.
- `Journal` must point at a file that exists in the same PR. Rule 37's CI gate and this trailer
  check each other.
- Never use `Closes #NNN` / `Fixes #NNN` in an agent commit. Auto-close on merge is precisely the
  mechanism that closes issues without evidence (Rule 39). Reference the issue with `Issue:`; the
  close is a separate, evidenced act.
- A human's commit does not need these trailers. The absence of a `Run-Id` is itself the signal
  that a human wrote it.

#### Why it earns its space

- **Bisect with a scalpel.** A bad commit found by `git bisect` immediately yields the run, the
  journal, the agent, and the model that produced it — and `git log --grep='Run-Id: <id>'` yields
  every sibling commit from the same run.
- **Model regressions become visible.** When a model version starts producing a characteristic
  defect, `Model:` is what makes that pattern queryable instead of anecdotal.
- **Review routing.** The reviewer knows which specialist's conventions to read the diff against.
- **Audit.** "Which changes reached `{{prod_ref}}` without a human in the loop?" is a grep, not an
  investigation.

### Part 2 — Never stage blindly

**Forbidden, always, in every context:**

```bash
git add -A          # NEVER
git add .           # NEVER
git add --all       # NEVER
git add -u          # NEVER
git commit -a       # NEVER
git commit -am '…'  # NEVER
```

**Required:**

```bash
git status --short              # look at every path first
git add internal/auth/token.go internal/auth/token_test.go
git diff --cached               # read what you are about to commit
git commit -F .git/COMMIT_MSG   # message with trailers
```

Stage the paths your change actually touched. Name them. Read the staged diff before committing.

#### What blind staging sweeps in

Every one of these is ordinary, and every one is a real cost:

- **Generated files you did not mean to commit.** `togo generate` produces `*.gen.go`; a run that
  regenerated to check something now commits unrelated regeneration noise into a diff about
  something else.
- **Frozen-set files.** A hook or workflow touched during debugging goes in silently — a Rule 38
  violation committed by accident rather than intent. This is the most likely way that rule gets
  broken.
- **Secrets.** `.env.local`, a service-account JSON, a dumped token. Once pushed, it is compromised
  and rotation is the only remedy — `git rm` does not unpublish it.
- **Scratch.** Local database dumps, profiling output, `nohup.out`, editor state, a debug binary.
- **Another agent's work in progress.** In a shared worktree, `-A` commits whatever a parallel run
  had open, under your `Run-Id`, destroying the provenance both runs depend on.
- **The un-reviewable diff.** A 400-file commit is not reviewed; it is approved. That is not the
  same thing.

`.gitignore` is not a defence. It catches what someone anticipated. Blind staging is dangerous
exactly for what nobody anticipated.

#### One run may make several commits — and should

Scoped commits are small and thematic. A run that touches a migration, a query file, generated
code, and a surface should produce four commits sharing one `Run-Id`, not one commit sharing
nothing. Generated output (`*.gen.go`) is committed **in its own commit**, with the generating
command named in the body, so reviewers can skip it deliberately rather than skimming past it.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named, dated failures.
These are prophylactic. When a run journal produces a real incident, record it here — do not
invent one.

## Enforcement

- **PreToolUse(Bash) hook** `.claude/hooks/guard-scoped-add.sh` — blocks (exit 2) any command
  matching `git add` with `-A`, `--all`, `-u`, `--update`, or a bare `.` / `*` pathspec, and any
  `git commit` carrying `-a` / `--all` (including bundled short flags such as `-am`). It handles
  chained commands (`&&`, `;`, `|`) and `git -C <dir>` forms. The refusal prints the explicit-path
  alternative. On its own parse failure it exits 0 (see `rules/README.md`).
- **commit-msg hook / CI** — a commit whose author is an agent identity but which lacks `Run-Id`,
  `Agent`, `Model`, `Issue`, or `Journal` is rejected. `Journal:` must resolve to a file present in
  the PR. `Closes`/`Fixes` in an agent commit is rejected.
- **Secret scan** — runs on the staged diff and on the PR, blocking on credential-shaped content.
  This is the backstop, not the primary defence; the primary defence is naming your paths.
- **Review** — a commit touching more than one intent, or containing files nobody can explain, goes
  back to be split. "It was already staged" is not a reason.

## Related Rules

- Rule 31 — never merge your own work. `Agent:` is how the reviewer instance confirms it is not
  reviewing itself.
- Rule 34 — secret handling. The most common way a secret reaches a remote is `git add -A`.
- Rule 35 — blast radius. The file and line caps are computed from the staged diff; blind staging
  breaks the measurement as well as the review.
- Rule 37 — the run journal. `Run-Id` and `Journal` are the join key between a commit and its
  evidence.
- Rule 38 — no self-modification. Explicit staging is what keeps the frozen set out of a feature
  commit.
- Rule 39 — no optimistic closing. Dropping `Closes #NNN` from agent commits removes the mechanism
  that made optimistic closing automatic.
- Rule 41 — external communication. Provenance is only meaningful while agent-authored artifacts
  stay inside the boundary.
