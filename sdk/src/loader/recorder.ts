// Runtime evidence, recorded on the HOST page.
//
// A report that says "the Pay button does nothing" is a starting point. The
// same report carrying the TypeError that fired when it was clicked, and the
// 500 the click produced, is a diagnosis. Neither of those is visible to the
// person filing — they are in a console nobody had open.
//
// This has to live on the host side. The shell is a separate document with its
// own console and its own fetch; instrumenting from in there records the
// widget's own traffic, which is never what anybody wanted to see.
//
// Three properties are non-negotiable, because this wraps globals on somebody
// else's product:
//
//   1. It never changes behaviour. Every wrapper calls the original, returns
//      exactly what the original returned, and lets every error propagate.
//   2. It is bounded. Ring buffers with hard caps, so a page that logs in a
//      loop for six hours costs the same memory as one that logs twice.
//   3. It never records bodies. URLs, methods, statuses and timings only —
//      request bodies carry passwords and tokens, and this data ends up in an
//      issue that people paste into chat.

export interface ConsoleEntry {
  level: string;
  text: string;
  at?: number;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  /** Milliseconds, rounded. Absent when the request never completed. */
  ms?: number;
}

/** Deliberately small. This is evidence, not a log drain. */
const MAX_CONSOLE = 50;
const MAX_NETWORK = 50;
/** One console line, truncated. A serialized object can be megabytes. */
const MAX_TEXT = 500;

/** Levels worth keeping. `log` and `debug` are noise in a bug report. */
const LEVELS = ["error", "warn"] as const;

const consoleRing: ConsoleEntry[] = [];
const networkRing: NetworkEntry[] = [];
let installed = false;

/** Everything recorded so far, oldest first. */
export function recorded(): { console: ConsoleEntry[]; network: NetworkEntry[] } {
  return { console: [...consoleRing], network: [...networkRing] };
}

function push<T>(ring: T[], item: T, max: number): void {
  ring.push(item);
  if (ring.length > max) ring.shift();
}

/** One console argument as a short string, never throwing on a circular object. */
function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    // Circular, or a getter that throws. The type is still worth having.
    return Object.prototype.toString.call(v);
  }
}

function clip(s: string): string {
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + "…" : s;
}

/**
 * Start recording. Idempotent — a second mount must not double-wrap, which
 * would record every line twice and stack a wrapper on a wrapper on reload.
 */
export function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  for (const level of LEVELS) {
    const original = console[level] as (...a: unknown[]) => void;
    if (typeof original !== "function") continue;
    console[level] = function (this: unknown, ...args: unknown[]) {
      push(consoleRing, { level, text: clip(args.map(stringify).join(" ")), at: Date.now() }, MAX_CONSOLE);
      // The original ALWAYS runs, with the original `this`. A widget that
      // swallows a customer's console output is a widget that gets removed.
      return original.apply(this, args);
    } as typeof console.error;
  }

  // An uncaught error never reaches console.error as a call — it is reported
  // by the runtime — so it has to be listened for separately or the single
  // most valuable line is the one that goes missing.
  window.addEventListener("error", (e) => {
    push(consoleRing, { level: "error", text: clip(e.message || "uncaught error"), at: Date.now() }, MAX_CONSOLE);
  });
  window.addEventListener("unhandledrejection", (e) => {
    push(consoleRing, { level: "error", text: clip("unhandled rejection: " + stringify(e.reason)), at: Date.now() }, MAX_CONSOLE);
  });

  installFetch();
  installXHR();
}

function installFetch(): void {
  if (typeof window.fetch !== "function") return;
  const original = window.fetch;
  window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
    const started = Date.now();
    const [input, init] = args;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    try {
      const res = await original.apply(this, args);
      record(method, url, res.status, Date.now() - started);
      return res;
    } catch (err) {
      // status 0 is the honest answer for a request that never got one — a
      // DNS failure, an abort, an offline device.
      record(method, url, 0, Date.now() - started);
      throw err;
    }
  };
}

function installXHR(): void {
  if (typeof XMLHttpRequest === "undefined") return;
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  type Tracked = XMLHttpRequest & { __fosMethod?: string; __fosUrl?: string; __fosAt?: number };

  XMLHttpRequest.prototype.open = function (this: Tracked, method: string, url: string | URL, ...rest: unknown[]) {
    this.__fosMethod = String(method || "GET").toUpperCase();
    this.__fosUrl = String(url);
    return (open as unknown as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.send = function (this: Tracked, ...rest: unknown[]) {
    this.__fosAt = Date.now();
    this.addEventListener("loadend", () => {
      record(this.__fosMethod || "GET", this.__fosUrl || "", this.status, Date.now() - (this.__fosAt || Date.now()));
    });
    return (send as unknown as (...a: unknown[]) => void).apply(this, rest);
  } as typeof XMLHttpRequest.prototype.send;
}

/**
 * Keep only what a bug report can use.
 *
 * A successful, fast request is not evidence — and on a busy page there are
 * hundreds of them, which would push the one failing call straight out of a
 * 50-entry ring. Failures and slow calls are what survive.
 */
function record(method: string, url: string, status: number, ms: number): void {
  const interesting = status === 0 || status >= 400 || ms > 2000;
  if (!interesting) return;
  push(networkRing, { method, url: stripQuery(url), status, ms: Math.round(ms) }, MAX_NETWORK);
}

/**
 * Drop the query string.
 *
 * Session tokens, signed URLs and reset codes live in query strings, and this
 * value is going into an issue that gets pasted into chat. The path is what
 * identifies the endpoint; the parameters are a liability.
 */
function stripQuery(url: string): string {
  const cut = url.indexOf("?");
  const clean = cut === -1 ? url : url.slice(0, cut);
  return clean.length > 200 ? clean.slice(0, 200) + "…" : clean;
}
