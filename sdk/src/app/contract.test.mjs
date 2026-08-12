// The app contract's runtime guard.
//
// isFeedbackOSApp decides whether a third-party module gets mounted. It is the
// only thing standing between "somebody published a broken app" and the shell
// throwing inside a window — so it has to be exact about what it accepts.
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
    entryPoints: [fileURLToPath(new URL("./contract.ts", import.meta.url))],
    bundle: true, format: "esm", write: false, logLevel: "error",
  });
  const dir = mkdtempSync(join(tmpdir(), "fos-"));
  const f = join(dir, "contract.mjs");
  writeFileSync(f, res.outputFiles[0].text);
  cached = await import(f);
  return cached;
}

test("accepts the minimum viable app", async () => {
  const { isFeedbackOSApp } = await load();
  assert.equal(isFeedbackOSApp({ mount() {} }), true);
});

test("rejects everything that is not one", async () => {
  const { isFeedbackOSApp } = await load();
  for (const bad of [
    null, undefined, 0, "", "mount", [], {},
    { mount: null },
    { mount: "not a function" },
    { Mount: () => {} },            // wrong case
    { render: () => {} },           // a React-shaped module
    Object.create(null),
  ]) {
    assert.equal(isFeedbackOSApp(bad), false, `accepted ${JSON.stringify(bad)}`);
  }
});

test("a class instance with a mount method is fine", async () => {
  const { isFeedbackOSApp } = await load();
  class App { mount() {} }
  assert.equal(isFeedbackOSApp(new App()), true);
});
