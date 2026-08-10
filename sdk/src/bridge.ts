import { screenshot } from "./capture";
import { startPicker } from "./picker";
import type { BridgeContext, ConsoleEntry, NetworkEntry, PinAnchor } from "./types";

/**
 * The FRAME side of the shell bridge. The shell half lives in
 * builderd/shell.go (the inline relay script) and MUST agree with this file —
 * the message types below ARE the contract.
 *
 * When the product page is framed by a builder shell, the shell cannot see
 * into it: a cross-origin iframe gives up no DOM, no pixels, no URL and no
 * console. That is origin isolation working, not a bug, and the only way
 * through it is for this side — the page that OWNS the DOM — to volunteer
 * the data. So the SDK, noticing a shell's handshake, becomes a reporter:
 * the shell owns the UI, this frame owns the DOM.
 *
 * Every message is {v:1, type, ...}. Every postMessage passes an explicit
 * targetOrigin and every inbound message is checked against BOTH the recorded
 * shell origin and the recorded shell window. Never "*" in either direction:
 * a wildcard here would hand this page's console lines and screenshots to any
 * page that frames it.
 *
 *   shell → frame   builder:hello        {shellOrigin}
 *   frame → shell   builder:ready        {url, title}
 *   frame → shell   builder:url          {url, title}   load / popstate / pushState
 *   shell → frame   builder:pin:start
 *   frame → shell   builder:pin:done     {anchor}       anchor:null = cancelled in-frame
 *   shell → frame   builder:pin:cancel
 *   shell → frame   builder:shot
 *   frame → shell   builder:shot:done    {dataUrl}      dataUrl:null + error on failure
 *   shell → frame   builder:context
 *   frame → shell   builder:context:done {console[], network[], viewport, userAgent, locale, url, title}
 *
 * Until a hello arrives the SDK behaves exactly as it does today: the only
 * footprint is one message listener, and a page that is not framed at all
 * gets not even that. The frame does not trust being framed — any parent can
 * put a page in an iframe, so nothing is patched, captured or answered until
 * a parent proves it speaks the protocol, and an optional origin allowlist
 * can restrict who is believed even then.
 *
 * SEVERAL FRAMES IN ONE SHELL — why this file needs no per-app bookkeeping
 *
 * A shell can host app.co, auth.app.co and dashboard.app.co side by side. This
 * file is unchanged by that, and deliberately so: each framed document is its
 * own JavaScript realm, so each runs its OWN installBridge with its own
 * `shell` lock, its own ring buffers, its own picker and its own `shooting`
 * flag. First-framer-wins is therefore already per frame, not global — there
 * is no shared state here for a sibling to reach, and no way for one app's
 * console to end up in another's payload, because the buffers are not in the
 * same heap.
 *
 * What the siblings DO share is the parent window: `shell.win` is the same
 * object in all of them, so N conversations arrive on the shell's single
 * listener interleaved. Telling them apart is the shell's job and it does it
 * with event.source (the window the browser says sent it), not with the origin
 * — two hosted apps may legitimately share an origin. Nothing this file sends
 * identifies the app, and nothing it sends should: the shell stamps every
 * forwarded answer from its own configured registry, so a frame cannot claim
 * to be a different app than the one the shell put in that slot.
 */

export const BRIDGE_MSG = {
  hello: "builder:hello",
  ready: "builder:ready",
  url: "builder:url",
  pinStart: "builder:pin:start",
  pinDone: "builder:pin:done",
  pinCancel: "builder:pin:cancel",
  shot: "builder:shot",
  shotDone: "builder:shot:done",
  context: "builder:context",
  contextDone: "builder:context:done",
} as const;

// Ring buffer caps. An unbounded capture on a chatty app is a memory leak in
// somebody's production tab; these are enough context to debug with and small
// enough to forget about.
const MAX_CONSOLE = 200;
const MAX_NETWORK = 100;

// Per-entry text ceilings, so one enormous log line cannot bloat the buffer
// the caps were meant to bound.
const MAX_LINE = 1000;
const MAX_URL = 512;

export interface BridgeOptions {
  /** Reported in the context payload so the shell knows the page's language. */
  locale?: string;
  /**
   * Origins allowed to act as the shell. When set, a hello from any other
   * origin is ignored. Unset, any direct parent that completes the handshake
   * is accepted.
   */
  shellOrigins?: string[];
  /** Fires once, when the first hello is accepted — the widget hides its UI. */
  onActivate?: (shellOrigin: string) => void;
}

/**
 * Install the frame side of the bridge. Returns an uninstaller that removes
 * the listener, tears down any active pick, and restores every patched
 * global — console, fetch, XHR and history come back exactly as found.
 */
