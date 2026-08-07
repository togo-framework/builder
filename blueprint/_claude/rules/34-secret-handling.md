---
description: "Never read, print, commit, or relocate secret material. Reference config by name only. Redact anything secret-shaped before it leaves the run. Rotation is human-only."
globs: "*"
alwaysApply: true
---

# Rule 34: Secrets Are Referenced by Name, Never Handled

**No agent may read, print, echo, log, commit, copy, or relocate secret material;
configuration is referenced by name only; any output matching a secret shape is
dropped before it leaves the run; and rotation is human-only.**

## The Rule

### The four verbs, all forbidden

| Verb | Concretely |
|---|---|
| **Read** | `cat .env`, `printenv`, `env`, opening a `*-key.json`, `gcloud secrets versions access`, `kubectl get secret -o yaml`, `op read`, `vault read`, `aws secretsmanager get-secret-value` |
| **Print** | echoing a value into chat, a log line, a PR body, an issue comment, a commit message, a test fixture, or a debug `fmt.Printf` |
| **Commit** | adding a file containing a live credential to git, in any branch, ever — including "temporarily", including a branch you intend to delete |
| **Relocate** | copying a secret from one store to another, from a store into a file, from a file into an env var, from an env var into a config map, or from any of these into a prompt |

An agent needs a secret's **name** to wire code. It never needs the **value**. If
you believe you need the value to make progress, you have found a `must_ask:`
moment (Rule 30), not an exception.

### Hook-blocked paths

These are blocked for `Read`, `Write`, `Edit`, and for Bash commands that would
open them:

```
.env
.env.*
**/.env*
**/secrets/**
**/credentials/**
*.pem
*.key
*_rsa
*.p12
*.pfx
*.jks
*-key.json
*-credentials.json
service-accounts/**
**/*serviceaccount*.json
.netrc
~/.config/gcloud/**
~/.aws/credentials
~/.kube/config
```

`.env.example` / `.env.sample` are readable and writable **provided every value
is a placeholder**. That is the one legitimate way an agent documents a new
config key: add `NEW_THING_URL=` (empty) or `NEW_THING_URL=<set-me>` to the
example file and say so in the PR.

### Reference by name only

In `{{project_name}}`:

- Go reads config through the project's config seam — `os.Getenv("DATABASE_URL")`,
  a `togo` provider, or a secret-manager reference string like
  `projects/*/secrets/DATABASE_URL/versions/latest`. The literal value never
  appears in Go source, in `db/queries/*.sql`, in a migration, or in a test.
- `web/` never holds a secret at all. Anything reachable from the browser bundle
  is public by construction — `NEXT_PUBLIC_*` and `VITE_*` prefixed values are
  **published**, not configured. Assigning a credential to one of those names is
  a disclosure, not a mistake. `web/` talks to `{{api_base}}`; the API holds the
  credentials.
- New config is declared in three places and nowhere else: the example env file
  (placeholder), the config struct/seam in Go, and the deployment's secret store
  (by a human). An agent does the first two.

### Egress redaction

Before any text leaves the run — chat output, PR body, issue comment, commit
message, log file, run journal — it is scanned and anything matching a secret
shape is replaced with `[REDACTED:<shape>]`. Shapes at minimum:

- PEM blocks (`-----BEGIN ... PRIVATE KEY-----`)
- `AKIA[0-9A-Z]{16}` and AWS secret-key-shaped 40-char base64
- `gh[pousr]_[A-Za-z0-9]{36,}`, `github_pat_[A-Za-z0-9_]{20,}`
- `AIza[0-9A-Za-z\-_]{35}`, `ya29\.[A-Za-z0-9\-_]+`
- `xox[abposr]-[A-Za-z0-9-]{10,}`
- `sk_live_[A-Za-z0-9]{16,}`, `rk_live_`, `whsec_`
- Connection strings with inline credentials:
  `(postgres|postgresql|mysql|mongodb|redis|amqp)://[^:@/]+:[^@]+@`
- JWT triples `eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`
- Any assignment whose key matches
  `(?i)(secret|token|password|passwd|api[_-]?key|private[_-]?key|credential)`
  and whose value is a non-placeholder literal ≥ 12 chars

Redaction is **fail-safe, not fail-open**: a false positive costs a `[REDACTED]`
in a log line; a false negative costs a leaked credential. When in doubt, redact.

A redaction event is not silent — the run reports "N values redacted from output"
so a human can tell that something secret-shaped was in flight.

### Rotation is human-only

If a secret is exposed, leaked, or suspected compromised, the agent's entire job
is:

1. **Stop.** Do not push, do not open a PR, do not "clean it up" first.
2. Report, in chat and in the run journal: *what kind* of credential, *where* it
   appeared (file + line, or command), and *how far it travelled* (local only /
   committed / pushed / in a PR body / in CI logs).
3. Never state the value, not even partially. "The first four characters are…"
   is a disclosure.
4. Apply the `security` label — which makes the follow-up human-only (Rule 33).

The agent does **not** rotate the credential, revoke the key, edit git history,
`git filter-repo`, force-push over the leak, or delete the CI logs. Every one of
those destroys evidence a human needs to size the incident, and several of them
make the exposure permanent-but-invisible. Rotation is a human decision with
blast radius the agent cannot see: what else uses this key, who must be told,
what breaks when it changes.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named,
dated failures. These are prophylactic. When a run journal produces a real
incident, record it here — do not invent one.

## Enforcement

- **`.claude/hooks/guard-secrets.sh`**
  - `PreToolUse(Read|Write|Edit)`: blocks (exit 2) any path matching the blocked
    list above, with the `.env.example` placeholder exception.
  - `PreToolUse(Bash)`: blocks `cat`/`less`/`head`/`tail`/`grep`/`cp`/`mv` on a
    blocked path; blocks `env`, `printenv`, `set` with no args, `export` of a
    secret-named key with a literal value; blocks
    `gcloud secrets versions access`, `kubectl get secret … -o (yaml|json)`,
    `aws secretsmanager get-secret-value`, `op read`, `vault read`,
    `doppler secrets get`.
  - `PostToolUse(*)` and `Stop`: runs the shape scanner over tool output and any
    outgoing text, replacing matches with `[REDACTED:<shape>]` and emitting the
    redaction count.
- **`.claude/hooks/post-commit-check.sh`**: scans the staged/committed diff for
  the same shapes and fails the commit before it can be pushed.
- **CI gate**: secret scanning on every push and PR (GitHub secret scanning plus
  a repo scanner). A hit fails the build and is not overridable by an agent.
- **`.gitignore`** ships with the blocked patterns pre-listed; removing an entry
  from it is a `claude-config-change` (Rule 30) and requires a human.
- **Review heuristic**: any diff adding a literal to a `(?i)(secret|token|key|password)`-named
  field, or adding a credential to a `NEXT_PUBLIC_*`/`VITE_*` name, is rejected.

## Related Rules

- Rule 30: The Autonomy Grant Is a File — `secret-access` is permanently `must_ask:`
- Rule 33: Human-Only Work — the `security` label an exposure triggers
- Rule 35: Blast Radius — `.env*` and `**/secrets/**` are also denied paths there
- Rule 37: The Run Journal — redaction applies to the journal before it is written
- Rule 41: External Communication — the same redaction gate on anything leaving the repo
