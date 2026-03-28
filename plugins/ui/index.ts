import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-ui";
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { homedir } from "node:os";

// Resolve the UI dist directory.
// In deployment, install.sh copies the built UI to <OPENCLAW_HOME>/ui/ (flat).
// In dev, the build output lives at ../../ui/dist relative to this plugin.
function resolveUiDist(): string {
  const home = process.env.OPENCLAW_HOME ?? join(homedir(), ".openclaw-acaclaw");
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
    const resolveToken = (): string => {
      // Read the gateway auth token from the resolved OpenClaw config
      const token = (api.config as Record<string, unknown> & { gateway?: { auth?: { token?: string } } })
        ?.gateway?.auth?.token;
      if (token) return token;

      // Fallback: check config file at profile home
      try {
        const home = process.env.OPENCLAW_HOME ?? join(homedir(), ".openclaw-acaclaw");
        const configPath = join(home, "openclaw.json");
        const raw = JSON.parse(readFileSync(configPath, "utf-8"));
        return raw?.gateway?.auth?.token ?? "";
      } catch { return ""; }
    };

    const injectToken = (html: Buffer | string): Buffer => {
      const token = resolveToken();
      if (!token) return Buffer.isBuffer(html) ? html : Buffer.from(html);
      let str = Buffer.isBuffer(html) ? html.toString("utf-8") : html;
      // Replace existing oc-token meta tag if present, otherwise append before </head>
      if (/<meta\s+name="oc-token"[^>]*>/i.test(str)) {
        str = str.replace(/<meta\s+name="oc-token"[^>]*>/i, `<meta name="oc-token" content="${token}">`);
      } else {
        str = str.replace("</head>", `<meta name="oc-token" content="${token}">\n</head>`);
      }
      return Buffer.from(str);
    };

    api.registerHttpRoute({
      path: "/",
      match: "prefix",
      auth: "plugin",
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
            let content = await readFile(filePath);
            // Inject auth token into HTML pages so the UI can authenticate
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
          // UI not built yet
          res.writeHead(503, { "Content-Type": "text/plain" });
          res.end("AcaClaw UI not built. Run: cd ui && npm run build");
        }
      },
    });
  },
};

export default uiPlugin;
