#!/usr/bin/env node
/**
 * Gateway Overhead Isolation Test
 *
 * Measures TTFT at three levels to isolate gateway overhead from prompt overhead:
 *
 *   Layer A — Raw DashScope API, no system prompt        → model baseline
 *   Layer B — Raw DashScope API, WITH full system prompt  → model + token processing
 *   Layer C — Gateway chat (full agent, full prompt)      → model + tokens + gateway
 *
 * Computed metrics:
 *   Token processing cost = B − A   (model processing the system prompt)
 *   Gateway overhead      = C − B   (WebSocket, hooks, plugins, session mgmt, prompt assembly)
 *
 * Usage:
 *   node scripts/test-gateway-overhead.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Config ─────────────────────────────────────────────────────────────────────

const ITERATIONS = 3;
const USER_MSG = "25+36=? just answer";
const CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");
const LLM_INPUT_DIR = join(homedir(), ".acaclaw", "logs");
const GATEWAY_URL = "ws://localhost:2090/";

function fmt(ms) {
  if (ms == null) return "N/A";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function loadConfig() {
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  const apiKey = cfg.env?.MODELSTUDIO_API_KEY;
  const baseUrl = cfg.models?.providers?.modelstudio?.baseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = cfg.agents?.defaults?.model?.replace("modelstudio/", "") ?? "qwen3.5-plus";
  if (!apiKey) throw new Error("No MODELSTUDIO_API_KEY in config");
  return { apiKey, baseUrl, model };
}

function loadCapturedSystemPrompt() {
  // Find the most recent llm-input log
  const today = new Date().toISOString().slice(0, 10);
  const logPath = join(LLM_INPUT_DIR, `llm-input-${today}.jsonl`);
  if (!existsSync(logPath)) {
    // Try any llm-input file
    const { readdirSync } = require("fs");
    const files = readdirSync(LLM_INPUT_DIR).filter(f => f.startsWith("llm-input-")).sort().reverse();
    if (!files.length) return null;
    const content = readFileSync(join(LLM_INPUT_DIR, files[0]), "utf-8");
    const firstLine = content.split("\n").find(l => l.trim());
    if (!firstLine) return null;
    return JSON.parse(firstLine).systemPrompt;
  }
  const content = readFileSync(logPath, "utf-8");
  const firstLine = content.split("\n").find(l => l.trim());
  if (!firstLine) return null;
  return JSON.parse(firstLine).systemPrompt;
}

// ── Layer A: Raw API, no system prompt ─────────────────────────────────────────

async function measureRawApi(config, systemPrompt) {
  const label = systemPrompt ? "B" : "A";
  const desc = systemPrompt
    ? `RAW API + FULL SYSTEM PROMPT (${systemPrompt.length} chars)`
    : "RAW API ONLY (no system prompt)";

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  Layer ${label}: ${desc}`);
  console.log(`${"═".repeat(70)}`);

  const results = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: USER_MSG });

    const t0 = performance.now();
    let ttft = null;
    let inputTokens = null;
    let thinkingTtft = null;

    try {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: 20,
          // Match gateway behavior: adaptive thinking
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`  ✗ Run ${i + 1}: HTTP ${res.status} — ${body.slice(0, 200)}`);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;

            // First thinking token
            if (delta?.reasoning_content && thinkingTtft === null) {
              thinkingTtft = performance.now() - t0;
            }
            // First text token
            if (delta?.content && ttft === null) {
              ttft = performance.now() - t0;
            }

            // Usage in final chunk
            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens;
            }
          } catch { /* skip */ }
        }

        if (ttft !== null) {
          // Read remaining for usage
          try {
            while (true) {
              const { done: d2, value: v2 } = await reader.read();
              if (d2) break;
              const text = decoder.decode(v2, { stream: true });
              // Extract usage from remaining chunks
              const usageMatch = text.match(/"prompt_tokens"\s*:\s*(\d+)/);
              if (usageMatch) inputTokens = parseInt(usageMatch[1]);
              if (text.includes("[DONE]")) { reader.cancel(); break; }
            }
          } catch { /* ok */ }
          break;
        }
      }
    } catch (e) {
      console.error(`  ✗ Run ${i + 1}: ${e.message}`);
      continue;
    }

    if (ttft !== null || thinkingTtft !== null) {
      const firstToken = thinkingTtft ?? ttft;
      results.push({
        ttft,
        thinkingTtft,
        firstToken,
        inputTokens,
      });
      const parts = [];
      if (thinkingTtft !== null) parts.push(`thinking=${fmt(thinkingTtft)}`);
      parts.push(`text=${fmt(ttft)}`);
      parts.push(`input=${inputTokens ?? "?"} tokens`);
      console.log(`  Run ${i + 1}: first_token=${fmt(firstToken)}  ${parts.join("  ")}`);
    }
  }

  const ttfts = results.map(r => r.firstToken).filter(Boolean);
  const med = median(ttfts);
  const tokens = results.find(r => r.inputTokens)?.inputTokens ?? "?";
  console.log(`\n  Median TTFT: ${fmt(med)}  (${results.length} runs, ~${tokens} input tokens)`);

  return { label, median: med, results, inputTokens: tokens };
}

