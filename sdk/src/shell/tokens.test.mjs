// Token layer contract tests.
//
// These assert on the BUILT stylesheet, not the source, because the failure
// this guards against is invisible in source: Tailwind v4 generates colour
// utilities from `@theme` `--color-*` entries, and declaring a bare `--card`
// on :root leaves `bg-card` undefined. An undefined utility does not error —
// it emits nothing, the surface renders transparent, and every window in the
// shell vanishes against the host page. It was written the wrong way first and
// only caught by measuring computed styles in a browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = process.env.FOS_CSS_DIR;
if (!dir) {
  test("skipped: set FOS_CSS_DIR to the built assets directory", () => {});
} else {
  const file = readdirSync(dir).find((f) => f.endsWith(".css"));
  const css = readFileSync(`${dir}/${file}`, "utf8");

  test("shadcn utilities resolve through our tokens, keeping the var() indirection", () => {
    for (const [util, token] of [
      ["bg-card", "--fos-surface"],
      ["bg-primary", "--fos-accent"],
      ["text-muted-foreground", "--fos-muted"],
      ["border-border", "--fos-border"],
    ]) {
      const re = new RegExp(`\\.${util}\\{[^}]*var\\(${token}\\)`);
      assert.match(css, re,
        `.${util} must resolve to var(${token}). A @theme block generates this; ` +
        `a bare :root custom property does not, and fails silently.`);
    }
  });

  test("both themes are present", () => {
    assert.match(css, /\.fos-dark/, "the dark primitives block is missing");
    // Quote-agnostic: minifiers drop the quotes from attribute selectors, so
    // /data-fos-theme="plex"/ passes in dev and fails in prod for no reason.
    assert.match(css, /data-fos-theme=["']?plex["']?\]/, "the plex preset is missing");
  });

  test("Arabic line-height override survives the build", () => {
    assert.match(css, /--fos-lh-body-ar:\s*1\.7/,
      "Arabic glyphs run taller than Latin; 1.55 clips dense body text");
  });
}
