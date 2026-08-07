import { dict } from "./i18n";
import { highlight } from "./picker";
import type { PinAnchor } from "./types";
import { icon } from "./icons";
import { renderMarkdown } from "./markdown";

/**
 * Issue detail, rendered inside the widget's own panel.
 *
 * Clicking a row must not navigate away: the reporter is usually mid-task on
 * the page the issue is about, and losing that context to a full page load is
 * the thing the widget exists to avoid. The full page stays available behind an
 * explicit "open" affordance.
 */

export interface DetailIssue {
  id: string;
  number: number;
  title: string;
  body: string;
  type: string;
  status: string;
  priority: string;
  route: string;
  pageUrl: string;
  createdAt: string;
  pins: Array<PinAnchor & { resolvedState?: string; verified?: string[] }>;
  comments: Array<{ id: string; author: string; kind: string; body: string; createdAt: string }>;
}

export interface DetailTransport {
  get(number: number): Promise<DetailIssue>;
  comment(number: number, body: string): Promise<void>;
}

export function httpDetail(apiBase = ""): DetailTransport {
  const base = apiBase.replace(/\/$/, "");
  return {
    async get(n) {
      const res = await fetch(`${base}/api/builder/issues/${n}`, { credentials: "include" });
      if (!res.ok) throw new Error(`could not load #${n}`);
      const d = await res.json();
      return {
        id: d.id, number: d.number, title: d.title, body: d.body ?? "",
        type: d.type, status: d.status, priority: d.priority,
        route: d.route ?? "", pageUrl: d.pageUrl ?? "", createdAt: d.createdAt ?? "",
        pins: d.pins ?? [], comments: d.comments ?? [],
      };
    },
    async comment(n, body) {
      const res = await fetch(`${base}/api/builder/issues/${n}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, author: "" }),
      });
      if (!res.ok) throw new Error("could not post the comment");
    },
  };
}

export interface DetailView {
  el: HTMLElement;
  load(number: number): Promise<void>;
  destroy(): void;
}

export function createDetail(
  locale: string,
  transport: DetailTransport,
  onBack: () => void,
): DetailView {
  const t = dict(locale);
  const el = document.createElement("div");
  el.className = "detail hidden";
  let current: DetailIssue | null = null;

  async function load(number: number) {
    el.replaceChildren(node("p", "empty", t.loading));
    try {
      current = await transport.get(number);
      render();
    } catch (err) {
      el.replaceChildren(node("p", "note err", String((err as Error).message)));
    }
  }

  function render() {
    if (!current) return;
    const d = current;
    el.replaceChildren();

    const head = node("div", "d-head", "");
    const back = button("ghost", "← " + t.onThisPage);
    back.addEventListener("click", onBack);
    const open = button("ghost", "↗");
    open.title = t.report;
    open.addEventListener("click", () =>
      window.open(`/issues/${d.number}`, "_blank", "noopener"),
    );
    head.append(back, open);
    el.appendChild(head);

    const meta = node("div", "d-meta", "");
    meta.append(
      node("span", "num", `#${d.number}`),
      node("span", `chip ${d.type}`, (t as any)[d.type] ?? d.type),
      node("span", "chip status", d.status.replace("_", " ")),
    );
    el.append(meta, node("h3", "d-title", d.title));

    if (d.body) {
      const body = node("div", "d-body", "");
      body.appendChild(renderMarkdown(d.body));
      el.appendChild(body);
    }

    // The pin is the reason this view is worth having in-page: the element is
    // on the screen behind the panel, so it can actually be shown.
    if (d.pins.length) {
      el.appendChild(node("div", "label", t.location));
      for (const p of d.pins) {
        const row = node("div", "d-pin", "");
        row.appendChild(node("span", "nm", `<${p.tag ?? "?"}>${p.name ? ` “${p.name}”` : ""}`));
        const show = button("ghost", "");
        show.appendChild(icon("eye", 14));
        show.title = t.pin;
        show.addEventListener("click", () => {
          const r = highlight(p);
          note(
            r.found
              ? `Found via ${r.by} (${Math.round(r.confidence * 100)}%)`
              : "The pinned element is not on this page any more.",
            r.found ? "ok" : "err",
          );
        });
        row.appendChild(show);
        el.appendChild(row);
      }
    }

    el.appendChild(node("div", "label", "Comments"));
    if (!d.comments.length) el.appendChild(node("p", "empty", "No comments yet."));
    for (const c of d.comments) {
      const box = node("div", "d-comment", "");
      const who = node("p", "who", c.author || "someone");
      if (c.kind === "agent") who.appendChild(node("span", "chip agent", "agent"));
      const txt = node("div", "txt", "");
      txt.appendChild(renderMarkdown(c.body));
      box.append(who, txt);
      el.appendChild(box);
    }

    const ta = document.createElement("textarea");
    ta.placeholder = "Add a comment…";
    ta.rows = 3;
    const send = button("primary", "Comment");
    send.addEventListener("click", async () => {
      const body = ta.value.trim();
      if (!body) return;
      send.disabled = true;
      try {
        await transport.comment(d.number, body);
        ta.value = "";
        await load(d.number);
      } catch (err) {
        note(String((err as Error).message), "err");
      } finally {
        send.disabled = false;
      }
    });
    el.append(ta, send);
  }

  function note(msg: string, kind: "ok" | "err") {
    const p = node("p", `note ${kind}`, msg);
    el.appendChild(p);
    setTimeout(() => p.remove(), 4000);
  }

  return { el, load, destroy: () => el.remove() };
}

function node(tag: string, cls: string, txt: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (txt) e.textContent = txt;
  return e;
}

function button(cls: string, txt: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = txt;
  return b;
}
