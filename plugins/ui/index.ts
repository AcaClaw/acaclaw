import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-ui";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

// Resolve once at load time — UI dist lives in ../../ui/dist relative to this file
const UI_DIST = join(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..", "..", "ui", "dist");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

// Gateway paths that must not be intercepted by the SPA
const RESERVED_PREFIXES = ["/health", "/ready", "/api/", "/plugins/", "/admin"];

const uiPlugin = {
  id: "acaclaw-ui",
  name: "AcaClaw UI",
  description: "Serves the AcaClaw research assistant web UI at /",
  configSchema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {},
  },

  register(api: OpenClawPluginApi) {
    api.registerHttpRoute({
      path: "/",
      match: "prefix",
      auth: "gateway",
      handler: async (req, res, next) => {
        // Pass through reserved gateway paths
        if (RESERVED_PREFIXES.some((p) => req.url!.startsWith(p))) {
          return next();
        }

        // Strip query string for file resolution
        const urlPath = req.url!.split("?")[0];
        const safePath = urlPath.replaceAll("..", "");

        // Try to serve the exact file first
        const filePath = join(UI_DIST, safePath === "/" ? "index.html" : safePath);

        try {
          const fileStat = await stat(filePath);
          if (fileStat.isFile()) {
            const ext = extname(filePath);
            const content = await readFile(filePath);
            res.writeHead(200, {
              "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
              "Content-Length": content.byteLength,
              "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
            });
            res.end(content);
            return;
          }
        } catch {
          // File not found — fall through to SPA fallback
        }

        // SPA fallback: serve index.html for client-side routing
        try {
          const indexPath = join(UI_DIST, "index.html");
          const content = await readFile(indexPath);
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          });
          res.end(content);
        } catch {
          // UI not built yet
          res.writeHead(503, { "Content-Type": "text/plain" });
          res.end("AcaClaw UI not built. Run: cd ui && npm run build");
        }
      },
    });
  },
};

export default uiPlugin;
