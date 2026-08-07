---
description: "Recall before acting, answer from recall and cite it, say 'no memory of X' instead of guessing, retain durable decisions only, and scope every memory correctly."
globs: "*"
conditional: brain driver != none
alwaysApply: true
---

# Rule 40: Memory Discipline

**Recall before you act. Answer from what you recalled, and cite it. Say "no memory of X" rather
than guessing. Retain decisions, not chatter. And scope every write correctly — a mis-tagged
global memory pollutes every other project on this brain, permanently and invisibly.**

> **Conditional rule.** This applies only when `{{project_name}}` is configured with a memory
> backend (`brain driver != none`). With no brain configured, ignore this file entirely — do not
> simulate memory, do not keep a shadow notes file, and do not claim recall you cannot perform.

## The Rule

### 1. Recall before acting

Before planning a change, before answering a question about how this system works, and before
contradicting something in the repo — **query memory first**. Not after you have formed an
opinion; before.

Recall at these moments specifically:

| Moment | Recall for |
|---|---|
| Start of a run | prior runs on this issue, this file, this subsystem |
| Before a design decision | whether it was already decided, and why |
| Before saying "we should use X" | whether X was tried and rejected |
| Before reporting a bug as new | whether it is a known recurrence |
| Before touching an unfamiliar plugin or migration | its history and its landmines |

The cost of a recall is one call. The cost of re-litigating a settled decision is a run, a review,
and a human's patience.

### 2. Answer FROM recall, and cite it

When memory returns something relevant, the answer is built on it and **says so**:

```
Per memory `decision/auth-token-ttl` (retained 2026-05-14): TTL was set to 15m
deliberately, after the refresh-storm incident. Not changing it here.
```

Not: "I believe the TTL is 15 minutes." Belief is unciteable. If a claim came from memory, name the
memory. If it came from reading the code, name the file and line. If it came from neither, it is a
guess and §3 applies.

Memory is **evidence about decisions**, never evidence about current state. A memory saying the
handler returns 200 does not mean it returns 200 today. Current state is proven by running
something (Rule 37). Memory tells you what was intended and why; the repository and the running
system tell you what is.

### 3. Say "no memory of X" — never fill the gap

When recall comes back empty, the correct output is a sentence that says so:

> No memory of why `{{api_base}}` is versioned this way. Proceeding on what the code shows;
> flagging for the human.

Forbidden: inventing a plausible history, hedging into a confident-sounding paraphrase, or
treating an unrelated near-match as the answer. An empty recall is a **useful, reportable fact** —
it tells the human that an undocumented decision exists and where it lives.

A near-match is not a match. If the recall is about a different service, a different environment
in `{{env_matrix}}`, or a different surface in `{{surfaces}}`, say that explicitly rather than
transplanting it.

### 4. Retain durable decisions — and nothing else

Write to memory when the thing being written will still be true and still be useful in six months.

| Retain | Do not retain |
|---|---|
| Architectural decisions **and their rationale** | what you did this afternoon (that is the run journal) |
| Rejected alternatives and why they were rejected | file contents, code snippets, current line numbers |
| Non-obvious constraints ("this plugin must register at priority < 50 because…") | anything the repo already states plainly |
| Incident causes and the fix that stuck | build output, test logs, transient errors |
| Human preferences stated as standing policy | one-off instructions scoped to a single run |
| Naming, terminology, domain vocabulary | secrets, tokens, credentials, PII — **never**, under any tag |

Run-by-run narrative belongs in `.runs/` (Rule 37), which is versioned, diffable, and scoped to
this repository. Memory is for the distilled residue: the decisions that outlive the runs.

Prefer few, well-titled, self-contained memories. A memory that only makes sense if you already
remember the conversation is not a memory.

### 5. Scope correctly — the expensive mistake

Every write carries a scope. Getting it wrong is the one error in this rule that damages things
outside this repository.

| Scope | Contains | Test before writing |
|---|---|---|
| **project** (default) | anything true of `{{project_name}}` specifically | "Would this be wrong or meaningless in another repo?" → project |
| **global** | facts about the human, or conventions that genuinely hold everywhere | "Would I want this recalled verbatim on an unrelated codebase in a year?" → only then global |

**Default to project scope. Always.** Global is a deliberate, rare, justified act.

A mis-scoped global is uniquely nasty: it surfaces in unrelated projects, where it is confidently
wrong, and where nobody has the context to recognize it as foreign. It has no blast-radius limit
and no natural expiry. "Migrations go in `db/migrations/`" is a fact about this project; written
globally it becomes a false assertion about every project the human ever works on.

Environment and tenancy are part of scope too. A memory about dev behaviour is tagged as such —
never written as an unqualified statement about the system.

### 6. Correct, don't accumulate

When memory is wrong, **fix the memory** — edit or forget it — in the same run that discovered the
error, and note the correction in the run journal. Do not write a second, contradictory memory and
leave both. Two memories that disagree are worse than neither, because recall will return one of
them and you will not know which.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named, dated failures.
These are prophylactic. When a run journal produces a real incident, record it here — do not
invent one.

## Enforcement

- **Conditional load** — the harness includes this rule only when a brain driver is configured. If
  `brain driver == none`, the file is inert.
- **Journal field** — when memory is configured, a run journal that made an architectural claim
  with no citation (memory key or file path) is flagged in review.
- **Scope guard** — a global-scope write emits a warning naming the key and the scope. Global
  writes are reviewed like OS changes (Rule 38): rare, deliberate, human-visible.
- **Secret scan** — retain payloads are scanned for credential-shaped strings and refused. This is
  a hard block, not a warning.
- **Review** — "no memory of X" in a report is a **correct** answer and is never treated as a gap
  in the run's quality. Reviewers should be more suspicious of a confident uncited history than of
  an admitted blank.

## Related Rules

- Rule 34 — secret handling. Secret material never enters memory, under any scope or tag; the
  retain-side scan is the same block.
- Rule 37 — the run journal. Narrative goes there; distilled decisions go to memory.
- Rule 39 — park rather than guess. Same instinct, applied to evidence instead of recall.
- Rule 41 — external communication. Memory is internal; nothing recalled from it is published
  outward by an agent.
