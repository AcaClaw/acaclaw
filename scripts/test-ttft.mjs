#!/usr/bin/env node
/**
 * TTFT comparison: Direct API vs Gateway (thinking mode)
 *
 * Both paths use the same model, same prompt, same streaming config.
 * The only difference is whether the request goes through OpenClaw gateway.
 *
 * Measures:
 *   - Time to first thinking token (TTFT-thinking)
 *   - Time to first text token (TTFT-text)
 *   - Total response time
 *   - Gateway overhead = Gateway TTFT - Direct TTFT
 *
 * Usage:
 *   node scripts/test-ttft.mjs            # full comparison (5 runs each)
 *   node scripts/test-ttft.mjs --runs=3   # custom iteration count
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

// ── Config ─────────────────────────────────────────────────────────────────────

const CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");
const GATEWAY_WS = "ws://localhost:2090/";
const PROMPT = "25+36=? just answer";
const DEFAULT_RUNS = 5;
const TIMEOUT_MS = 60_000;

const runs = (() => {
  const arg = process.argv.find((a) => a.startsWith("--runs="));
  return arg ? parseInt(arg.split("=")[1], 10) || DEFAULT_RUNS : DEFAULT_RUNS;
})();

// ── Read config ────────────────────────────────────────────────────────────────

let apiKey, baseUrl, model;
try {
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  apiKey = cfg.env?.MODELSTUDIO_API_KEY;
  baseUrl =
    cfg.models?.providers?.modelstudio?.baseUrl ??
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
  model =
    (cfg.agents?.defaults?.model ?? "modelstudio/qwen3.5-plus").replace(
      "modelstudio/",
      ""
    );
} catch (e) {
  console.error("Cannot read config:", e.message);
  process.exit(1);
}
if (!apiKey) {
  console.error("No MODELSTUDIO_API_KEY in config");
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(ms) {
  if (ms == null) return "\u2014";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stats(arr) {
  if (!arr.length) return { min: null, med: null, max: null };
  const s = [...arr].sort((a, b) => a - b);
  return { min: s[0], med: median(s), max: s[s.length - 1] };
}

// ── 1. Direct API (thinking enabled) ──────────────────────────────────────────

async function directApi() {
  const t0 = performance.now();
  let ttftThinking = null;
  let ttftText = null;
  let answer = "";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: PROMPT }],
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 50,
      enable_thinking: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split("\n");
    buf = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") break;

      try {
        const chunk = JSON.parse(raw);
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.reasoning_content && ttftThinking === null) {
          ttftThinking = performance.now() - t0;
        }
        if (delta?.content && ttftText === null) {
          ttftText = performance.now() - t0;
        }
        if (delta?.content) answer += delta.content;
      } catch {
        /* skip */
      }
    }
  }

  const total = performance.now() - t0;
  return { ttftThinking, ttftText, total, answer: answer.trim() };
}

// ── 2. Gateway (thinking streamed via patch) ─────────────────────────────────

async function gateway() {
  const { default: WebSocket } = await import("ws");

  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    let ttftThinking = null;
    let ttftText = null;
    let answer = "";
    let targetRunId = null;
    let connected = false;

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("timeout"));
    }, TIMEOUT_MS);

    const ws = new WebSocket(GATEWAY_WS, {
      headers: { Origin: "http://localhost:2090" },
    });

    ws.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      // Challenge -> connect
      if (msg.type === "event" && msg.event === "connect.challenge") {
        ws.send(
          JSON.stringify({
            type: "req",
            id: "c",
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: "openclaw-control-ui",
                version: "ttft-test",
                platform: "test",
                mode: "ui",
              },
              role: "operator",
              scopes: [
                "operator.admin",
                "operator.read",
                "operator.write",
                "operator.approvals",
                "operator.pairing",
              ],
            },
          })
        );
        return;
      }

      // Connect response -> send chat
      if (msg.type === "res" && msg.id === "c") {
        if (!msg.ok) {
          clearTimeout(timer);
          ws.close();
          reject(new Error(`connect: ${msg.error?.message}`));
          return;
        }
        connected = true;
        ws.send(
          JSON.stringify({
            type: "req",
            id: "s",
            method: "chat.send",
            params: {
              sessionKey: `agent:main:web:ttft-${Date.now()}`,
              message: PROMPT,
              idempotencyKey: randomUUID(),
            },
          })
        );
        return;
      }

      // chat.send ack
      if (msg.type === "res" && msg.id === "s") {
        if (!msg.ok) {
          clearTimeout(timer);
          ws.close();
          reject(new Error(`chat.send: ${msg.error?.message}`));
          return;
        }
        targetRunId = msg.payload?.runId;
        return;
      }

      // Chat events
      if (msg.type === "event" && msg.event === "chat") {
        const p = msg.payload;
        if (targetRunId && p.runId !== targetRunId) return;

        if (p.state === "delta" && p.message?.content) {
          for (const c of p.message.content) {
            if (c.type === "thinking" && ttftThinking === null) {
              ttftThinking = performance.now() - t0;
            }
            if (c.type === "text") {
              if (ttftText === null) ttftText = performance.now() - t0;
              answer = c.text ?? "";
            }
          }
        }

        if (p.state === "final") {
          // Use final answer if we missed deltas; don't double-accumulate
          if (!answer && p.message?.content) {
            for (const c of p.message.content) {
              if (c.type === "text") answer += c.text ?? "";
            }
          }
          clearTimeout(timer);
          ws.close();
          resolve({
            ttftThinking,
            ttftText,
            total: performance.now() - t0,
            answer: answer.trim(),
          });
        }

        if (p.state === "error") {
          clearTimeout(timer);
          ws.close();
          reject(new Error(p.errorMessage ?? "chat error"));
        }
      }
    });
  });
}