export function installBridge(o: BridgeOptions = {}): () => void {
  // Not framed: no shell can exist, so not even the listener is worth having.
  if (window.parent === window) return () => {};

  const locale = o.locale ?? "en";

  // The one party we speak to, pinned at handshake time. The origin comes
  // from event.origin — the browser's word, not the message's — and every
  // later message must arrive from this exact window AND origin.
  let shell: { win: Window; origin: string } | null = null;

  let cancelPick: (() => void) | null = null;
  let shooting = false;
  let urlTimer: number | null = null;

  const consoleRing: ConsoleEntry[] = [];
  const networkRing: NetworkEntry[] = [];
  const uninstallers: Array<() => void> = [];

  function post(msg: Record<string, unknown>) {
    if (!shell) return;
    try {
      // Explicit targetOrigin, never "*": if the shell navigated elsewhere,
      // the message is dropped by the browser rather than delivered to
      // whoever lives there now.
      shell.win.postMessage(msg, shell.origin);
    } catch {
      /* a detached shell window must not break the page */
    }
  }

  function postReady() {
    post({ v: 1, type: BRIDGE_MSG.ready, url: location.href, title: document.title });
  }

  function postUrl() {
    post({ v: 1, type: BRIDGE_MSG.url, url: location.href, title: document.title });
  }

  // Deferred a tick: routers call pushState first and set document.title
  // after, so reading synchronously reports the OLD title with the new URL.
  // The timer also coalesces a pushState+replaceState burst into one report.
  function postUrlSoon() {
    if (urlTimer !== null) return;
    urlTimer = window.setTimeout(() => {
      urlTimer = null;
      postUrl();
    }, 0);
  }

  function postContext() {
    const c = contextPayload(consoleRing, networkRing, locale);
    post({ v: 1, type: BRIDGE_MSG.contextDone, ...c });
  }

  // ---- pin ---------------------------------------------------------------
  function beginPick() {
    endPick(); // a second pin:start restarts clean rather than stacking pickers
    cancelPick = startPicker(
      (anchor: PinAnchor, el: Element) => {
        cancelPick = null;
        // Confirm on the page itself — the reporter is looking at the frame,
        // not at the shell's panel, at this instant.
        el.classList.add("builder-pin-found");
        setTimeout(() => el.classList.remove("builder-pin-found"), 3000);
        post({ v: 1, type: BRIDGE_MSG.pinDone, anchor });
        // Context rides along with every result: the pin is the "what", the
        // console and network are the "what was happening".
        postContext();
      },
      () => {
        // Escape pressed inside the frame. The shell cannot see that key, so
        // an explicit nothing-was-picked answer is the only thing that stops
        // its UI waiting forever.
        cancelPick = null;
        post({ v: 1, type: BRIDGE_MSG.pinDone, anchor: null });
      },
    );
  }

  /** Shell-initiated cancel: tear down silently, the shell already knows. */
  function endPick() {
    if (cancelPick) {
      cancelPick();
      cancelPick = null;
    }
  }

  // ---- screenshot --------------------------------------------------------
  async function shoot() {
    if (shooting) return; // a double-click on the shell side is one capture
    shooting = true;
    try {
      const att = await screenshot();
      const dataUrl = await blobToDataURL(att.blob);
      post({ v: 1, type: BRIDGE_MSG.shotDone, dataUrl });
      postContext();
    } catch (err) {
      post({
        v: 1,
        type: BRIDGE_MSG.shotDone,
        dataUrl: null,
        error: redact(String((err as Error)?.message || err)).slice(0, 300),
      });
    } finally {
      shooting = false;
    }
  }

  // ---- activation --------------------------------------------------------
  function activate() {
    // Patches land HERE, after a shell proved itself — never at load. A page
    // that is merely framed by something keeps its console, fetch and history
    // untouched.
    uninstallers.push(
      patchConsole((en) => pushRing(consoleRing, MAX_CONSOLE, en)),
      patchFetch((en) => pushRing(networkRing, MAX_NETWORK, en)),
      patchXHR((en) => pushRing(networkRing, MAX_NETWORK, en)),
      patchHistory(postUrlSoon),
    );
    if (document.readyState !== "complete") {
      const onLoad = () => postUrl();
      window.addEventListener("load", onLoad, { once: true });
      uninstallers.push(() => window.removeEventListener("load", onLoad));
    }
    try {
      o.onActivate?.(shell!.origin);
    } catch {
      /* the host's callback must not break the handshake */
    }
  }

  function onMessage(e: MessageEvent) {
    const d = e.data as { v?: number; type?: string; shellOrigin?: string } | null;
    if (!d || d.v !== 1 || typeof d.type !== "string") return;

    if (!shell) {
      // Nothing is served before the handshake, and the handshake itself is
      // suspicious by default: it must be a hello, from our DIRECT parent
      // (event.source is the browser's word for who sent it), from a real
      // origin that matches what the message claims, and — when the host
      // configured an allowlist — from an origin on it.
      if (d.type !== BRIDGE_MSG.hello) return;
      if (window.parent === window || e.source !== window.parent) return;
      if (!e.origin || e.origin === "null") return;
      if (d.shellOrigin !== e.origin) return;
      if (o.shellOrigins && !o.shellOrigins.includes(e.origin)) return;
      shell = { win: window.parent, origin: e.origin };
      activate();
      postReady();
      return;
    }

    // Locked to the first accepted shell. Both checks, always: origin proves
    // where the document lives, source proves it is the same window and not a
    // sibling frame or popup on the same origin.
    if (e.source !== shell.win || e.origin !== shell.origin) return;

    switch (d.type) {
      case BRIDGE_MSG.hello:
        // The shell re-offers the handshake until answered (its probe loop),
        // and a re-hello after our ready costs nothing to re-acknowledge.
        postReady();
        return;
      case BRIDGE_MSG.pinStart:
        beginPick();
        return;
      case BRIDGE_MSG.pinCancel:
        endPick();
        return;
      case BRIDGE_MSG.shot:
        void shoot();
        return;
      case BRIDGE_MSG.context:
        postContext();
        return;
    }
  }

  window.addEventListener("message", onMessage);

  const onPop = () => postUrlSoon();
  window.addEventListener("popstate", onPop);
  window.addEventListener("hashchange", onPop);

  return () => {
    window.removeEventListener("message", onMessage);
    window.removeEventListener("popstate", onPop);
    window.removeEventListener("hashchange", onPop);
    if (urlTimer !== null) {
      clearTimeout(urlTimer);
      urlTimer = null;
    }
    endPick();
    for (const u of uninstallers.splice(0)) {
      try {
        u();
      } catch {
        /* one failed restore must not skip the rest */
      }
    }
    shell = null;
  };
}

