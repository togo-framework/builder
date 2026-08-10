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

/** The payload of `builder:context:done` — what the frame volunteers to the shell. */
export interface BridgeContext {
  console: ConsoleEntry[];
  network: NetworkEntry[];
  viewport: { w: number; h: number; dpr: number };
  userAgent: string;
  locale: string;
  url: string;
  title: string;
}

export interface Transport {
  /** Issues attached to the current page. */
  listByRoute(route: string): Promise<IssueSummary[]>;
  create(issue: NewIssue): Promise<{ id: string; number: number }>;
}

export interface MountOptions {
  /** API origin. Same-origin by default, which is what keeps cookies working. */
  apiBase?: string;
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
   * The page this widget sits on is a shell framing another origin.
   *
   * Pinning and screenshots both read the DOM, and a cross-origin iframe is
   * opaque to both: the picker sees one element it cannot look inside, and
   * html-to-image serialises the frame as a blank rectangle — which on a shell
   * page, where the frame IS the page, is a black image.
   *
   * So the controls are disabled and say why. A button that produces a black
   * screenshot is worse than no button: it looks like a bug in the tool and it
   * costs the operator the time to find out otherwise.
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
}
