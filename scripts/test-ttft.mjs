#!/usr/bin/env node
/**
 * TTFT (Time-To-First-Token) verification script.
 *
 * Measures:
 *  1. Raw API TTFT — direct HTTP to DashScope (no OpenClaw, no AcaClaw)
 *  2. Gateway TTFT — through OpenClaw + AcaClaw plugins (full system prompt)
 *  3. Token breakdown — input / cached / output from each gateway request
 *  4. Historical analysis — scan existing session JSONL files for past TTFT
 *
 * Validates numbers documented in docs/en/ttft-optimization.md.
 *
 * Usage:
 *   node scripts/test-ttft.mjs              # run all tests
 *   node scripts/test-ttft.mjs --raw-only   # raw API only
 *   node scripts/test-ttft.mjs --gw-only    # gateway only
 *   node scripts/test-ttft.mjs --history    # historical analysis only
 */

import { createReadStream, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

// ── Constants ──────────────────────────────────────────────────────────────────

const GATEWAY_URL = "ws://localhost:2090/";
const RAW_ITERATIONS = 3;
const GW_ITERATIONS = 3;
const TTFT_THRESHOLD_MS = 5_000;
const RAW_PROMPT = "25+36=? just answer";
const GW_PROMPT = "hi";
const SESSION_DIR = join(homedir(), ".openclaw", "agents", "main", "sessions");
const CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function p95(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)];
}

// ── 1. Raw API TTFT ────────────────────────────────────────────────────────────

async function measureRawApi() {
  console.log("\n" + "═".repeat(70));
  console.log("  1. RAW API TTFT (direct DashScope, no system prompt)");
  console.log("═".repeat(70));

  // Read API key and model from config
  let apiKey, baseUrl, model;
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    apiKey = cfg.env?.MODELSTUDIO_API_KEY;
    baseUrl = cfg.models?.providers?.modelstudio?.baseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
    model = cfg.agents?.defaults?.model?.replace("modelstudio/", "") ?? "qwen3.5-plus";
  } catch (e) {
    console.error("  ✗ Cannot read config:", e.message);
    return null;
  }

  if (!apiKey) {
    console.error("  ✗ No MODELSTUDIO_API_KEY in config");
    return null;
  }

  const results = [];

  for (let i = 0; i < RAW_ITERATIONS; i++) {
    const t0 = performance.now();
    let ttft = null;

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: RAW_PROMPT }],
          stream: true,
          max_tokens: 20,
          enable_thinking: false, // Ensure no thinking overhead in raw baseline
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

        // Parse SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content && ttft === null) {
              ttft = performance.now() - t0;
            }
          } catch { /* skip */ }
        }

        if (ttft !== null) {
          reader.cancel();
          break;
        }
      }
    } catch (e) {
      console.error(`  ✗ Run ${i + 1}: ${e.message}`);
      continue;
    }

    if (ttft !== null) {
      results.push(ttft);
      const status = ttft < TTFT_THRESHOLD_MS ? "✓" : "✗ FAIL";
      console.log(`  ${status}  Run ${i + 1}: ${fmt(ttft)}`);
    }
  }

  if (results.length) {
    console.log(`\n  Summary (${results.length} runs):`);
    console.log(`    Min:    ${fmt(Math.min(...results))}`);
    console.log(`    Median: ${fmt(median(results))}`);
    console.log(`    Max:    ${fmt(Math.max(...results))}`);
    console.log(`    Model:  ${model}`);
    console.log(`    Prompt: "${RAW_PROMPT}" (~9 tokens, no system prompt)`);
  }

  return { results, model };
}

// ── 2. Gateway TTFT ────────────────────────────────────────────────────────────

