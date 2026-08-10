import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Everything the dashboard is mounts under /builder.
//
// This is the whole reason the bundle can be dropped into somebody else's
// application. The screens used to live at /issues, /agents, /chat — top-level
// paths that any host product may already own, and that a host's own router
// would answer first. /builder is one prefix, claimed once, and nothing else in
// a normal application wants it.
//
// Setting it here rather than in the router is what makes the ASSET urls agree:
// vite stamps /builder/assets/… into index.html, and import.meta.env.BASE_URL
// becomes "/builder/" — which the router reads as its basepath, so the two can
// never drift.
const base = "/builder/";

// The shared source, by its real path. web/src is a symlink into the blueprint
// (see prepare.mjs); pointing the dev server's fs allowance and the build at the
// real directory is what lets Vite read it without complaining that the file is
// outside the project root.
const shared = fileURLToPath(new URL("../blueprint/_project/web/src", import.meta.url));
const here = fileURLToPath(new URL(".", import.meta.url));

const port = Number(process.env.PORT) || 3200;
// Developing the dashboard against a running builderd. Not used by the build.
const apiTarget = process.env.VITE_API_PROXY || "http://localhost:8099";
const proxy = {
  // ws:true is required: the terminal attaches over a WebSocket under
  // /api/builder/term/attach.
  "/api": { target: apiTarget, changeOrigin: true, ws: true },
  "/events": { target: apiTarget, changeOrigin: true },
  "/graphql": { target: apiTarget, changeOrigin: true },
  "/sdk": { target: apiTarget, changeOrigin: true },
  "/builder-assets": { target: apiTarget, changeOrigin: true },
};

// The font faces are declared with ABSOLUTE urls — url(/fonts/lusail/…) — in
// app.css and, more awkwardly, inside @togo-framework/ui's shipped stylesheet,
// which is a node_module this repo cannot edit. Vite leaves such strings alone:
// they are public-directory references, not module imports, so nothing rebases
// them and the browser asked the HOST for /fonts/…, got its 404, and every
// screen fell back to the system stack.
//
// Rewriting them here, after the CSS is generated, is the smallest fix that
// covers both sources. `base` is the single input, so this cannot drift from
// where the app is actually mounted; on a root build (base "/") it is a no-op.
function rebaseAbsoluteFontURLs(base: string): Plugin {
  return {
    name: "builder:rebase-font-urls",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      if (base === "/") return;
      for (const file of Object.values(bundle)) {
        if (file.type !== "asset" || !file.fileName.endsWith(".css")) continue;
        const css = typeof file.source === "string" ? file.source : Buffer.from(file.source).toString("utf8");
        file.source = css.replace(/url\((['"]?)\/fonts\//g, `url($1${base}fonts/`);
      }
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), rebaseAbsoluteFontURLs(base)],
  server: { port, proxy, fs: { allow: [shared, here] } },
  preview: { port, proxy },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The bundle is embedded in the Go binary and served from it. Source maps
    // would double its size for a build nobody debugs from the daemon.
    sourcemap: false,
  },
});
