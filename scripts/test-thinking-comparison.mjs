#!/usr/bin/env node
/**
 * Direct DashScope API: thinking token streaming analysis.
 *
 * Key insight: thinking tokens ARE output. The API streams the first thinking
 * token in ~0.5-0.7s (excellent TTFT). The problem is OpenClaw doesn't forward
 * these to the client, so users wait 3-17s for the first TEXT token.
 *
 * This script measures:
 *  - First thinking token latency (true TTFT if thinking is streamed)
 *  - First text token latency (current perceived TTFT)
 *  - Think→Text gap (hidden delay the user currently endures)
 */

import https from "https";
import fs from "fs";
import path from "path";

const cfgPath = path.join(process.env.HOME, ".openclaw/openclaw.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const API_KEY = cfg.env?.MODELSTUDIO_API_KEY;
if (!API_KEY) { console.error("No MODELSTUDIO_API_KEY in config"); process.exit(1); }

const BASE = "dashscope.aliyuncs.com";
const MODEL = "qwen3.5-plus";

function testRaw(enableThinking, messages, label) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let firstToken = null, firstThinking = null, firstText = null;
    let thinkChars = 0, textChars = 0, chunks = 0;

    const body = JSON.stringify({
      model: MODEL,
      messages,
      stream: true,
      enable_thinking: enableThinking,
      max_tokens: 300
    });

    const req = https.request({
      hostname: BASE, port: 443,
      path: "/compatible-mode/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + API_KEY
      }
    }, (res) => {
      let buf = "";
      res.on("data", (chunk) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ") || line.trim() === "data: [DONE]") continue;
          try {
            const d = JSON.parse(line.slice(6));
            const delta = d.choices?.[0]?.delta;
            if (!delta) continue;
            const now = performance.now() - t0;
            chunks++;
            if (!firstToken) firstToken = now;
            if (delta.reasoning_content) {
              if (!firstThinking) firstThinking = now;
              thinkChars += delta.reasoning_content.length;
            }
            if (delta.content) {
              if (!firstText) firstText = now;
              textChars += delta.content.length;
            }
          } catch (e) {}
        }
      });
      res.on("end", () => {
        resolve({
          label, enableThinking, firstToken, firstThinking, firstText,
          thinkChars, textChars, chunks,
          total: performance.now() - t0
        });
      });
    });
    req.on("error", (e) => resolve({ label, error: e.message }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ label, error: "timeout" }); });
    req.write(body);
    req.end();
  });
}

function fmt(ms) { return ms == null ? "N/A" : (ms / 1000).toFixed(2) + "s"; }

// Build a large system prompt similar to AcaClaw's ~15K token prompt
function buildLargePrompt() {
  // Read SOUL.md and IDENTITY.md to simulate AcaClaw prompt
  const agentDir = path.join(process.env.HOME, "github/acaclaw/agents/main");
  let soul = "", identity = "";
  try { soul = fs.readFileSync(path.join(agentDir, "SOUL.md"), "utf8"); } catch (e) {}
  try { identity = fs.readFileSync(path.join(agentDir, "IDENTITY.md"), "utf8"); } catch (e) {}

  // Pad to ~15K tokens with realistic content
  const padding = `
You are an academic research assistant with expertise in multiple disciplines.
You have access to tools for literature search, data analysis, and file management.
Please follow these guidelines:
- Be precise and cite sources when possible
- Use academic language appropriate for the discipline
- Provide structured responses with clear sections
`.repeat(40);

  return [
    { role: "system", content: (soul + "\n" + identity + "\n" + padding).slice(0, 50000) },
    { role: "user", content: "25+36=? just answer" }
  ];
}

console.log("=== RAW DASHSCOPE API: THINKING vs NON-THINKING ===\n");

// --- Phase 1: Minimal prompt ---
console.log("--- Phase 1: Minimal prompt (1 user message) ---\n");
const minMessages = [{ role: "user", content: "25+36=? just answer" }];