async function measureGateway() {
  console.log("\n" + "═".repeat(70));
  console.log("  2. GATEWAY TTFT (OpenClaw + AcaClaw plugins, full system prompt)");
  console.log("═".repeat(70));

  const { default: WebSocket } = await import("ws");
  const results = [];

  for (let i = 0; i < GW_ITERATIONS; i++) {
    const sessionKey = `agent:main:web:ttft-test-${Date.now()}-${i}`;
    const result = await new Promise((resolve) => {
      const t0 = performance.now();
      let ttft = null;
      let usage = null;
      let runId = null;
      let authenticated = false;
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ ttft: null, usage: null, error: "timeout (60s)" });
      }, 60_000);

      const ws = new WebSocket(GATEWAY_URL, {
        headers: { Origin: "http://localhost:2090" },
      });

      ws.on("error", (e) => {
        clearTimeout(timeout);
        resolve({ ttft: null, usage: null, error: e.message });
      });

      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());

        // Connect challenge
        if (msg.type === "event" && msg.event === "connect.challenge") {
          ws.send(JSON.stringify({
            type: "req", id: "c1", method: "connect",
            params: {
              minProtocol: 3, maxProtocol: 3,
              client: { id: "openclaw-control-ui", version: "ttft-test", platform: "test", mode: "ui" },
              role: "operator",
              scopes: ["operator.admin", "operator.read", "operator.write", "operator.approvals", "operator.pairing"],
            },
          }));
          return;
        }

        // Connect response
        if (msg.type === "res" && msg.id === "c1") {
          if (!msg.ok) {
            clearTimeout(timeout);
            ws.close();
            resolve({ ttft: null, usage: null, error: `connect: ${msg.error?.message}` });
            return;
          }
          authenticated = true;
          ws.send(JSON.stringify({
            type: "req", id: "s1", method: "chat.send",
            params: { sessionKey, message: GW_PROMPT, idempotencyKey: `ttft-${Date.now()}` },
          }));
          return;
        }

        // chat.send response
        if (msg.type === "res" && msg.id === "s1") {
          if (!msg.ok) {
            clearTimeout(timeout);
            ws.close();
            resolve({ ttft: null, usage: null, error: `chat.send: ${msg.error?.message}` });
            return;
          }
          runId = msg.payload?.runId;
          return;
        }

        // Chat event
        if (msg.type === "event" && msg.event === "chat") {
          const d = msg.payload;
          // Accept any runId on first event if ours hasn't been set yet
          if (runId && d.runId !== runId) return;

          if (d.state === "delta" && ttft === null) {
            ttft = performance.now() - t0;
          }

          if (d.state === "final") {
            if (ttft === null) ttft = performance.now() - t0;
            usage = d.message?.usage ?? d.usage ?? null;
            clearTimeout(timeout);
            ws.close();
            resolve({ ttft, usage, error: null });
          }

          if (d.state === "error") {
            clearTimeout(timeout);
            ws.close();
            resolve({ ttft, usage: null, error: d.errorMessage ?? "chat error" });
          }
        }
      });
    });

    if (result.error) {
      console.log(`  ✗  Run ${i + 1}: ERROR — ${result.error}`);
      continue;
    }

    results.push(result);
    const status = result.ttft < TTFT_THRESHOLD_MS ? "✓" : "✗ FAIL";
    const cacheInfo = result.usage?.cacheRead ? ` (cached: ${result.usage.cacheRead})` : "";
    console.log(`  ${status}  Run ${i + 1}: ${fmt(result.ttft)}  |  input: ${result.usage?.input ?? "?"}  output: ${result.usage?.output ?? "?"}${cacheInfo}`);
  }

  if (results.length) {
    const ttfts = results.map((r) => r.ttft).filter(Boolean);
    const inputs = results.map((r) => r.usage?.input).filter(Boolean);
    const cached = results.map((r) => r.usage?.cacheRead).filter((v) => v != null);
    console.log(`\n  Summary (${results.length} runs):`);
    console.log(`    TTFT Min:    ${fmt(Math.min(...ttfts))}`);
    console.log(`    TTFT Median: ${fmt(median(ttfts))}`);
    console.log(`    TTFT Max:    ${fmt(Math.max(...ttfts))}`);
    console.log(`    Input tokens:  ${Math.min(...inputs)}–${Math.max(...inputs)}`);
    console.log(`    Cached tokens: ${cached.every((c) => c === 0) ? "0 (NO CACHING)" : cached.join(", ")}`);
    console.log(`    Prompt: "${GW_PROMPT}"`);
  }

  return results;
}

