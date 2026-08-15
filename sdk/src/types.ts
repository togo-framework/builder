/** Issue classification. Mirrors the `builder_issue_type` enum. */
export type IssueType = "bug" | "feature" | "question" | "discussion";

/** Board column. Mirrors the `builder_issue_status` enum. */
export type IssueStatus =
  | "triage"
  | "ready"
  | "in_progress"
  | "blocked"
  | "in_review"
  | "done"
  | "rejected";

/**
 * A DOM anchor captured by the pin picker.
 *
 * Every field is a separate re-resolution strategy, ordered most durable first.
 * They are all captured at pin time because the cheap ones (`css` especially)
 * break on the first restyle or list reorder, and by then the element is gone
 * and there is nothing left to fall back to.
 */
export interface PinAnchor {
  /** `data-testid` — survives restyle AND reorder. The only strategy that does. */
  testid?: string;
  /** `#id` — survives restyle, breaks if the id is generated per render. */
  domId?: string;
  /** ARIA role + accessible name — survives restyle, usually survives reorder. */
  role?: string;
  name?: string;
  /** Structural CSS path. Last resort: silently re-resolves to a DIFFERENT element after a reorder. */
  css?: string;
  /** Visible text, truncated. Used to score a candidate rather than to select one. */
  hint?: string;
  tag?: string;
  /** Bounding box as viewport FRACTIONS, so it survives a window resize. */
  rect?: { x: number; y: number; w: number; h: number };
  scrollY?: number;
  viewport?: { w: number; h: number; dpr: number };
  href?: string;
  /** Which strategies were verified unique at capture time. */
  verified?: string[];
}

export interface Attachment {
  name: string;
  mime: string;
  size: number;
  kind: "screenshot" | "image" | "video" | "file";
  /** The actual bytes. The published togo widget carries only a name, which
   *  makes its attachment feature non-functional; this is the fix. */
  blob: Blob;
}

export interface NewIssue {
  type: IssueType;
  title: string;
  body: string;
  route: string;
  pageUrl: string;
  locale: string;
  pins: PinAnchor[];
  attachments: Attachment[];
  reporterEmail?: string;
  /**
   * The console/network snapshot the framed product volunteered (bridge mode).
   * Only ever present when the reporter was shown the disclosure and did not
   * opt out — attaching it silently would make the widget a session harvester.
   */
  context?: BridgeContext | null;
}

export interface IssueSummary {
  id: string;
  number: number;
  title: string;
  type: IssueType;
  status: IssueStatus;
  /** True while an agent holds a lease on it — drives the inline spinner. */
  busy: boolean;
  /** Slug of the agent currently working it. Empty unless `busy`. */
  agent?: string;
  commentCount: number;
}

/** One captured console line. Text is redacted BEFORE it enters the buffer. */
export interface ConsoleEntry {
  level: "log" | "info" | "warn" | "error" | "debug";
  text: string;
  ts: number;
}

/**
 * One captured request. Method, URL, status and duration ONLY — bodies are
 * never read and headers (Authorization above all) are never touched. The URL
 * is redacted because tokens live in query strings too.
 */
export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  ok: boolean;
  durationMs: number;
  ts: number;
}

/**
 * Which hosted app a bridge payload came from.
 *
 * A shell can host several apps at once — app.co, auth.app.co,
 * dashboard.app.co — each in its own frame. This is stamped by the SHELL, from
 * its own configured registry, onto every message it forwards from a frame; it
 * is never taken from the frame, which has no way to know what the operator
 * named it and no business asserting it. That is what makes it impossible for
 * one app's console to be filed against another.
 */
export interface BridgeApp {
  /** Slug from the shell's config. Stable across a URL change. */
  id: string;
  /** What the operator called it, and what the filed issue will say. */
  name: string;
  /** The one origin that frame is allowed to speak from. */
  origin: string;
}

/** The payload of `builder:context:done` — what the frame volunteers to the shell. */
export interface BridgeContext {
  console: ConsoleEntry[];
  network: NetworkEntry[];
  viewport: { w: number; h: number; dpr: number };
  userAgent: string;
  locale: string;
  url: string;
  title: string;
  /**
   * The app this snapshot came from. Absent when the SDK is not in a shell —
   * an unframed product is one app and naming it would be noise. Present, it
   * rides all the way into the issue's stored browser context, which is how a
   * report from auth.app.co says so on the board.
   */
  app?: BridgeApp;
}

export interface Transport {
  /** Issues attached to the current page. */
  listByRoute(route: string): Promise<IssueSummary[]>;
  create(issue: NewIssue): Promise<{ id: string; number: number }>;
}

/**
 * An app contributed by the EMBEDDING site.
 *
 * The dock ships the builder's own screens; this is how a product puts its own
 * screens beside them. `path` is a route on the page's own origin, framed
 * same-origin under the session that is already open — which is why only the
 * host can declare one, and why the server-side app registry has no equivalent.
 */
export interface HostApp {
  /** Unique within the dock. Collides with a builder screen at your peril. */
  slug: string;
  /** Shown on the tile and in the Launchpad. Localize it yourself. */
  name: string;
  /** A glyph name from the shell's inlined set, e.g. "Settings", "Globe". */
  icon?: string;
  /** Any CSS colour. Used for the tile's gradient. */
  color?: string;
  /** A path on this origin, e.g. "/en/settings/seo". */
  path: string;
  /** Opening size. The app knows its own layout; the shell does not. */
  window?: { width?: number; height?: number; minWidth?: number; minHeight?: number; resizable?: boolean };
}

