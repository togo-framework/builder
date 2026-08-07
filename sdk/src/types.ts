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
}

export interface IssueSummary {
  id: string;
  number: number;
  title: string;
  type: IssueType;
  status: IssueStatus;
  /** True while an agent holds a lease on it — drives the inline spinner. */
  busy: boolean;
  commentCount: number;
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
  /** Called after an issue is created. */
  onCreated?: (r: { id: string; number: number }) => void;
}

export interface Handle {
  open(): void;
  close(): void;
  refresh(): void;
  destroy(): void;
}
