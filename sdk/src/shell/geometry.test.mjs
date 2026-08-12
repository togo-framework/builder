// Window geometry persistence.
//
// The interesting cases are all about REFUSING a stored rect. A window restored
// somewhere unreachable is worse than one in the default position — you cannot
// grab a title bar that is off-screen, so the app looks broken rather than
// merely misplaced.
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
    entryPoints: [fileURLToPath(new URL("./geometry.ts", import.meta.url))],
    bundle: true, format: "esm", write: false, logLevel: "error",
  });
  const dir = mkdtempSync(join(tmpdir(), "geo-"));
  const f = join(dir, "geometry.mjs");
  writeFileSync(f, res.outputFiles[0].text);
  cached = await import(f);
  return cached;
}

function stubEnv(w = 1440, h = 900) {
  const store = new Map();
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  global.window = { innerWidth: w, innerHeight: h, setTimeout: (fn, ms) => setTimeout(fn, ms) };
  return store;
}

test("a rect round-trips within the same viewport bucket", async () => {
  stubEnv();
  const g = await load();
  g.saveRect("demo", { x: 100, y: 80, w: 500, h: 400 });
  assert.deepEqual(g.loadRect("demo"), { x: 100, y: 80, w: 500, h: 400 });
});

test("geometry does not leak across viewport buckets", async () => {
  stubEnv(1440, 900);
  const g = await load();
  g.saveRect("demo", { x: 900, y: 400, w: 500, h: 400 });
  // Same session, much smaller screen — a laptop after an external monitor.
  global.window.innerWidth = 500;
  global.window.innerHeight = 800;
  assert.equal(g.loadRect("demo"), null,
    "a desktop layout was restored onto a phone-sized viewport");
});

test("an off-screen rect is refused rather than restored", async () => {
  stubEnv(1440, 900);
  const g = await load();
  for (const [name, rect] of [
    ["past the right edge", { x: 1400, y: 100, w: 500, h: 400 }],
    ["below the bottom",    { x: 100, y: 890, w: 500, h: 400 }],
    ["off the left",        { x: -600, y: 100, w: 500, h: 400 }],
    ["above the top",       { x: 100, y: -50, w: 500, h: 400 }],
  ]) {
    g.saveRect("x", rect);
    assert.equal(g.loadRect("x"), null, `restored a window that was ${name}`);
  }
});

test("a rect only partly off-screen is kept — the title bar is still grabbable", async () => {
  stubEnv(1440, 900);
  const g = await load();
  g.saveRect("demo", { x: 1200, y: 60, w: 500, h: 400 });
  assert.ok(g.loadRect("demo"), "refused a window whose title bar was reachable");
});

test("corrupt storage does not throw on somebody's page", async () => {
  const store = stubEnv();
  const g = await load();
  store.set("fos:geometry:v1", "{not json");
  assert.equal(g.loadRect("demo"), null);
  g.saveRect("demo", { x: 1, y: 2, w: 3, h: 4 }); // must not throw
});

test("writes are coalesced during a drag", async () => {
  stubEnv();
  const g = await load();
  const save = g.debouncedSaveRect(20);
  for (let i = 0; i < 50; i++) save("demo", { x: i, y: i, w: 400, h: 300 });
  assert.equal(g.loadRect("demo"), null, "wrote before the debounce elapsed");
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(g.loadRect("demo"), { x: 49, y: 49, w: 400, h: 300 },
    "the last position of the drag is what should persist");
});
