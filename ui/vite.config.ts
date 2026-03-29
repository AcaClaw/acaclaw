import { defineConfig, Plugin } from "vite";
import { resolve } from "path";
import { readFileSync } from "fs";
import { homedir } from "os";

/** Vite plugin: inject the gateway auth token into oc-token meta tag during dev. */
function injectGatewayToken(): Plugin {
  return {
    name: "inject-gateway-token",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        next();
      });
    },
    transformIndexHtml(html) {
      try {
        const candidates = [
          resolve(homedir(), ".openclaw", "openclaw.json"),
        ];
        let token: string | undefined;
        for (const p of candidates) {
          try {
            const cfg = JSON.parse(readFileSync(p, "utf-8"));
            token = cfg?.gateway?.auth?.token;
            if (token) break;
          } catch { /* try next */ }
        }
        if (token) {
          return html.replace(
            /<meta name="oc-token" content="[^"]*"/,
            `<meta name="oc-token" content="${token}"`,
          );
        }
      } catch { /* config not found — leave empty */ }
      return html;
    },
  };
}

export default defineConfig({
  root: "src",
  plugins: [injectGatewayToken()],
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:2090",
      "/health": "http://localhost:2090",
      "/ready": "http://localhost:2090",
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": "http://localhost:2090",
      "/health": "http://localhost:2090",
      "/ready": "http://localhost:2090",
    },
  },
});
