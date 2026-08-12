# `ui-desktop-embed` — a vendored fork of `@togo-framework/ui-desktop`

**Vendored deliberately, at the operator's decision (2026-08-12).** Not a
temporary copy waiting to be deleted: we own this and its maintenance. The
upstream PR is opened in parallel and is never on the critical path.

## Why fork rather than depend

`ui-desktop` assumes **it owns the document**. That assumption is correct for
`togo new <app> --frontend os`, where the desktop *is* the app. It is wrong for
FeedbackOS, which renders inside its own iframe over somebody else's site. The
same lines are right upstream and wrong here:

- `DesktopShell:114`, `TopBar:81`, `Dock:85`, `Launchpad:81`, `Spotlight:65` are
  hard-coded `fixed inset-0`.
- `Window.tsx:29-38,145-152` clamp and snap against `window.innerWidth/Height`
  with no bounds concept.
- `WindowManager.tsx:74` keeps `let zCounter = 10` module-global and unbounded.
- `Spotlight.tsx:35-46` `preventDefault`s Cmd/Ctrl+K on `document` for its whole
  lifetime.

Giving it a document of its own turns most of those from bugs back into correct
behaviour. The rest are fixed here (see tasks #22, #23).

## The one seam: `ui-core.ts`

Every `@togo-framework/ui-core` import was rewritten to `../../ui-core`. That is
the only edit made to the copied sources so far — the components are otherwise
byte-identical to upstream, so a future re-sync is a readable diff.

34 symbols cross that seam. 32 resolve from `@togo-framework/ui`;
`wallpaperCss` and `formatRelativeTime` are implemented locally.
`DynamicIcon` deliberately **throws** — see below.

## Budget

The shell has a hard **300 KB gz** ceiling. `lucide-react` alone is
**132,299 B gz** — 3.6x the entire current SDK bundle (36,665 B gz) — and it
cannot be tree-shaken because `DynamicIcon` resolves glyphs from a runtime
string. There are still **12 direct `lucide-react` imports** in these
components; removing them is task #25.

## Re-syncing with upstream

```bash
# The fork point:
git clone --depth=1 https://github.com/togo-framework/ui-desktop
diff -ru ui-desktop/src/components/desktop components/desktop
```

Keep the seam. If a re-sync adds a new `@togo-framework/ui-core` import, rewrite
it to `../../ui-core` and add the symbol there — never import ui-core directly
from a component, or the budget conversation scatters across fifteen files.
