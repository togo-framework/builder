# builder docs — index

One question per file. Find your question here, open one file, stop reading.

All paths are relative to the repository root (`builder/`) unless prefixed with
`../`, which means a sibling checkout under `togo/`.

## Start here

| Your question | File |
|---|---|
| What is builder, and what are its moving parts? | [`architecture.md`](architecture.md) |
| How do I run it inside my product? | [`run-in-process.md`](run-in-process.md) |
| How do I run it as its own daemon on port 8099? | [`run-standalone.md`](run-standalone.md) |
| Which one should I use? | [`run-standalone.md`](run-standalone.md#which-mode-do-i-want) |

## Doing things

| Your question | File |
|---|---|
| How do I watch an agent actually working? | [`agent-runs-tmux.md`](agent-runs-tmux.md) |
| How do I add a screen to builder without editing builder? | [`custom-apps.md`](custom-apps.md) |
| What can the `togo-builder` binary do? | [`cli.md`](cli.md) |
| What HTTP endpoints exist? | [`http-api.md`](http-api.md) |
| What environment variable controls X? | [`environment.md`](environment.md) |

## Knowledge

| Your question | File |
|---|---|
| What is the project brain, and how good is recall really? | [`brain.md`](brain.md) |
| How do I feed external knowledge in on a schedule? | [`sources.md`](sources.md) |
| How do I configure the GitHub source specifically? | [`sources-github.md`](sources-github.md) |
| Why is memory provenance in the state it is in? | [`brain-provenance.md`](brain-provenance.md) |

## When it is broken

| Your question | File |
|---|---|
| It looks like it is running but it is not / UI changes do not appear / fonts are wrong / tmux fails | [`troubleshooting.md`](troubleshooting.md) |

## Naming trap, read once

`internal/docs/` is **not** this folder. `internal/docs/` is a runtime feature —
a document library that uploads files and ingests them into the brain, mounted
at `/api/builder/docs`. This folder (`docs/`) is prose for humans and agents and
is not embedded, served, or read by any Go code.

Verified: `grep -rn "go:embed" --include='*.go' .` returns four directives
(`sdk/dist`, `assets`, `blueprint/_project`, `blueprint/_claude`). None covers
`docs/`.

## Conventions in these files

- **Verified** means the statement was checked against the file named next to it
  during the writing pass.
- **Unverified** means it is written from a report or a code comment and was not
  executed. Treat it as a hypothesis, not a fact.
- Commands are given in full, with the directory to run them from.
</content>
</invoke>
