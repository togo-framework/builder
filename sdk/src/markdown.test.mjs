// Tests for the panel's markdown renderer.
//
// The security cases are the point of this file. The renderer runs inside the
// HOST page's origin — the customer's app, with the customer's session — and
// the strings it renders are written by whoever filed the bug report. A single
// innerHTML in markdown.ts turns every issue body into stored XSS on their
// site, so that property is asserted here rather than trusted to review.
//
// Run: node --test src/markdown.test.mjs   (build.mjs compiles the TS first)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { build } from "esbuild";

const dom = new JSDOM("<!doctype html><body></body>");
globalThis.document = dom.window.document;

const bundle = await build({
  entryPoints: ["src/markdown.ts"],
  bundle: true, write: false, format: "esm", target: "es2020",
});
const mod = await import(
  "data:text/javascript;base64," +
  Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const { renderMarkdown } = mod;

/** Render and return the container, so tests can query the real DOM. */
function render(md) {
  const host = document.createElement("div");
  host.appendChild(renderMarkdown(md));
  return host;
}

// ── the security property ───────────────────────────────────────────────────

test("the renderer never uses innerHTML", () => {
  const src = readFileSync(new URL("./markdown.ts", import.meta.url), "utf8");
  // Strip comments first — this file's own prose says "innerHTML" repeatedly.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"]) {
    assert.ok(!code.includes(sink), `markdown.ts must not use ${sink}`);
  }
});

test("raw HTML in a report is shown as text, never parsed", () => {
  const host = render("Hello <img src=x onerror=alert(1)> world");
  assert.equal(host.querySelectorAll("img").length, 0, "an <img> was constructed");
  assert.ok(host.textContent.includes("<img src=x onerror=alert(1)>"),
    "the raw markup should be visible as literal text");
});

test("a script tag cannot be smuggled through a code fence", () => {
  const host = render("```\n<script>alert(1)</script>\n```");
  assert.equal(host.querySelectorAll("script").length, 0);
  assert.equal(host.querySelector("pre code").textContent, "<script>alert(1)</script>");
});

test("javascript: links degrade to plain text", () => {
  const host = render("[click me](javascript:alert(document.cookie))");
  assert.equal(host.querySelectorAll("a").length, 0, "a javascript: URL became a link");
  assert.ok(host.textContent.includes("click me"));
});

test("data: and vbscript: links degrade to plain text", () => {
  for (const bad of ["data:text/html;base64,PHNjcmlwdD4=", "vbscript:msgbox(1)", "JaVaScRiPt:alert(1)"]) {
    const host = render(`[x](${bad})`);
    assert.equal(host.querySelectorAll("a").length, 0, `${bad} became a link`);
  }
});

test("safe links are rendered, and cannot reach back into the opener", () => {
  const host = render("[docs](https://example.com/a) and [mail](mailto:a@b.c) and [rel](/issues/3)");
  const links = [...host.querySelectorAll("a")];
  assert.equal(links.length, 3);
  assert.equal(links[0].getAttribute("href"), "https://example.com/a");
  for (const a of links) {
    assert.match(a.getAttribute("rel") ?? "", /noopener/);
  }
});

// ── rendering, i.e. the bug the user actually reported ──────────────────────

test("the triage comment renders as formatting, not as literal asterisks", () => {
  // This exact string is what the orchestrator writes, and what was showing
  // raw on the issue page.
  const host = render("**Triaged** → `blocked`");
  assert.equal(host.querySelector("strong").textContent, "Triaged");
  assert.equal(host.querySelector("code").textContent, "blocked");
  assert.ok(!host.textContent.includes("**"), "asterisks are still visible");
  assert.ok(!host.textContent.includes("`"), "backticks are still visible");
});

test("italics written with underscores render", () => {
  const host = render("_Understood as:_ the user wants X");
  assert.equal(host.querySelector("em").textContent, "Understood as:");
});

test("headings start below the panel title", () => {
  const host = render("# Top\n## Second");
  // The panel's own title is an h3, so body headings must not outrank it.
  assert.equal(host.querySelector("h4").textContent, "Top");
  assert.equal(host.querySelector("h5").textContent, "Second");
});

test("lists render as lists", () => {
  const ul = render("- one\n- two\n- three");
  assert.equal(ul.querySelectorAll("ul li").length, 3);
  const ol = render("1. first\n2. second");
  assert.equal(ol.querySelectorAll("ol li").length, 2);
});

test("a fenced block keeps its language and its exact contents", () => {
  const host = render("before\n\n```go\nfunc main() {\n\tx := 1\n}\n```\n\nafter");
  const code = host.querySelector("pre code");
  assert.equal(code.className, "lang-go");
  assert.equal(code.textContent, "func main() {\n\tx := 1\n}");
  assert.equal(host.querySelectorAll("p").length, 2);
});

test("markdown inside a code span is not re-parsed", () => {
  const host = render("`**not bold**`");
  assert.equal(host.querySelector("code").textContent, "**not bold**");
  assert.equal(host.querySelectorAll("strong").length, 0);
});

test("blockquotes nest their own blocks", () => {
  const host = render("> quoted **bold**\n> still quoted");
  assert.equal(host.querySelectorAll("blockquote").length, 1);
  assert.equal(host.querySelector("blockquote strong").textContent, "bold");
});

test("a single newline inside a paragraph becomes a line break", () => {
  const host = render("line one\nline two");
  assert.equal(host.querySelectorAll("p").length, 1);
  assert.equal(host.querySelectorAll("br").length, 1);
});

test("plain prose with no markdown survives unchanged", () => {
  const body = "remove the widgets from the current page and make it empty for my next promot";
  assert.equal(render(body).textContent, body);
});

test("empty and malformed input do not throw or hang", () => {
  for (const bad of ["", "   ", "```\nunclosed fence", "> ", "- ", "***", "[x](", "**"]) {
    assert.doesNotThrow(() => render(bad), `threw on ${JSON.stringify(bad)}`);
  }
});
