/**
 * Shadow-DOM stylesheet.
 *
 * Everything is scoped to the shadow root, so the host page cannot restyle the
 * widget and the widget cannot leak into the host — which is the whole reason
 * this is a Shadow DOM rather than a React portal. All spacing uses logical
 * properties (`inline-start`, not `left`) so RTL is a `dir` attribute rather
 * than a second stylesheet.
 *
 * The sheet opens with design tokens — type scale, spacing rhythm, radii,
 * motion — and every rule below draws from them. A widget that sits over
 * somebody else's product is judged as a product itself, and ad-hoc pixel
 * values are exactly how it stops looking like one.
 *
 * color-mix() is used for the accent-derived tints so that an operator's
 * custom --accent (injected at mount) retints them too; static rgba tints
 * would stay indigo under a green brand. Browsers older than 2023 drop those
 * single declarations and fall back to the plain value declared before them
 * (or to no tint), never to a broken layout.
 */
export const CSS = /* css */ `
:host {
  /* ---- palette ---- */
  --bg: #ffffff;
  --surface: #f8f9fb;
  --surface-2: #eef1f4;
  --border: #e6e9ee;
  --border-strong: #cdd3dc;
  --text: #14181f;
  --text-2: #4b5565;
  --muted: #6c7686;
  --accent: #4f46e5;
  --accent-fg: #ffffff;
  /* accent-ink is accent AS TEXT — overridden in dark, where #4f46e5 on a
     near-black panel fails contrast. Derived, so a custom accent tracks. */
  --accent-ink: var(--accent);
  --accent-soft: color-mix(in srgb, var(--accent) 9%, transparent);
  --danger: #d92d20;
  --ok: #087443;
  /* The third state colour. Review and high priority are neither a failure nor
     a success, and borrowing --danger for them was reading as "broken". */
  --warn: #b54708;
  /* issue-type colours: one hue per type, re-tuned per theme below */
  --c-bug: #d92d20;
  --c-feature: #1570ef;
  --c-question: #b54708;
  --c-discussion: #6938ef;

  /* ---- type scale ---- */
  /* px, not rem: rem resolves against the HOST document's root font size, and
     the whole point of the explicit stack below is that the widget looks the
     same on every site it is embedded in. */
  --fs-2xs: 10.5px;
  --fs-xs: 11.5px;
  --fs-sm: 12.5px;
  --fs-md: 13.5px;
  --fs-lg: 15px;
  --fs-xl: 16.5px;
  --lh-tight: 1.25;
  --lh-body: 1.55;

  /* ---- spacing rhythm (4px base) ---- */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;

  /* ---- radii ---- */
  --r-sm: 8px;
  --r-md: 10px;
  --r-lg: 16px;
  --r-full: 999px;

  /* ---- motion ---- */
  --ease: cubic-bezier(.32, .72, 0, 1);
  --t-1: .13s;
  --t-2: .26s;

  /* ---- elevation ---- */
  --shadow-1: 0 1px 2px rgba(16,24,40,.07), 0 8px 24px -8px rgba(16,24,40,.16);
  --shadow-2: 0 2px 6px rgba(16,24,40,.08), 0 24px 64px -16px rgba(16,24,40,.30);

  /* ---- fonts ---- */
  /* Explicit system stack: inheriting the host's font means the widget looks
     different on every site it is embedded in. Tabular numerals are applied
     per-element (counts, issue numbers) rather than globally. */
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI",
          Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas,
          "Liberation Mono", monospace;

  all: initial;
  font-family: var(--font);
  font-size: var(--fs-md);
  -webkit-font-smoothing: antialiased;

/* Built-in screen accents.
   Tokens rather than hex literals in index.ts, which is where they used to
   live — ten of them, invisible to the theme layer, identical in every project
   that installs the widget. A colour a project cannot change is not a default,
   it is a decision made on its behalf. Custom apps already supply their own
   via the manifest; these are the compiled-in screens, which have to declare
   theirs somewhere, so it is here where a theme can reach them. */
  --app-agents: #8b5cf6;
  --app-skills: #06b6d4;
  --app-issues: #f59e0b;
  --app-vault: #10b981;
  --app-sources: #3b82f6;
  --app-docs: #f43f5e;
  --app-brain: #a855f7;
  --app-chat: #14b8a6;
  --app-mcp: #ec4899;
  --app-terminal: #64748b;
  /* Fallback for an app that declares no colour. */
  --app-default: #64748b;

}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --bg: #15171d; --surface: #1c1f27; --surface-2: #262a35;
    --border: #2b303c; --border-strong: #414957;
    --text: #edeef1; --text-2: #aab2c0; --muted: #8a93a5;
    --accent-ink: color-mix(in srgb, var(--accent) 55%, #ffffff);
    --ok: #75e0a7; --danger: #f97066; --warn: #fdb022;
    --c-bug: #f97066; --c-feature: #84adff; --c-question: #fdb022; --c-discussion: #b692f6;
    --shadow-1: 0 1px 2px rgba(0,0,0,.5), 0 8px 24px -8px rgba(0,0,0,.6);
    --shadow-2: 0 2px 6px rgba(0,0,0,.5), 0 24px 64px -16px rgba(0,0,0,.75);
  }
}
:host([data-theme="dark"]) {
  --bg: #15171d; --surface: #1c1f27; --surface-2: #262a35;
  --border: #2b303c; --border-strong: #414957;
  --text: #edeef1; --text-2: #aab2c0; --muted: #8a93a5;
  --accent-ink: color-mix(in srgb, var(--accent) 55%, #ffffff);
  --ok: #75e0a7; --danger: #f97066; --warn: #fdb022;
  --c-bug: #f97066; --c-feature: #84adff; --c-question: #fdb022; --c-discussion: #b692f6;
  --shadow-1: 0 1px 2px rgba(0,0,0,.5), 0 8px 24px -8px rgba(0,0,0,.6);
  --shadow-2: 0 2px 6px rgba(0,0,0,.5), 0 24px 64px -16px rgba(0,0,0,.75);
}

* { box-sizing: border-box; }
button { font: inherit; cursor: pointer; }
/* One focus treatment for every control. :focus-visible, not :focus — the
   ring is for keyboard users, and painting it on every click reads as a bug. */
button:focus-visible, a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ---- floating action button ---- */
/* The launcher button. Compact: this sits on top of somebody's product all
   day, so it should read as a tool at the edge of the screen rather than as a
   call to action in the middle of their design. */
.fab {
  position: fixed; z-index: 2147483645;
  display: inline-flex; align-items: center; gap: 7px;
  height: 36px; padding: 0 14px; border: 0; border-radius: var(--r-full);
  background: var(--accent); color: var(--accent-fg);
  font-family: var(--font);
  font-size: var(--fs-sm); font-weight: 600; letter-spacing: .01em; line-height: 1;
  box-shadow: var(--shadow-1);
  /* accent-tinted glow; browsers without color-mix keep the neutral shadow */
  box-shadow: 0 1px 2px rgba(16,24,40,.12),
              0 6px 20px -6px color-mix(in srgb, var(--accent) 55%, transparent);
  touch-action: none;                 /* let pointer events drive the drag */
  user-select: none;
  transition: transform var(--t-1) var(--ease), box-shadow var(--t-1) var(--ease);
}
.fab:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(16,24,40,.12),
              0 10px 28px -6px color-mix(in srgb, var(--accent) 60%, transparent);
}
.fab:active { cursor: grabbing; transform: translateY(0); }
.fab:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
/* The count.
   place-items alone centred the box but not the digit: the badge inherited the
   button's line-height:1 and the glyph sat high in the circle. An explicit
   line-height and tabular figures put the number in the middle and keep it
   there when it goes from 9 to 10. */
.fab .count {
  min-width: 18px; height: 18px; padding: 0 5px;
  box-sizing: border-box;
  border-radius: var(--r-full); background: rgba(255,255,255,.25);
  font-size: var(--fs-2xs); font-weight: 700;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  display: inline-flex; align-items: center; justify-content: center;
}
.fab-ico { display: inline-flex; align-items: center; }
.fab-ico svg { width: 14px; height: 14px; }

/* ---- slide-over panel ---- */
.panel {
  position: fixed; inset-block: 0; inset-inline-end: 0; z-index: 2147483645;
  width: min(420px, 100vw);
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  border-inline-start: 1px solid var(--border);
  box-shadow: var(--shadow-2);
  transform: translateX(var(--slide, 100%));
  transition: transform var(--t-2) var(--ease), width var(--t-2) var(--ease);
}
:host([dir="rtl"]) .panel { --slide: -100%; }
.panel[data-open="true"] { --slide: 0 !important; }
/* A single issue's title, body, pin and comment thread need more room to read
   and to type a reply into than the listing's scannable row of short titles. */
.panel[data-detail="true"] { width: min(640px, 100vw); }

/* Header: names the product surface, carries the close control. The route
   subline is live context — this panel only ever shows THIS page's issues. */
.head {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: 14px var(--sp-4); border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 auto; }
.brand-ico {
  flex: none; width: 32px; height: 32px; border-radius: var(--r-md);
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent); color: var(--accent-fg);
}
.brand-ico svg { width: 16px; height: 16px; }
.brand-txt { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.head h2 {
  margin: 0; font-size: var(--fs-lg); font-weight: 650;
  letter-spacing: -.01em; line-height: var(--lh-tight);
}
.brand-sub {
  font-size: var(--fs-xs); color: var(--muted);
  font-family: var(--mono); font-variant-numeric: tabular-nums;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  direction: ltr; text-align: start;   /* a route is LTR text even in RTL UI */
}
.x {
  flex: none; width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: var(--r-sm);
  background: transparent; color: var(--muted);
  transition: background var(--t-1) var(--ease), color var(--t-1) var(--ease);
}
.x:hover { background: var(--surface-2); color: var(--text); }

.body {
  padding: var(--sp-4); overflow-y: auto; flex: 1 1 auto;
  display: flex; flex-direction: column;
  scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;
}
.intro {
  margin: 0 0 var(--sp-4);
  font-size: var(--fs-sm); line-height: var(--lh-body); color: var(--muted);
}

.primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; height: 38px; padding: 0 var(--sp-4);
  border: 0; border-radius: var(--r-md);
  background: var(--accent); color: var(--accent-fg);
  font-size: var(--fs-md); font-weight: 600; letter-spacing: .01em;
  transition: filter var(--t-1) var(--ease), box-shadow var(--t-1) var(--ease);
}
.primary:hover {
  filter: brightness(1.07);
  box-shadow: 0 4px 14px -4px color-mix(in srgb, var(--accent) 50%, transparent);
}
.primary:disabled { opacity: .55; cursor: default; filter: none; box-shadow: none; }

/* Sentence case, not UPPERCASE + letter-spacing.
   The uppercase micro-label is the most reliable "this is a 2016 admin theme"
   typographic tell there is, and this sheet already knew: the detail view's
   own comment calls it "a form idiom" and uses .d-sect-t instead. This is the
   rest of that migration — same weight and colour as .d-sect-t so a form
   heading and a section heading finally look like the same system. */
.label {
  margin: var(--sp-5) 0 var(--sp-2);
  font-size: var(--fs-xs); font-weight: 600; color: var(--text-2);
}

/* ---- issue rows ---- */
/* One grouped card, hairline dividers, hover per row. Uniform bordered slabs
   made every row shout at the same volume; a grouped list lets the number,
   type and title carry the hierarchy instead of the chrome. */
.rows {
  display: flex; flex-direction: column;
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--bg); overflow: hidden;
}
.rows > * + * { border-top: 1px solid var(--border); }
.row {
  display: flex; align-items: center; gap: 10px;
  min-height: 40px; padding: 9px var(--sp-3);
  border: 0; background: transparent;
  font-size: var(--fs-md); text-align: start; color: var(--text); width: 100%;
  transition: background var(--t-1) var(--ease);
}
.row:hover { background: var(--surface); }
.row:focus-visible { outline-offset: -2px; }  /* overflow:hidden clips an outer ring */
.row .num {
  flex: none; color: var(--muted); font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
}
.row .t {
  flex: 1 1 auto; min-width: 0; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row .go {
  flex: none; color: var(--border-strong);
  transition: color var(--t-1) var(--ease), transform var(--t-1) var(--ease);
}
.row:hover .go { color: var(--muted); transform: translateX(2px); }

/* Type as a coloured dot + word, not a filled chip: ten tinted pills in a
   list is decoration, one dot per row is information. */
.chip {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  font-size: var(--fs-2xs); font-weight: 650; letter-spacing: .01em;
  text-transform: capitalize; color: var(--text-2);
}
.chip::before {
  content: ""; width: 6px; height: 6px; border-radius: 50%;
  background: currentColor;
}
.chip.bug { color: var(--c-bug); }
.chip.feature { color: var(--c-feature); }
.chip.question { color: var(--c-question); }
.chip.discussion { color: var(--c-discussion); }
/* Status and agent keep the dot too.
   They used to be filled pills — directly under the comment above explaining
   why filled pills in a list are decoration. Two idioms for "a fact about this
   row", one of them contradicting the rule stated two lines earlier, and the
   detail view had already settled on dots (.d-dot). One language now. */
.chip.status { color: var(--text-2); }
.chip.agent { color: var(--accent); }

/* An agent holds a lease on this issue.
   A presence indicator, not a spinner. A rotating spinner promises imminent
   completion — a lease can be held for hours, so the promise is false and the
   motion is just noise in a list. This is the same treatment the detail view
   already uses (.d-pulse), and under prefers-reduced-motion it stops animating
   but stays VISIBLE: the information is "an agent is on this", which a reader
   who cannot tolerate motion still needs. */
.spin {
  flex: none; width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent);
  animation: d-pulse 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) { .spin { animation: none; opacity: .7; } }
.empty {
  font-size: var(--fs-sm); color: var(--muted); padding: var(--sp-2) 0;
}
.rows .empty { padding: var(--sp-4); text-align: center; }

/* "who is working on this" — a spinner plus the agent's name. */
.agent-tag {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  max-width: 42%; padding: 2px 8px 2px 6px; border-radius: var(--r-full);
  background: var(--surface); border: 1px solid var(--border);
}
.agent-tag .who {
  font-size: var(--fs-2xs); font-family: var(--mono);
  color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agent-tag .spin { width: 10px; height: 10px; border-width: 1.5px; flex: none; }

/* Link out to the full board from the on-this-page listing. */
.board-link {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: var(--sp-3); padding: 5px 2px;
  font-size: var(--fs-sm); font-weight: 500;
  color: var(--accent-ink); text-decoration: none;
  border-radius: var(--r-sm);
}
.board-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.board-link .ico { transition: transform var(--t-1) var(--ease); }
.board-link:hover .ico { transform: translateX(2px); }

/* ---- app launcher ---- */
/* Pushed to the bottom of the panel: page feedback is the panel's job, the
   launcher is its second function. margin-top:auto keeps it anchored there
   even when the issue list is short. */
.apps {
  margin-top: auto; padding-top: var(--sp-2);
}
.apps .label { margin-top: var(--sp-5); }
.appgrid {
  /* auto-fill, not a fixed column count: the launcher grew from four items to
     ten, and a hard count either squeezes them or strands one alone. */
  display: grid; gap: 2px;
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
}
.app {
  display: flex; flex-direction: column; align-items: center; gap: 7px;
  padding: 10px 4px 8px; border: 0; border-radius: var(--r-md);
  background: transparent; color: var(--text-2);
  font-size: var(--fs-xs); font-weight: 500; line-height: 1.2; text-align: center;
  transition: background var(--t-1) var(--ease), color var(--t-1) var(--ease);
}
.app:hover { background: var(--surface); color: var(--text); }
/* Solid app-colour tile, white glyph — reads as a real launcher. The washed
   22%-alpha version made ten distinct surfaces look like one grey smear. The
   inset highlight is what keeps a flat colour square from looking printed. */
.app-ico {
  width: 38px; height: 38px; border-radius: 11px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 1px 2px rgba(16,24,40,.18);
  transition: transform var(--t-1) var(--ease);
}
.app:hover .app-ico { transform: translateY(-1px); }
.app-ico svg { width: 18px; height: 18px; }

/* ---- the report modal ---- */
.modal {
  position: fixed; inset: 0; z-index: 2147483646;
  display: grid; place-items: center;
  /* No backdrop fill.
     The whole point of dragging this out of the way is to keep looking at the
     page underneath — dimming it would defeat that, and a modal you can move
     is not one that should be blocking the view in the first place. */
  background: transparent;
  opacity: 0; pointer-events: none;
  transition: opacity var(--t-1) var(--ease);
}
.modal[data-open="true"] { opacity: 1; pointer-events: auto; }
.modal-card {
  /* Positioned rather than centred once dragging starts; place-items handles
     the first paint and JS takes over from there. */
  width: min(440px, calc(100vw - 24px));
  max-height: min(86vh, 720px);
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}
.modal[data-open="true"] .modal-card { animation: modal-in var(--t-2) var(--ease); }
@keyframes modal-in {
  from { opacity: 0; transform: translateY(6px) scale(.985); }
}
.modal-head {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border);
  cursor: grab; user-select: none;
  touch-action: none;                 /* pointer events drive the drag */
  flex: 0 0 auto;
}
.modal-head:active { cursor: grabbing; }
/* The form is a flex item AND a flex container.
   The card is a column with a max-height, but the scrollable body is not its
   child — the form element is, and the body sits inside that. An ordinary block
   form grows to fit its content, so the body inherited unlimited height and its
   overflow-y never had anything to overflow: the footer holding Submit was
   pushed off the bottom of the screen and could not be reached at all.
   min-height:0 is the other half — a flex child defaults to min-height:auto,
   which refuses to shrink below its content and defeats the scroll on its own.
   (No backticks in this file: the whole stylesheet is a template literal, and
   one closes it. esbuild caught that; it is the reason for this note.) */
.modal-card > .form {
  display: flex; flex-direction: column;
  flex: 1 1 auto; min-height: 0;
}
.modal-title { margin: 0; font-size: var(--fs-md); font-weight: 650; }
.modal-x {
  margin-inline-start: auto;
  flex: none; width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: var(--r-sm);
  background: transparent; color: var(--muted);
  transition: background var(--t-1) var(--ease), color var(--t-1) var(--ease);
}
.modal-x:hover { color: var(--text); background: var(--surface-2); }
.modal-body {
  padding: var(--sp-4); overflow-y: auto; flex: 1 1 auto; min-height: 0;
  scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;
}
.modal-body .label:first-child { margin-top: 0; }
.modal-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border); flex: 0 0 auto;
  background: var(--surface);
}
.modal-foot .primary { width: auto; }
.row2 { display: grid; gap: var(--sp-2); }
.hint { margin: var(--sp-1) 0 0; font-size: var(--fs-xs); color: var(--muted); }
/* One row per pin, each removable on its own. */
.pinrow {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: 5px var(--sp-2); border: 1px solid var(--border); border-radius: var(--r-sm);
  margin-bottom: 5px; font-size: var(--fs-xs);
}
.pinnum {
  flex: 0 0 auto; width: 16px; height: 16px; border-radius: var(--r-full);
  background: var(--accent); color: var(--accent-fg);
  font-size: 9.5px; font-weight: 700; line-height: 16px; text-align: center;
  font-variant-numeric: tabular-nums;
}
.pintxt { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pindel {
  flex: 0 0 auto; min-width: 32px; min-height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; background: transparent; color: var(--muted); border-radius: var(--r-sm);
}
.pindel:hover { color: var(--text); background: var(--surface-2); }

/* ---- report form ---- */
.pills { display: flex; flex-wrap: wrap; gap: 7px; }
.pill {
  min-height: 32px; padding: 6px 14px; border-radius: var(--r-full);
  font-size: var(--fs-sm); font-weight: 500;
  border: 1px solid var(--border); background: var(--bg); color: var(--text-2);
  transition: border-color var(--t-1) var(--ease), background var(--t-1) var(--ease),
              color var(--t-1) var(--ease);
}
.pill:hover { border-color: var(--border-strong); }
.pill[aria-pressed="true"] {
  border-color: var(--accent); color: var(--accent-ink); font-weight: 600;
  background: var(--accent-soft);
}

input[type="text"], textarea {
  width: 100%; min-height: 36px; padding: 8px var(--sp-3);
  font: inherit; font-size: var(--fs-md); line-height: var(--lh-body);
  color: var(--text); background: var(--bg);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  transition: border-color var(--t-1) var(--ease);
}
input:hover, textarea:hover { border-color: var(--border-strong); }
input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: var(--accent); }
input:disabled { color: var(--muted); background: var(--surface); }
textarea { min-height: 96px; resize: vertical; }
::placeholder { color: var(--muted); opacity: .8; }

.btns { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.ghost {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 32px; padding: 6px var(--sp-3); font-size: var(--fs-sm); font-weight: 500;
  border: 1px solid var(--border); border-radius: var(--r-sm);
  background: transparent; color: var(--text);
  transition: border-color var(--t-1) var(--ease), background var(--t-1) var(--ease),
              color var(--t-1) var(--ease);
}
.ghost:hover { border-color: var(--border-strong); background: var(--surface); }
.ghost[aria-pressed="true"] {
  border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft);
}

.files { display: flex; flex-direction: column; gap: 5px; margin-top: var(--sp-2); }
.file {
  display: flex; align-items: center; gap: var(--sp-2);
  font-size: var(--fs-xs); color: var(--muted);
  padding: 6px var(--sp-2); background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--r-sm);
}
.file .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file button {
  flex: none; min-width: 32px; min-height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; background: transparent; color: var(--muted); border-radius: var(--r-sm);
}
.file button:hover { color: var(--text); background: var(--surface-2); }
.thumb { width: 32px; height: 32px; flex: none; border-radius: 5px; object-fit: cover; border: 1px solid var(--border); }

/* Confirms what got pinned, right under the button that captured it — the
   button's own label truncates the tag, this shows the accessible name too. */
.pin-preview {
  margin-top: var(--sp-2); padding: 7px 10px; font-size: var(--fs-xs); color: var(--muted);
  font-family: var(--mono);
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm);
  overflow-wrap: anywhere; word-break: break-word;
}

.note { font-size: var(--fs-xs); margin-top: 10px; }
.note.err { color: var(--danger); }
.note.ok { color: var(--ok); }

/* Bridge-mode context disclosure (framedHost). Flex + logical gap, so the
   checkbox row reads correctly in RTL without direction-specific rules. */
.ctxrow { margin-top: 10px; }
.ctx-opt {
  display: flex; align-items: center; gap: 6px; margin-top: 6px;
  font-size: var(--fs-xs); color: var(--muted); cursor: pointer;
}
.ctx-opt input { accent-color: var(--accent); margin: 0; }
.hidden { display: none !important; }

/* ---- in-panel issue detail ----
   The same object as the dashboard's issue page, in a column a third of the
   width. Matched: plain title, quiet labelled properties, state as a dot, one
   activity stream at two weights, hairline borders and fills a few percent
   apart. Adapted: the 264px properties rail lies DOWN under the title and
   wraps into as many columns as the panel is wide, because beside the content
   it would leave nothing readable to sit next to. */

/* Three bands: a fixed top bar, a scrolling document, a pinned composer. The
   panel body stops padding and stops scrolling in detail mode so the bar and
   the composer can reach the panel's own edges — a sticky footer inset by the
   body's 16px leaves content sliding through the gap beneath it. */
.panel[data-detail="true"] .body { padding: 0; overflow: hidden; }
/* The panel's standing intro ("Found a bug…?") belongs to the report flow. It
   was left showing above the detail view, where it reads as a caption on
   somebody else's issue — and with the body's padding gone it went full-bleed
   and looked broken. */
.panel[data-detail="true"] .intro { display: none; }
.detail { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }

.d-nav {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: 9px var(--sp-3) 9px 10px;
  border-bottom: 1px solid var(--border); flex: 0 0 auto;
}
.d-back {
  display: inline-flex; align-items: center; gap: 5px;
  min-height: 28px; padding: 4px 8px; border: 0; border-radius: var(--r-sm);
  background: transparent; color: var(--muted);
  font-size: var(--fs-xs); font-weight: 500;
  transition: background var(--t-1) var(--ease), color var(--t-1) var(--ease);
}
.d-back:hover { background: var(--surface-2); color: var(--text); }
.d-num {
  font-size: var(--fs-xs); font-weight: 600; color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.d-iconbtn {
  flex: none; width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: var(--r-sm); background: transparent; color: var(--muted);
  transition: background var(--t-1) var(--ease), color var(--t-1) var(--ease);
}
.d-iconbtn:hover { background: var(--surface-2); color: var(--text); }
.d-open { margin-inline-start: auto; }

/* The document. One scroll context — the nav and the composer sit outside it. */
.d-main {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  padding: var(--sp-4);
  scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;
}

/* Large and plain: no box, no chip beside it, nothing competing. */
.d-title {
  margin: 0; font-size: var(--fs-xl); font-weight: 650;
  letter-spacing: -.015em; line-height: 1.3;
  overflow-wrap: anywhere;
}
.d-sub {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin: 6px 0 0; font-size: var(--fs-xs); color: var(--muted);
}
.d-sep { color: var(--border-strong); }
.d-live { display: inline-flex; align-items: center; gap: 5px; }
.d-pulse {
  width: 6px; height: 6px; border-radius: 50%;
  background: color-mix(in srgb, var(--text) 70%, transparent);
  animation: d-pulse 1.6s ease-in-out infinite;
}
@keyframes d-pulse { 50% { opacity: .35; } }

/* ---- properties ----
   auto-fit, not a fixed count: two columns at the panel's full 640px, one on
   a phone, without a media query that would have to know the panel's width. */
.d-props {
  display: grid; gap: 1px var(--sp-4);
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  margin-top: var(--sp-4);
}
.d-prop { display: flex; align-items: baseline; gap: var(--sp-2); min-height: 24px; }
/* A fixed key column so the values line up into a column of their own — the
   block reads as a table of facts, never as a form. */
.d-prop-k {
  flex: 0 0 auto; width: 84px;
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--fs-xs); color: var(--muted);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.d-prop-k .ico { flex: none; color: var(--muted); }
.d-prop-v {
  flex: 1 1 auto; min-width: 0;
  font-size: var(--fs-xs); color: var(--text);
  overflow-wrap: anywhere; word-break: break-word;
}
.d-prop-v.muted { color: var(--muted); }
.d-prop-v .mono { font-family: var(--mono); font-size: var(--fs-2xs); }

/* State is a dot. Never a coloured word — that is the one rule every
   reference shares, and a row of tinted pills is decoration, not information.
   Both scales are the issue page's, so the same state is the same colour on
   both surfaces. */
.d-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.d-dot[data-status="triage"]      { background: color-mix(in srgb, var(--muted) 60%, transparent); }
.d-dot[data-status="ready"]       { background: color-mix(in srgb, var(--accent) 70%, transparent); }
.d-dot[data-status="in_progress"] { background: var(--accent); }
.d-dot[data-status="blocked"]     { background: var(--danger); }
.d-dot[data-status="in_review"]   { background: var(--warn); }
.d-dot[data-status="done"]        { background: var(--ok); }
.d-dot[data-status="rejected"]    { background: color-mix(in srgb, var(--muted) 40%, transparent); }
.d-dot[data-priority="low"]      { background: color-mix(in srgb, var(--muted) 40%, transparent); }
.d-dot[data-priority="normal"]   { background: color-mix(in srgb, var(--muted) 70%, transparent); }
.d-dot[data-priority="high"]     { background: var(--warn); }
.d-dot[data-priority="critical"] { background: var(--danger); }

/* ---- description ---- */
.d-body {
  margin-top: var(--sp-4);
  font-size: var(--fs-sm); line-height: var(--lh-body); color: var(--text);
}
.d-empty { margin: 0; font-size: var(--fs-sm); color: var(--muted); }

/* ---- section headers ----
   Sentence case and quiet, with the count trailing and muted — the reference's
   header. .label now matches it. */
.d-sect {
  display: flex; align-items: center; gap: 6px;
  margin: var(--sp-5) 0 var(--sp-2);
  padding-top: var(--sp-4); border-top: 1px solid var(--border);
}
.d-sect-t { margin: 0; font-size: var(--fs-xs); font-weight: 600; color: var(--text-2); }
.d-sect-n { font-size: var(--fs-xs); color: var(--muted); font-variant-numeric: tabular-nums; }

/* ---- captured objects (the pins) ----
   A tile, a name, and the one fact that says whether it can be found again.
   Deliberately an object rather than a link: it is a thing the report carries. */
.d-objs { display: flex; flex-direction: column; gap: 6px; }
.d-obj {
  display: flex; align-items: center; gap: 10px;
  padding: 8px; border: 1px solid var(--border); border-radius: var(--r-sm);
}
.d-obj-ico {
  flex: none; width: 32px; height: 32px; border-radius: var(--r-sm);
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); background: var(--surface); color: var(--muted);
}
/* min-width:0 lets the flex item shrink below its content width — without it
   a long accessible name (the pinned node's whole text) forces the panel wider
   and the WHOLE slide-over scrolls sideways. */
.d-obj-txt { flex: 1 1 auto; min-width: 0; }
.d-obj-nm {
  margin: 0; font-size: var(--fs-sm); font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.d-obj-meta {
  margin: 1px 0 0; font-size: var(--fs-2xs); color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.d-obj-meta .mono { font-family: var(--mono); }

/* ---- activity: one stream, two weights ---- */
.d-thread { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.d-item { position: relative; display: flex; gap: 10px; padding-bottom: var(--sp-4); }
.d-evt { align-items: center; }
.d-item:last-child { padding-bottom: 0; }
/* The faint thread. Inline-start so it runs down the avatars in both
   directions, and behind them — the avatar's own fill is what breaks it. */
.d-line {
  position: absolute; inset-block: 0; inset-inline-start: 11px;
  width: 1px; background: var(--border);
}
.d-item:last-child .d-line { block-size: 12px; }
.d-avatar {
  position: relative; z-index: 1; flex: none;
  width: 23px; height: 23px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); background: var(--bg); color: var(--muted);
  font-size: var(--fs-2xs); font-weight: 600;
}
/* An event is a fact: a knot on the thread, not a face. The wrapper stays
   transparent and the DOT carries the ring that breaks the line — a 23px
   filled circle erased almost the whole segment and left the thread reading
   as a dashed rule rather than one continuous line. */
.d-knot {
  position: relative; z-index: 1; flex: none;
  width: 23px; height: 23px;
  display: inline-flex; align-items: center; justify-content: center;
}
.d-knot span {
  width: 5px; height: 5px; border-radius: 50%;
  background: color-mix(in srgb, var(--muted) 55%, transparent);
  box-shadow: 0 0 0 3px var(--bg);
}

/* A comment carries reasoning, so it keeps card weight. */
.d-card {
  flex: 1 1 auto; min-width: 0;
  border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--bg);
}
.d-card-h {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px;
  margin: 0; padding: 6px 10px; border-bottom: 1px solid var(--border);
  font-size: var(--fs-2xs); color: var(--muted);
}
.d-card-h .d-who { font-weight: 600; color: var(--text); }
.d-badge {
  padding: 1px 6px; border-radius: var(--r-full);
  border: 1px solid var(--border); background: var(--surface);
  font-size: var(--fs-2xs); font-weight: 600; color: var(--text-2);
}
.d-card-b {
  padding: 8px 10px; font-size: var(--fs-sm); line-height: var(--lh-body);
  overflow-wrap: anywhere;
}

/* An event is one quiet line. */
.d-evt-t {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  margin: 0; font-size: var(--fs-xs); color: var(--muted);
}
.d-evt-w { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d-evt-t .d-who { color: var(--text-2); }
.d-evt-at { flex: none; }

/* ---- composer ----
   Pinned, so answering never means finding the end of the thread first. */
.d-composer {
  flex: 0 0 auto; padding: 10px var(--sp-4) var(--sp-3);
  border-top: 1px solid var(--border); background: var(--bg);
}
.d-draft { min-height: 60px; font-size: var(--fs-sm); }
.d-composer-act { display: flex; justify-content: flex-end; margin-top: var(--sp-2); }
.d-send { width: auto; height: 32px; padding: 0 var(--sp-3); font-size: var(--fs-sm); }
.d-composer .note { margin: 0 0 var(--sp-2); }

/* ---- rendered markdown (see markdown.ts) ----
   These style elements INSIDE the shadow root, so they must live in CSS —
   appended to HOST_CSS they would be injected into the host document, where
   none of these selectors exist. */
.md-p { margin: 0 0 var(--sp-2); line-height: var(--lh-body); }
.md-p:last-child { margin-bottom: 0; }
.md-h { margin: var(--sp-3) 0 6px; font-size: var(--fs-md); font-weight: 600; line-height: 1.35; color: var(--text); }
.md-h:first-child { margin-top: 0; }
.md-list { margin: 0 0 var(--sp-2); padding-inline-start: 20px; }
.md-list li { margin: 2px 0; line-height: 1.5; }
.md-list:last-child { margin-bottom: 0; }
.md-code {
  font-family: var(--mono); font-size: var(--fs-xs);
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 4px;
}
.md-pre {
  margin: 0 0 var(--sp-2); padding: 9px var(--sp-3); overflow-x: auto;
  border-radius: var(--r-sm); background: var(--bg); border: 1px solid var(--border);
}
.md-pre:last-child { margin-bottom: 0; }
.md-pre code {
  font-family: var(--mono);
  font-size: var(--fs-xs); line-height: 1.5; white-space: pre;
  background: none; border: 0; padding: 0;
}
.md-quote {
  margin: 0 0 var(--sp-2); padding: 2px 0; padding-inline-start: 10px; color: var(--muted);
  border-inline-start: 2px solid var(--border);
}
.md-quote .md-p:last-child { margin-bottom: 0; }
.md-strong { font-weight: 600; }
.md-em { font-style: italic; }
.md-del { opacity: .65; }
.md-a { color: var(--accent-ink); text-decoration: underline; text-underline-offset: 2px; }
.d-body hr, .d-card-b hr { margin: 10px 0; border: 0; border-top: 1px solid var(--border); }

/* ---- markdown tables ----
   Agents write these on every run and the panel used to print the pipes. Two
   shapes, decided in markdown.ts: a headerless two-column table is a list of
   labelled facts and renders as one, which survives a 640px column; anything
   else is a real table and scrolls sideways inside its own box rather than
   widening the panel. */
.md-kv {
  display: grid; grid-template-columns: minmax(0, 96px) minmax(0, 1fr);
  gap: 3px var(--sp-3);
  margin: 0 0 var(--sp-2); padding: 9px 10px;
  border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface);
  font-size: var(--fs-xs);
}
.md-kv:last-child { margin-bottom: 0; }
.md-kv dt { color: var(--muted); overflow-wrap: anywhere; }
.md-kv dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
.md-tablewrap {
  margin: 0 0 var(--sp-2); overflow-x: auto;
  border: 1px solid var(--border); border-radius: var(--r-sm);
  scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;
}
.md-tablewrap:last-child { margin-bottom: 0; }
.md-table { border-collapse: collapse; width: 100%; font-size: var(--fs-xs); }
.md-table th, .md-table td {
  padding: 6px 10px; text-align: start; vertical-align: top;
  border-bottom: 1px solid var(--border); overflow-wrap: anywhere;
}
.md-table thead th { background: var(--surface); font-weight: 600; color: var(--text-2); white-space: nowrap; }
.md-table tbody tr:last-child td { border-bottom: 0; }
/* A code span is machine text sitting inside prose that may run the other way;
   isolating it stops a branch name from reordering the sentence around it. */
.md-code { unicode-bidi: isolate; }

/* Inline SVG icons (see icons.ts). Sized in em so they track the label they
   sit beside, and flex:none so a long label never squashes them. */
.ico { flex: none; width: 1em; height: 1em; }
button .ico, a .ico { margin-inline-end: 2px; vertical-align: -0.125em; }
.pin-btn, .addfile, .shot, .clear-pin {
  display: inline-flex; align-items: center; gap: 6px;
}
/* Directional glyphs flip with the layout; translate direction flips with the
   scaleX so the hover nudge still points "forward". */
:host([dir="rtl"]) .board-link .ico,
:host([dir="rtl"]) .d-back .ico,
:host([dir="rtl"]) .d-send .ico,
:host([dir="rtl"]) .row .go { transform: scaleX(-1); }
:host([dir="rtl"]) .board-link:hover .ico { transform: scaleX(-1) translateX(2px); }
:host([dir="rtl"]) .row:hover .go { transform: scaleX(-1) translateX(2px); }

@media (prefers-reduced-motion: reduce) {
  .panel, .modal, .fab, .primary, .app, .app-ico, .row, .row .go,
  .board-link .ico, .pill, .ghost, .x, .modal-x { transition: none; }
  .modal[data-open="true"] .modal-card { animation: none; }
  .fab:hover, .app:hover .app-ico, .row:hover .go { transform: none; }
  .spin { animation: none; border-top-color: var(--border); }
  .d-back, .d-iconbtn { transition: none; }
  /* The pulse is the only signal that an agent is live, so it stays visible —
     it stops moving rather than disappearing. */
  .d-pulse { animation: none; opacity: .7; }
}
`;

/**
 * Styles injected into the HOST document — the only ones that must be, because
 * they decorate host elements during pin mode.
 */
export const HOST_CSS = /* css */ `
.builder-pin-hover {
  outline: 2px solid #4f46e5 !important;
  outline-offset: 2px !important;
  cursor: crosshair !important;
}
.builder-pin-armed, .builder-pin-armed * { cursor: crosshair !important; }
.builder-pin-found {
  outline: 2px solid #4f46e5 !important;
  outline-offset: 2px !important;
  animation: builder-pin-flash 1.4s ease-out 2;
}
@keyframes builder-pin-flash {
  0%, 100% { outline-color: #4f46e5; }
  50% { outline-color: transparent; }
}

`;
