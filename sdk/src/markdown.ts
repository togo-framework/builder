// A small markdown renderer for the in-page panel.
//
// Why not the kit's MarkdownRenderer: that is a React component pulling in
// react-markdown, remark-gfm, rehype-highlight, highlight.js and the DataTable.
// This bundle is an IIFE injected into somebody else's page — it has no React
// and is 45 kB precisely so that embedding it is free. Reaching that component
// would cost well over 200 kB on every host page to render a bug report.
//
// The dashboard (React) DOES use the kit's renderer. Same markdown, two
// renderers, because the constraints genuinely differ.
//
// SECURITY — this file never touches innerHTML.
//
// Everything is built with createElement/textContent. Issue bodies and comments
// are written by whoever filed the report and by agents, then rendered inside
// the customer's own origin: an innerHTML shortcut here would be stored XSS on
// their page, with their session. Every addition to this file must keep that
// property; there is a test asserting it.

/** Block-level markdown → DOM. Returns a fragment ready to append. */
export function renderMarkdown(src: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = (src ?? "").replace(/\r\n?/g, "\n").split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code. Consumed verbatim — nothing inside is markdown.
    const fence = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const close = fence[1][0];
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${close}{3,}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // the closing fence, or the end of input
      const pre = document.createElement("pre");
      pre.className = "md-pre";
      const code = document.createElement("code");
      if (fence[2]) code.className = `lang-${fence[2]}`;
      code.textContent = body.join("\n");
      pre.appendChild(code);
      frag.appendChild(pre);
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // Thematic break, checked before lists so "---" is not read as a bullet.
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      frag.appendChild(document.createElement("hr"));
      i++;
      continue;
    }

    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      // The panel's own title is an h3, so a body "# Heading" starts at h4 and
      // never outranks it in the document outline.
      const level = Math.min(6, 3 + heading[1].length);
      const h = document.createElement(`h${level}`);
      h.className = "md-h";
      h.appendChild(renderInline(heading[2]));
      frag.appendChild(h);
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      const bq = document.createElement("blockquote");
      bq.className = "md-quote";
      bq.appendChild(renderMarkdown(quoted.join("\n")));
      frag.appendChild(bq);
      continue;
    }

    const bullet = /^\s*[-*+]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = !bullet.test(line);
      const marker = ordered ? numbered : bullet;
      const list = document.createElement(ordered ? "ol" : "ul");
      list.className = "md-list";
      while (i < lines.length && marker.test(lines[i])) {
        const li = document.createElement("li");
        // Continuation lines belong to the item they are indented under.
        let text = lines[i].replace(marker, "");
        i++;
        while (i < lines.length && lines[i].trim() && !marker.test(lines[i]) &&
               !/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(lines[i])) {
          text += "\n" + lines[i].trim();
          i++;
        }
        li.appendChild(renderInline(text));
        list.appendChild(li);
      }
      frag.appendChild(list);
      continue;
    }

    // GFM tables.
    //
    // Agents emit these constantly — the run card posted when one claims an
    // issue is a two-column table of branch, repo, areas, model and budget —
    // and without this branch the panel showed them as literal rows of pipes
    // ("| Branch | builder/issue-2 |"), which is what the operator reported.
    const table = tableAt(lines, i);
    if (table) {
      frag.appendChild(renderTable(table));
      i = table.next;
      continue;
    }

    // Paragraph: run to the next blank line or block starter.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() &&
           !/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(lines[i]) &&
           // A table's first line is an ordinary-looking line of text, so the
           // paragraph run has to stop at one explicitly or it eats the header
           // and the delimiter row before the table branch ever sees them.
           !isTableAt(lines, i)) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) {
      const p = document.createElement("p");
      p.className = "md-p";
      p.appendChild(renderInline(para.join("\n")));
      frag.appendChild(p);
    } else {
      i++; // never stall
    }
  }
  return frag;
}

// ---- tables ---------------------------------------------------------------
//
// A cell may contain an escaped pipe, so the split cannot be a plain
// String.split("|"). The escapes are parked on a character markdown can never
// produce, split on the real separators, then put back.
const ESC_PIPE = "\u0000";

function splitRow(line: string): string[] {
  let s = line.trim().replace(/\\\|/g, ESC_PIPE);
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.split(ESC_PIPE).join("|").trim());
}