// ---- context -------------------------------------------------------------

function contextPayload(
  consoleRing: ConsoleEntry[],
  networkRing: NetworkEntry[],
  locale: string,
): BridgeContext {
  return {
    console: consoleRing.slice(),
    network: networkRing.slice(),
    viewport: {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    },
    userAgent: navigator.userAgent,
    locale,
    url: location.href,
    title: document.title,
  };
}

function pushRing<T>(ring: T[], cap: number, entry: T) {
  ring.push(entry);
  if (ring.length > cap) ring.shift(); // oldest out; the cap is the contract
}

// ---- console capture ------------------------------------------------------

const LEVELS: ConsoleEntry["level"][] = ["log", "info", "warn", "error", "debug"];

/**
 * Wrap the console methods. The original is called with the original
 * arguments no matter what the capture does — a widget that breaks the
 * product's own logging is worse than one that captures nothing.
 */
function patchConsole(push: (e: ConsoleEntry) => void): () => void {
  const originals = new Map<ConsoleEntry["level"], (...args: unknown[]) => void>();
  for (const lv of LEVELS) {
    const orig = console[lv] as (...args: unknown[]) => void;
    if (typeof orig !== "function") continue;
    originals.set(lv, orig);
    console[lv] = function (...args: unknown[]) {
      try {
        push({ level: lv, text: fmtArgs(args), ts: Date.now() });
      } catch {
        /* capture must never take the log line down with it */
      }
      orig.apply(console, args);
    };
  }
  return () => {
    for (const [lv, orig] of originals) console[lv] = orig;
  };
}

function fmtArgs(args: unknown[]): string {
  const parts = args.map((a) => {
    if (typeof a === "string") return a;
    if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
    try {
      return JSON.stringify(a) ?? String(a);
    } catch {
      return String(a); // circular structures reduce to their toString
    }
  });
  // Redacted BEFORE it enters the buffer: the honest place to strip a token
  // is where it is still local, not after it crossed to the shell.
  return redact(parts.join(" ").slice(0, MAX_LINE));
}

// ---- network capture ------------------------------------------------------
//
// Method, URL, status and duration ONLY. Request and response bodies are
// never read, and headers — Authorization above all — are never touched.
// The URL still goes through the redactor because tokens live in query
// strings too.

