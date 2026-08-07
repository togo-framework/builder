import { OWN_MARKER } from "./anchor";
import { ACCEPT, humanSize, kindOf, limitFor, normalizeRoute, screenshot } from "./capture";
import { dict } from "./i18n";
import { highlight, startPicker } from "./picker";
import { createDetail, httpDetail, type DetailView } from "./detail";
import { CSS, HOST_CSS } from "./styles";
import { httpTransport } from "./transport";
import type { Attachment, Handle, IssueSummary, IssueType, MountOptions, PinAnchor } from "./types";

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
      <span aria-hidden="true">✎</span><span class="fab-label"></span><span class="count hidden"></span>
    </button>
    <aside class="panel" role="dialog" aria-modal="false" data-open="false">
      <div class="head"><h2></h2><button class="x" aria-label=""></button></div>
      <div class="body">
        <p class="intro"></p>
        <button class="primary report"></button>

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
    </aside>`;
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
  const titleIn = $<HTMLInputElement>('input[name="title"]');
  const bodyIn = $<HTMLTextAreaElement>('textarea[name="body"]');
  const urlIn = $<HTMLInputElement>('input[name="url"]');
  const pinBtn = $<HTMLButtonElement>(".pin");
  const clearPinBtn = $<HTMLButtonElement>(".clearpin");
  const sendBtn = $<HTMLButtonElement>(".send");

  // ---- static copy -------------------------------------------------------
  $(".fab-label").textContent = t.fab;
  $("h2").textContent = t.title;
  $(".x").textContent = "✕";
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
  $(".board-link").textContent = t.openBoard + " →";
  titleIn.placeholder = t.titlePlaceholder;
  bodyIn.placeholder = t.detailsPlaceholder;
  pinBtn.textContent = "📍 " + t.pin;
  clearPinBtn.textContent = "✕ " + t.clear;
  $(".addfile").textContent = "📎 " + t.addFile;
  $(".shot").textContent = "🖼 " + t.screenshot;
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
    fab.setAttribute("aria-expanded", "false");
    showForm(false);
    cancelPick?.();
    cancelPick = null;
  }
  $(".x").addEventListener("click", close);
  root.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape" && !cancelPick) close();
  });

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
      pinBtn.textContent = "📍 " + t.pin;
      return;
    }
    // Get out of the user's way while they aim at the page behind us.
    panel.dataset.open = "false";
    pinBtn.setAttribute("aria-pressed", "true");
    pinBtn.textContent = t.pinning;
    cancelPick = startPicker(
      (anchor) => {
        pins = [anchor];
        cancelPick = null;
        panel.dataset.open = "true";
        renderPins();
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
    pinBtn.textContent = has ? "📍 " + t.pinned(pins[0].tag ?? "?") : "📍 " + t.pin;
    clearPinBtn.classList.toggle("hidden", !has);
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
      const nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = f.name;
      const sz = document.createElement("span");
      sz.textContent = humanSize(f.size);
      const rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "✕";
      rm.setAttribute("aria-label", t.clear);
      rm.addEventListener("click", () => {
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
        void refresh();
      });
      $(".body").appendChild(detail.el);
    }
    listing.classList.add("hidden");
    $(".report").classList.add("hidden");
    form.classList.add("hidden");
    foot.classList.add("hidden");
    detail.el.classList.remove("hidden");
    await detail.load(number);
  }

  const handle: Handle = {
    open,
    close,
    refresh: () => void refresh(),
    destroy() {
      cancelPick?.();
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
