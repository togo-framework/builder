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
 *
 * THE SAME ISSUE, TWO SURFACES
 *
 * This view and the dashboard's issue page show one object, so they read as
 * one product: title large and plain, properties as quiet labelled groups,
 * state as a coloured dot and never a coloured word, and activity as ONE
 * stream at two weights — a comment carries reasoning and gets a card, an
 * event is a fact and gets a line, joined by a faint vertical thread.
 *
 * WHAT THE PANEL DOES DIFFERENTLY, AND WHY
 *
 * The page is three panes (nav | content | 264px properties rail). This is a
 * slide-over at most 640px wide, so a rail beside the content would leave the
 * content in a column too narrow to read a code block in. The rail becomes a
 * block of the same quiet rows directly under the title, wrapping into as many
 * columns as the width allows — one on a phone, two at full panel width. Same
 * vocabulary, same order, laid down instead of across.
 *
 * Dropped rather than crammed in: the issue pager, star, copy-link and delete
 * (account-level actions that belong on the page the header links to), the
 * editable property controls (this transport has no PATCH, and a control that
 * looks editable but silently is not is worse than a value), and the captured
 * console/network section (reference material, whereas the pin is the one
 * thing that can only be done HERE, over the live page).
 */

export interface DetailComment {
  id: string;
  author: string;
  kind: string;
  body: string;
  createdAt: string;
}

export interface DetailEvent {
  action: string;
  actorKind: string;
  createdAt: string;
}

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
  assignee: string;
  humanOnly: boolean;
  area: string;
  branch: string;
  attempts: number;
  busy: boolean;
  pins: Array<PinAnchor & { resolvedState?: string; verified?: string[] }>;
  comments: DetailComment[];
  activity: DetailEvent[];
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
        // The properties the panel now shows. All of them were already in the
        // response; this view simply threw them away and rendered three chips.
        assignee: d.assignee ?? "", humanOnly: !!d.humanOnly, area: d.area ?? "",
        branch: d.branch ?? "", attempts: typeof d.attempts === "number" ? d.attempts : 0,
        busy: !!d.busy,
        pins: d.pins ?? [], comments: d.comments ?? [], activity: d.activity ?? [],
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

/** One entry in the merged stream, ordered by when it happened. */
type ThreadItem =
  | { at: number; kind: "comment"; comment: DetailComment }
  | { at: number; kind: "event"; event: DetailEvent };