function patchFetch(push: (e: NetworkEntry) => void): () => void {
  const orig = window.fetch;
  if (typeof orig !== "function") return () => {};
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const started = Date.now();
    let method = "GET";
    let url = "";
    try {
      if (typeof input === "string") url = input;
      else if (input instanceof URL) url = input.href;
      else if (input) {
        url = input.url;
        method = input.method || "GET";
      }
      if (init && init.method) method = init.method;
    } catch {
      /* an exotic input must not break the request it belongs to */
    }
    const rec = (status: number, ok: boolean) => {
      try {
        push({
          method: method.toUpperCase(),
          url: netUrl(url),
          status,
          ok,
          durationMs: Date.now() - started,
          ts: started,
        });
      } catch {
        /* ditto */
      }
    };
    const p = orig.call(window, input as RequestInfo, init);
    // Observing handlers on the SAME promise the caller gets — the chain the
    // application awaits is returned untouched.
    p.then(
      (res) => rec(res.status, res.ok),
      () => rec(0, false),
    );
    return p;
  };
  return () => {
    window.fetch = orig;
  };
}

function patchXHR(push: (e: NetworkEntry) => void): () => void {
  const proto = XMLHttpRequest.prototype;
  const origOpen = proto.open;
  const origSend = proto.send;
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string; started: number }>();

  proto.open = function (this: XMLHttpRequest, method: string, url: string | URL) {
    try {
      meta.set(this, {
        method: String(method || "GET").toUpperCase(),
        url: String(url),
        started: 0,
      });
    } catch {
      /* never break the app's request over bookkeeping */
    }
    // arguments, not the two named params: open has a five-argument overload
    // (async, username, password) and the passthrough must be transparent.
    return origOpen.apply(this, arguments as unknown as Parameters<XMLHttpRequest["open"]>);
  };

  proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const m = meta.get(this);
    if (m) {
      m.started = Date.now();
      const onEnd = () => {
        this.removeEventListener("loadend", onEnd);
        try {
          push({
            method: m.method,
            url: netUrl(m.url),
            status: this.status,
            ok: this.status >= 200 && this.status < 400,
            durationMs: Date.now() - m.started,
            ts: m.started,
          });
        } catch {
          /* capture failure is not the app's problem */
        }
      };
      try {
        this.addEventListener("loadend", onEnd);
      } catch {
        /* ditto */
      }
    }
    // The body passes through UNREAD — capturing it is exactly the defect the
    // rules above exist to prevent.
    return origSend.call(this, body);
  };

  return () => {
    proto.open = origOpen;
    proto.send = origSend;
  };
}

function netUrl(u: string): string {
  let abs = u;
  try {
    abs = new URL(u, location.href).href;
  } catch {
    /* keep the raw string; the redactor still runs on it */
  }
  return redact(abs).slice(0, MAX_URL);
}

// ---- history patch --------------------------------------------------------

/** SPA routers navigate without a page load; pushState is the only signal. */
function patchHistory(onNav: () => void): () => void {
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
    origPush.apply(this, args);
    onNav();
  };
  history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
    origReplace.apply(this, args);
    onNav();
  };
  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
  };
}

// ---- redaction ------------------------------------------------------------
//
// A TS port of internal/sources/scrub.go, applied before anything leaves the
// page. Blunt pattern matching is correct here: occasionally redacting a
// harmless value is cosmetic, and shipping somebody's production token to the
// shell is not.

const REDACTED = "[redacted]";

// A URL with credentials: https://user:token@host/path.
const dsnCreds = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:/@\s]+):[^@\s]*@/g;

// Keyword/value form: password=hunter2 and friends. The value stops at
// whitespace, & or quote so a query string loses one parameter, not its tail.
const kvCreds =
  /\b(password|passwd|pwd|secret|token|api[_-]?key|auth|authorization|access[_-]?key|private[_-]?key|sslpassword)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&"']+)/gi;

// Vendor-prefixed keys that are unambiguous on sight.
const vendorKeys =
  /\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g;

// A JWT: three base64url segments separated by dots.
const jwtRe = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

// A PEM block, collapsed to a marker.
const pemBlock = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

/** Strip credentials from a string that is about to cross to the shell. */
export function redact(s: string): string {
  if (!s) return s;
  s = s.replace(pemBlock, "[redacted private key]");
  s = s.replace(dsnCreds, "$1:" + REDACTED + "@");
  s = s.replace(kvCreds, "$1$2" + REDACTED);
  s = s.replace(vendorKeys, REDACTED);
  s = s.replace(jwtRe, REDACTED);
  return s;
}

// ---- misc -----------------------------------------------------------------

function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("could not encode the screenshot"));
    r.readAsDataURL(b);
  });
}
