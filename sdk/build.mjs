// Bundles the SDK as a single self-contained IIFE.
//
// IIFE, not ESM: the SDK has to drop into any page with one <script> tag,
// including pages with no build step at all. globalName is the whole public API.
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const opts = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "BuilderIssues",
  outfile: "dist/builder-sdk.js",
  target: ["es2020"],
  minify: !watch,
  sourcemap: watch,
  legalComments: "none",
};

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log("watching…");
} else {
  const r = await esbuild.build({ ...opts, metafile: true });
  const out = r.metafile.outputs["dist/builder-sdk.js"];
  console.log(`dist/builder-sdk.js  ${(out.bytes / 1024).toFixed(1)} kB`);
}