export interface MountOptions {
  /** API origin. Same-origin by default, which is what keeps cookies working. */
  apiBase?: string;
  /**
   * The embedding site's own screens, as apps.
   *
   * Windowed-shell only: the panel has no dock to put them in. Ignored rather
   * than erroring when the shell falls back, so passing them is always safe.
   */
  apps?: HostApp[];
  /**
   * Where the builder's screens are mounted, under `apiBase`.
   *
   * Defaults to "/builder", which is where the plugin serves them from its
   * embedded bundle. The launcher used to open "/issues", "/agents" and the
   * rest at the ROOT of whatever page the widget was on — which is correct only
   * for a project scaffolded from the blueprint, whose own router happens to
   * define those paths. Installed into an existing application, every tile in
   * the launcher opened a 404: the host owns "/" and has never heard of
   * "/agents".
   *
   * Override only if the plugin was mounted somewhere else.
   */
  screensBase?: string;
  /**
   * Which shell to render.
   *
   *   "panel"  the existing single-panel widget. THE DEFAULT, and the code path
   *            is untouched by the FeedbackOS work — Rule 36's off-branch is the
   *            old branch, not new code pretending to be old.
   *   "os"     the windowed FeedbackOS shell in its own iframe: a dock, draggable
   *            resizable windows, and apps registered by plugins.
   *   "auto"   "os" where it is provably safe, "panel" everywhere else.
   *
   * "os" and "auto" both fall back to "panel" on their own — a browser whose
   * clip-path does not exclude clipped regions from hit-testing, a host CSP that
   * blocks the frame, or a shell that stops answering its heartbeat. A caller
   * asking for "os" is asking for the upgrade where it works, never for a broken
   * page where it does not.
   */
  shell?: "panel" | "os" | "auto";

  /**
   * Base z-index for the overlay. Below the FAB's 2147483645 by default so the
   * two coexist during migration.
   */
  zIndex?: number;

  /**
   * Claim Cmd/Ctrl+K for the shell's spotlight.
   *
   * Defaults to false on a host that is not the API's own origin. Host search
   * palettes are very often Cmd+K — this site's own layout binds it — and
   * silently stealing it is a worse first impression than not having a
   * shortcut.
   */
  hotkey?: string | false;

  /** `en` | `ar`. Drives copy and text direction. */
  locale?: string;
  /** Accent colour. Falls back to the builder default. */
  accent?: string;
  /** Force a theme instead of following `prefers-color-scheme`. */
  theme?: "light" | "dark";
  /** Where the FAB starts, before the user drags it. */
  position?: { right: number; bottom: number };
  /** Override the transport — used by the host app to inject session auth. */
  transport?: Transport;
  /**
   * The page this widget sits on is a shell framing one or more other origins.
   *
   * Pinning and screenshots both read the DOM, and a cross-origin iframe is
   * opaque to both: the picker sees one element it cannot look inside, and
   * html-to-image serialises the frame as a blank rectangle — which on a shell
   * page, where the frames ARE the page, is a black image.
   *
   * So the panel does not read them. It posts requests to its own window; the
   * shell's relay forwards each to the frame it names and stamps every answer
   * with the app it came from. The panel keeps per-app state and files the
   * report against the app in view — see the framedHost block in index.ts.
   */
  framedHost?: boolean;
  /**
   * The FRAME role — the counterpart of `framedHost`, kept as a separate
   * option because they are separate pages: `framedHost` marks the OUTER
   * shell page, `bridge` governs the INNER framed product.
   *
   * When this page is framed by a builder shell, the SDK answers the shell's
   * `builder:hello`, suppresses its own panel and FAB (two widgets on screen
   * is the bug this replaces), and serves pin / screenshot / context / URL
   * requests over postMessage — see bridge.ts for the protocol. Defaults to
   * true; until a hello actually arrives the SDK behaves exactly as it does
   * unframed. Set false to never answer a shell.
   */
  bridge?: boolean;
  /**
   * Origins allowed to act as the shell. When set, a `builder:hello` from any
   * other origin is ignored. Unset, any direct parent that completes the
   * handshake is accepted — reasonable for a dev tool; tighten it when the
   * product runs anywhere an unknown page could frame it.
   */
  shellOrigins?: string[];
  /** Called after an issue is created. */
  onCreated?: (r: { id: string; number: number }) => void;
}

export interface Handle {
  open(): void;
  close(): void;
  refresh(): void;
  destroy(): void;
  /**
   * Replace the site's contributed apps (MountOptions.apps) after mount.
   *
   * Only present on the windowed shell — the panel has no dock — so callers
   * either use the optional call or the namespace-level `setApps`, which is a
   * no-op rather than a crash when the panel is running.
   */
  setApps?(apps: HostApp[]): void;

  /**
   * Show, hide or toggle the app launcher.
   *
   * Omitting `open` toggles. Exists because the control for it lives in the
   * HOST's chrome — a site's own admin bar — which has no other way to reach
   * state that lives inside the shell's document.
   */
  toggleDock?(open?: boolean): void;
}
