// The dead-man's switch, tested for the failures it exists to survive.
//
// Every case here is a way the shell can stop answering while the host page is
// fully captured. If any of them stops releasing, a customer's site is left
// permanently and invisibly uninteractive — so these assertions matter more
// than anything else in the SDK.
//
// Run: node --test src/loader/watchdog.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

// Minimal DOM. jsdom would work but this needs controllable time and exactly
// five event targets; a fake is clearer about what is being simulated.
function harness() {
  const listeners = new Map();
  const target = {
    addEventListener(type, fn) {
      (listeners.get(type) ?? listeners.set(type, []).get(type)).push(fn);
    },
    removeEventListener(type, fn) {
      const a = listeners.get(type) ?? [];
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
  };
  // set() returns the Map, so the get-or-create above needs help.
  const orig = listeners.set.bind(listeners);
  listeners.set = (k, v) => (orig(k, v), listeners);
  target.addEventListener = (type, fn) => {
    if (!listeners.has(type)) orig(type, []);
    listeners.get(type).push(fn);
  };
  const fire = (type, ev = {}) => (listeners.get(type) ?? []).slice().forEach((f) => f(ev));

  let now = 0;
  const timers = [];
  global.window = {
    addEventListener: target.addEventListener,
    removeEventListener: target.removeEventListener,
    setInterval: (fn) => (timers.push(fn), timers.length),
    clearInterval: () => {},
  };
  global.document = {
    hidden: false,
    addEventListener: target.addEventListener,
    removeEventListener: target.removeEventListener,
  };
  const realNow = Date.now;
  Date.now = () => now;

  return {
    fire,
    advance(ms) {
      now += ms;
      timers.forEach((t) => t());
    },
    restore() {
      Date.now = realNow;
    },
  };
}

// watchdog.ts is TypeScript; esbuild (already a devDependency) transpiles it.
// Hand-rolling type-stripping was tried and is not worth the fragility.
let cached;
async function load() {
  if (cached) return cached;
  const { build } = await import("esbuild");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const res = await build({
    entryPoints: [fileURLToPath(new URL("./watchdog.ts", import.meta.url))],
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "error",
  });
  const dir = mkdtempSync(join(tmpdir(), "wd-"));
  const f = join(dir, "watchdog.mjs");
  writeFileSync(f, res.outputFiles[0].text);
  cached = await import(f);
  return cached;
}

test("a shell that stops answering releases capture", async () => {
  const h = harness();
  const { Watchdog } = await load();
  let released = null;
  const w = new Watchdog({
    onRelease: (r) => (released = r),
    onTeardown: () => {},
    onFallback: () => {},
  });
  w.start();
  w.captureAll();
  h.advance(400);
  assert.equal(released, null, "released while the shell was still beating");
  h.advance(1400); // > 1500ms silent
  assert.ok(released, "capture was NOT released after the shell went silent");
  h.restore();
});

test("pointerup on the host releases immediately, without waiting for the shell", async () => {
  const h = harness();
  const { Watchdog } = await load();
  let released = null;
  const w = new Watchdog({ onRelease: (r) => (released = r), onTeardown: () => {}, onFallback: () => {} });
  w.start();
  w.captureAll();
  h.fire("pointerup");
  assert.equal(released, "pointerup");
  h.restore();
});

test("Escape releases — the user's own escape hatch", async () => {
  const h = harness();
  const { Watchdog } = await load();
  let released = null;
  const w = new Watchdog({ onRelease: (r) => (released = r), onTeardown: () => {}, onFallback: () => {} });
  w.start();
  w.captureAll();
  h.fire("keydown", { key: "Escape" });
  assert.equal(released, "escape");
  h.restore();
});

test("a capture that outlives its cap is released even while the shell beats", async () => {
  const h = harness();
  const { Watchdog } = await load();
  let released = null;
  const w = new Watchdog({ onRelease: (r) => (released = r), onTeardown: () => {}, onFallback: () => {} });
  w.start();
  w.captureAll();
  // A shell that is alive but stuck in a drag is the same problem for the
  // customer as one that is dead.
  for (let i = 0; i < 8; i++) {
    w.beat();
    h.advance(250);
  }
  assert.ok(released, "a live-but-stuck shell held the page hostage");
  h.restore();
});

test("prolonged silence tears the frame down entirely", async () => {
  const h = harness();
  const { Watchdog } = await load();
  let torn = null;
  const w = new Watchdog({ onRelease: () => {}, onTeardown: (r) => (torn = r), onFallback: () => {} });
  w.start();
  h.advance(4500);
  assert.ok(torn, "the frame was never torn down after 4s of silence");
  h.restore();
});

test("three releases in one session abandons the windowed shell", async () => {
  const h = harness();
  const { Watchdog } = await load();
  let fell = null;
  const w = new Watchdog({ onRelease: () => {}, onTeardown: () => {}, onFallback: (r) => (fell = r) });
  w.start();
  for (let i = 0; i < 3; i++) {
    w.captureAll();
    h.fire("pointerup");
  }
  assert.ok(fell, "the shell kept its third chance instead of falling back to the panel");
  h.restore();
});

test("a hidden tab releases", async () => {
  const h = harness();
  const { Watchdog } = await load();
  let released = null;
  const w = new Watchdog({ onRelease: (r) => (released = r), onTeardown: () => {}, onFallback: () => {} });
  w.start();
  w.captureAll();
  global.document.hidden = true;
  h.fire("visibilitychange");
  assert.equal(released, "tab hidden");
  h.restore();
});
