# Spike: can the shell get a self-contained stylesheet?

**Date:** 2026-08-12 · **Task:** #12 · **Verdict: PASS — Risk 2 is closed**

The shell is its own top-level document. It cannot borrow the host page's
Tailwind build, so it needs a stylesheet that is complete on its own. If that
were impossible, Phase 1 could not start and the fallback was to hand-write six
components against the ui-core token contract.

## What was found first

`@togo-framework/ui`'s shipped `dist/styles.css` is **not compiled output** —
it is Tailwind v4 *source*: 2 `@theme` blocks, 4 unresolved `@import`s, a
`@custom-variant`, and zero compiled utility classes. A `<link>` to it renders
nothing. The shell therefore needs its own Tailwind compilation step, which is
what `build.shell.mjs` (task #26) must carry.

## The build

`shell.css` imports only `tailwindcss` and `@togo-framework/ui/styles.css`,
with `@source` pointed at the shell's own markup. Built with
`@tailwindcss/vite`. Markup uses ui-desktop's REAL class strings copied from
`Window.tsx`/`Dock.tsx`, so this proves the actual components will render.

## Evidence

Compiled stylesheet: **26474 bytes**

| Check | Result |
|---|---|
| Unresolved `@import` remaining | **0** |
| `@property` registrations emitted | **41** (incl. `--tw-scale-x/y/z`, `--tw-ring-*`, `--tw-shadow*`) |
| Unique custom properties defined | **186** |
| Stylesheets loaded by the page | **1** — ours. No host Tailwind. |
| Tokens resolve (light) | card `rgb(255,255,255)`, border `rgb(220,226,229)`, muted `rgb(90,107,114)`, primary `rgb(22,91,202)` |
| Tokens resolve (dark) | card `rgb(23,30,33)`, border `rgb(44,53,58)`, muted `rgb(164,176,182)`, primary `rgb(31,197,219)` |
| Dark toggle actually changes computed styles | **yes** |
| `@property`-dependent utility | `scale: 1.1`, `--tw-scale-x: 110%` — **works** |

Screenshots: `shellcss-light.png`, `shellcss-dark.png`.

## A measurement trap worth recording

The first probe read `getComputedStyle(el).transform` and got `none`, which
looked like the `@property` registrations had failed. They had not. Tailwind v4
emits the standalone **`scale`** property, not `transform: scale()`:

```css
.scale-110{--tw-scale-x:110%;--tw-scale-y:110%;--tw-scale-z:110%;scale:var(--tw-scale-x) var(--tw-scale-y)}
```

Anyone asserting on transforms in this codebase will hit the same thing.

## Carried into #26

- The shell build MUST run Tailwind; linking `ui/styles.css` is not enough.
- Seven `/fonts/...` references do not resolve at build time and stay as runtime
  URLs. The shell must either serve those fonts or drop the `@font-face` block —
  the same unresolved-asset warnings fadymondy.com's own build emits.
- `@togo-framework/ui/dist/styles.css` is headed "Sentra Design System" and
  references `@prism/ui`. Builder CI already fails the *blueprint* on a leaked
  product name; the same string ships inside this dependency.