export function createDetail(
  locale: string,
  transport: DetailTransport,
  onBack: () => void,
  /**
   * The full page for one issue.
   *
   * Passed in rather than built here, because only the caller knows where the
   * builder's screens are mounted. This used to open "/issues/39" on whatever
   * origin the widget was sitting on — right for a project scaffolded from the
   * blueprint, a 404 in any application that owns "/issues" itself or does not
   * define it at all.
   */
  issueURL: (number: number) => string = (n) => `/builder/issues/${n}`,
): DetailView {
  const t = dict(locale);
  const el = document.createElement("div");
  el.className = "detail hidden";
  let current: DetailIssue | null = null;
  // Held outside render() so a reload — posting a comment, or a failed one —
  // does not wipe what the operator has half-typed.
  let draft = "";
  let noteSlot: HTMLElement | null = null;

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
    el.append(nav(d), main(d), composer(d));
  }

  // ---- the top bar -------------------------------------------------------
  // Where you are and the two ways out: back to the page's listing, or out to
  // the full issue. Everything else the page's header carries — pager, star,
  // delete — lives on the page, one click away through the second of those.
  function nav(d: DetailIssue): HTMLElement {
    const bar = node("div", "d-nav", "");

    const back = document.createElement("button");
    back.type = "button";
    back.className = "d-back";
    back.append(icon("chevronLeft", 14), node("span", "", t.back));
    back.addEventListener("click", onBack);

    // An issue number is machine text: it stays "#2" in Arabic, never "2#".
    const num = node("span", "d-num", `#${d.number}`);
    num.setAttribute("dir", "ltr");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "d-iconbtn d-open";
    open.title = t.openFull;
    open.setAttribute("aria-label", t.openFull);
    open.appendChild(icon("externalLink", 14));
    open.addEventListener("click", () => window.open(issueURL(d.number), "_blank", "noopener"));

    bar.append(back, num, open);
    return bar;
  }

  // ---- the scrolling document --------------------------------------------
  function main(d: DetailIssue): HTMLElement {
    const m = node("div", "d-main", "");

    // Title: large, plain, no chrome. dir=auto because a title is prose and
    // may be written in either language whatever the panel's own direction is.
    const h = node("h3", "d-title", d.title);
    h.setAttribute("dir", "auto");
    m.appendChild(h);

    const sub = node("p", "d-sub", "");
    sub.appendChild(node("span", "", t.opened(t.ago(d.createdAt))));
    if (d.busy) {
      // Greyscale, like the issue page: the pulse alone says "alive". Colour
      // here would compete with the two dots that actually encode state.
      const live = node("span", "d-live", "");
      live.appendChild(node("span", "d-pulse", ""));
      live.appendChild(node("span", "", t.working));
      sub.append(sep(), live);
    }
    m.appendChild(sub);

    m.appendChild(properties(d));

    // The description IS the document — no heading, no box, straight under the
    // properties. It used to sit in a bordered grey slab, which made a bug
    // report look like a quoted aside inside its own issue.
    const body = node("div", "d-body", "");
    body.setAttribute("dir", "auto");
    if (d.body) body.appendChild(renderMarkdown(d.body));
    else body.appendChild(node("p", "d-empty", t.noDescription));
    m.appendChild(body);

    if (d.pins.length) {
      m.appendChild(sect(t.pinnedHeading, d.pins.length));
      const box = node("div", "d-objs", "");
      for (const p of d.pins) box.appendChild(pinRow(p));
      m.appendChild(box);
    }

    const stream = items(d);
    m.appendChild(sect(t.activityHeading, stream.length || undefined));
    m.appendChild(thread(stream));
    return m;
  }

  // ---- properties --------------------------------------------------------
  //
  // The rail, laid down. Every property stays visible with nothing in it — an
  // empty Branch is the invitation the issue page keeps too, and a row that
  // appears only sometimes makes the block a different shape on every issue.
  function properties(d: DetailIssue): HTMLElement {
    const box = node("div", "d-props", "");

    box.appendChild(prop(dot("status", d.status), t.statusLabel,
      text(t.statuses[d.status] ?? d.status)));
    box.appendChild(prop(dot("priority", d.priority), t.priorityLabel,
      text(t.priorities[d.priority] ?? d.priority)));
    box.appendChild(prop(icon("flag", 13), t.type,
      text((t as unknown as Record<string, string>)[d.type] ?? d.type)));

    // One value for the whole routing decision, exactly as the issue page's
    // single control expresses it: a named agent, anyone who owns the area, or
    // nobody but a person.
    const who = d.humanOnly ? t.assigneeHuman : d.assignee || t.assigneeAnyArea;
    // An agent slug is machine text; the two fallbacks are prose. Isolated
    // either way, and never with a direction forced on the row.
    box.appendChild(prop(icon("user", 13), t.assigneeLabel,
      d.assignee && !d.humanOnly ? machine(who) : text(who), !d.assignee && !d.humanOnly));

    box.appendChild(prop(icon("layers", 13), t.areaLabel,
      d.area ? machine(d.area) : text(t.notSet), !d.area));
    box.appendChild(prop(icon("gitBranch", 13), t.branchLabel,
      d.branch ? machine(d.branch) : text(t.notSet), !d.branch));
    box.appendChild(prop(icon("history", 13), t.attemptsLabel,
      machine(String(d.attempts))));
    if (d.route) box.appendChild(prop(icon("route", 13), t.routeLabel, machine(d.route)));

    return box;
  }

  function prop(glyph: Element, label: string, value: Node, muted = false): HTMLElement {
    const row = node("div", "d-prop", "");
    const k = node("span", "d-prop-k", "");
    k.append(glyph, node("span", "", label));
    const v = node("span", `d-prop-v${muted ? " muted" : ""}`, "");
    v.appendChild(value);
    row.append(k, v);
    return row;
  }

  /** State as a coloured dot. Never a coloured word — see the design refs. */
  function dot(kind: "status" | "priority", value: string): HTMLElement {
    const s = document.createElement("span");
    s.className = "d-dot";
    s.dataset[kind] = value;
    return s;
  }

  // ---- pins --------------------------------------------------------------
  //
  // The reason this view is worth having in the panel at all: the element is
  // on the screen BEHIND us, so it can actually be pointed at.
  function pinRow(p: PinAnchor & { verified?: string[] }): HTMLElement {
    const row = node("div", "d-obj", "");

    const tile = node("span", "d-obj-ico", "");
    tile.setAttribute("aria-hidden", "true");
    tile.appendChild(icon("crosshair", 15));

    const txt = node("div", "d-obj-txt", "");
    const nm = node("p", "d-obj-nm", "");
    // The tag is markup and stays LTR; the accessible name is whatever text
    // was on the element and may be Arabic. Two isolates rather than one
    // dir=ltr over the pair, which would drag an Arabic name out of order.
    const tag = node("bdi", "", `<${p.tag ?? "?"}>`);
    tag.setAttribute("dir", "ltr");
    nm.appendChild(tag);
    if (p.name) {
      nm.appendChild(node("span", "", " — "));
      nm.appendChild(node("bdi", "", `“${p.name}”`));
    }
    const meta = node("p", "d-obj-meta", "");
    if (p.verified && p.verified.length) meta.appendChild(machine(p.verified.join(", ")));
    else meta.textContent = t.pinNoStrategy;
    txt.append(nm, meta);

    const show = document.createElement("button");
    show.type = "button";
    show.className = "d-iconbtn";
    show.title = t.pinShow;
    show.setAttribute("aria-label", t.pinShow);
    show.appendChild(icon("eye", 14));
    show.addEventListener("click", () => {
      const r = highlight(p);
      note(r.found ? t.pinFound(r.by, Math.round(r.confidence * 100)) : t.pinLost,
        r.found ? "ok" : "err");
    });

    row.append(tile, txt, show);
    return row;
  }

  // ---- activity ----------------------------------------------------------
  //
  // ONE stream, TWO weights. A comment carries reasoning, so it keeps card
  // weight — including an agent's, which is where the run card and its table
  // live. An event is a fact, so it collapses to a line. The thread line is
  // what makes them one conversation rather than two lists stacked up.
  function items(d: DetailIssue): ThreadItem[] {
    return [
      ...d.comments.map((c): ThreadItem => ({ at: stamp(c.createdAt), kind: "comment", comment: c })),
      ...d.activity
        // "commented" duplicates the card sitting right beside it. On a page
        // 264px wider that is a harmless echo; in this column it is half the
        // stream saying nothing.
        .filter((a) => a.action !== "commented")
        .map((a): ThreadItem => ({ at: stamp(a.createdAt), kind: "event", event: a })),
    ].sort((x, y) => x.at - y.at);
  }

  function thread(stream: ThreadItem[]): HTMLElement {
    if (!stream.length) return node("p", "d-empty", t.emptyThread);

    const list = document.createElement("ol");
    list.className = "d-thread";
    for (const it of stream) {
      list.appendChild(it.kind === "comment" ? commentItem(it.comment) : eventItem(it.event));
    }
    return list;
  }

  function commentItem(c: DetailComment): HTMLElement {
    const li = document.createElement("li");
    li.className = "d-item";
    li.appendChild(line());
    li.appendChild(avatar(c.author, c.kind));

    const card = document.createElement("article");
    card.className = "d-card";

    const head = node("p", "d-card-h", "");
    const who = node("span", "d-who", "");
    who.appendChild(node("bdi", "", c.author || "—"));
    head.appendChild(who);
    if (c.kind === "agent") head.appendChild(node("span", "d-badge", t.agentBadge));
    head.appendChild(sep());
    head.appendChild(node("span", "", t.ago(c.createdAt)));

    const body = node("div", "d-card-b", "");
    body.setAttribute("dir", "auto");
    body.appendChild(renderMarkdown(c.body));

    card.append(head, body);
    li.appendChild(card);
    return li;
  }

  function eventItem(e: DetailEvent): HTMLElement {
    const li = document.createElement("li");
    li.className = "d-item d-evt";
    li.appendChild(line());

    const knot = node("span", "d-knot", "");
    knot.setAttribute("aria-hidden", "true");
    knot.appendChild(document.createElement("span"));
    li.appendChild(knot);

    const p = node("p", "d-evt-t", "");
    const said = node("span", "d-evt-w", "");
    // Both halves are translated prose. An unknown verb from a newer server
    // falls through as the raw identifier rather than vanishing.
    said.appendChild(node("span", "d-who", t.actors[e.actorKind] ?? e.actorKind));
    said.appendChild(document.createTextNode(" " + (t.actions[e.action] ?? e.action)));
    p.append(said, sep(), node("span", "d-evt-at", t.ago(e.createdAt)));
    li.appendChild(p);
    return li;
  }

  /** Initials for a person, the bot glyph for an agent. */
  function avatar(name: string, kind: string): HTMLElement {
    const a = node("span", "d-avatar", "");
    a.setAttribute("aria-hidden", "true");
    if (kind === "agent") a.appendChild(icon("agents", 13));
    else if (kind === "system") a.appendChild(icon("messageSquare", 12));
    else a.appendChild(node("bdi", "", (name.trim()[0] || "?").toUpperCase()));
    return a;
  }

  // ---- composer ----------------------------------------------------------
  //
  // Pinned to the bottom of the panel rather than trailing the stream.
  // Answering is the action this view exists for, and in a column this narrow
  // a composer at the end of a long thread is a composer you have to go and
  // look for.
  function composer(d: DetailIssue): HTMLElement {
    const box = node("div", "d-composer", "");
    noteSlot = node("p", "note hidden", "");

    const ta = document.createElement("textarea");
    ta.className = "d-draft";
    ta.placeholder = t.commentPlaceholder;
    ta.rows = 2;
    ta.value = draft;
    ta.addEventListener("input", () => { draft = ta.value; });

    const send = document.createElement("button");
    send.type = "button";
    send.className = "primary d-send";
    const paint = (label: string) => {
      send.replaceChildren(icon("send", 13), node("span", "", label));
    };
    paint(t.commentCta);
    send.addEventListener("click", async () => {
      const body = ta.value.trim();
      if (!body) return;
      send.disabled = true;
      paint(t.posting);
      try {
        await transport.comment(d.number, body);
        draft = "";
        await load(d.number);
      } catch (err) {
        note(String((err as Error).message), "err");
        send.disabled = false;
        paint(t.commentCta);
      }
    });

    const row = node("div", "d-composer-act", "");
    row.appendChild(send);
    box.append(noteSlot, ta, row);
    return box;
  }

  /** Transient feedback, shown above the composer where it cannot be missed. */
  function note(msg: string, kind: "ok" | "err") {
    const slot = noteSlot;
    if (!slot) return;
    slot.textContent = msg;
    slot.className = `note ${kind}`;
    setTimeout(() => {
      if (slot.textContent === msg) slot.className = "note hidden";
    }, 4000);
  }

  // ---- small helpers -----------------------------------------------------
  const sep = () => {
    const s = node("span", "d-sep", "·");
    s.setAttribute("aria-hidden", "true");
    return s;
  };

  const line = () => {
    const l = node("span", "d-line", "");
    l.setAttribute("aria-hidden", "true");
    return l;
  };

  function sect(title: string, count?: number): HTMLElement {
    const h = node("div", "d-sect", "");
    h.appendChild(node("h4", "d-sect-t", title));
    if (count !== undefined) {
      const n = node("span", "d-sect-n", String(count));
      n.setAttribute("dir", "ltr");
      h.appendChild(n);
    }
    return h;
  }

  return { el, load, destroy: () => el.remove() };
}

/** Prose, isolated from its neighbours but carrying no direction of its own. */
function text(s: string): HTMLElement {
  return node("bdi", "", s);
}

/**
 * Machine text — a branch, a route, an agent slug, a count.
 *
 * dir=ltr on the VALUE, never on the row that holds it: the row also carries
 * an Arabic label, and one direction over both is how "الفرع" ends up on the
 * wrong side of its own value.
 */
function machine(s: string): HTMLElement {
  const b = node("bdi", "mono", s);
  b.setAttribute("dir", "ltr");
  return b;
}

/** Epoch ms, or 0 — an unparseable stamp sorts to the top rather than throwing. */
function stamp(iso: string): number {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

function node(tag: string, cls: string, txt: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt) e.textContent = txt;
  return e;
}