// ── 3. Historical Session Analysis ─────────────────────────────────────────────

async function analyzeHistory() {
  console.log("\n" + "═".repeat(70));
  console.log("  3. HISTORICAL SESSION ANALYSIS");
  console.log("═".repeat(70));

  if (!existsSync(SESSION_DIR)) {
    console.log("  No session directory found at", SESSION_DIR);
    return null;
  }

  const files = readdirSync(SESSION_DIR).filter((f) => f.endsWith(".jsonl"));
  console.log(`  Scanning ${files.length} session files...`);

  const records = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(SESSION_DIR, file), "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      const msgs = lines.map((l) => JSON.parse(l));

      const userMsg = msgs.find((m) => m.message?.role === "user");
      const firstAsst = msgs.find((m) => m.message?.role === "assistant");
      if (!userMsg?.timestamp || !firstAsst?.timestamp) continue;

      const ttft = new Date(firstAsst.timestamp) - new Date(userMsg.timestamp);
      const usage = firstAsst.message?.usage;
      if (!usage) continue;

      const hasTools = msgs.some(
        (m) =>
          m.message?.role === "toolResult" ||
          JSON.stringify(m.message?.content || "").includes('"toolCall"'),
      );

      const query =
        typeof userMsg.message?.content === "string"
          ? userMsg.message.content.slice(0, 60)
          : Array.isArray(userMsg.message?.content)
            ? (userMsg.message.content.find((c) => c.type === "text")?.text ?? "").slice(0, 60)
            : "?";

      // Thinking analysis
      const asstContent = firstAsst.message?.content;
      const thinkChars = Array.isArray(asstContent)
        ? asstContent.filter((c) => c.type === "thinking").reduce((s, c) => s + (c.thinking?.length ?? 0), 0)
        : 0;
      const thinkingLevel = msgs.find((m) => m.thinkingLevel !== undefined)?.thinkingLevel ?? "?";

      records.push({
        session: file.slice(0, 8),
        ttft,
        input: usage.input,
        cached: usage.cacheRead ?? 0,
        output: usage.output,
        hasTools,
        query,
        thinkChars,
        thinkingLevel,
      });
    } catch { /* skip corrupt files */ }
  }

  if (!records.length) {
    console.log("  No valid sessions found.");
    return null;
  }

  // Sort by TTFT
  records.sort((a, b) => a.ttft - b.ttft);

  console.log(`\n  Found ${records.length} sessions with timing data:\n`);
  console.log("  Session  | TTFT       | Input  | Cached | Think | Level    | Query");
  console.log("  " + "-".repeat(85));
  for (const r of records) {
    const ttftStr = fmt(r.ttft).padStart(10);
    const status = r.ttft < TTFT_THRESHOLD_MS ? " " : "!";
    console.log(
      `  ${status}${r.session} | ${ttftStr} | ${String(r.input).padStart(6)} | ${String(r.cached).padStart(6)} | ${String(r.thinkChars).padStart(5)} | ${String(r.thinkingLevel).padEnd(8)} | ${r.query}`,
    );
  }

  const ttfts = records.map((r) => r.ttft);
  const inputs = records.map((r) => r.input);
  const passingCount = ttfts.filter((t) => t < TTFT_THRESHOLD_MS).length;
  const failingCount = ttfts.filter((t) => t >= TTFT_THRESHOLD_MS).length;

  console.log(`\n  Distribution:`);
  console.log(`    Count:     ${records.length}`);
  console.log(`    Min:       ${fmt(Math.min(...ttfts))}`);
  console.log(`    Median:    ${fmt(median(ttfts))}`);
  console.log(`    P95:       ${fmt(p95(ttfts))}`);
  console.log(`    Max:       ${fmt(Math.max(...ttfts))}`);
  console.log(`    < 5s:      ${passingCount} (${((passingCount / records.length) * 100).toFixed(0)}%)`);
  console.log(`    ≥ 5s:      ${failingCount} (${((failingCount / records.length) * 100).toFixed(0)}%)`);
  console.log(`    Input min: ${Math.min(...inputs)}`);
  console.log(`    Input max: ${Math.max(...inputs)}`);
  console.log(`    Caching:   ${records.every((r) => r.cached === 0) ? "NONE — 0 cached tokens across all sessions" : "Active"}`);

  // Thinking analysis
  const thinkRecords = records.filter((r) => r.thinkChars > 0);
  const noThinkRecords = records.filter((r) => r.thinkChars === 0);
  const thinkLevels = [...new Set(records.map((r) => r.thinkingLevel))];
  console.log(`\n  Thinking analysis:`);
  console.log(`    Sessions with thinking: ${thinkRecords.length}/${records.length}`);
  console.log(`    Sessions without:       ${noThinkRecords.length}/${records.length}`);
  console.log(`    thinkingLevel values:   ${thinkLevels.join(", ")}`);
  if (thinkRecords.length) {
    const thinkCharsArr = thinkRecords.map((r) => r.thinkChars);
    console.log(`    Think chars min:        ${Math.min(...thinkCharsArr)}`);
    console.log(`    Think chars median:     ${median(thinkCharsArr)}`);
    console.log(`    Think chars max:        ${Math.max(...thinkCharsArr)}`);
  }
  if (thinkRecords.length && thinkLevels.includes("off")) {
    console.log(`    ⚠  BUG: Sessions show thinkingLevel=off but STILL contain thinking content`);
    console.log(`       OpenClaw is NOT passing enable_thinking=false to the API`);
  }

  return records;
}

