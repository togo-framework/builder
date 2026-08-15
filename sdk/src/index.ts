import { OWN_MARKER } from "./anchor";
import { ShellFrame, hostIsDark, hostLocale } from "./loader/frame";
import { collectHostFonts } from "./loader/fonts";
import { BRIDGE_MSG, installBridge } from "./bridge";
import { ACCEPT, humanSize, kindOf, limitFor, normalizeRoute, screenshot } from "./capture";
import { dict } from "./i18n";
import { highlight, startPicker } from "./picker";
import { createDetail, httpDetail, type DetailView } from "./detail";
import { CSS, HOST_CSS } from "./styles";
import { httpTransport } from "./transport";
import type {
  Attachment,
  BridgeApp,
  BridgeContext,
  Handle,
  IssueSummary,
  IssueType,
  MountOptions,
  HostApp,
  PinAnchor,
} from "./types";
import { hasIcon, icon, label as iconLabel } from "./icons";

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
  // FeedbackOS, when asked for and when the browser can host it.
  //
  // Everything below this block is the panel — unchanged, and still the
  // default. Rule 36's off-branch has to be the OLD branch: an off-path made of
  // new code is a second implementation nobody has been running, which is not a
  // fallback, it is a bet.
  //
  // mountShell returns null when the environment cannot support the overlay
  // (hit-testing, a blocking CSP, a shell that stops answering). It is not an
  // error and there is no message: the caller asked for the upgrade where it
  // works, and gets the panel where it does not.
  const want = opts.shell ?? "panel";
  if (want === "os" || want === "auto") {
    const h = tryMountShell(opts);
    if (h) return h;
  }

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
  // True once a builder shell's hello has been accepted (see bridge.ts). The
  // shell renders the UI from the outer page; ours goes away entirely.
  let bridged = false;
  // Bridge-mode state, meaningful only with framedHost. The shell page's own
  // location is /shell — the page a report is ABOUT is inside one of the
  // frames, and these mirror what the app IN VIEW last told us about itself.
  //
  // Mirrors rather than the source of truth: the per-app records live in the
  // framedHost block below, and paintActive() copies the active one out to
  // here. That keeps every path that files or lists a report — open(),
  // refresh(), submit() — reading exactly one page's worth of state, so none
  // of them had to learn that there is now more than one app.
  let innerPage: { url: string; title: string } | null = null;
  let frameCtx: BridgeContext | null = null;
  // The app in view, as the shell last announced it. Rides into the filed
  // issue's context so the report says which of the hosted apps it came from.
  let activeApp: BridgeApp | null = null;
  // A pick running INSIDE a frame, holding the id of the app it was started
  // in. Separate from cancelPick (a pick on this page) because the two flows
  // must never interleave: Escape on the shell must cancel the frame's picker,
  // not dismiss the form under the reporter. Scoped to an app rather than a
  // bare flag because a pick armed in auth must not be satisfied by a
  // pin:done that arrives from the dashboard.
  let bridgePick: string | null = null;
  let cancelBridgePick: () => void = () => {};

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

            <!-- Bridge-mode disclosure. Hidden until the framed product has
                 volunteered console/network context; then it says exactly what
                 will ride along with the report and offers the way out. A tool
                 that quietly harvests session activity is not a feedback
                 widget. -->
            <div class="ctxrow hidden">
              <p class="hint ctx-note"></p>
              <label class="ctx-opt"><input type="checkbox" class="ctx-optout"><span class="ctx-opt-txt"></span></label>
            </div>

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
  //
  // The shell panel asks a FRAME to pin and capture.
  //
  // Both read the DOM, and on a shell page the products' DOMs belong to other
  // origins. Rather than disable the controls — which is what this did first,
  // and which left the operator with a feature that visibly could not work —
  // the panel posts a request to its own window. The shell relays it into the
  // frame, the SDK loaded inside that product does the work where the DOM
  // actually is, and the answer comes back the same way.
  //
  // Same-window postMessage rather than a direct call: the shell is the only
  // thing that knows each frame's origin, and it must stay the only thing that
  // talks to them. A panel reaching for contentWindow itself would be a second
  // place to get targetOrigin wrong — and with several frames, a second place
  // to send app A's request to app B.
  //
  // SEVERAL APPS
  //
  // The shell can host app.co, auth.app.co and dashboard.app.co at once. Every
  // answer it forwards is stamped with {app:{id,name,origin}} from its own
  // config, so this panel never infers who sent what: it files each payload
  // into that app's record and reads the report's context out of the record
  // for the app in view. A console line from the dashboard therefore cannot
  // reach a report filed against auth — not because the panel is careful about
  // it, but because they were never in the same box.
  if (opts.framedHost) {
    /** One hosted app's half of the conversation. */
    type AppRecord = {
      app: BridgeApp;
      /** A builder:ready arrived for that frame's CURRENT document. */
      ready: boolean;
      /** Where that app last said it was — the page a report about it attaches to. */
      page: { url: string; title: string } | null;
      /** Its own console/network snapshot. Never shared, never merged. */
      ctx: BridgeContext | null;
    };
    const records = new Map<string, AppRecord>();

    const recordFor = (app: BridgeApp): AppRecord => {
      let r = records.get(app.id);
      if (!r) {
        r = { app, ready: false, page: null, ctx: null };
        records.set(app.id, r);
      } else {
        r.app = app; // the shell is authoritative; keep the freshest stamp
      }
      return r;
    };

    /** Read the shell's stamp off an inbound message, or nothing. */
    const readApp = (v: unknown): BridgeApp | null => {
      const a = v as Partial<BridgeApp> | null;
      if (!a || typeof a.id !== "string" || !a.id) return null;
      return {
        id: a.id,
        name: typeof a.name === "string" && a.name ? a.name : a.id,
        origin: typeof a.origin === "string" ? a.origin : "",
      };
    };

    // Requests name the app they are for. The shell resolves the id against
    // its own registry and refuses pin/screenshot for anything but the frame
    // in view, so a stale id here cannot act on the wrong product — it is
    // simply dropped.
    const askFrame = (type: string, appId: string | undefined) => {
      if (!appId) return;
      window.postMessage({ v: 1, type, appId }, location.origin);
    };
    const askActive = (type: string) => askFrame(type, activeApp?.id);

    // Until the app in view answers a hello there is no SDK in there to do the
    // work. The controls say so rather than failing silently.
    const noSdk =
      "This app has not loaded the builder script, so there is nothing " +
      "inside the frame to read the page with. Add the script tag to enable " +
      "pinning and screenshots.";

    const pinB = $<HTMLButtonElement>(".pin");
    const shotB = $<HTMLButtonElement>(".shot");
    const ctxRow = $<HTMLElement>(".ctxrow");
    const ctxNote = $<HTMLParagraphElement>(".ctx-note");
    $(".ctx-opt-txt").textContent = t.ctxOptOut;

    /**
     * Copy the app in view out of its record and into the panel.
     *
     * The single place the mirrors above are written, so there is one answer
     * to "which app is this report about" and every other path just reads it.
     */
    const paintActive = () => {
      const r = activeApp ? records.get(activeApp.id) : undefined;
      innerPage = r?.page ?? null;
      frameCtx = r?.ctx ?? null;

      const ready = !!r?.ready;
      for (const b of [pinB, shotB]) {
        b.disabled = !ready;
        b.title = ready ? "" : noSdk;
        if (ready) b.removeAttribute("aria-disabled");
        else b.setAttribute("aria-disabled", "true");
      }

      urlIn.value = innerPage?.url ?? "";
      // Name the app beside the route. With several hosted apps "/login" is
      // ambiguous on its own — auth has one and so does the dashboard — and
      // the panel header is where the reporter checks what they are filing
      // against before they write a word. dir=auto because an operator may
      // have named an app in Arabic while the route stays LTR.
      const route = normalizeRoute(innerPage?.url);
      const sub = $<HTMLElement>(".brand-sub");
      sub.setAttribute("dir", "auto");
      sub.textContent = activeApp ? `${activeApp.name} · ${route}` : route;

      const has = !!frameCtx && (frameCtx.console.length > 0 || frameCtx.network.length > 0);
      ctxRow.classList.toggle("hidden", !has);
      if (frameCtx && activeApp) {
        ctxNote.textContent = t.ctxAttached(
          activeApp.name,
          frameCtx.console.length,
          frameCtx.network.length,
        );
      }
    };

    const endBridgePick = () => {
      bridgePick = null;
      // Only the modal comes back if the form is what was open — same rule as
      // the local pick's restore.
      if (formOpen) modal.dataset.open = "true";
      else panel.dataset.open = "true";
      renderPins(); // restores the pin button's label and pressed state
    };
    cancelBridgePick = () => {
      // Cancel in the app the pick was STARTED in, which may no longer be the
      // one in view. Sending the cancel to the active app instead would leave
      // a picker armed in a frame nobody is looking at.
      askFrame(BRIDGE_MSG.pinCancel, bridgePick ?? undefined);
      endBridgePick();
    };

    window.addEventListener("message", (e: MessageEvent) => {
      // Only our own window, only our own origin. The shell has already
      // checked which frame spoke and that it was still on its own origin;
      // this is the second half of the same rule, and without it any page
      // could post a forged pin result into the panel.
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data as {
        v?: number;
        type?: string;
        app?: unknown;
        anchor?: PinAnchor | null;
        dataUrl?: string | null;
        error?: string;
        url?: string;
        title?: string;
      } & Partial<BridgeContext>;
      if (!d || d.v !== 1 || typeof d.type !== "string") return;

      // Which app this is about. Every bridge payload carries it, stamped by
      // the shell; one that does not is not a payload we can attribute, and an
      // unattributable payload is exactly what must not reach a report.
      const app = readApp(d.app);
      if (!app) return;

      // The shell announcing a switch. Not a frame answer — no frame is
      // involved — so it is handled before the per-app records are touched.
      if (d.type === "builder:app:active") {
        // A pick still running in the app being switched AWAY from would be
        // armed in a frame that is now hidden: its highlight is invisible and
        // its click can never happen. Cancel it rather than leaving it there.
        if (bridgePick && bridgePick !== app.id) cancelBridgePick();
        activeApp = app;
        recordFor(app);
        paintActive();
        // Its context may be stale, or never fetched. Ask now so the
        // disclosure counts what would actually be sent from THIS app.
        askFrame(BRIDGE_MSG.context, app.id);
        void refresh();
        return;
      }

      const r = recordFor(app);

      switch (d.type) {
        case BRIDGE_MSG.ready:
          r.ready = true;
          if (typeof d.url === "string" && d.url) {
            r.page = { url: d.url, title: typeof d.title === "string" ? d.title : "" };
          }
          askFrame(BRIDGE_MSG.context, app.id);
          if (app.id === activeApp?.id) {
            paintActive();
            void refresh();
          }
          return;

        case BRIDGE_MSG.url:
          if (typeof d.url === "string" && d.url) {
            r.page = { url: d.url, title: typeof d.title === "string" ? d.title : "" };
          }
          // A navigation in a hidden frame is recorded and nothing else: the
          // listing and the URL field describe the app in view, and repainting
          // them for a background app would rewrite the form under the
          // reporter's hands.
          if (app.id === activeApp?.id) {
            paintActive();
            void refresh();
          }
          return;

        case BRIDGE_MSG.pinDone: {
          // Only the app the pick was started in may satisfy it. Without this,
          // a stray pin:done from another frame would attach its anchor to a
          // report about a page it does not belong to.
          if (bridgePick !== app.id) return;
          const a = d.anchor;
          // anchor null = the reporter pressed Escape inside the frame.
          if (a && typeof a === "object" && pins.length < MAX_PINS) pins = [...pins, a];
          endBridgePick();
          return;
        }

        case BRIDGE_MSG.shotDone: {
          // The relay only ever routes a shot to the app in view, so an answer
          // from anywhere else is not ours to act on.
          if (app.id !== activeApp?.id) return;
          shotB.disabled = false;
          if (typeof d.dataUrl === "string" && d.dataUrl.startsWith("data:")) {
            const att = dataUrlToAttachment(d.dataUrl);
            if (att && att.size <= limitFor("image")) {
              files.push(att);
              renderFiles();
              setNote("");
            } else {
              setNote(t.failed, "err");
            }
          } else {
            // dataUrl null + error: the capture failed inside the frame.
            setNote(typeof d.error === "string" && d.error ? d.error : t.failed, "err");
          }
          return;
        }

        case BRIDGE_MSG.contextDone: {
          // Filed under the app that sent it, and stamped with that app —
          // the stamp travels all the way into the stored issue, which is how
          // the board can say a report came from auth.app.co.
          r.ctx = {
            console: Array.isArray(d.console) ? d.console : [],
            network: Array.isArray(d.network) ? d.network : [],
            viewport:
              d.viewport && typeof d.viewport === "object"
                ? d.viewport
                : { w: 0, h: 0, dpr: 1 },
            userAgent: typeof d.userAgent === "string" ? d.userAgent : "",
            locale: typeof d.locale === "string" ? d.locale : "",
            url: typeof d.url === "string" ? d.url : "",
            title: typeof d.title === "string" ? d.title : "",
            app,
          };
          if (app.id === activeApp?.id) paintActive();
          return;
        }
      }
    });

    pinB.addEventListener("click", () => {
      if (!activeApp || !records.get(activeApp.id)?.ready) return;
      if (bridgePick) {
        cancelBridgePick();
        return;
      }
      bridgePick = activeApp.id;
      // The reporter aims INSIDE the frame; the shell's own surfaces get out
      // of the way exactly as the local pick does.
      panel.dataset.open = "false";
      modal.dataset.open = "false";
      pinB.setAttribute("aria-pressed", "true");
      pinB.textContent = t.pinning;
      askActive(BRIDGE_MSG.pinStart);
    });
    shotB.addEventListener("click", () => {
      if (!activeApp || !records.get(activeApp.id)?.ready) return;
      shotB.disabled = true; // until shot:done — a double click is one capture
      askActive(BRIDGE_MSG.shot);
    });
    // A fresh snapshot each time the form opens, so the disclosure counts what
    // would actually be sent, not what was true at handshake time.
    $(".report").addEventListener("click", () => askActive(BRIDGE_MSG.context));

    // Nothing is known until the shell announces an app, so start honest: both
    // controls disabled with the reason on them.
    paintActive();
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
    if (bridged) return; // the shell owns the UI; this panel no longer exists
    panel.dataset.open = "true";
    fab.setAttribute("aria-expanded", "true");
    // On a shell page the framedHost block owns the URL field and the header
    // subline: they name the APP in view as well as its route, and rewriting
    // them from here would drop the app name every time the panel opened —
    // which is precisely when the reporter is checking what they are about to
    // file against.
    if (!opts.framedHost) {
      // Re-read on every open: in an SPA the route changes without a remount,
      // and a header pinned to the mount-time route would quietly lie.
      urlIn.value = location.href;
      $(".brand-sub").textContent = normalizeRoute();
    }
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
    { key: "agents", path: "/agents", color: "var(--app-agents)", label: t.appAgents },
    { key: "skills", path: "/skills", color: "var(--app-skills)", label: t.appSkills },
    { key: "issues", path: "/issues", color: "var(--app-issues)", label: t.appIssues },
    { key: "vault", path: "/vault", color: "var(--app-vault)", label: t.appVault },
    { key: "sources", path: "/sources", color: "var(--app-sources)", label: t.appSources },
    { key: "docs", path: "/library", color: "var(--app-docs)", label: t.appDocs },
    { key: "brain", path: "/brain", color: "var(--app-brain)", label: t.appBrain },
    { key: "chat", path: "/chat", color: "var(--app-chat)", label: t.appChat },
    { key: "mcp", path: "/mcp", color: "var(--app-mcp)", label: t.appMcp },
    { key: "terminal", path: "/terminal", color: "var(--app-terminal)", label: t.appTerminal },
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

  // Where the screens are mounted under that origin.
  //
  // "/builder" by default, because that is where the plugin serves its embedded
  // bundle. Every path in APPS is written as the route the app's own router
  // knows ("/agents"), and this is what turns it into a URL that exists on the
  // server ("/builder/agents"). Without it the launcher pointed at the host
  // product's root, where those paths belong to the host — and in an app that
  // was not scaffolded from the blueprint, every tile was a 404.
  //
  // Normalised without a trailing slash so the join below is never "//agents".
  const screensBase = (opts.screensBase ?? "/builder").replace(/\/+$/, "");

  const appURL = (path: string, embed: boolean) =>
    `${appOrigin()}${screensBase}${path}${embed ? "?embed=1" : ""}`;

  // One tile, whether the app is one of the ten above or one somebody dropped
  // into the apps directory this morning. The launcher does not distinguish
  // them, because to the operator they are the same thing: a screen.
  type Tile = { key: string; path: string; color: string; label: string };

  function addTile(app: Tile) {
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
    // A custom app names a lucide glyph the widget may not carry; the generic
    // tile is the fallback, so an unknown icon costs an icon rather than a
    // throw that empties the whole grid.
    chip.appendChild(icon(hasIcon(app.key) ? app.key : "app", 18));

    const name = document.createElement("span");
    name.textContent = app.label;

    b.append(chip, name);
    b.addEventListener("click", () => openApp(app));
    appGrid.appendChild(b);
  }

  for (const app of APPS) addTile(app);

  // Custom apps, appended after the built-in ten.
  //
  // Fetched rather than compiled in: they are discovered by the server at boot
  // and this widget must not need a rebuild when one is added. Every failure is
  // swallowed — an unauthenticated visitor, a registry that is down, a response
  // that will not parse. The feedback button's whole promise is that it works
  // when the thing around it is broken, and a launcher that throws on a missing
  // optional list would break it over an app nobody has installed.
  void (async () => {
    try {
      const base = (opts.apiBase ?? "").replace(/\/$/, "");
      const res = await fetch(`${base}/api/builder/apps`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data?.apps) ? data.apps : [];
      const isAr = t.dir === "rtl";
      for (const a of list) {
        const slug = typeof a?.slug === "string" ? a.slug : "";
        if (!slug) continue;
        const en = typeof a?.title?.en === "string" ? a.title.en : slug;
        const ar = typeof a?.title?.ar === "string" ? a.title.ar : "";
        addTile({
          key: slug,
          path: `/apps/${slug}`,
          color: typeof a?.color === "string" && a.color ? a.color : "var(--app-default)",
          label: isAr && ar ? ar : en,
        });
      }
    } catch {
      // Deliberately silent: see above.
    }
  })();

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
  function openApp(app: Tile) {
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
    if (e.key !== "Escape") return;
    // A pick running inside the frame: Escape cancels the pick, never the
    // form — dismissing the form here would wipe the half-written report.
    if (bridgePick) {
      cancelBridgePick();
      return;
    }
    if (formOpen && !cancelPick) showForm(false);
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
  // The LOCAL picker — it reads THIS page's DOM. On a shell page the DOM that
  // matters is inside a cross-origin frame, so the framedHost block above owns
  // the pin button there and this handler must not also fire: both running at
  // once is a picker armed on the shell that can never be clicked, on top of
  // the real one inside the frame.
  if (!opts.framedHost) pinBtn.addEventListener("click", () => {
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

  // The LOCAL screenshot — html-to-image against THIS document. On a shell
  // page that yields a picture of the shell with a blank rectangle where the
  // product is; the framedHost block owns the button there and the capture
  // happens inside the frame instead.
  if (!opts.framedHost) $(".shot").addEventListener("click", async () => {
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
      // In a shell, the report is about the framed page: route and URL come
      // from what the frame reported, and the console/network snapshot rides
      // along only when the disclosure was shown and the reporter did not opt
      // out.
      //
      // WHICH APP it came from is not part of that bargain. A shell can host
      // three surfaces of one product, and a report that does not say whether
      // it is about app.co or auth.app.co is worse than no report — it sends
      // somebody to read the wrong code. So the app survives an opt-out and
      // survives an app with no SDK loaded at all: those cost the console and
      // the network lines, never the attribution.
      const ctxOff = $<HTMLInputElement>(".ctx-optout");
      const attribution: BridgeContext | undefined = activeApp
        ? {
            console: [],
            network: [],
            // Zeroed rather than read from this window: the shell's own
            // viewport, user agent and locale describe the BUILDER, and
            // labelling them as the product's environment would be a lie the
            // reader has no way to catch.
            viewport: { w: 0, h: 0, dpr: 1 },
            userAgent: "",
            locale: "",
            url: innerPage?.url ?? "",
            title: innerPage?.title ?? "",
            app: activeApp,
          }
        : undefined;
      const r = await transport.create({
        type,
        title,
        body: bodyIn.value,
        route: normalizeRoute(innerPage?.url),
        pageUrl: innerPage?.url ?? location.href,
        locale,
        pins,
        attachments: files,
        context: frameCtx && !ctxOff?.checked ? frameCtx : attribution,
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
      // Scoped to the inner page when framed — "issues on this page" means the
      // page the operator is looking at, which on a shell is the framed one.
      issues = await transport.listByRoute(normalizeRoute(innerPage?.url));
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
      }, (n) => appURL(`/issues/${n}`, true));
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

  // ---- bridge mode (framed by a builder shell) ---------------------------
  //
  // The frame side of the shell protocol — see bridge.ts. Installed unless
  // this page IS the shell (framedHost — the two roles are separate options
  // by design) or the host opted out. Until a hello actually arrives this is
  // one dormant message listener and nothing else; a product that is not in
  // a shell is unaffected.
  let uninstallBridge: (() => void) | null = null;
  if (!opts.framedHost && opts.bridge !== false) {
    uninstallBridge = installBridge({
      locale,
      shellOrigins: opts.shellOrigins,
      onActivate: () => {
        // The shell owns the UI. Two widgets on screen — the shell's panel
        // AND this FAB inside the frame — is the bug this mode replaces, so
        // ours is suppressed entirely, not just closed.
        bridged = true;
        cancelPick?.();
        cancelPick = null;
        close();
        host.style.display = "none";
      },
    });
  }

  const handle: Handle = {
    open,
    close,
    refresh: () => void refresh(),
    destroy() {
      uninstallBridge?.();
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

/**
 * Decode a `builder:shot:done` payload into a real attachment. The frame sends
 * a data URL because a Blob cannot cross the relay's re-post; the bytes are
 * reconstituted here so the upload path is the same multipart it always was.
 */
function dataUrlToAttachment(dataUrl: string): Attachment | null {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const mime = /^data:([^;,]+)/.exec(dataUrl.slice(0, comma))?.[1] || "image/png";
    const bin = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return { name: `screenshot-${stamp}.png`, mime, size: blob.size, kind: "screenshot", blob };
  } catch {
    return null; // a malformed payload must not take the form down with it
  }
}

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

/** The shell↔frame message types — exported so the shell side can be checked against them. */
export { BRIDGE_MSG } from "./bridge";

/**
 * The icon set, for the shell page.
 *
 * The shell's app switcher needs glyphs and the shell is a plain HTML page
 * with no build step — it already loads this bundle for the panel, so lending
 * it the same lucide set is the difference between one icon family on that
 * page and two. Exported rather than duplicated: a second copy of the paths in
 * shell.go would drift the first time one is redrawn.
 */
export { icon, hasIcon } from "./icons";

export type {
  MountOptions,
  Handle,
  IssueSummary,
  NewIssue,
  PinAnchor,
  ConsoleEntry,
  NetworkEntry,
  BridgeContext,
} from "./types";


/**
 * Attempt the windowed shell.
 *
 * @returns a Handle when the overlay mounted, or null to fall through to the
 *          panel. Never throws: a failure here must degrade, not break the
 *          host page, and a throw inside mount() would take the widget down
 *          entirely on a site that only wanted a feedback button.
 */
/** The most recently mounted windowed shell, for the namespace-level setApps. */
let lastShell: Handle | null = null;

/**
 * Contribute the embedding site's own screens to the dock, after mount.
 *
 * No-op when the panel is running rather than the windowed shell: the panel
 * has no dock to put them in, and a host should be able to call this
 * unconditionally without feature-detecting which shell it got.
 */
export function toggleDock(open?: boolean): void {
  lastShell?.toggleDock?.(open);
}

export function setApps(apps: HostApp[]): void {
  lastShell?.setApps?.(apps ?? []);
}

function tryMountShell(opts: MountOptions): Handle | null {
  try {
    const base = (opts.apiBase ?? "").replace(/\/$/, "");
    const src = `${base}/sdk/shell.html`;
    const origin = base ? new URL(base, location.href).origin : location.origin;

    let fellBack = false;
    const frame = new ShellFrame({
      src,
      origin,
      zIndex: opts.zIndex,
      boot: {
        apiBase: base,
        // Same rule as the theme below: an explicit `locale` is an override,
        // and the page's own <html lang> is the source of truth otherwise. A
        // widget that stays English inside an Arabic page is not localized, it
        // is merely translated.
        locale: opts.locale ? (opts.locale === "ar" ? "ar" : "en") : hostLocale(),
        theme: "default",
        // Follow the HOST's theme when the caller does not force one.
        //
        // `opts.theme` is an override, not the source of truth, and treating it
        // as one made the shell render light over a dark site — a bright window
        // dropped onto somebody's dark product, which reads as broken rather
        // than as a default. Most hosts signal dark the same two ways, and both
        // are cheap to read; prefers-color-scheme is the backstop for a site
        // that signals neither.
        dark: opts.theme ? opts.theme === "dark" : hostIsDark(),
        // The shell's own location is /sdk/shell.html, so it cannot work out
        // which page the operator is reporting about. Only this side knows.
        hostHref: location.href,
        hostTitle: document.title,
        // Type is the strongest signal that two surfaces belong together, and
        // a separate document inherits no fonts at all — so the family AND the
        // @font-face rules have to be carried across explicitly.
        fonts: collectHostFonts(),
        // The embedding site's own screens. Passed through untouched: the
        // shell validates them, because a bad manifest must cost one tile
        // rather than the whole dock.
        hostApps: opts.apps ?? [],
        accent: opts.accent,
        // Default off on a foreign origin: the host's own palette is very
        // often Cmd+K, and stealing it silently is a bad first impression.
        hotkey: opts.hotkey ?? (origin === location.origin ? "mod+k" : false),
      },
      onFallback: () => {
        if (fellBack) return;
        fellBack = true;
        // Re-enter with the shell disabled. The panel is a complete widget; it
        // does not need to be told it is a fallback.
        mount({ ...opts, shell: "panel" });
      },
    });

    if (!frame.mount()) return null;
    const handle = {
      open: () => {},
      close: () => {},
      refresh: () => {},
      setApps: (apps: HostApp[]) => frame.setHostApps(apps ?? []),
      // The launcher's visibility is host chrome's business: the toggle lives
      // in the site's admin bar, which is not inside the shell and cannot reach
      // its state any other way.
      toggleDock: (open?: boolean) => frame.toggleDock(open),
      destroy: () => frame.teardown("destroyed by the host"),
    } as Handle;
    // Also reachable off the namespace, because the page that KNOWS the app
    // list is usually not the line that called mount(): mount happens in the
    // document's own script, while the routes are a fact of the framework
    // bundle that boots afterwards.
    lastShell = handle;
    return handle;
  } catch {
    return null;
  }
}
