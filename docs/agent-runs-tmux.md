# How do I watch an agent actually working?

Every agent run executes **inside a tmux session**, so you can attach to a live
run and read the pane. Implementation: `internal/runner/tmux.go`.

## Attach to a run

```bash
tmux ls                                  # what is running
tmux attach -t builder-issue-42-1        # watch it
```

Detach with `Ctrl-b d`. Attaching is read/write on a real terminal — the agent's
session is a normal shell, so be careful what you type into it.

The issue detail page shows a copyable `tmux attach` command **while a run is in
progress**.

## Session names are deterministic

```
builder-issue-<number>-<attempt>
```

Verified: `internal/runner/tmux.go:51-61` —
`TmuxSessionName(issue int64, attempt int)` returns
`fmt.Sprintf("builder-issue-%d-%d", issue, attempt)`.

So issue 42, attempt 1 is `builder-issue-42-1`. You can construct the name
before the run exists.

Runs with no issue number — the short classification and triage calls — get
`builder-run-<8 hex>` instead, derived from the run UUID's first eight
characters, or from CSPRNG bytes when there is no id. Verified:
`sessionLabel()`, `tmux.go:127-158`.

Every call site gets a session, including those short runs, because "every
running task must be over tmux" is the requirement and a per-call-site opt-in
would silently miss the next one somebody adds.

## Session lifetime

A finished session is killed **immediately** by default. To keep the pane
around for a post-mortem read:

```bash
BUILDER_TMUX_LINGER=300     # seconds; 0 or unparseable = kill now; capped at 3600
```

Verified: `tmuxLinger()`, `tmux.go:116-126`.

Kills target `=`-anchored names (`kill-session -t "=builder-issue-4-1"`) because
without the `=` tmux matches by prefix, and killing `builder-issue-4-1` would
also kill `builder-issue-4-10`. Verified: `tmux.go:328-330`.

`ReapTmuxSession` exists for the builder-dies-mid-run case: the tmux server
outlives the builder and would otherwise keep the session forever. It is silent
when tmux is absent or the session is already gone — both are normal.

## tmux is optional

Missing tmux, a tmux that fails to start a session, an unusable session name, an
unwritable run directory — each falls back to **spawning the process directly**.
The run still happens; you just cannot attach. The log line is:

```
tmux unavailable — agent runs will not be attachable
  hint: install tmux to watch runs with: tmux attach -t <session>
```

Verified: `tmux.go:166-236`.

Force the fallback on:

```bash
BUILDER_TMUX=0     # tmuxPath() returns "disabled by BUILDER_TMUX=0"
```

Verified: `tmux.go:100-108`. The lookup is cached in a `sync.Once` for the life
of the process, so a fleet with no tmux does not pay a failing `LookPath` on
every dispatch.

## How the environment reaches the session

The run's environment travels in a **file** under
`filepath.Join(os.TempDir(), "builder-tmux")`, not in `tmux -e` flags and not on
the command line. A tmux session otherwise inherits the environment of the tmux
*server*, which is whatever started it — possibly hours ago, possibly a
different project.

The session runs `/bin/sh <script>` with `new-session -d -s <name> -c <dir>`,
and completion is observed by polling for a return-code file, cross-checked
against `has-session` so a tmux server killed out from under the builder cannot
hang the caller. Verified: `tmux.go:198-292`.

## The browser terminal is a different thing

`internal/term/` serves an interactive terminal in the builder UI at
`/api/builder/term`. It is **off unless `BUILDER_TERMINAL=1`** and is never
intended for production — adversarial review flagged that with it on, anyone who
could reach the UI had a shell. Verified: `providers.go:280-305`,
`internal/term/term.go:12`.

### The `new-session -A` trap, and the fix

Do **not** use `tmux new-session -A -s <name>` from a non-TTY process such as an
HTTP handler. The first call succeeds. The **second** call for the same name
dies with:

```
open terminal failed: not a terminal
```

`-A` means "attach if it exists", and attaching requires a terminal that an HTTP
handler does not have. Neither `-d` nor `-D` saves you.

The fix in place is **check-then-create**: `has-session` touches no client, so
the exists path stays terminal-free.

```go
exists := exec.CommandContext(r.Context(), bin, "has-session", "-t", "="+name)
// if that fails:
//   exec.CommandContext(..., "new-session", "-d", "-s", name, "-c", s.workdir)
```

Verified: `internal/term/attach.go:49-65`. Attaching to an existing session uses
`attach-session`, not `new-session`, so the tmux server owns the process tree
(`attach.go:144`).

## Do not run one to test this

An agent run is a real Claude Code session and costs real money. Read
`internal/runner/tmux.go` rather than dispatching an issue to see what happens.
</content>
</invoke>
