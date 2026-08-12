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

## Budget — settled

The shell has a hard **300 KB gz** ceiling. `lucide-react` was **132,299 B gz**,
3.6x the entire current SDK bundle (36,665 B gz), and could not be tree-shaken
because `DynamicIcon` resolves glyphs from a runtime string.

It is gone. `icons.tsx` inlines the exact 32 glyphs these components render,
with the path data copied verbatim from lucide (ISC, attributed in the file):

| | gz |
|---|---|
| `lucide-react` | 132,299 B |
| inlined set | **2,099 B** |
| saved | 130,200 B — **63x smaller** |

`DynamicIcon` keeps its signature and resolves against that set. An unknown name
renders a lettered tile rather than a blank square, because apps are registered
by third-party plugins with a free-text `Icon` field — unknown names are the
normal case, and a dock of empty squares reads as "the shell is broken" rather
than "that plugin picked an icon we don't carry". The letter is the first
GRAPHEME via `Intl.Segmenter`, not `.charAt(0)`, which would slice an Arabic or
emoji name mid-cluster.

Regenerate rather than hand-editing the arrays.

## Chrome status

Tokenised and embed-correct: `Window`, `WindowManager`, `Dock`.

Still carrying upstream's wallpaper-era chrome (`bg-black/25`, `bg-white/10`,
`border-white/10`): `TopBar`, `NotificationCenter`. Deliberately not fixed —
both are in the "should an overlay ship this at all" list below, and restyling a
component we may delete is waste. If they stay, they need the same treatment
`Dock` got: `--fos-chrome-bg` / `--fos-chrome-border` instead of translucent
white and black, which only read correctly over a dark wallpaper the desktop
owns.

## Still to decide: components an overlay should not ship

Pruning `OSLoginScreen` (below) removed a whole dependency. Four more are
upstream-shaped in the same way, and one is a host-safety problem:

- **`DesktopContextMenu` — hijacks right-click.** Upstream owns the page, so
  binding the context menu to "change wallpaper / refresh desktop" is correct
  there. Over a customer's site it steals a gesture the host may rely on. This
  should not ship in an overlay.
- `DesktopIcon` / `DesktopIconGrid` — there is no desktop surface to put icons
  on; the host page is what is behind the windows.
- `TogoMenu` — power / logout / restart is not an overlay's authority.
- `WeatherWidget` — a desktop affordance with no place in a feedback tool.

Removing them also drops ~16 of the 32 inlined glyphs. Not done here because
`DesktopShell` composes two of them and that is a layout change, not a
dependency change.

## Re-syncing with upstream

```bash
# The fork point:
git clone --depth=1 https://github.com/togo-framework/ui-desktop
diff -ru ui-desktop/src/components/desktop components/desktop
```

Keep the seam. If a re-sync adds a new `@togo-framework/ui-core` import, rewrite
it to `../../ui-core` and add the symbol there — never import ui-core directly
from a component, or the budget conversation scatters across fifteen files.