// ── Run comparison ─────────────────────────────────────────────────────────────

async function main() {
  console.log(
    "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"
  );
  console.log(
    "\u2551  TTFT Comparison: Direct API vs Gateway (thinking mode)        \u2551"
  );
  console.log(
    "\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d"
  );
  console.log(`  Model:    ${model}`);
  console.log(`  Prompt:   "${PROMPT}"`);
  console.log(`  Runs:     ${runs} per path`);
  console.log(`  Thinking: enabled (both paths)\n`);

  // ── Direct API ───────────────────────────────────────────────────────────
  console.log(
    "\u2500\u2500\u2500 Direct API \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"
  );
  const directResults = [];
  for (let i = 0; i < runs; i++) {
    try {
      const r = await directApi();
      directResults.push(r);
      console.log(
        `  #${i + 1}  thinking: ${fmt(r.ttftThinking).padStart(7)}  text: ${fmt(r.ttftText).padStart(7)}  total: ${fmt(r.total).padStart(7)}  answer: ${r.answer}`
      );
    } catch (e) {
      console.log(`  #${i + 1}  ERROR: ${e.message}`);
    }
  }

  console.log();

  // ── Gateway ──────────────────────────────────────────────────────────────
  console.log(
    "\u2500\u2500\u2500 Gateway \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"
  );
  const gwResults = [];
  for (let i = 0; i < runs; i++) {
    try {
      const r = await gateway();
      gwResults.push(r);
      console.log(
        `  #${i + 1}  thinking: ${fmt(r.ttftThinking).padStart(7)}  text: ${fmt(r.ttftText).padStart(7)}  total: ${fmt(r.total).padStart(7)}  answer: ${r.answer}`
      );
    } catch (e) {
      console.log(`  #${i + 1}  ERROR: ${e.message}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(
    "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550"
  );
  console.log("  RESULTS");
  console.log(
    "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n"
  );

  const dThink = stats(
    directResults.map((r) => r.ttftThinking).filter(Boolean)
  );
  const dText = stats(directResults.map((r) => r.ttftText).filter(Boolean));
  const dTotal = stats(directResults.map((r) => r.total));

  const gThink = stats(gwResults.map((r) => r.ttftThinking).filter(Boolean));
  const gText = stats(gwResults.map((r) => r.ttftText).filter(Boolean));
  const gTotal = stats(gwResults.map((r) => r.total));

  const pad = (s, n = 10) => String(s).padStart(n);

  console.log(
    "                     Direct API         Gateway          Overhead"
  );
  console.log(
    "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"
  );

  const row = (label, d, g) => {
    const overhead =
      d.med != null && g.med != null ? fmt(g.med - d.med) : "\u2014";
    console.log(
      `  ${label.padEnd(20)} ${pad(fmt(d.med))}          ${pad(fmt(g.med))}          ${pad(overhead)}`
    );
  };

  row("TTFT (thinking)", dThink, gThink);
  row("TTFT (text)", dText, gText);
  row("Total", dTotal, gTotal);

  console.log(
    "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"
  );

  // Range
  console.log(`\n  Ranges (min\u2013max):`);
  console.log(
    `    Direct thinking: ${fmt(dThink.min)}\u2013${fmt(dThink.max)}   Gateway thinking: ${fmt(gThink.min)}\u2013${fmt(gThink.max)}`
  );
  console.log(
    `    Direct text:     ${fmt(dText.min)}\u2013${fmt(dText.max)}   Gateway text:     ${fmt(gText.min)}\u2013${fmt(gText.max)}`
  );
  console.log(
    `    Direct total:    ${fmt(dTotal.min)}\u2013${fmt(dTotal.max)}   Gateway total:    ${fmt(gTotal.min)}\u2013${fmt(gTotal.max)}`
  );

  // Verdict
  if (gThink.med != null && dThink.med != null) {
    const overhead = gThink.med - dThink.med;
    console.log(
      `\n  Gateway overhead (thinking TTFT): ${fmt(overhead)} (${((overhead / dThink.med) * 100).toFixed(0)}% of direct)`
    );
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
