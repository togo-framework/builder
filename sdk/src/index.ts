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
      <div class="head"><h2></h2><button class="x" aria-label=""></button></div>
      <div class="body">
        <p class="intro"></p>
        <button class="primary report"></button>

        <!-- The builder's own screens, as an app launcher.
             These used to be four permanent items in the product's sidebar.
             They belong to the tooling, not to the app being built, so they
             live behind this button and open as a layer over the page. -->
        <div class="apps">
          <div class="label lbl-apps"></div>
          <div class="appgrid"></div>
        </div>

        <form class="form hidden" novalidate>
          <div class="label lbl-type"></div>
          <div class="pills"></div>

          <div class="label lbl-title"></div>
          <input type="text" name="title" maxlength="255" required>

          <div class="label lbl-details"></div>
          <textarea name="body"></textarea>

          <div class="label lbl-url"></div>
          <input type="text" name="url" disabled>

          <div class="label lbl-loc"></div>
          <div class="btns">
            <button type="button" class="ghost pin" aria-pressed="false"></button>
            <button type="button" class="ghost clearpin hidden"></button>
          </div>
          <div class="pin-preview hidden"></div>

          <div class="label lbl-att"></div>
          <div class="btns">
            <button type="button" class="ghost addfile"></button>
            <button type="button" class="ghost shot"></button>
          </div>
          <div class="files"></div>
          <input type="file" class="filein hidden" multiple accept="${ACCEPT}">

          <p class="note hidden"></p>
        </form>

        <div class="listing">
          <div class="label lbl-page"></div>
          <div class="rows"></div>
          <!-- The panel shows only issues for THIS page. Getting to the full
               board previously meant knowing the /issues URL by heart. -->
          <a class="board-link" href="/issues" target="_blank" rel="noopener"></a>
        </div>
      </div>
      <div class="foot hidden"><button type="submit" class="primary send"></button></div>
    </aside>

    <!-- The overlay that hosts a builder screen.
         An iframe on the same origin rather than a re-implementation: these
         are the real pages, with the real session cookie, and keeping one copy
         of them is the entire point of moving them out of the sidebar. -->
    <div class="ov" data-open="false" role="dialog" aria-modal="true" aria-label="">
      <div class="ov-head">
        <span class="ov-ico"></span>
        <h2 class="ov-title"></h2>
        <a class="ov-tab" target="_blank" rel="noopener" aria-label=""></a>
        <button class="ov-x" aria-label=""></button>
      </div>
      <iframe class="ov-frame" title=""></iframe>
    </div>`;
  root.appendChild(wrap);

  const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
  const fab = $<HTMLButtonElement>(".fab");
  const panel = $<HTMLElement>(".panel");
  const form = $<HTMLFormElement>(".form");
  const listing = $<HTMLElement>(".listing");
  const foot = $<HTMLElement>(".foot");
  const rows = $<HTMLElement>(".rows");
  const pillbox = $<HTMLElement>(".pills");
  const note = $<HTMLParagraphElement>(".note");
  const fileList = $<HTMLElement>(".files");
  const fileIn = $<HTMLInputElement>(".filein");
  const countEl = $<HTMLElement>(".count");
  const appGrid = $<HTMLElement>(".appgrid");
  const ov = $<HTMLElement>(".ov");
  const ovFrame = $<HTMLIFrameElement>(".ov-frame");
  const ovTitle = $<HTMLElement>(".ov-title");
  const ovIco = $<HTMLElement>(".ov-ico");
  const ovTab = $<HTMLAnchorElement>(".ov-tab");
  const ovX = $<HTMLButtonElement>(".ov-x");
  const titleIn = $<HTMLInputElement>('input[name="title"]');
  const bodyIn = $<HTMLTextAreaElement>('textarea[name="body"]');
  const urlIn = $<HTMLInputElement>('input[name="url"]');
  const pinBtn = $<HTMLButtonElement>(".pin");
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
  $(".fab-ico").replaceChildren(icon("pencil", 15));
  $(".x").replaceChildren(icon("x", 15));
  $(".x").setAttribute("aria-label", t.close);
  $(".intro").textContent = t.intro;
  $(".report").textContent = t.report;
  $(".lbl-type").textContent = t.type;
  $(".lbl-title").textContent = t.titleLabel;
  $(".lbl-details").textContent = t.details;
  $(".lbl-url").textContent = t.pageUrl;
  $(".lbl-loc").textContent = t.location;
  $(".lbl-att").textContent = t.attachments;
  $(".lbl-page").textContent = t.onThisPage;
  iconLabel($(".board-link"), "arrowRight", t.openBoard);
  $(".lbl-apps").textContent = t.apps;
  ovX.setAttribute("aria-label", t.close);
  ovX.appendChild(icon("x", 16));
  ovTab.setAttribute("aria-label", t.openInTab);
  ovTab.appendChild(icon("external", 15));
  titleIn.placeholder = t.titlePlaceholder;
  bodyIn.placeholder = t.detailsPlaceholder;
  iconLabel(pinBtn, "pin", t.pin);
  iconLabel(clearPinBtn, "x", t.clear);
  iconLabel($(".addfile"), "paperclip", t.addFile);
  iconLabel($(".shot"), "image", t.screenshot);
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
    // 22% alpha on the fill, full strength on the glyph: the tile reads as that
    // colour without four saturated blocks fighting the panel behind them.
    chip.style.background = `${app.color}38`;
    chip.style.color = app.color;
    chip.appendChild(icon(app.key, 18));

    const name = document.createElement("span");
    name.textContent = app.label;

    b.append(chip, name);
    b.addEventListener("click", () => openApp(app));
    appGrid.appendChild(b);
  }

  let ovEscape: ((e: KeyboardEvent) => void) | null = null;

  function openApp(app: (typeof APPS)[number]) {
    ovFrame.src = appURL(app.path, true);
    ovFrame.title = app.label;
    ovTitle.textContent = app.label;
    ovTab.href = appURL(app.path, false);
    ov.setAttribute("aria-label", app.label);

    ovIco.textContent = "";
    ovIco.style.background = `${app.color}38`;
    ovIco.style.color = app.color;
    ovIco.appendChild(icon(app.key, 16));

    ov.dataset.open = "true";
    // The panel goes away underneath: the overlay covers it anyway, and leaving
    // it open means closing the overlay reveals a panel the operator had
    // forgotten was there.
    close();

    // Escape closes. Bound on the host document because focus is inside the
    // iframe as soon as the page loads, and a listener on the shadow root would
    // never see the key.
    ovEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeApp();
    };
    document.addEventListener("keydown", ovEscape);
  }

  function closeApp() {
    ov.dataset.open = "false";
    // Blank the frame rather than leaving it loaded. A hidden iframe keeps
    // polling — the board and the fleet both refresh on an interval — and the
    // operator closed it precisely to stop paying attention to it.
    ovFrame.src = "about:blank";
    if (ovEscape) document.removeEventListener("keydown", ovEscape);
    ovEscape = null;
  }

  ovX.addEventListener("click", closeApp);
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

  function showForm(on: boolean) {
    formOpen = on;
    form.classList.toggle("hidden", !on);
    listing.classList.toggle("hidden", on);
    foot.classList.toggle("hidden", !on);
    $(".report").classList.toggle("hidden", on);
    if (on) setTimeout(() => titleIn.focus(), 30);
    else reset();
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
    panel.dataset.open = "false";
    pinBtn.setAttribute("aria-pressed", "true");
    pinBtn.textContent = t.pinning;
    cancelPick = startPicker(
      (anchor, pickedEl) => {
        pins = [anchor];
        cancelPick = null;
        panel.dataset.open = "true";
        renderPins();
        // Confirm the pick on the page itself, not just in the panel text —
        // the reporter is looking at the page, not the button, at this instant.
        pickedEl.classList.add("builder-pin-found");
        setTimeout(() => pickedEl.classList.remove("builder-pin-found"), 3000);
      },
      () => {
        cancelPick = null;
        panel.dataset.open = "true";
        renderPins();
      },
    );
  });
  clearPinBtn.addEventListener("click", () => {
    pins = [];
    renderPins();
  });

  function renderPins() {
    const has = pins.length > 0;
    pinBtn.setAttribute("aria-pressed", String(has));
    iconLabel(pinBtn, "pin", has ? t.pinned(pins[0].tag ?? "?") : t.pin);
    clearPinBtn.classList.toggle("hidden", !has);
    pinPreview.classList.toggle("hidden", !has);
    if (has) {
      const p = pins[0];
      const label = p.name || p.hint || "";
      pinPreview.textContent = `<${p.tag ?? "?"}>${label ? ` “${label}”` : ""}`;
    }
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
        panel.dataset.detail = "false";
        void refresh();
      });
      $(".body").appendChild(detail.el);
    }
    listing.classList.add("hidden");
    $(".report").classList.add("hidden");
    form.classList.add("hidden");
    foot.classList.add("hidden");
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
