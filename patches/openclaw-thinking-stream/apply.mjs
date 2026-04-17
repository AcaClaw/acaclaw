#!/usr/bin/env node
/**
 * Patch: Enable real-time thinking (reasoning) streaming over WebSocket.
 *
 * OpenClaw's webchat `chat.send` handler does NOT provide an `onReasoningStream`
 * callback, so thinking tokens are never broadcast to connected clients.
 * Telegram, Discord, and Feishu handlers DO set this up — the webchat handler
 * simply omits it.
 *
 * This patch adds an `onReasoningStream` callback that broadcasts accumulated
 * thinking content as `{ type: "thinking" }` chat delta events.
 *
 * Prerequisites:
 *   - Set `reasoningDefault: "stream"` on each agent in agents.list[]
 *     (or per-session via `/reasoning stream`).
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Resolve OpenClaw dist directory
const DIST =
  process.env.OPENCLAW_DIST ??
  resolve(
    process.env.HOME,
    ".local/share/fnm/node-versions/v24.3.0/installation/lib/node_modules/openclaw/dist"
  );

const TARGET = "gateway-cli-CWpalJNJ.js";
const filePath = resolve(DIST, TARGET);

if (!existsSync(filePath)) {
  console.error(`[patch] file not found: ${filePath}`);
  process.exit(1);
}

const MARKER = "/* acaclaw-thinking-stream-patch */";

let src = readFileSync(filePath, "utf-8");

if (src.includes(MARKER)) {
  console.log("[patch] already applied — skipping");
  process.exit(0);
}

// ─── Patch: add onReasoningStream to webchat replyOptions ───────────────
//
// Target (original):
//     onModelSelected
//                                 }
//                         }).then(async () => {
//
// Replace with:
//     onModelSelected,
//     onReasoningStream: <IIFE that accumulates and broadcasts thinking>
//                                 }
//                         }).then(async () => {

// File uses tabs for indentation
// Target: 5 tabs before onModelSelected, 4 tabs before }, 3 tabs before }).then
const SEARCH = "\t\t\t\t\tonModelSelected\n\t\t\t\t}\n\t\t\t}).then(async () => {";

if (!src.includes(SEARCH)) {
  console.error("[patch] target string not found — gateway file may have changed");
  process.exit(1);
}

const REPLACE = [
  "\t\t\t\t\tonModelSelected,",
  `\t\t\t\t\t${MARKER}`,
  "\t\t\t\t\tonReasoningStream: (() => {",
  '\t\t\t\t\t\tlet _buf = "";',
  "\t\t\t\t\t\tlet _ts = 0;",
  "\t\t\t\t\t\treturn (payload) => {",
  '\t\t\t\t\t\t\t_buf = payload.text ?? "";',
  "\t\t\t\t\t\t\tconst now = Date.now();",
  "\t\t\t\t\t\t\tif (now - _ts < 100) return;",
  "\t\t\t\t\t\t\t_ts = now;",
  '\t\t\t\t\t\t\tcontext.broadcast("chat", {',
  "\t\t\t\t\t\t\t\trunId: clientRunId,",
  "\t\t\t\t\t\t\t\tsessionKey,",
  "\t\t\t\t\t\t\t\tseq: 0,",
  '\t\t\t\t\t\t\t\tstate: "delta",',
  "\t\t\t\t\t\t\t\tmessage: {",
  '\t\t\t\t\t\t\t\t\trole: "assistant",',
  '\t\t\t\t\t\t\t\t\tcontent: [{ type: "thinking", text: _buf }],',
  "\t\t\t\t\t\t\t\t\ttimestamp: now",
  "\t\t\t\t\t\t\t\t}",
  "\t\t\t\t\t\t\t}, { dropIfSlow: true });",
  "\t\t\t\t\t\t};",
  "\t\t\t\t\t})()",
  "\t\t\t\t}",
  "\t\t\t}).then(async () => {",
].join("\n");

// Back up original
const backupPath = filePath + ".orig";
if (!existsSync(backupPath)) {
  copyFileSync(filePath, backupPath);
  console.log(`[patch] backed up → ${backupPath}`);
}

src = src.replace(SEARCH, REPLACE);
writeFileSync(filePath, src, "utf-8");
console.log(`[patch] applied thinking-stream patch to ${TARGET}`);