/** The ---|:--:|--- row that turns the line above it into a table header. */
function isDelimiter(line: string): boolean {
  if (!line || line.indexOf("-") < 0 || line.indexOf("|") < 0) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function isTableAt(lines: string[], i: number): boolean {
  return i + 1 < lines.length && lines[i].indexOf("|") >= 0 && isDelimiter(lines[i + 1]);
}

/** Logical alignment, so a right-aligned column is trailing-aligned in RTL. */
type Align = "" | "start" | "center" | "end";

interface Table {
  head: string[];
  align: Align[];
  body: string[][];
  cols: number;
  /** Every header cell is blank — the shape agents use for a key/value card. */
  headless: boolean;
  next: number;
}

function tableAt(lines: string[], i: number): Table | null {
  if (!isTableAt(lines, i)) return null;

  const head = splitRow(lines[i]);
  const align: Align[] = splitRow(lines[i + 1]).map((c) =>
    c.startsWith(":") && c.endsWith(":") ? "center"
      : c.endsWith(":") ? "end"
      : c.startsWith(":") ? "start"
      : "",
  );

  let j = i + 2;
  const body: string[][] = [];
  while (j < lines.length && lines[j].trim() && lines[j].indexOf("|") >= 0) {
    body.push(splitRow(lines[j]));
    j++;
  }

  return {
    head, align, body,
    cols: body.reduce((m, r) => Math.max(m, r.length), head.length),
    headless: head.every((c) => c === ""),
    next: j,
  };
}

/**
 * Two shapes, because a slide-over panel is 640px at its widest and a real
 * table does not survive that.
 *
 * A HEADLESS TWO-COLUMN table — what an agent writes for its run card, header
 * row left empty on purpose — is not really a table: it is a list of labelled
 * facts. It renders as a key/value grid, which reads at any width and matches
 * how the dashboard already renders pin details and captured environment.
 *
 * Anything else is a genuine table and renders as one, inside a horizontally
 * scrollable wrapper so a wide one costs a swipe rather than widening the
 * whole panel.
 */
function renderTable(t: Table): HTMLElement {
  if (t.headless && t.cols === 2) {
    const dl = document.createElement("dl");
    dl.className = "md-kv";
    for (const row of t.body) {
      const dt = document.createElement("dt");
      // Per CELL, never per row: a key may be English while its value is an
      // Arabic sentence, and one direction imposed on the pair mangles one of
      // them. dir=auto also isolates a bare path so it cannot drag the text
      // beside it around.
      dt.setAttribute("dir", "auto");
      dt.appendChild(renderInline(row[0] ?? ""));
      const dd = document.createElement("dd");
      dd.setAttribute("dir", "auto");
      dd.appendChild(renderInline(row[1] ?? ""));
      dl.append(dt, dd);
    }
    return dl;
  }

  const wrap = document.createElement("div");
  wrap.className = "md-tablewrap";
  const table = document.createElement("table");
  table.className = "md-table";

  const cell = (tag: string, text: string, n: number): HTMLElement => {
    const c = document.createElement(tag);
    c.setAttribute("dir", "auto");
    if (t.align[n]) c.style.textAlign = t.align[n];
    c.appendChild(renderInline(text));
    return c;
  };

  if (!t.headless) {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    for (let n = 0; n < t.cols; n++) tr.appendChild(cell("th", t.head[n] ?? "", n));
    thead.appendChild(tr);
    table.appendChild(thead);
  }

  const tbody = document.createElement("tbody");
  for (const row of t.body) {
    const tr = document.createElement("tr");
    for (let n = 0; n < t.cols; n++) tr.appendChild(cell("td", row[n] ?? "", n));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  wrap.appendChild(table);
  return wrap;
}

// Inline spans, matched in one pass. Code first, so that `**not bold**` inside
// a code span survives verbatim.
const INLINE =
  /(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;

function renderInline(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let rest = text;

  for (;;) {
    const m = INLINE.exec(rest);
    if (!m || m.index === undefined) break;

    if (m.index > 0) appendText(frag, rest.slice(0, m.index));

    if (m[1]) {
      const c = document.createElement("code");
      c.className = "md-code";
      c.textContent = m[2].trim();
      frag.appendChild(c);
    } else if (m[3] !== undefined) {
      frag.appendChild(link(m[4], m[3] || m[4]));
    } else if (m[5]) {
      frag.appendChild(wrap("strong", "md-strong", m[6]));
    } else if (m[7]) {
      frag.appendChild(wrap("del", "md-del", m[8]));
    } else if (m[9]) {
      frag.appendChild(wrap("em", "md-em", m[10]));
    } else if (m[11]) {
      frag.appendChild(link(m[11], m[11]));
    }

    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) appendText(frag, rest);
  return frag;
}

function wrap(tag: string, cls: string, inner: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.appendChild(renderInline(inner));
  return e;
}

/**
 * Anchors are the one place markdown carries a URL, so the scheme is checked
 * rather than assumed: `[click](javascript:fetch('/admin/delete'))` is a
 * one-line stored-XSS payload in any renderer that passes href through.
 *
 * Unsafe schemes degrade to plain text — the reader still sees what was
 * written, it just is not clickable.
 */
function link(href: string, label: string): HTMLElement | Text {
  const safe = /^(https?:|mailto:)/i.test(href) || /^[/#]/.test(href);
  if (!safe) return document.createTextNode(label);

  const a = document.createElement("a");
  a.className = "md-a";
  a.href = href;
  a.target = "_blank";
  // noopener: the opened page must not get a handle on the host window.
  a.rel = "noopener noreferrer ugc";
  a.textContent = label;
  return a;
}

// A single newline inside a paragraph is a line break, matching how people
// actually write bug reports.
function appendText(frag: DocumentFragment, s: string): void {
  const parts = s.split("\n");
  parts.forEach((part, idx) => {
    if (idx) frag.appendChild(document.createElement("br"));
    if (part) frag.appendChild(document.createTextNode(part));
  });
}
