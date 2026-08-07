/**
 * Shadow-DOM stylesheet.
 *
 * Everything is scoped to the shadow root, so the host page cannot restyle the
 * widget and the widget cannot leak into the host — which is the whole reason
 * this is a Shadow DOM rather than a React portal. All spacing uses logical
 * properties (`inline-start`, not `left`) so RTL is a `dir` attribute rather
 * than a second stylesheet.
 */
export const CSS = /* css */ `
:host {
  --bg: #ffffff;
  --surface: #f6f7f9;
  --border: #e2e5ea;
  --text: #16191d;
  --muted: #6b7280;
  --accent: #4f46e5;
  --accent-fg: #ffffff;
  --danger: #b42318;
  --radius: 10px;
  --shadow: 0 1px 2px rgba(0,0,0,.06), 0 12px 32px -12px rgba(0,0,0,.25);
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  all: initial;
  font-family: var(--font);
}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --bg: #16181d; --surface: #1e2127; --border: #2c313a;
    --text: #e9ebef; --muted: #9099a6;
    --shadow: 0 1px 2px rgba(0,0,0,.5), 0 12px 32px -12px rgba(0,0,0,.7);
  }
}
:host([data-theme="dark"]) {
  --bg: #16181d; --surface: #1e2127; --border: #2c313a;
  --text: #e9ebef; --muted: #9099a6;
  --shadow: 0 1px 2px rgba(0,0,0,.5), 0 12px 32px -12px rgba(0,0,0,.7);
}

* { box-sizing: border-box; }
button { font: inherit; cursor: pointer; }

/* ---- floating action button ---- */
.fab {
  position: fixed; z-index: 2147483645;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border: 0; border-radius: 999px;
  background: var(--accent); color: var(--accent-fg);
  font-size: 14px; font-weight: 600; line-height: 1;
  box-shadow: var(--shadow);
  touch-action: none;                 /* let pointer events drive the drag */
  user-select: none;
  transition: transform .12s ease, box-shadow .12s ease;
}
.fab:hover { transform: translateY(-1px); }
.fab:active { cursor: grabbing; }
.fab:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.fab .count {
  min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 999px; background: rgba(255,255,255,.24);
  font-size: 11px; display: grid; place-items: center;
}

/* ---- slide-over panel ---- */
.panel {
  position: fixed; inset-block: 0; inset-inline-end: 0; z-index: 2147483645;
  width: min(420px, 100vw);
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  border-inline-start: 1px solid var(--border);
  box-shadow: var(--shadow);
  transform: translateX(var(--slide, 100%));
  transition: transform .18s ease;
}
:host([dir="rtl"]) .panel { --slide: -100%; }
.panel[data-open="true"] { --slide: 0 !important; }

.head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px; border-bottom: 1px solid var(--border);
}
.head h2 { margin: 0; font-size: 15px; font-weight: 650; }
.x {
  border: 0; background: transparent; color: var(--muted);
  font-size: 18px; line-height: 1; padding: 4px 6px; border-radius: 6px;
}
.x:hover { background: var(--surface); color: var(--text); }

.body { padding: 18px; overflow-y: auto; flex: 1; }
.intro { margin: 0 0 16px; font-size: 13px; line-height: 1.55; color: var(--muted); }

.primary {
  width: 100%; padding: 11px 16px; border: 0; border-radius: var(--radius);
  background: var(--accent); color: var(--accent-fg);
  font-size: 14px; font-weight: 600;
}
.primary:disabled { opacity: .55; cursor: default; }

.label {
  margin: 22px 0 10px; font-size: 10.5px; font-weight: 650;
  letter-spacing: .09em; text-transform: uppercase; color: var(--muted);
}

/* ---- issue rows ---- */
.rows { display: flex; flex-direction: column; gap: 6px; }
.row {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 11px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--surface);
  font-size: 13px; text-align: start; color: var(--text); width: 100%;
}
.row:hover { border-color: var(--accent); }
.row .num { color: var(--muted); font-variant-numeric: tabular-nums; flex: none; }
.row .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip {
  flex: none; padding: 2px 7px; border-radius: 5px;
  font-size: 10.5px; font-weight: 650; text-transform: capitalize;
}
.chip.bug { background: #fde8e6; color: #b42318; }
.chip.feature { background: #e6edfd; color: #2c4fd6; }
.chip.question { background: #fdf3d7; color: #8a6100; }
.chip.discussion { background: #efe6fd; color: #6b34c8; }
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) .chip.bug { background: #3a1c19; color: #f5a79b; }
  :host(:not([data-theme="light"])) .chip.feature { background: #1a2547; color: #9db4f5; }
  :host(:not([data-theme="light"])) .chip.question { background: #3a2f13; color: #e8c66a; }
  :host(:not([data-theme="light"])) .chip.discussion { background: #2b1f42; color: #c4a4f2; }
}
/* An agent holds a lease on this issue. */
.spin {
  flex: none; width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid var(--border); border-top-color: var(--accent);
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; border-top-color: var(--border); }
  .panel { transition: none; }
}
.empty { font-size: 13px; color: var(--muted); padding: 6px 0; }

/* ---- report form ---- */
.pills { display: flex; flex-wrap: wrap; gap: 7px; }
.pill {
  padding: 6px 13px; border-radius: 999px; font-size: 12.5px;
  border: 1px solid var(--border); background: var(--bg); color: var(--muted);
}
.pill[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }

input[type="text"], textarea {
  width: 100%; padding: 9px 11px; font: inherit; font-size: 13.5px;
  color: var(--text); background: var(--bg);
  border: 1px solid var(--border); border-radius: 8px;
}
input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: var(--accent); }
input:disabled { color: var(--muted); background: var(--surface); }
textarea { min-height: 96px; resize: vertical; }

.btns { display: flex; flex-wrap: wrap; gap: 8px; }
.ghost {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; font-size: 12.5px;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); color: var(--text);
}
.ghost:hover { border-color: var(--accent); color: var(--accent); }
.ghost[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }

.files { display: flex; flex-direction: column; gap: 5px; margin-top: 9px; }
.file {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--muted);
  padding: 6px 9px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 7px;
}
.file .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file button { border: 0; background: transparent; color: var(--muted); padding: 0 3px; }

.note { font-size: 12px; margin-top: 10px; }
.note.err { color: var(--danger); }
.note.ok { color: var(--accent); }
.foot { padding: 14px 18px; border-top: 1px solid var(--border); }
.hidden { display: none !important; }

/* ---- in-panel issue detail ---- */
.detail { display: flex; flex-direction: column; gap: 10px; }
.d-head { display: flex; align-items: center; justify-content: space-between; }
.d-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.d-title { margin: 2px 0 0; font-size: 15.5px; font-weight: 650; line-height: 1.35; }
.d-body { margin: 0; font-size: 13.5px; line-height: 1.6;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 8px; padding: 10px 12px; }
.d-pin { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px;
         background: var(--surface); border: 1px solid var(--border);
         border-radius: 7px; padding: 7px 10px; }
/* min-width:0 lets the flex item shrink below its content width — without it
   a long accessible name (the pinned node's whole text) forces the panel wider
   and the WHOLE slide-over scrolls sideways. */
.d-pin .nm { flex: 1; min-width: 0; font-family: ui-monospace, monospace;
             overflow-wrap: anywhere; word-break: break-word; }
.d-comment { border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; }
.d-comment .who { margin: 0 0 4px; font-size: 11.5px; font-weight: 600; color: var(--muted);
                  display: flex; align-items: center; gap: 6px; }
.d-comment .txt { margin: 0; font-size: 13px; line-height: 1.55; white-space: pre-wrap; }
.chip.status { background: var(--surface-2, var(--surface)); color: var(--muted); }
.chip.agent { background: var(--accent); color: var(--accent-fg); }

/* ── moved here from HOST_CSS ───────────────────────────────────────────
   These style elements INSIDE the shadow root, so they must live in CSS.
   Appending them to the end of this file put them in HOST_CSS, which is
   injected into the host document — where none of these selectors exist.
   The markdown still rendered (the DOM was right) but with UA styling only,
   which is exactly the kind of bug that looks fine in a screenshot. */
/* ── rendered markdown (see markdown.ts) ─────────────────────────────── */
.md-p { margin: 0 0 8px; line-height: 1.55; }
.md-p:last-child { margin-bottom: 0; }
.md-h { margin: 12px 0 6px; font-size: 13px; font-weight: 600; line-height: 1.35; color: var(--text); }
.md-h:first-child { margin-top: 0; }
.md-list { margin: 0 0 8px; padding-inline-start: 20px; }
.md-list li { margin: 2px 0; line-height: 1.5; }
.md-list:last-child { margin-bottom: 0; }
.md-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 4px;
}
.md-pre {
  margin: 0 0 8px; padding: 9px 11px; overflow-x: auto;
  border-radius: 8px; background: var(--bg); border: 1px solid var(--border);
}
.md-pre:last-child { margin-bottom: 0; }
.md-pre code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; line-height: 1.5; white-space: pre;
  background: none; border: 0; padding: 0;
}
.md-quote {
  margin: 0 0 8px; padding: 2px 0 2px 10px; color: var(--muted);
  border-inline-start: 2px solid var(--border);
}
.md-quote .md-p:last-child { margin-bottom: 0; }
.md-strong { font-weight: 600; }
.md-em { font-style: italic; }
.md-del { opacity: .65; }
.md-a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.d-body hr, .txt hr { margin: 10px 0; border: 0; border-top: 1px solid var(--border); }
.txt { margin: 0; font-size: 13px; }

/* Link out to the full board from the on-this-page listing. */
.board-link {
  display: inline-block; margin-top: 10px; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 12.5px; color: var(--text); text-decoration: none;
  background: var(--bg);
}
.board-link:hover { border-color: var(--accent); color: var(--accent); }

/* "who is working on this" — a spinner plus the agent's name. */
.agent-tag {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  max-width: 42%; padding: 2px 7px 2px 5px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--border);
}
.agent-tag .who {
  font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agent-tag .spin { width: 10px; height: 10px; border-width: 1.5px; flex: none; }

/* Inline SVG icons (see icons.ts). Sized in em so they track the label they
   sit beside, and flex:none so a long label never squashes them. */
.ico { flex: none; width: 1em; height: 1em; }
button .ico, a .ico { margin-inline-end: 2px; vertical-align: -0.125em; }
.fab-ico { display: inline-flex; align-items: center; }
.board-link { display: inline-flex; align-items: center; gap: 6px; }
.pin-btn, .addfile, .shot, .clear-pin {
  display: inline-flex; align-items: center; gap: 6px;
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