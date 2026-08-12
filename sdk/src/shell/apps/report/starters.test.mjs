// Starters are the scaffolding the Initial CTA pattern says carries the weight,
// so the ranking is the product decision being tested: the more specific the
// evidence behind a suggestion, the higher it should sit.
import { test } from "node:test";
import assert from "node:assert/strict";

let cached;
async function load() {
  if (cached) return cached;
  const { build } = await import("esbuild");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const res = await build({
    entryPoints: [fileURLToPath(new URL("./starters.ts", import.meta.url))],
    bundle: true, format: "esm", write: false, logLevel: "error",
  });
  const dir = mkdtempSync(join(tmpdir(), "st-"));
  const f = join(dir, "starters.mjs");
  writeFileSync(f, res.outputFiles[0].text);
  cached = await import(f);
  return cached;
}

const empty = { route: "/checkout", console: [], network: [] };

test("the row is never empty — empty scaffolding reads as a broken feature", async () => {
  const { buildStarters } = await load();
  for (const mode of ["bug", "idea", "question", "chore"]) {
    const s = buildStarters(empty, mode);
    assert.ok(s.length > 0, `no starters for mode ${mode}`);
    for (const x of s) assert.ok(x.text.trim().length > 0, "a starter with no text");
  }
});

test("a pinned element outranks everything — the user pointed at it", async () => {
  const { buildStarters } = await load();
  const s = buildStarters({
    ...empty,
    pinName: "Pay now",
    network: [{ method: "POST", url: "/api/pay", status: 500 }],
    console: [{ level: "error", text: "boom" }],
  }, "bug");
  assert.equal(s[0].id, "pin");
  assert.match(s[0].label, /Pay now/);
  // And it should read as a sentence, not a template with a hole in it.
  assert.match(s[0].text, /button/, "did not infer that 'Pay now' is a button");
});

test("a 5xx the user just caused beats a console error", async () => {
  const { buildStarters } = await load();
  const s = buildStarters({
    ...empty,
    network: [{ method: "POST", url: "/api/pay", status: 500 }],
    console: [{ level: "error", text: "boom" }],
  }, "bug");
  assert.equal(s[0].id, "net5xx-0");
  assert.match(s[0].label, /500/);
});

test("a 4xx only appears when there is nothing stronger", async () => {
  const { buildStarters } = await load();
  const withServerError = buildStarters({
    ...empty,
    network: [
      { method: "POST", url: "/api/pay", status: 500 },
      { method: "GET", url: "/api/me", status: 404 },
    ],
  }, "bug");
  assert.ok(!withServerError.some((x) => x.id === "net4xx"),
    "a 404 was offered alongside a 500 — often the app behaving correctly");

  const only4xx = buildStarters({
    ...empty, network: [{ method: "GET", url: "/api/me", status: 404 }],
  }, "bug");
  assert.ok(only4xx.some((x) => x.id === "net4xx"));
});

test("recent issues on this route are offered as 'this again'", async () => {
  const { buildStarters } = await load();
  const s = buildStarters({ ...empty, recent: [{ number: 142, title: "Checkout spinner" }] }, "bug");
  const r = s.find((x) => x.id === "recent-142");
  assert.ok(r, "a real prior issue was not offered");
  assert.match(r.text, /#142/);
});

test("never more than six — a wall of suggestions is not scaffolding", async () => {
  const { buildStarters } = await load();
  const s = buildStarters({
    route: "/x",
    pinName: "Save",
    console: [{ level: "error", text: "a" }],
    network: [
      { method: "POST", url: "/1", status: 500 },
      { method: "POST", url: "/2", status: 500 },
      { method: "POST", url: "/3", status: 500 },
    ],
    recent: [
      { number: 1, title: "one" }, { number: 2, title: "two" }, { number: 3, title: "three" },
    ],
  }, "bug");
  assert.ok(s.length <= 6, `got ${s.length}`);
});