// ── 4. AcaClaw Overhead Estimate ───────────────────────────────────────────────

function estimateOverhead() {
  console.log("\n" + "═".repeat(70));
  console.log("  4. ACACLAW OVERHEAD ESTIMATE (system prompt additions)");
  console.log("═".repeat(70));

  const agentsDir = join(process.cwd(), "agents");
  const pluginsDir = join(process.cwd(), "plugins");

  // Measure SOUL.md + IDENTITY.md sizes
  let totalSoulChars = 0;
  let totalIdentityChars = 0;
  const souls = {};

  if (existsSync(agentsDir)) {
    for (const agent of readdirSync(agentsDir)) {
      const soulPath = join(agentsDir, agent, "SOUL.md");
      const idPath = join(agentsDir, agent, "IDENTITY.md");
      if (existsSync(soulPath)) {
        const chars = readFileSync(soulPath, "utf-8").length;
        totalSoulChars += chars;
        souls[agent] = chars;
      }
      if (existsSync(idPath)) {
        totalIdentityChars += readFileSync(idPath, "utf-8").length;
      }
    }
  }

  // Estimate tokens (~4 chars per token for English)
  const soulTokens = Math.round(totalSoulChars / 4);
  const identityTokens = Math.round(totalIdentityChars / 4);

  console.log("\n  Agent personality files (all agents):");
  for (const [agent, chars] of Object.entries(souls)) {
    console.log(`    ${agent}: ${chars} chars (~${Math.round(chars / 4)} tokens)`);
  }
  console.log(`    TOTAL SOUL.md:     ${totalSoulChars} chars (~${soulTokens} tokens)`);
  console.log(`    TOTAL IDENTITY.md: ${totalIdentityChars} chars (~${identityTokens} tokens)`);

  // NOTE: Only the ACTIVE agent's SOUL.md is injected per request (not all of them)
  const mainSoul = souls["main"] ?? 0;
  const mainTokens = Math.round(mainSoul / 4);
  console.log(`\n  Per-request injection (main agent only):`);
  console.log(`    SOUL.md (main):         ${mainSoul} chars (~${mainTokens} tokens)`);
  console.log(`    Workspace context:      ~500–1500 chars (~125–375 tokens)`);
  console.log(`    Academic env context:    ~800–1200 chars (~200–300 tokens)`);
  console.log(`    ─────────────────────────────────────`);
  console.log(`    AcaClaw total addition:  ~${mainSoul + 500 + 800}–${mainSoul + 1500 + 1200} chars (~${mainTokens + 125 + 200}–${mainTokens + 375 + 300} tokens)`);
  console.log(`\n  The remaining ~12,000+ input tokens are from OpenClaw itself:`);
  console.log(`    Tool schemas, system rules, safety instructions, etc.`);
}

