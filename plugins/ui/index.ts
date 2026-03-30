import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-ui";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { homedir } from "node:os";

// Resolve the UI dist directory.
// In deployment, install.sh copies the built UI to <OPENCLAW_HOME>/ui/ (flat).
// In dev, the build output lives at ../../ui/dist relative to this plugin.
function resolveUiDist(): string {
  const home = process.env.OPENCLAW_HOME ?? join(homedir(), ".openclaw");
  const deployed = join(home, "ui");
  // Deployed dir has index.html directly (not nested in dist/)
  if (existsSync(join(deployed, "index.html"))) return deployed;
  // Dev fallback: relative to this plugin source
  return join(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..", "..", "ui", "dist");
}
const UI_DIST = resolveUiDist();

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

// OpenClaw's prefixMatchPath for path "/" only matches exact "/" (not "/foo"),
// so we register explicit prefix routes for static asset dirs and SPA pages.
// Static asset directories under UI_DIST
const ASSET_PREFIXES = ["/assets", "/fonts", "/logo"];
// SPA fallback paths — any path the app-e2e tests or bookmarks may hit directly
const SPA_ROUTES = [
  "/chat", "/api-keys", "/settings", "/agents", "/sessions", "/workspace",
  "/monitor", "/debug", "/logs", "/staff", "/skills", "/onboarding",
  "/backup", "/environment", "/usage", "/command-palette",
];

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
    const resolveToken = (): string => {
      const token = (api.config as Record<string, unknown> & { gateway?: { auth?: { token?: string } } })
        ?.gateway?.auth?.token;
      return token ?? "";
    };

    const injectToken = (html: Buffer | string): Buffer => {
      const token = resolveToken();
      if (!token) return Buffer.isBuffer(html) ? html : Buffer.from(html);
      let str = Buffer.isBuffer(html) ? html.toString("utf-8") : html;
      if (/<meta\s+name="oc-token"[^>]*>/i.test(str)) {
        str = str.replace(/<meta\s+name="oc-token"[^>]*>/i, `<meta name="oc-token" content="${token}">`);
      } else {
        str = str.replace("</head>", `<meta name="oc-token" content="${token}">\n</head>`);
      }
      return Buffer.from(str);
    };

    const handler = async (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
      const urlPath = (req.url ?? "/").split("?")[0];
      const safePath = urlPath.replaceAll("..", "");

      // Try to serve the exact file first
      const filePath = join(UI_DIST, safePath === "/" ? "index.html" : safePath);
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          const ext = extname(filePath);
          let content = await readFile(filePath);
          if (ext === ".html") content = injectToken(content);
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
        const content = injectToken(await readFile(indexPath));
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        res.end(content);
      } catch {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("AcaClaw UI not built. Run: cd ui && npm run build");
      }
    };

    // Root route (exact match)
    api.registerHttpRoute({ path: "/", match: "exact", auth: "plugin", handler });

    // Static asset directories (prefix match)
    for (const prefix of ASSET_PREFIXES) {
      api.registerHttpRoute({ path: prefix, match: "prefix", auth: "plugin", handler });
    }

    // SPA fallback routes (prefix match) — serves index.html for client-side routing
    for (const route of SPA_ROUTES) {
      api.registerHttpRoute({ path: route, match: "prefix", auth: "plugin", handler });
    }
  },
};

export default uiPlugin;
