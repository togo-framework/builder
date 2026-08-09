import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const port = Number(process.env.PORT) || 3000;
// Proxy the API to the Go backend so the SPA is same-origin in dev — this is what
// makes auth cookies (login/session) work. Override the target with VITE_API_PROXY.
const apiTarget = process.env.VITE_API_PROXY || "http://localhost:8080";
const proxy = {
  // ws:true is required, not optional. The terminal attaches over a WebSocket
  // under /api/builder/term/attach, and without this the dev server answers the
  // upgrade with its own 200 and the socket never reaches Go — the terminal
  // mounts, shows nothing, and there is no request in the API log to explain it.
  "/api": { target: apiTarget, changeOrigin: true, ws: true },
  "/events": { target: apiTarget, changeOrigin: true },
  "/graphql": { target: apiTarget, changeOrigin: true },
  "/docs": { target: apiTarget, changeOrigin: true },
  "/sdk": { target: apiTarget, changeOrigin: true },
  // The plugin's embedded static assets — today the terminal's icon font.
  // Without this the font 404s against the Vite dev server and the terminal
  // silently falls back to whatever Nerd Font the machine happens to have,
  // which is exactly the dependency embedding it was meant to remove.
  "/builder-assets": { target: apiTarget, changeOrigin: true },
  // Huma serves the OpenAPI document + $ref schemas at these paths; the Scalar docs
  // UI fetches /openapi.yaml — without proxying it the dev server returns index.html
  // and the docs page shows "Failed to parse OpenAPI file".
  "/openapi": { target: apiTarget, changeOrigin: true },
  "/schemas": { target: apiTarget, changeOrigin: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port, proxy },
  preview: { port, proxy },
});