// ── Layer C: Gateway ───────────────────────────────────────────────────────────

async function measureGateway() {
  console.log(`\n${"═".repeat(70)}`);
  console.log("  Layer C: GATEWAY (full agent, full prompt, all plugins)");
  console.log(`${"═".repeat(70)}`);

  const { default: WebSocket } = await import("ws");
  const results = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const sessionKey = `agent:main:web:gw-overhead-${Date.now()}`;
    const result = await new Promise((resolve) => {
      const ws = new WebSocket(GATEWAY_URL, {
        headers: { Origin: "http://localhost:2090" },
      });
      const timer = setTimeout(() => { ws.close(); resolve({ error: "timeout" }); }, 60000);
      let t0 = null;
      let ttft = null;
      let thinkingTtft = null;
      let inputTokens = null;

      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "event" && msg.event === "connect.challenge") {
          ws.send(JSON.stringify({
            type: "req", id: "c1", method: "connect",
            params: {
              minProtocol: 3, maxProtocol: 3,
              client: { id: "openclaw-control-ui", version: "t", platform: "t", mode: "ui" },
              role: "operator",
              scopes: ["operator.admin", "operator.read", "operator.write", "operator.approvals", "operator.pairing"],
            },
          }));
        }

        if (msg.type === "res" && msg.id === "c1" && msg.ok) {
          t0 = performance.now();
          ws.send(JSON.stringify({
            type: "req", id: "s1", method: "chat.send",
            params: { sessionKey, message: USER_MSG, idempotencyKey: `gw-oh-${Date.now()}` },
          }));
        }

        if (msg.type === "event" && msg.event === "chat" && t0) {
          const d = msg.payload;

          // Payload structure: { runId, sessionKey, seq, state, message }
          // message.content is array of { type, text } or { type, thinking }
          if (d.state === "delta" && d.message?.content) {
            for (const c of d.message.content) {
              if (c.type === "thinking" && c.thinking && thinkingTtft === null) {
                thinkingTtft = performance.now() - t0;
              }
              if (c.type === "text" && c.text && ttft === null) {
                ttft = performance.now() - t0;
              }
            }
          }

          if (d.state === "final" || d.state === "error") {
            // Usage may be in message.usage or message.api
            const api = d.message?.api;
            if (api?.usage) inputTokens = api.usage.input;
            clearTimeout(timer);
            ws.close();
            resolve({ ttft, thinkingTtft, inputTokens });
          }
        }
      });

      ws.on("error", (e) => {
        clearTimeout(timer);
        resolve({ error: e.message });
      });
    });

    if (result.error) {
      console.error(`  ✗ Run ${i + 1}: ${result.error}`);
      continue;
    }

    const firstToken = result.thinkingTtft ?? result.ttft;
    results.push({
      ttft: result.ttft,
      thinkingTtft: result.thinkingTtft,
      firstToken,
      inputTokens: result.inputTokens,
    });
    const parts = [];
    if (result.thinkingTtft !== null) parts.push(`thinking=${fmt(result.thinkingTtft)}`);
    parts.push(`text=${fmt(result.ttft)}`);
    parts.push(`input=${result.inputTokens ?? "?"} tokens`);
    console.log(`  Run ${i + 1}: first_token=${fmt(firstToken)}  ${parts.join("  ")}`);
  }

  const ttfts = results.map(r => r.firstToken).filter(Boolean);
  const med = median(ttfts);
  const tokens = results.find(r => r.inputTokens)?.inputTokens ?? "?";
  console.log(`\n  Median TTFT: ${fmt(med)}  (${results.length} runs, ~${tokens} input tokens)`);

  // Also read input tokens from llm-input log for the gateway runs
  let logTokens = null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const logPath = join(LLM_INPUT_DIR, `llm-input-${today}.jsonl`);
    if (existsSync(logPath)) {
      const lines = readFileSync(logPath, "utf-8").split("\n").filter(l => l.trim());
      // Get last entry — should be from this run
      if (lines.length) {
        const last = JSON.parse(lines[lines.length - 1]);
        const promptChars = (last.systemPrompt?.length ?? 0) + (last.prompt?.length ?? 0);
        logTokens = Math.round(promptChars / 2.42);
        console.log(`  (from llm-input log: ~${promptChars} prompt chars, ~${logTokens} est. tokens)`);
      }
    }
  } catch { /* ok */ }

  return { label: "C", median: med, results, inputTokens: tokens !== "?" ? tokens : logTokens };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  GATEWAY OVERHEAD ISOLATION TEST                                    ║");
  console.log("║  Separates: model baseline / token processing / gateway overhead    ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  const config = loadConfig();
  console.log(`\nModel: ${config.model}`);
  console.log(`API: ${config.baseUrl}`);
  console.log(`Test message: "${USER_MSG}"`);
  console.log(`Iterations per layer: ${ITERATIONS}`);

  // Load the captured system prompt for Layer B
  const systemPrompt = loadCapturedSystemPrompt();
  if (!systemPrompt) {
    console.error("\n⚠  No captured system prompt found in ~/.acaclaw/logs/llm-input-*.jsonl");
    console.error("   Send a message through the gateway first to capture one.");
    console.error("   Then re-run this test.");
    process.exit(1);
  }
  console.log(`System prompt: ${systemPrompt.length} chars (~${Math.round(systemPrompt.length / 2.42)} tokens est.)`);

  // Run all three layers
  const layerA = await measureRawApi(config, null);
  const layerB = await measureRawApi(config, systemPrompt);
  const layerC = await measureGateway();

  // ── Analysis ──────────────────────────────────────────────────────────────

  console.log(`\n${"═".repeat(70)}`);
  console.log("  ANALYSIS: OVERHEAD BREAKDOWN");
  console.log(`${"═".repeat(70)}\n`);

  const a = layerA.median;
  const b = layerB.median;
  const c = layerC.median;

  // Handle gateway not streaming thinking (ttft = text token only)
  const gwTextTtft = median(layerC.results.map(r => r.ttft).filter(Boolean));
  const gwThinkTtft = median(layerC.results.map(r => r.thinkingTtft).filter(Boolean));

  console.log("  ┌─────────────────────────────────────────────────────────┐");
  console.log(`  │  Layer A  (raw API, no prompt):     ${fmt(a).padStart(10)}          │`);
  console.log(`  │  Layer B  (raw API + system prompt): ${fmt(b).padStart(10)}          │`);
  console.log(`  │  Layer C  (gateway, full stack):     ${fmt(c).padStart(10)}          │`);
  if (gwThinkTtft) {
    console.log(`  │    └ first thinking token:          ${fmt(gwThinkTtft).padStart(10)}          │`);
    console.log(`  │    └ first text token:              ${fmt(gwTextTtft).padStart(10)}          │`);
  }
  console.log("  ├─────────────────────────────────────────────────────────┤");

  // Note: Layer B has fewer input tokens than Layer C because the gateway
  // also sends tool schemas as the OpenAI tools parameter, which are NOT
  // included in the systemPrompt captured by llm_input hook.
  const bTokens = typeof layerB.inputTokens === "number" ? layerB.inputTokens : 0;
  const cTokens = typeof layerC.inputTokens === "number" ? layerC.inputTokens : 15400;
  const toolTokens = cTokens - bTokens;

  if (toolTokens > 0) {
    console.log(`  │  NOTE: Layer B = ${bTokens} tokens, C = ~${cTokens} tokens     │`);
    console.log(`  │  Gap of ~${toolTokens} tokens = tool schemas (not in prompt)    │`);
    console.log("  ├─────────────────────────────────────────────────────────┤");
  }

  if (a != null && b != null) {
    const tokenCost = b - a;
    console.log(`  │  Token processing  (B − A):         ${fmt(tokenCost).padStart(10)}          │`);
    if (layerB.inputTokens !== "?") {
      const perToken = tokenCost / layerB.inputTokens;
      console.log(`  │    per token:                      ${perToken.toFixed(3)}ms          │`);
    }
  }

  if (b != null && c != null) {
    const gwOverhead = c - b;
    console.log(`  │  Gateway overhead  (C − B):         ${fmt(gwOverhead).padStart(10)}          │`);
    console.log(`  │    (WebSocket + hooks + plugins +                       │`);
    console.log(`  │     session mgmt + prompt assembly)                     │`);
  }

  if (a != null && c != null) {
    const total = c - a;
    console.log(`  │  Total overhead    (C − A):         ${fmt(total).padStart(10)}          │`);
  }

  console.log("  └─────────────────────────────────────────────────────────┘");

  // Token counts
  console.log("\n  Token comparison:");
  console.log(`    Layer A input tokens: ${layerA.inputTokens}`);
  console.log(`    Layer B input tokens: ${layerB.inputTokens}`);
  console.log(`    Layer C input tokens: ${layerC.inputTokens}`);

  // Thinking analysis
  console.log("\n  Thinking token streaming:");
  const aThink = layerA.results.filter(r => r.thinkingTtft).length;
  const bThink = layerB.results.filter(r => r.thinkingTtft).length;
  const cThink = layerC.results.filter(r => r.thinkingTtft).length;
  console.log(`    Layer A: ${aThink}/${layerA.results.length} runs had thinking tokens`);
  console.log(`    Layer B: ${bThink}/${layerB.results.length} runs had thinking tokens`);
  console.log(`    Layer C: ${cThink}/${layerC.results.length} runs had thinking tokens`);
  if (cThink === 0 && bThink > 0) {
    console.log("    ⚠  Gateway does NOT stream thinking tokens (confirmed)");
  }

  // Breakdown as percentages
  if (a != null && b != null && c != null) {
    const totalOverhead = c - a;
    const tokenCost = b - a;  // Only system prompt tokens (no tool schemas)
    const gwRaw = c - b;      // Includes tool schema token cost + pure gateway overhead

    // Estimate: tool schemas add ~6000 tokens, at ~0.06ms/token ≈ ~360ms extra token processing
    // The rest is pure gateway overhead (WebSocket, hooks, sessions, prompt assembly)
    const toolTokenCostMs = toolTokens > 0 ? toolTokens * (tokenCost / (bTokens - 16)) : 0;
    const pureGwOverhead = gwRaw - toolTokenCostMs;

    console.log("\n  Overhead decomposition:");
    console.log(`    Model baseline:               ${fmt(a)}`);
    console.log(`    Token processing (prompt):     ${fmt(tokenCost)}  (${(tokenCost/totalOverhead*100).toFixed(1)}%)`);
    if (toolTokens > 0) {
      console.log(`    Token processing (tools est.): ${fmt(toolTokenCostMs)}  (${(toolTokenCostMs/totalOverhead*100).toFixed(1)}%)`);
    }
    console.log(`    Pure gateway overhead:         ${fmt(pureGwOverhead)}  (${(pureGwOverhead/totalOverhead*100).toFixed(1)}%)`);
    console.log(`      (WebSocket + hooks + plugins + session + prompt assembly)`);
    console.log(`    Total overhead (C − A):        ${fmt(totalOverhead)}`);
  }

  // Recommendations
  console.log(`\n${"─".repeat(70)}`);
  console.log("  ACTIONABLE FINDINGS:");
  console.log(`${"─".repeat(70)}`);

  if (a != null && b != null) {
    const tokenCost = b - a;
    if (tokenCost > 2000) {
      console.log(`  ✗ Token processing adds ${fmt(tokenCost)} — prompt trimming would help`);
    } else {
      console.log(`  ✓ Token processing only adds ${fmt(tokenCost)} — prompt size is acceptable`);
    }
  }

  if (b != null && c != null) {
    const gwOverhead = c - b;
    if (gwOverhead > 500) {
      console.log(`  ✗ Gateway overhead is ${fmt(gwOverhead)} — needs investigation:`);
      console.log("    → WebSocket handshake + connect.challenge");
      console.log("    → Plugin hook execution (before_prompt_build, llm_input, etc.)");
      console.log("    → Session creation + JSONL write");
      console.log("    → Prompt assembly (SOUL.md, workspace files, skills)");
      console.log("    → Tool schema serialization");
    } else {
      console.log(`  ✓ Gateway overhead is only ${fmt(gwOverhead)} — acceptably fast`);
    }
  }

  if (layerC.results.some(r => r.thinkingTtft === null) &&
      layerB.results.some(r => r.thinkingTtft !== null)) {
    console.log("  ✗ Thinking tokens NOT streamed by gateway — user sees blank until text");
    console.log("    → If streamed, perceived TTFT would match Layer B thinking TTFT");
    const bThinkMed = median(layerB.results.map(r => r.thinkingTtft).filter(Boolean));
    if (bThinkMed) {
      console.log(`    → Potential perceived TTFT: ${fmt(bThinkMed)} (vs current ${fmt(c)})`);
    }
  }

  console.log("");
}

main().catch(e => { console.error(e); process.exit(1); });