// ── 5. Validation Summary ──────────────────────────────────────────────────────

function validate(rawResults, gwResults, histRecords) {
  console.log("\n" + "═".repeat(70));
  console.log("  5. DOCUMENT VALIDATION");
  console.log("═".repeat(70));

  const docPath = join(process.cwd(), "docs", "en", "ttft-optimization.md");
  let issues = 0;

  function check(label, actual, docClaim, tolerance = 0.3) {
    if (actual == null) {
      console.log(`  ⊘  ${label}: no data`);
      return;
    }
    const diff = Math.abs(actual - docClaim) / docClaim;
    if (diff <= tolerance) {
      console.log(`  ✓  ${label}: measured=${fmt(actual)}, documented=${fmt(docClaim)} (${(diff * 100).toFixed(0)}% diff)`);
    } else {
      console.log(`  ✗  ${label}: measured=${fmt(actual)}, documented=${fmt(docClaim)} (${(diff * 100).toFixed(0)}% diff — WRONG)`);
      issues++;
    }
  }

  // Raw API
  if (rawResults?.results?.length) {
    const rawMedian = median(rawResults.results);
    check("Raw API TTFT (doc says 522\u2013726ms)", rawMedian, 624); // midpoint
  }

  // Gateway
  if (gwResults?.length) {
    const gwTtfts = gwResults.map((r) => r.ttft).filter(Boolean);
    const gwMedian = median(gwTtfts);
    const gwInputs = gwResults.map((r) => r.usage?.input).filter(Boolean);
    check("Gateway TTFT (doc says ~8,990ms)", gwMedian, 8990);
    if (gwInputs.length) {
      const avgInput = gwInputs.reduce((a, b) => a + b, 0) / gwInputs.length;
      check("Input tokens (doc says ~15,300)", avgInput, 15300);
    }
  }

  // Historical
  if (histRecords?.length) {
    const ttfts = histRecords.map((r) => r.ttft);
    const med = median(ttfts);
    console.log(`\n  Historical median TTFT: ${fmt(med)} (${histRecords.length} sessions)`);
    console.log(`  Historical TTFT range: ${fmt(Math.min(...ttfts))}–${fmt(Math.max(...ttfts))}`);

    if (histRecords.every((r) => r.cached === 0)) {
      console.log(`  ⚠  Prompt caching: NOT WORKING — all sessions show 0 cached tokens (documented as known issue)`);
    }

    const inputs = histRecords.map((r) => r.input);
    const variance = ((Math.max(...ttfts) - Math.min(...ttfts)) / median(ttfts) * 100).toFixed(0);
    console.log(`  ⚠  TTFT variance: ${variance}% — DashScope API has high variance at same token count`);
  }

  console.log(`\n  Issues found: ${issues}`);
  return issues;
}

// ── Main ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const rawOnly = args.includes("--raw-only");
const gwOnly = args.includes("--gw-only");
const histOnly = args.includes("--history");
const all = !rawOnly && !gwOnly && !histOnly;

console.log("╔" + "═".repeat(70) + "╗");
console.log("║  AcaClaw TTFT Verification Test" + " ".repeat(39) + "║");
console.log("║  Threshold: " + fmt(TTFT_THRESHOLD_MS) + " ".repeat(52) + "║");
console.log("╚" + "═".repeat(70) + "╝");

let rawResults = null;
let gwResults = null;
let histRecords = null;

if (all || rawOnly) rawResults = await measureRawApi();
if (all || gwOnly) gwResults = await measureGateway();
if (all || histOnly) histRecords = await analyzeHistory();

estimateOverhead();
const issues = validate(rawResults, gwResults, histRecords);

console.log("\n" + "═".repeat(70));
if (issues === 0) {
  console.log("  RESULT: All documented values are within tolerance ✓");
} else {
  console.log(`  RESULT: ${issues} documented value(s) need correction ✗`);
}
console.log("═".repeat(70) + "\n");

process.exit(issues > 0 ? 1 : 0);
