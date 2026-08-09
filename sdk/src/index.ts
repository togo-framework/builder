import { OWN_MARKER } from "./anchor";
import { ACCEPT, humanSize, kindOf, limitFor, normalizeRoute, screenshot } from "./capture";
import { dict } from "./i18n";
import { highlight, startPicker } from "./picker";
import { createDetail, httpDetail, type DetailView } from "./detail";
import { CSS, HOST_CSS } from "./styles";
import { httpTransport } from "./transport";
import type { Attachment, Handle, IssueSummary, IssueType, MountOptions, PinAnchor } from "./types";
import { icon, label as iconLabel } from "./icons";

const FAB_POS_KEY = "builder.fab.position";
const TYPES: IssueType[] = ["bug", "feature", "question", "discussion"];
// Mirrors the server's cap (internal/issues: maxPins). It truncates silently
// past this, so the widget stops accepting pins at the same number rather than
// letting a reporter place twelve and send eight.
const MAX_PINS = 8;

/**
 * Mount the feedback widget. One call is the entire integration:
 *
 *   <script src="/sdk/builder-sdk.js"></script>
 *   <script>BuilderIssues.mount()</script>
 */
export function mount(opts: MountOptions = {}): Handle {
  const t = dict(opts.locale ?? document.documentElement.lang ?? "en");
  const transport = opts.transport ?? httpTransport(opts.apiBase);
  const locale = opts.locale ?? "en";

  // Shadow DOM, not a portal: the host page cannot restyle us and we cannot
  // leak into it. A React portal inherits the host's cascade, which is how
  // feedback widgets end up inheriting a `* { box-sizing }` or a global font.
  const host = document.createElement("div");
  host.setAttribute(OWN_MARKER, "");
  host.setAttribute("dir", t.dir);
  if (opts.theme) host.setAttribute("data-theme", opts.theme);
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS + (opts.accent ? `:host{--accent:${sanitizeColor(opts.accent)}}` : "");
  root.appendChild(style);

  // The only styles that must live in the host document: pin-mode decoration.
  const hostStyle = document.createElement("style");
  hostStyle.setAttribute(OWN_MARKER, "");
  hostStyle.textContent = HOST_CSS;
  document.head.appendChild(hostStyle);

  // ---- state -------------------------------------------------------------
  let issues: IssueSummary[] = [];
  let pins: PinAnchor[] = [];
  let files: Attachment[] = [];
  let type: IssueType = "bug";
  let formOpen = false;
  let busy = false;
  let cancelPick: (() => void) | null = null;
  let detail: DetailView | null = null;

  // ---- markup ------------------------------------------------------------
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <button class="fab" part="fab" aria-haspopup="dialog" aria-expanded="false">
      <span class="fab-ico"></span><span class="fab-label"></span><span class="count hidden"></span>
    </button>
    <aside class="panel" role="dialog" aria-modal="false" data-open="false">
      <!-- The brand row names the surface and shows the route the panel is
           scoped to — the subline is the answer to "issues on WHICH page?",
           which a bare "Feedback" title left implicit. -->
      <div class="head">
        <div class="brand">
          <span class="brand-ico"></span>
          <div class="brand-txt"><h2></h2><span class="brand-sub"></span></div>
        </div>
        <button class="x" aria-label=""></button>
      </div>
      <div class="body">
        <p class="intro"></p>
        <button class="primary report"></button>

        <div class="listing">
          <div class="label lbl-page"></div>
          <div class="rows"></div>
          <!-- The panel shows only issues for THIS page. Getting to the full
               board previously meant knowing the /issues URL by heart. -->
          <a class="board-link" href="/issues" target="_blank" rel="noopener"></a>
        </div>

        <!-- The builder's own screens, as an app launcher.
             These used to be four permanent items in the product's sidebar.
             They belong to the tooling, not to the app being built, so they
             live behind this button and open as a layer over the page.
             Last in the column (and anchored to the bottom by CSS): the page's
             issues are what this panel is FOR; the launcher is its side door. -->
        <div class="apps">
          <div class="label lbl-apps"></div>
          <div class="appgrid"></div>
        </div>
      </div>
    </aside>

    <!-- The report form, as a draggable modal.
         It used to live inline in the slide-over, which meant filling it in
         covered the right-hand third of the page you were reporting on — and
         pinning an element or taking a screenshot needs you to SEE that page.
         A modal you can drag out of the way solves both: the form stays put
         while you work around it. -->
    <div class="modal" data-open="false" role="dialog" aria-modal="true" aria-label="">
      <div class="modal-card">
        <div class="modal-head">
          <h2 class="modal-title"></h2>
          <button type="button" class="modal-x" aria-label=""></button>
        </div>
        <form class="form" novalidate>
          <div class="modal-body">
            <div class="label lbl-title"></div>
            <input type="text" name="title" maxlength="255" required>

            <div class="row2">
              <div>
                <div class="label lbl-type"></div>
                <div class="pills"></div>
              </div>
            </div>

            <div class="label lbl-loc"></div>
            <div class="btns">
              <button type="button" class="ghost pin" aria-pressed="false"></button>
              <button type="button" class="ghost clearpin hidden"></button>
            </div>
            <div class="pin-preview hidden"></div>

            <div class="label lbl-details"></div>
            <textarea name="body"></textarea>
            <p class="hint lbl-md"></p>

            <div class="label lbl-att"></div>
            <div class="btns">
              <button type="button" class="ghost addfile"></button>
              <button type="button" class="ghost shot"></button>
            </div>
            <div class="files"></div>
            <input type="file" class="filein hidden" multiple accept="${ACCEPT}">

            <div class="label lbl-url"></div>
            <input type="text" name="url" disabled>

            <p class="note hidden"></p>
          </div>
          <div class="modal-foot">
            <button type="button" class="ghost cancel"></button>
            <button type="submit" class="primary send"></button>
          </div>
        </form>
      </div>
    </div>

`;
  root.appendChild(wrap);

  const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
  const fab = $<HTMLButtonElement>(".fab");
  const panel = $<HTMLElement>(".panel");
  const form = $<HTMLFormElement>(".form");
  const listing = $<HTMLElement>(".listing");
  const modal = $<HTMLElement>(".modal");
  const modalCard = $<HTMLElement>(".modal-card");
  const modalHead = $<HTMLElement>(".modal-head");
  const modalX = $<HTMLButtonElement>(".modal-x");
  const cancelBtn = $<HTMLButtonElement>(".cancel");
  const rows = $<HTMLElement>(".rows");
  const pillbox = $<HTMLElement>(".pills");
  const note = $<HTMLParagraphElement>(".note");
  const fileList = $<HTMLElement>(".files");
  const fileIn = $<HTMLInputElement>(".filein");
  const countEl = $<HTMLElement>(".count");
  const appGrid = $<HTMLElement>(".appgrid");
  const titleIn = $<HTMLInputElement>('input[name="title"]');
  const bodyIn = $<HTMLTextAreaElement>('textarea[name="body"]');
  const urlIn = $<HTMLInputElement>('input[name="url"]');
  const pinBtn = $<HTMLButtonElement>(".pin");
  // See MountOptions.framedHost. Both of these read the DOM, and the DOM of a
  // framed product is not ours to read.
  if (opts.framedHost) {
    const why =
      "Not available here: this page frames your product on another origin, " +
      "and the browser will not let one origin read another's pixels or elements. " +
      "Load the widget inside the product for pinning and screenshots.";
    for (const sel of [".pin", ".shot"]) {
      const b = $<HTMLButtonElement>(sel);
      b.disabled = true;
      b.title = why;
      b.setAttribute("aria-disabled", "true");
    }
  }
  const clearPinBtn = $<HTMLButtonElement>(".clearpin");
  const pinPreview = $<HTMLElement>(".pin-preview");
  const sendBtn = $<HTMLButtonElement>(".send");

  // object URLs for screenshot/image thumbnails, keyed by the attachment they
  // preview. Revoked on remove/reset/destroy so a long report session does not
  // leak one blob URL per capture.
  const thumbURLs = new WeakMap<Attachment, string>();
  function thumbURLFor(f: Attachment): string {
    let u = thumbURLs.get(f);
    if (!u) {
      u = URL.createObjectURL(f.blob);
      thumbURLs.set(f, u);
    }
    return u;
  }
  function revokeThumb(f: Attachment) {
    const u = thumbURLs.get(f);
    if (u) {
      URL.revokeObjectURL(u);
      thumbURLs.delete(f);
    }
  }

  // ---- static copy -------------------------------------------------------
  $(".fab-label").textContent = t.fab;
  $("h2").textContent = t.title;
  // role=dialog does not take its accessible name from the heading inside it.
  panel.setAttribute("aria-label", t.title);
  $(".brand-ico").replaceChildren(icon("messageSquare", 16));
  // The route, not the full URL: the panel scopes issues by route, and origin
  // + query would truncate away the only part that varies.
  $(".brand-sub").textContent = normalizeRoute();
  $(".fab-ico").replaceChildren(icon("messageSquare", 14));
  $(".x").replaceChildren(icon("x", 16));
  $(".x").setAttribute("aria-label", t.close);
  $(".intro").textContent = t.intro;
  iconLabel($(".report"), "plus", t.report, 15);
  $(".lbl-type").textContent = t.type;
  $(".lbl-title").textContent = t.titleLabel;
  $(".lbl-details").textContent = t.details;
  $(".lbl-url").textContent = t.pageUrl;
  $(".lbl-loc").textContent = t.location;
  $(".lbl-att").textContent = t.attachments;
  $(".lbl-page").textContent = t.onThisPage;
  iconLabel($(".board-link"), "arrowRight", t.openBoard);
  $(".lbl-apps").textContent = t.apps;
  $(".modal-title").textContent = t.reportTitle;
  modalX.setAttribute("aria-label", t.close);
  modalX.appendChild(icon("x", 16));
  modal.setAttribute("aria-label", t.reportTitle);
  cancelBtn.textContent = t.cancel;
  $(".lbl-md").textContent = t.markdownHint;
  titleIn.placeholder = t.titlePlaceholder;
  bodyIn.placeholder = t.detailsPlaceholder;
  iconLabel(pinBtn, "pin", t.pin);
  iconLabel(clearPinBtn, "x", t.clear);
  iconLabel($(".addfile"), "paperclip", t.addFile);
  iconLabel($(".shot"), "camera", t.screenshot);
  sendBtn.textContent = t.submit;

  for (const ty of TYPES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pill";
    b.dataset.type = ty;
    b.textContent = t[ty];
    b.setAttribute("aria-pressed", String(ty === type));
    b.addEventListener("click", () => {
      type = ty;
      pillbox.querySelectorAll(".pill").forEach((p) =>
        p.setAttribute("aria-pressed", String((p as HTMLElement).dataset.type === ty)),
      );
    });
    pillbox.appendChild(b);
  }

  // ---- draggable FAB -----------------------------------------------------
  // A 4px threshold before a drag starts, so a click is still a click. Without
  // it every open gesture registers as a 1px drag and the panel never opens.
  const DRAG_THRESHOLD = 4;
  let drag: { x: number; y: number; ox: number; oy: number; moved: boolean } | null = null;

  const place = (right: number, bottom: number) => {
    const r = Math.max(8, Math.min(right, window.innerWidth - 80));
    const b = Math.max(8, Math.min(bottom, window.innerHeight - 48));
    fab.style.insetInlineEnd = `${r}px`;
    fab.style.insetBlockEnd = `${b}px`;
  };
  const saved = readPos();
  place(saved?.right ?? opts.position?.right ?? 24, saved?.bottom ?? opts.position?.bottom ?? 24);

  fab.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const r = fab.getBoundingClientRect();
    drag = {
      x: e.clientX,
      y: e.clientY,
      ox: window.innerWidth - r.right,
      oy: window.innerHeight - r.bottom,
      moved: false,
    };
    fab.setPointerCapture(e.pointerId);
  });
  fab.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    place(drag.ox - dx, drag.oy - dy);
  });
  fab.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    fab.releasePointerCapture(e.pointerId);
    if (moved) {
      const r = fab.getBoundingClientRect();
      writePos(window.innerWidth - r.right, window.innerHeight - r.bottom);
      return; // a drag must not also toggle the panel
    }
    toggle();
  });
  // Keyboard path — a draggable control still has to be operable without one.
  fab.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
  window.addEventListener("resize", () => {
    const r = fab.getBoundingClientRect();
    place(window.innerWidth - r.right, window.innerHeight - r.bottom);
  });

  // ---- panel -------------------------------------------------------------
  function toggle() {
    panel.dataset.open === "true" ? close() : open();
  }
  function open() {
    panel.dataset.open = "true";
    fab.setAttribute("aria-expanded", "true");
    urlIn.value = location.href;
    // Re-read on every open: in an SPA the route changes without a remount,
    // and a header pinned to the mount-time route would quietly lie.
    $(".brand-sub").textContent = normalizeRoute();
    void refresh();
  }
  function close() {
    panel.dataset.open = "false";
    panel.dataset.detail = "false";
    fab.setAttribute("aria-expanded", "false");
    showForm(false);
    cancelPick?.();
    cancelPick = null;
  }

  // ---- app launcher ------------------------------------------------------
  //
  // The builder's four screens, opened as a layer over the host page instead of
  // living in its navigation. Each is the real route in an iframe on the app's
  // own origin, so there is exactly one implementation of each and the session
  // cookie already applies.
  //
  // Colours are fixed per app rather than derived: these four are a permanent,
  // memorised set, and a hash-derived palette would reshuffle them the day one
  // is renamed.
  const APPS = [
    { key: "agents", path: "/agents", color: "#8b5cf6", label: t.appAgents },
    { key: "skills", path: "/skills", color: "#06b6d4", label: t.appSkills },
    { key: "issues", path: "/issues", color: "#f59e0b", label: t.appIssues },
    { key: "vault", path: "/vault", color: "#10b981", label: t.appVault },
    { key: "sources", path: "/sources", color: "#3b82f6", label: t.appSources },
    { key: "docs", path: "/library", color: "#f43f5e", label: t.appDocs },
    { key: "brain", path: "/brain", color: "#a855f7", label: t.appBrain },
    { key: "chat", path: "/chat", color: "#14b8a6", label: t.appChat },
    { key: "mcp", path: "/mcp", color: "#ec4899", label: t.appMcp },
    { key: "terminal", path: "/terminal", color: "#64748b", label: t.appTerminal },
  ] as const;

  // Where the app lives. apiBase is the builder's origin when the widget is
  // embedded in a different product; same-origin is the default and the common
  // case, and an invalid value must not produce a link to nowhere.
  function appOrigin(): string {
    const base = (opts.apiBase ?? "").trim();
    if (!base) return "";
    try {
      return new URL(base, location.href).origin;
    } catch {
      return "";
    }
  }

  const appURL = (path: string, embed: boolean) =>
    `${appOrigin()}${path}${embed ? "?embed=1" : ""}`;

  for (const app of APPS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "app";
    b.dataset.app = app.key;

    const chip = document.createElement("span");
    chip.className = "app-ico";
    // Solid fill, white glyph (glyph colour and depth live in the stylesheet).
    // The earlier 22%-alpha tint washed ten distinct surfaces into one grey
    // smear — the tile colour IS the identity, so it gets full strength.
    chip.style.background = app.color;
    chip.appendChild(icon(app.key, 18));

    const name = document.createElement("span");
    name.textContent = app.label;

    b.append(chip, name);
    b.addEventListener("click", () => openApp(app));
    appGrid.appendChild(b);
  }

  // Opening an app NAVIGATES. It does not open a layer.
  //
  // These screens used to load in an iframe overlay stapled to the host's
  // viewport, and that was the panel wearing a page. The URL never changed, so
  // an operator could not link a colleague to an issue, could not bookmark the
  // board, could not press Back, and lost their place on refresh. The board
  // itself was squeezed into a floating layer with two scroll contexts and a
  // close button where a page just wants to be navigated away from.
  //
  // ?embed=1 stays. It is not an iframe flag — it means "render this screen on
  // its own, without the host product's sidebar and account menu". Arriving as
  // a real navigation and then drawing the host's chrome around it would put
  // the operator back inside the application they just left, which is the
  // thing the launcher exists to escape. The app persists the mode for the
  // session, so a Link deeper into the screen keeps it.
  function openApp(app: (typeof APPS)[number]) {
    const origin = appOrigin();
    const url = appURL(app.path, true);

    // Cross-origin means the widget is embedded in somebody else's product. We
    // navigate the top-level document only when the app lives on THIS origin;
    // yanking an operator out of the host application they were using, losing
    // whatever they had unsaved, is not a thing a feedback widget may do. A new
    // tab is still a real page with a real URL, which is the whole ask.
    if (origin && origin !== location.origin) {
      // Cross-origin: sessionStorage on the target cannot be written from
      // here, so the query param is the only carrier. It is enough — the app
      // stores the flag itself on arrival.
      window.open(url, "_blank", "noopener");
      close();
      return;
    }

    // Same origin: set the flag DIRECTLY rather than trusting the query string
    // to survive the trip. The router validates search params per route and
    // drops the ones a route does not declare, so ?embed=1 reaches /mcp and is
    // stripped from /issues before the layout ever reads it — the chrome came
    // back on exactly the screens most worth opening. Writing the flag here is
    // immune to that, and the param stays only so the mode is visible in the
    // address bar while debugging.
    try {
      sessionStorage.setItem("builder:standalone", "1");
      // Where Close returns to. history.back() would only step one entry, so
      // after two screens it lands on another builder screen rather than on
      // the page the operator actually left. This is that page.
      sessionStorage.setItem("builder:standalone:return", location.href);
    } catch {
      // Private browsing, or storage disabled. The param is the fallback, and
      // Close falls back to history.
    }
    close();
    location.assign(url);
  }


  // ---- the report modal, dragged by its header ---------------------------
  //
  // Reporting means looking at the thing you are reporting on. A form pinned
  // to the right edge of the screen covers exactly the part of the page you
  // most often need to see while describing it, and pinning an element or
  // taking a screenshot needs the page visible. So: move it.
  //
  // Position is not remembered between openings. It is moved to uncover
  // something specific on THIS page, and restoring yesterday's offset on a
  // different layout would put it somewhere arbitrary.
  let mDrag: { dx: number; dy: number } | null = null;

  modalHead.addEventListener("pointerdown", (e) => {
    // Not from the close button — that is a click, not a handle.
    if ((e.target as Element).closest(".modal-x")) return;
    const r = modalCard.getBoundingClientRect();
    // Switch from grid-centred to absolutely placed at the position it is
    // already in, so the first drag frame does not jump.
    modalCard.style.position = "fixed";
    modalCard.style.margin = "0";
    modalCard.style.left = `${r.left}px`;
    modalCard.style.top = `${r.top}px`;
    mDrag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    modalHead.setPointerCapture(e.pointerId);
  });

  modalHead.addEventListener("pointermove", (e) => {
    if (!mDrag) return;
    const r = modalCard.getBoundingClientRect();
    // Clamped so the header can never be dragged off-screen — a modal whose
    // handle is past the edge cannot be brought back.
    const x = Math.min(Math.max(e.clientX - mDrag.dx, 8 - r.width + 80), innerWidth - 80);
    const y = Math.min(Math.max(e.clientY - mDrag.dy, 8), innerHeight - 44);
    modalCard.style.left = `${x}px`;
    modalCard.style.top = `${y}px`;
  });

  const endDrag = (e: PointerEvent) => {
    if (!mDrag) return;
    mDrag = null;
    try { modalHead.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
  };
  modalHead.addEventListener("pointerup", endDrag);
  modalHead.addEventListener("pointercancel", endDrag);

  // Re-centre on the next open, and drop the inline placement so the grid
  // centring applies again.
  function recentreModal() {
    modalCard.style.position = "";
    modalCard.style.left = "";
    modalCard.style.top = "";
    modalCard.style.margin = "";
  }

  modalX.addEventListener("click", () => showForm(false));
  cancelBtn.addEventListener("click", () => showForm(false));

  // Escape closes the form. Bound to the host document because the pin picker
  // moves focus onto the page itself.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && formOpen && !cancelPick) showForm(false);
  });
  $(".x").addEventListener("click", close);
  root.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape" && !cancelPick) close();
  });

  // The panel is deliberately aria-modal="false" — the host page stays
  // interactive underneath it — so a click landing on that page must dismiss
  // the panel instead of leaving both layers open at once. Capture phase, like
  // the picker's own listeners, so a host handler that stops propagation on
  // bubble can't swallow this first.
  function onOutsideClick(e: MouseEvent) {
    if (panel.dataset.open !== "true" || cancelPick) return;
    if (e.composedPath().includes(host)) return;
    close();
  }
  document.addEventListener("click", onOutsideClick, true);

  // The form is a modal now, not a section of the panel. The panel stays open
  // behind it — the list of issues on this page is context for what you are
  // about to write, and closing it would hide the duplicate you are about to
  // file.
  function showForm(on: boolean) {
    formOpen = on;
    modal.dataset.open = on ? "true" : "false";
    if (on) {
      recentreModal();
      setTimeout(() => titleIn.focus(), 30);
    } else {
      reset();
      cancelPick?.();
      cancelPick = null;
    }
  }
  $(".report").addEventListener("click", () => showForm(true));

  function reset() {
    form.reset();
    pins = [];
    files.forEach(revokeThumb);
    files = [];
    type = "bug";
    pillbox.querySelectorAll(".pill").forEach((p) =>
      p.setAttribute("aria-pressed", String((p as HTMLElement).dataset.type === "bug")),
    );
    renderPins();
    renderFiles();
    setNote("");
  }

  function setNote(msg: string, kind: "err" | "ok" | "" = "") {
    note.textContent = msg;
    note.className = `note ${kind}`.trim();
    note.classList.toggle("hidden", !msg);
  }

  // ---- pin ---------------------------------------------------------------
  pinBtn.addEventListener("click", () => {
    if (cancelPick) {
      cancelPick();
      cancelPick = null;
      pinBtn.setAttribute("aria-pressed", "false");
      iconLabel(pinBtn, "pin", t.pin);
      return;
    }
    // Get out of the user's way while they aim at the page behind us.
    //
    // BOTH surfaces. This used to hide only the panel, which was right when the
    // form lived inside it — now the form is a modal sitting over the middle of
    // the page, so picking an element meant aiming at whatever the modal was not
    // covering. Hidden directly rather than through showForm(), which resets the
    // form: the title and description typed so far must survive the pick.
    panel.dataset.open = "false";
    modal.dataset.open = "false";
    pinBtn.setAttribute("aria-pressed", "true");
    pinBtn.textContent = t.pinning;

    const restore = () => {
      // Only the modal comes back if the form is what was open. Reopening the
      // panel underneath a modal the operator is mid-way through leaves two
      // layers up for no reason.
      if (formOpen) modal.dataset.open = "true";
      else panel.dataset.open = "true";
    };

    cancelPick = startPicker(
      (anchor, pickedEl) => {
        // Appended, and capped at what the server accepts — it truncates
        // silently past maxPins, so a reporter who pinned twelve things would
        // lose the last few with no indication.
        if (pins.length < MAX_PINS) pins = [...pins, anchor];
        cancelPick = null;
        restore();
        renderPins();
        // Confirm the pick on the page itself, not just in the panel text —
        // the reporter is looking at the page, not the button, at this instant.
        pickedEl.classList.add("builder-pin-found");
        setTimeout(() => pickedEl.classList.remove("builder-pin-found"), 3000);
      },
      () => {
        cancelPick = null;
        restore();
        renderPins();
      },
    );
  });
  clearPinBtn.addEventListener("click", () => {
    pins = [];
    renderPins();
  });

  // Several pins, not one.
  //
  // A report is often about a relationship between parts of a page — "this
  // button writes to that panel", "these three cards are misaligned" — and with
  // a single pin the reporter had to describe the rest in prose, which is
  // exactly the ambiguity that gets an issue parked at triage. The backend and
  // the schema always accepted a list; only this widget insisted on one.
  function renderPins() {
    const has = pins.length > 0;
    pinBtn.setAttribute("aria-pressed", String(has));
    // The button keeps working after the first pick, so adding a second is the
    // same gesture as adding the first.
    iconLabel(pinBtn, "pin", has ? t.pinAnother : t.pin);
    clearPinBtn.classList.toggle("hidden", !has);
    pinPreview.classList.toggle("hidden", !has);

    pinPreview.textContent = "";
    pins.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "pinrow";

      const n = document.createElement("span");
      n.className = "pinnum";
      n.textContent = String(i + 1);

      const label = p.name || p.hint || "";
      const txt = document.createElement("span");
      txt.className = "pintxt";
      txt.textContent = `<${p.tag ?? "?"}>${label ? ` “${label}”` : ""}`;

      // Each pin is removable on its own. With a list, one "Clear" that wipes
      // every pin is the wrong granularity — mis-clicking the fourth pin should
      // not cost the first three.
      const del = document.createElement("button");
      del.type = "button";
      del.className = "pindel";
      del.setAttribute("aria-label", `${t.clear} ${i + 1}`);
      del.appendChild(icon("x", 12));
      del.addEventListener("click", () => {
        pins.splice(i, 1);
        renderPins();
      });

      row.append(n, txt, del);
      pinPreview.appendChild(row);
    });
  }

  // ---- attachments -------------------------------------------------------
  $(".addfile").addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", () => {
    for (const f of Array.from(fileIn.files ?? [])) addFile(f);
    fileIn.value = "";
  });

  function addFile(f: File) {
    const kind = kindOf(f.type);
    const cap = limitFor(kind);
    if (f.size > cap) {
      setNote(`${f.name} is ${humanSize(f.size)} — the limit is ${humanSize(cap)}.`, "err");
      return;
    }
    files.push({ name: f.name, mime: f.type, size: f.size, kind, blob: f });
    renderFiles();
    setNote("");
  }

  $(".shot").addEventListener("click", async () => {
    const btn = $<HTMLButtonElement>(".shot");
    btn.disabled = true;
    // Hide the widget so it does not appear in its own screenshot.
    const wasOpen = panel.dataset.open;
    panel.dataset.open = "false";
    host.style.visibility = "hidden";
    try {
      await new Promise((r) => setTimeout(r, 120)); // let the paint settle
      files.push(await screenshot());
      renderFiles();
      setNote("");
    } catch (err) {
      setNote(String((err as Error).message || err), "err");
    } finally {
      host.style.visibility = "";
      panel.dataset.open = wasOpen ?? "true";
      btn.disabled = false;
    }
  });

  function renderFiles() {
    fileList.replaceChildren();
    files.forEach((f, i) => {
      const row = document.createElement("div");
      row.className = "file";
      if (f.kind === "screenshot" || f.kind === "image") {
        const img = document.createElement("img");
        img.className = "thumb";
        img.src = thumbURLFor(f);
        img.alt = "";
        row.appendChild(img);
      }
      const nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = f.name;
      const sz = document.createElement("span");
      sz.textContent = humanSize(f.size);
      const rm = document.createElement("button");
      rm.type = "button";
      rm.replaceChildren(icon("x", 12));
      rm.setAttribute("aria-label", t.clear);
      rm.addEventListener("click", () => {
        revokeThumb(f);
        files.splice(i, 1);
        renderFiles();
      });
      row.append(nm, sz, rm);
      fileList.appendChild(row);
    });
  }

  // ---- submit ------------------------------------------------------------
  async function submit() {
    if (busy) return;
    const title = titleIn.value.trim();
    if (!title) {
      setNote(t.titleRequired, "err");
      titleIn.focus();
      return;
    }
    busy = true;
    sendBtn.disabled = true;
    sendBtn.textContent = t.submitting;
    try {
      const r = await transport.create({
        type,
        title,
        body: bodyIn.value,
        route: normalizeRoute(),
        pageUrl: location.href,
        locale,
        pins,
        attachments: files,
      });
      setNote(t.created(r.number), "ok");
      opts.onCreated?.(r);
      setTimeout(() => {
        showForm(false);
        void refresh();
      }, 900);
    } catch (err) {
      setNote(String((err as Error).message || t.failed), "err");
    } finally {
      busy = false;
      sendBtn.disabled = false;
      sendBtn.textContent = t.submit;
    }
  }
  sendBtn.addEventListener("click", submit);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void submit();
  });

  // ---- listing -----------------------------------------------------------
  async function refresh() {
    if (formOpen) return;
    rows.replaceChildren(el("div", "empty", t.loading));
    try {
      issues = await transport.listByRoute(normalizeRoute());
    } catch {
      issues = [];
    }
    countEl.textContent = issues.length > 9 ? "9+" : String(issues.length);
    countEl.classList.toggle("hidden", issues.length === 0);
    $(".lbl-page").textContent = issues.length ? t.issueCount(issues.length) : t.onThisPage;

    rows.replaceChildren();
    if (!issues.length) {
      rows.appendChild(el("div", "empty", t.none));
      return;
    }
    for (const it of issues) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "row";
      b.append(el("span", "num", `#${it.number}`), el("span", `chip ${it.type}`, t[it.type]));
      b.appendChild(el("span", "t", it.title));
      if (it.busy) {
        // Name the agent. A bare spinner says "something is happening"; the
        // operator's actual question is WHICH agent took this, because that is
        // what tells them whether the right specialist picked it up.
        const who = el("span", "agent-tag", "");
        who.appendChild(el("span", "spin", ""));
        who.appendChild(el("span", "who", it.agent || t.agentWorking));
        who.setAttribute("title", it.agent ? t.agentWorkingBy(it.agent) : t.agentWorking);
        b.appendChild(who);
      }
      // The chevron says "this row opens something" — without it a grouped
      // list of buttons is indistinguishable from a read-only table.
      const go = icon("chevronRight", 14);
      go.classList.add("go");
      b.appendChild(go);
      // Open in the panel, not a new tab: the reporter is mid-task on the page
      // the issue is about, and a navigation throws that context away.
      b.addEventListener("click", () => void showDetail(it.number));
      rows.appendChild(b);
    }
  }

  async function showDetail(number: number) {
    if (!detail) {
      detail = createDetail(locale, httpDetail(opts.apiBase), () => {
        detail?.el.classList.add("hidden");
        listing.classList.remove("hidden");
        $(".report").classList.remove("hidden");
        // showDetail hides the launcher too — restore it, or the first detail
        // view removes the launcher for the rest of the session.
        $(".apps").classList.remove("hidden");
        panel.dataset.detail = "false";
        void refresh();
      });
      $(".body").appendChild(detail.el);
    }
    listing.classList.add("hidden");
    $(".report").classList.add("hidden");
    $(".apps").classList.add("hidden");
    // The form is its own modal now, so it is dismissed rather than hidden —
    // leaving it open over a detail view would stack two dialogs.
    showForm(false);
    detail.el.classList.remove("hidden");
    // A single issue's title, body, pin and comment thread need real room to
    // read and to type a reply into — the listing's 420px column was sized for
    // a scannable row of short titles, not a document.
    panel.dataset.detail = "true";
    await detail.load(number);
  }

  const handle: Handle = {
    open,
    close,
    refresh: () => void refresh(),
    destroy() {
      cancelPick?.();
      files.forEach(revokeThumb);
      document.removeEventListener("click", onOutsideClick, true);
      host.remove();
      hostStyle.remove();
    },
  };
  void refresh();
  return handle;
}

/** Re-find and flash a stored pin. Exposed for the issue detail page. */
export { highlight as highlightPin };

function el(tag: string, cls: string, txt: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = txt;
  return e;
}

function readPos(): { right: number; bottom: number } | null {
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.right === "number" && typeof p?.bottom === "number" ? p : null;
  } catch {
    return null; // a disabled localStorage must not break the widget
  }
}

function writePos(right: number, bottom: number) {
  try {
    localStorage.setItem(FAB_POS_KEY, JSON.stringify({ right, bottom }));
  } catch {
    /* private browsing */
  }
}

/** Only allow a colour through if it parses; otherwise CSS injection. */
function sanitizeColor(c: string): string {
  return /^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(c.trim()) ? c.trim() : "";
}

export type { MountOptions, Handle, IssueSummary, NewIssue, PinAnchor } from "./types";
