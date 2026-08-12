// Builds the FeedbackOS shell document.
//
// This is a SECOND pipeline, deliberately alongside the existing one rather
// than replacing it. `build.mjs` still produces dist/builder-sdk.js — the
// framework-free IIFE that every current embed loads — and it is untouched.
// Nothing here changes what an existing site gets.
//
// The shell is a different artifact with different constraints: it is a whole
// HTML document served at /sdk/shell.html, loaded into an iframe on first
// open, and it carries React, the vendored desktop components and the token
// stylesheet. It does not exist in the host page's realm and never runs there.
//
// BUDGETS are enforced here rather than aspirational, because a bundle that is
// merely "watched" grows. Measured, gzipped, failing the build:
//
//   loader  <=  45 KB gz   what the host page pays before anything opens
//   shell   <= 300 KB gz   the iframe document, paid only on first open
//
// The loader ceiling is the important one. It is on somebody's marketing page.

import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
mkdirSync(dist, { recursive: true });

const BUDGET = { shell: 300 * 1024, loader: 45 * 1024 };
const watch = process.argv.includes("--watch");

/** Size a built artifact the way a browser will actually receive it. */
function measure(label, file, ceiling) {
  const raw = readFileSync(file);
  const gz = gzipSync(raw).length;
  const pct = Math.round((gz / ceiling) * 100);
  const line = `${label.padEnd(8)} ${String(raw.length).padStart(8)} B raw  ${String(gz).padStart(7)} B gz  ${String(pct).padStart(3)}% of budget`;
  if (gz > ceiling) {
    console.error(`${line}   OVER`);
    return { over: true, gz };
  }
  console.log(line);
  return { over: false, gz };
}

// The shell document. Written here rather than kept as a file because it is
// three tags and a mount point, and every one of them is load-bearing:
//
//   - `dir` and `lang` are set by the boot script from the mount options, not
//     hardcoded. This is a real top-level document now, so unlike the old
//     shadow root there is no :host([dir=rtl]) to inherit from — getting this
//     wrong is a new failure surface the architecture introduced.
//   - the background is transparent. The host site shows through everywhere
//     the shell does not paint, which is the entire premise of the overlay.
//   - no external anything: strict CSP, and the whole point is self-containment.
const html = ({ css, js }) => `<!doctype html>
<html lang="en" dir="ltr" class="fos-root">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>FeedbackOS</title>
<style>${css}</style>
</head>
<body>
<div id="fos"></div>
<script type="module">${js}</script>
</body>
</html>
`;

async function run() {
  // ── shell bundle ──────────────────────────────────────────────────────
  const shell = await build({
    entryPoints: [join(here, "src/shell/boot.tsx")],
    bundle: true,
    format: "esm",
    target: ["es2022"],
    jsx: "automatic",
    minify: true,
    write: false,
    outfile: "shell.js",
    logLevel: "warning",
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "text" },
  });

  const jsOut = shell.outputFiles.find((f) => f.path.endsWith(".js"));
  const cssOut = shell.outputFiles.find((f) => f.path.endsWith(".css"));
  if (!jsOut) {
    console.error("esbuild produced no .js output. Files:", shell.outputFiles.map((f) => f.path));
    process.exit(1);
  }

  // ── Tailwind ─────────────────────────────────────────────────────────
  // Compiled through Vite's plugin rather than the CLI or the compile() API.
  // Both of those run without error here and emit ZERO utilities — the source
  // scanning simply does not fire, whether @source is relative, absolute, a
  // glob, or a single named file, and whether the target is vendor/ or src/.
  // The Vite plugin resolves the same inputs correctly, and was already proven
  // twice (the spike that closed Risk 2, and the token-layer verification).
  //
  // This step is a HARD error if it produces no utilities. Spike #12 recorded
  // why: the failure is silent otherwise — correct markup, classes that resolve
  // to nothing, and every window rendering as unstyled text over a customer's
  // page.
  const { build: viteBuild } = await import("vite");
  const tailwind = (await import("@tailwindcss/vite")).default;

  // An HTML entry, not the CSS directly. Given a bare CSS input Vite treats it
  // as an asset and the Tailwind plugin never runs its scan; given an HTML
  // document that LINKS the sheet it processes it exactly as in a real app,
  // which is the path the Risk-2 spike proved works.
  // The stub lives at the package root, and Vite's root is the package —
  // NOT src/shell. @source globs reach ../../vendor, which is outside a
  // src/shell root, and Vite will not scan outside its root. That was the
  // whole reason this produced zero utilities: the globs were correct and
  // simply pointed somewhere the scanner was not allowed to look.
  const stub = join(here, ".tw-entry.html");
  writeFileSync(stub, '<!doctype html><link rel="stylesheet" href="./src/shell/shell.css">');
  let tw = "";
  try {
    const cssRes = await viteBuild({
      root: here,
      logLevel: "error",
      plugins: [tailwind()],
      build: { write: false, rollupOptions: { input: stub }, minify: true, emptyOutDir: false },
    });
    const chunks = Array.isArray(cssRes) ? cssRes[0].output : cssRes.output;
    // String(): an emitted asset's `source` is `string | Uint8Array`, and a
    // regex test against a Uint8Array silently coerces it to "47,42,33,..."
    // and never matches — which reads exactly like "Tailwind produced no
    // utilities" when in fact it produced all of them.
    tw = String(chunks.find((c) => c.fileName.endsWith(".css"))?.source ?? "");
  } finally {
    try { unlinkSync(stub); } catch {}
  }

  // Not `\.bg-card\{` — a minifier groups selectors, so the class is very often
  // followed by a comma rather than a brace. Asserting on the brace fails on a
  // build that is completely correct.
  if (!/\.bg-card\b/.test(tw) || tw.length < 10000) {
    console.error("Tailwind produced no utilities for the vendored components.");
    console.error("Check the @source globs in src/shell/shell.css.");
    process.exit(1);
  }

  const jsFile = join(dist, "shell.js");
  writeFileSync(jsFile, jsOut.text);

  // The stylesheet is INLINED into the document rather than linked. One
  // request, no flash of unstyled window, and no second URL for a strict host
  // CSP to have an opinion about.
  const css = tw + (cssOut ? cssOut.text : "");
  writeFileSync(join(dist, "shell.html"), html({ css, js: jsOut.text }));

  // ── budget gate ───────────────────────────────────────────────────────
  console.log("");
  const s = measure("shell", join(dist, "shell.html"), BUDGET.shell);
  let over = s.over;

  const loaderFile = join(dist, "builder-sdk.js");
  try {
    statSync(loaderFile);
    const l = measure("loader", loaderFile, BUDGET.loader);
    over = over || l.over;
  } catch {
    console.log("loader   (not built in this pass — run build.mjs)");
  }

  // A grep, not a bundler config, because the failure it guards against is
  // reintroduction by someone who does not know why it matters. lucide-react
  // is 132,299 B gz and cannot be tree-shaken: DynamicIcon resolves glyphs
  // from a runtime string, so the compiler must keep all of them.
  if (readFileSync(jsFile, "utf8").includes("lucide-react")) {
    console.error("\nlucide-react is in the shell bundle. It is 132 KB gz and cannot be");
    console.error("tree-shaken — see sdk/vendor/ui-desktop-embed/icons.tsx.");
    over = true;
  }

  if (over && !watch) {
    console.error("\nbundle budget exceeded — failing the build.");
    process.exit(1);
  }
}

await run();
if (watch) console.log("\nwatching is not wired yet; re-run to rebuild.");