const results = [];
for (let run = 1; run <= 3; run++) {
  const off = await testRaw(false, minMessages, `min-off-${run}`);
  const on = await testRaw(true, minMessages, `min-on-${run}`);
  results.push({ run, off, on, prompt: "minimal" });

  console.log(`Run ${run}:`);
  console.log(`  thinking=false: firstToken=${fmt(off.firstToken)} text=${off.textChars}chars total=${fmt(off.total)}`);
  console.log(`  thinking=true:  firstThink=${fmt(on.firstThinking)} firstText=${fmt(on.firstText)} think=${on.thinkChars}chars text=${on.textChars}chars total=${fmt(on.total)}`);
  if (on.firstThinking && on.firstText) {
    console.log(`  Think→Text gap: ${fmt(on.firstText - on.firstThinking)} (user sees nothing during this gap)`);
  }
  console.log();
}

// --- Phase 2: Large prompt (~15K tokens, simulating AcaClaw) ---
console.log("--- Phase 2: Large prompt (~15K tokens, simulating AcaClaw) ---\n");
const largeMessages = buildLargePrompt();
console.log(`System prompt length: ${largeMessages[0].content.length} chars (~${Math.round(largeMessages[0].content.length / 4)} tokens)\n`);

for (let run = 1; run <= 3; run++) {
  const off = await testRaw(false, largeMessages, `large-off-${run}`);
  const on = await testRaw(true, largeMessages, `large-on-${run}`);
  results.push({ run, off, on, prompt: "large" });

  console.log(`Run ${run}:`);
  console.log(`  thinking=false: firstToken=${fmt(off.firstToken)} text=${off.textChars}chars total=${fmt(off.total)}`);
  console.log(`  thinking=true:  firstThink=${fmt(on.firstThinking)} firstText=${fmt(on.firstText)} think=${on.thinkChars}chars text=${on.textChars}chars total=${fmt(on.total)}`);
  if (on.firstThinking && on.firstText) {
    console.log(`  Think→Text gap: ${fmt(on.firstText - on.firstThinking)} (user sees nothing during this gap)`);
  }
  console.log();
}

// --- Summary ---
console.log("=== SUMMARY ===\n");

const minOff = results.filter(r => r.prompt === "minimal").map(r => r.off.firstToken).filter(Boolean);
const minOn = results.filter(r => r.prompt === "minimal").map(r => r.on.firstToken).filter(Boolean);
const largeOff = results.filter(r => r.prompt === "large").map(r => r.off.firstToken).filter(Boolean);
const largeOn = results.filter(r => r.prompt === "large").map(r => r.on.firstToken).filter(Boolean);
const minOnFirstThink = results.filter(r => r.prompt === "minimal").map(r => r.on.firstThinking).filter(Boolean);
const largeOnFirstThink = results.filter(r => r.prompt === "large").map(r => r.on.firstThinking).filter(Boolean);
const minOnFirstText = results.filter(r => r.prompt === "minimal").map(r => r.on.firstText).filter(Boolean);
const largeOnFirstText = results.filter(r => r.prompt === "large").map(r => r.on.firstText).filter(Boolean);

function median(arr) { const s = [...arr].sort((a,b) => a-b); return s[Math.floor(s.length/2)]; }

console.log("                          | Minimal prompt | Large prompt (~15K tok)");
console.log("thinking=false: first tok | " + fmt(median(minOff)).padEnd(14) + " | " + fmt(median(largeOff)));
console.log("thinking=true:  1st think | " + fmt(median(minOnFirstThink)).padEnd(14) + " | " + fmt(median(largeOnFirstThink)));
console.log("thinking=true:  1st text  | " + fmt(median(minOnFirstText)).padEnd(14) + " | " + fmt(median(largeOnFirstText)));

console.log("\n=== KEY INSIGHT ===");
console.log("First THINKING token = real TTFT (thinking IS visible output)");
if (largeOnFirstThink.length) {
  console.log("  API delivers first thinking token in " + fmt(median(largeOnFirstThink)) + " even with 15K input tokens");
  console.log("  If OpenClaw streamed these, perceived TTFT would be ~" + fmt(median(largeOnFirstThink)));
  if (largeOnFirstText.length) {
    console.log("  Currently user waits " + fmt(median(largeOnFirstText)) + " (until first TEXT token) — " + (median(largeOnFirstText) / median(largeOnFirstThink)).toFixed(0) + "x unnecessary delay");
  }
}

// Average thinking tokens generated
const thinkToks = results.filter(r => r.on.thinkChars > 0).map(r => r.on.thinkChars);
if (thinkToks.length) {
  console.log("\nAvg thinking chars generated: " + Math.round(thinkToks.reduce((a,b) => a+b, 0) / thinkToks.length));
}

process.exit(0);
