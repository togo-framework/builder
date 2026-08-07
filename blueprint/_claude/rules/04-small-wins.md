---
description: "Every feature must have a small win — the minimum deliverable that proves value. Never deliver a large chunk without a demonstrable win."
globs: "*"
alwaysApply: true
---

# Rule 04: Small Wins — Deliver Incrementally

**Never plan or deliver a large chunk without a real, demonstrable win.**

## The Rule

When breaking a plan into features, each feature must declare a **small win**: the minimum deliverable that proves value and can be shown working, end to end, today.

A small win is something you can *point at*. "Scaffolding is in place" is not a win. "This URL returns this JSON" is.

## Examples

| Too big | Small win |
|---------|-----------|
| "Build the API" | "`GET {{api_base}}/health` returns 200 from a self-registered plugin" |
| "Model the domain" | "One resource is declared in `togo.resources.yaml`, scaffolded, generated, and migrated; one sqlc query returns a row" |
| "Wire up auth" | "A request without the `read:items` permission gets 403; with it, 200" |
| "Build the admin surface" | "One `web/` route lists real rows fetched from `{{api_base}}`" |
| "Add realtime" | "A row insert shows up in the open browser tab without a refresh" |
| "Migrate to the new plugin" | "The old and new plugin both register; the new one serves one route behind a flag" |
| "Full i18n across `{{locales}}`" | "One page renders correctly in every locale in `{{locales}}`" |

## Sequencing a togo feature

The natural small-win ladder in this stack follows the generator-first sequence (Rule 10). Each rung is shippable and provable on its own:

1. Resource declared in `togo.resources.yaml` and scaffolded — the shape is agreed.
2. `togo generate` clean, `togo migrate` applied — the table exists and typed Go compiles against it.
3. Handler registered via `init()` + `RegisterProviderFunc` — the route answers.
4. `web/` consumes it — a human can see it.

Do not collapse four rungs into one commit and call it a feature. Each rung is a checkpoint you can be wrong at cheaply.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint derives from. Multi-week features delivered as one drop were reliably wrong in a way that was discovered at the end, when unwinding meant discarding the whole batch. Small wins bound the blast radius of a misunderstanding to one rung of the ladder.

## Enforcement

- If a feature cannot be delivered as a small win, break it down further. If you are unsure what constitutes a small win, ask (Rule 02).
- Every feature block in a `.plans/` file carries a `**Small Win**:` line. A missing one is an incomplete plan.
- "Demonstrable" means demonstrated. The win is not claimed until it is verified (Rule 05, Rule 28).
