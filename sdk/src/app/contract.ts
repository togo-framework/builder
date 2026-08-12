// The FeedbackOS app contract.
//
// This is what a project author implements to put something in a window. It is
// the public API of the whole windowed shell, so the shape matters more than
// anything else here — a wrong contract is the expensive mistake, because every
// app written against it has to change when it moves.
//
// THE MOUNT CONTRACT IS IMPERATIVE, NOT A REACT COMPONENT.
//
// `mount(host) => instance` rather than `React.ComponentType`. That is
// deliberate and it is the single most important decision in this file:
//
//   - an app can be React, Solid, Svelte, Vue, or fifty lines of DOM
//   - an app NEVER compiles against our React, so it cannot be broken by our
//     upgrade, and cannot break us with a duplicate copy of a renderer
//   - the same signature works for a module in our realm, a nested iframe, and
//     a built-in — one host, four content kinds, no special cases at call sites
//
// A React-shaped contract would have quietly made every app a React app and
// pinned the whole ecosystem to our version of it.

/** How a window gets filled. Mirrors customapps.ContentKind in Go. */
export type ContentKind = "module" | "iframe" | "builtin" | "route";

export interface AppContent {
  kind: ContentKind;
  /** Module file name, absolute https URL, builtin name, or dashboard path. */
  entry: string;
  permissions?: string[];
  /** iframe sandbox override. Empty means the default, which withholds same-origin. */
  sandbox?: string;
}

export interface AppWindowSpec {
  width?: number;
  height?: number;
  /** Below this the app's layout stops being usable. Only the app knows where. */
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
}

/** One app, as the shell sees it. Mirrors customapps.Manifest. */
export interface AppMeta {
  slug: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  order?: number;
  content: AppContent;
  window?: AppWindowSpec;
}

/**
 * What the shell hands an app at mount.
 *
 * A struct rather than positional arguments so a later addition does not break
 * every app already written — the same reason togo hands providers a *Kernel.
 */
export interface AppHost {
  /** The app's own slug, so one bundle can serve several registrations. */
  slug: string;
  /** API origin. Same-origin requests carry the session; cross-origin do not. */
  apiBase: string;
  /** "en" | "ar". */
  locale: string;
  /** "ltr" | "rtl". Set it on your own root; nothing inherits across a frame. */
  dir: "ltr" | "rtl";
  /** Whether the shell is currently dark. */
  dark: boolean;

  /**
   * Fetch through the shell.
   *
   * Use this rather than global fetch: it attaches the app's scoped token when
   * there is one, and it is the seam where a future permission check lands. An
   * app that reaches for window.fetch works today and silently bypasses that.
   */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;

  /** Set the window's title — e.g. a composer becoming "#143" after filing. */
  setTitle: (title: string) => void;
  /** Close this window. */
  close: () => void;
  /** Ask the shell to open another app, optionally at a section. */
  open: (slug: string, section?: string) => void;

  /**
   * Deep-link target, and a nonce that changes on every retarget.
   *
   * The nonce exists because re-opening an app at the SAME section must still
   * navigate — without it, "open Settings at wallpaper" does nothing the second
   * time, which reads as the app being broken.
   */
  section?: string;
  sectionNonce: number;
}

/** What mount() returns. Every member optional: the minimum app is a mount. */
export interface AppInstance {
  /** Tear down. Remove listeners and timers — the host element is discarded. */
  unmount?: () => void;
  /** The shell re-targeted this app at a section while it was already open. */
  onSection?: (section: string, nonce: number) => void;
  /** Theme or locale changed under the app. */
  onHostChange?: (host: AppHost) => void;
}

/**
 * The default export of an app module.
 *
 * ```ts
 * export default {
 *   mount(el, host) {
 *     el.textContent = `hello from ${host.slug}`;
 *     return { unmount() { el.textContent = ""; } };
 *   },
 * } satisfies FeedbackOSApp;
 * ```
 */
export interface FeedbackOSApp {
  mount: (el: HTMLElement, host: AppHost) => AppInstance | void | Promise<AppInstance | void>;
}

/** Runtime shape check. A module that fails this gets an error tile, not a throw. */
export function isFeedbackOSApp(v: unknown): v is FeedbackOSApp {
  return !!v && typeof (v as FeedbackOSApp).mount === "function";
}
