---
description: "External communication is human-only. No email, no third-party repo comments, no package publishes, no non-allowlisted webhooks, no customer-facing text without sign-off."
globs: "*"
alwaysApply: true
---

# Rule 41: External Communication Is Human-Only

**No agent sends anything that leaves this organization's boundary. No email. No comments on
repositories you do not own. No package publishes. No calls to non-allowlisted webhooks or
endpoints. No customer-facing text without a named human's sign-off. Draft it, hand it over, stop.**

## The Rule

The test is not "is this action reversible?" — it is **"can a stranger read it?"** If yes, a human
decides whether it is sent. Every time.

### Forbidden outright

| Channel | Includes |
|---|---|
| **Email** | any send, to anyone, via any client, SMTP, API, or MCP tool. Drafts are permitted; sending is not. |
| **Third-party repositories** | issues, comments, reviews, PRs, discussions, stars, forks on any repo outside `{{project_name}}`'s own org. Upstream bug reports included. |
| **Package registries** | `npm publish`, `go` module tag pushes intended as releases, `docker push` to a public registry, PyPI, crates.io, Homebrew taps, VS Code marketplace — any publish that others can install. |
| **Social and community** | posts, DMs, replies, or reactions on any social platform, forum, Discord, Slack Connect channel, or mailing list outside the org. |
| **Non-allowlisted network egress** | webhooks, callbacks, analytics endpoints, "just testing the integration" POSTs to a partner's URL, any host not on the project's egress allowlist. |
| **Customer-facing text** | release notes, changelog entries that ship, in-product copy, error strings users read, docs on a public site, status-page updates, support replies. In `{{locales}}`, every locale. |
| **Anything that spends money or creates an account** | signups, API key provisioning against paid third parties, purchases. |

### Permitted

| Action | Condition |
|---|---|
| Issues, comments, PRs on `{{project_name}}`'s own repositories | yes — internal |
| Commits and pushes to branches on those repositories | subject to the engineering band's push rules |
| Writing a **draft** — email body, upstream bug report, release note, announcement | yes. Put it in the repo or the run journal, clearly labelled `DRAFT — not sent`. |
| Reading anything external | yes — fetching docs, reading upstream issues, `go get`, npm install |
| Requests to hosts on the project's egress allowlist | yes — that is what the allowlist is for |
| Internal-only notifications the org configured (its own CI, its own chat) | yes |

Reading the internet is fine. Writing to it is not.

### Drafting is the job; sending is not

An agent that produces a well-researched upstream bug report, a clean release note in
`{{locales}}`, or a precise customer explanation has done valuable work. It hands the artifact to a
human with everything needed to send it:

```markdown
## DRAFT — not sent. Requires human review and send.

**Channel:** upstream GitHub issue → github.com/<owner>/<repo>
**Why:** the panic in §"What reproduced" of .runs/20260807T142231Z-142.md is upstream, not ours
**Contains:** stack trace, minimal repro, our version pins
**Does NOT contain:** internal hostnames, customer names, our issue numbers

---
<the draft>
```

Then stop. Do not "go ahead and file it since it's obviously fine". Obviousness is not the standard;
a human's decision is.

### Why the line is drawn at the boundary, not at reversibility

Internal mistakes are absorbed by people with context. External ones are not:

- An email cannot be unsent, and it arrives with the organization's name on it.
- A published package version is permanent — registries do not let you reuse a version, and someone
  has already pulled it.
- A comment on a stranger's repository is the organization speaking in public, by an author who
  cannot judge the relationship, the history, or the politics.
- Customer-facing copy carries legal, tonal, and translation weight that no run has the context to
  assess. A `{{locales}}` string that is merely awkward in one locale can be wrong in another.
- A webhook to an unknown host may exfiltrate whatever the payload contains — and payload contents
  are exactly what a run is least careful about.

None of these are recovered by a revert.

### Edge cases, resolved

- *"The human asked me to email X."* — write the draft, present it, let them send. A request to
  compose is not a request to transmit. If they explicitly say "send it", that is their send, made
  through their own tools, not an agent's.
- *"It's an automated status update to our own Slack."* — internal, org-configured, already
  allowlisted: permitted. A Slack Connect channel shared with a customer is **external**.
- *"CI publishes the package; I'm just tagging."* — a tag that triggers a publish **is** the
  publish. Rule 38 already freezes the workflows; this rule freezes the trigger.
- *"I need to test the partner webhook."* — use a local mock or a recorded fixture. Never the
  partner's real endpoint.
- *"The bug is upstream and blocking me."* — park (Rule 39), draft the report, escalate. Being
  blocked does not confer send authority.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named, dated failures.
These are prophylactic. When a run journal produces a real incident, record it here — do not
invent one.

## Enforcement

- **PreToolUse(Bash)** — the tool-permission layer denies `npm publish`, `docker push` to public
  registries, `gh` commands whose `--repo` is outside the org, `git push` to a non-org remote, and
  `mail`/`sendmail`/`curl` to hosts absent from the egress allowlist. Denial is the default for
  unrecognized hosts, not the exception.
- **MCP tool allowlist** — email, social, and third-party-issue MCP tools are not granted to
  feature-run agents at all. The safest denial is the capability never being present.
- **CI gate** — a workflow that publishes on a tag requires a human-triggered dispatch or a
  protected-environment approval; it never fires from an agent-created tag.
- **Review** — any file containing user-visible copy is routed to a human for sign-off before
  merge, in every locale in `{{locales}}`.
- **Journal** — drafts produced but not sent are listed under "Follow-ups" (Rule 37) so the human
  sees them.

## Related Rules

- Rule 30 — the autonomy grant. Every channel in this rule is permanently `must_ask:`; no grant
  level unlocks them.
- Rule 33 — human-only work. `customer-comms`, `legal`, and `security` labels reserve the issues;
  this rule reserves the channels. Both apply.
- Rule 34 — secret handling. The egress denial is also the last line against exfiltration through
  a "harmless" webhook.
- Rule 35 — blast radius. `cross_repo_writes: false` is the same boundary drawn in path terms.
- Rule 38 — no self-modification. The workflows that could publish are already frozen.
- Rule 39 — never auto-retry a non-idempotent operation. A failed publish or a failed send is
  exactly the case where "did it partially land?" is unanswerable.
- Rule 42 — provenance. Anything an agent authored is attributable, which is only meaningful while
  it stays inside the boundary.
