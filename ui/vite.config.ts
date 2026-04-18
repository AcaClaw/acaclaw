import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { readFileSync } from "fs";

/** Stamp sw.js with a build timestamp so the browser detects SW updates. */
function swVersionStamp(): Plugin {
  return {
    name: "sw-version-stamp",
    apply: "build",
    generateBundle() {
      const swPath = resolve(__dirname, "src/sw.template.js");
      const content = readFileSync(swPath, "utf-8");
      const stamped = content.replaceAll(
        "__BUILD_TIMESTAMP__",
        Date.now().toString(36)
      );
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: stamped,
      });
    },
  };
}

export default defineConfig({
  root: "src",
  plugins: [swVersionStamp()],
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
