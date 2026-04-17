#!/usr/bin/env node
/**
 * Captures the raw LLM input for a single chat turn by acting as a transparent
 * HTTPS proxy between OpenClaw and DashScope. Sends one message through the
 * gateway, intercepts the outgoing API request, and dumps the full messages
 * array and token count.
 *
 * Alternative approach: Subscribe to the llm_input event via plugin to get
 * the full prompt. But that requires modifying the acaclaw-logger plugin.
 *
 * Usage:
 *   node scripts/dump-llm-input.mjs
 *   node scripts/dump-llm-input.mjs --prompt "what is DNA?"
 *   node scripts/dump-llm-input.mjs --output /tmp/llm-input.json
 */

import WebSocket from "ws";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");
const SESSION_DIR = join(homedir(), ".openclaw", "agents", "main", "sessions");

const args = process.argv.slice(2);
const promptIdx = args.indexOf("--prompt");
const prompt = promptIdx >= 0 ? args[promptIdx + 1] : "what is 2+2?";
const outputIdx = args.indexOf("--output");
const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;

// ── Approach: Send a message, then read the session JSONL which contains
//    the full message history. Combined with the system prompt from
//    before_prompt_build hooks, this gives us the full context.
//    
//    For the ACTUAL raw API request (system prompt + messages + tools),
//    we need to either:
//    1. Read it from the session JSONL (partial — no system prompt)  
//    2. Use OpenClaw's llm_input hook (needs plugin change)
//    3. Use mitmproxy to intercept HTTPS (complex)
//
//    This script takes approach (1) + estimates prompt from token count.

async function main() {
  console.log("=== RAW LLM INPUT CAPTURE ===\n");
  console.log(`Prompt: "${prompt}"`);

  // Send a message through the gateway
  const sessionKey = "agent:main:web:dump-" + Date.now();
  
  const result = await new Promise((resolve) => {
    const ws = new WebSocket("ws://localhost:2090/", {
      headers: { Origin: "http://localhost:2090" }
    });
    const timer = setTimeout(() => { ws.close(); resolve({ error: "timeout" }); }, 60000);

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "event" && msg.event === "connect.challenge") {
        ws.send(JSON.stringify({
          type: "req", id: "c1", method: "connect",
          params: {
            minProtocol: 3, maxProtocol: 3,
            client: { id: "openclaw-control-ui", version: "t", platform: "t", mode: "ui" },
            role: "operator",
            scopes: ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"]
          }
        }));
      }

      if (msg.type === "res" && msg.id === "c1" && msg.ok) {
        ws.send(JSON.stringify({
          type: "req", id: "s1", method: "chat.send",
          params: {
            sessionKey,
            message: prompt,
            idempotencyKey: "dump-" + Date.now()
          }
        }));
      }

      if (msg.type === "event" && msg.event === "chat") {
        const d = msg.payload;
        if (d.state === "final" || d.state === "error") {
          clearTimeout(timer);
          ws.close();
          resolve({ sessionKey, final: d });
        }
      }
    });
    ws.on("error", (e) => { clearTimeout(timer); resolve({ error: e.message }); });
  });

  if (result.error) {
    console.error("Error:", result.error);
    process.exit(1);
  }

  // Wait a moment for JSONL to be flushed
  await new Promise(r => setTimeout(r, 500));

  // Find the session JSONL
  const sessionId = result.sessionKey.split(":").pop();
  console.log(`\nSession key: ${result.sessionKey}`);
  
  // The session file name is a UUID, not the session key suffix
  // Find the most recent JSONL file
  const files = require("fs").readdirSync(SESSION_DIR)
    .filter(f => f.endsWith(".jsonl"))
    .map(f => ({ name: f, mtime: require("fs").statSync(join(SESSION_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (!files.length) {
    console.error("No session files found");
    process.exit(1);
  }

  // Read the newest file (our just-created session)
  const sessionFile = join(SESSION_DIR, files[0].name);
  console.log(`Session file: ${files[0].name}`);

  const lines = readFileSync(sessionFile, "utf8").split("\n").filter(l => l.trim());
  const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  console.log(`\n${"─".repeat(70)}`);
  console.log("SESSION JSONL CONTENTS:");
  console.log(`${"─".repeat(70)}\n`);

  for (const entry of entries) {
    if (entry.type === "session") {
      console.log(`[session] id=${entry.id} version=${entry.version}`);
    } else if (entry.type === "model_change") {
      console.log(`[model] provider=${entry.provider} model=${entry.modelId}`);
    } else if (entry.type === "thinking_level_change") {
      console.log(`[thinking] level=${entry.thinkingLevel}`);
    } else if (entry.type === "custom") {
      console.log(`[custom] type=${entry.customType} data=${JSON.stringify(entry.data).slice(0, 200)}`);
    } else if (entry.type === "message") {
      const msg = entry.message;
      console.log(`[message] role=${msg.role}`);
      
      if (msg.role === "user") {
        console.log(`  content: ${JSON.stringify(msg.content).slice(0, 500)}`);
      }
      
      if (msg.role === "assistant") {
        // Content breakdown
        if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c.type === "thinking") {
              console.log(`  [thinking] ${c.thinking?.length ?? 0} chars`);
              if (c.thinking) console.log(`    "${c.thinking.slice(0, 200)}..."`);
            } else if (c.type === "text") {
              console.log(`  [text] ${c.text?.length ?? 0} chars`);
              if (c.text) console.log(`    "${c.text.slice(0, 200)}..."`);
            } else if (c.type === "toolCall") {
              console.log(`  [toolCall] tool=${c.toolName}`);
            }
          }
        } else {
          console.log(`  content: ${JSON.stringify(msg.content).slice(0, 500)}`);
        }
        
        // Usage (this is the key data)
        if (msg.usage) {
          console.log(`\n  ┌─ TOKEN USAGE ─────────────────────────────────┐`);
          console.log(`  │ Input tokens:      ${String(msg.usage.input).padStart(8)}                │`);
          console.log(`  │ Output tokens:     ${String(msg.usage.output).padStart(8)}                │`);
          console.log(`  │ Cache read:        ${String(msg.usage.cacheRead ?? 0).padStart(8)}                │`);
          console.log(`  │ Cache write:       ${String(msg.usage.cacheWrite ?? 0).padStart(8)}                │`);
          console.log(`  │ Total tokens:      ${String(msg.usage.totalTokens).padStart(8)}                │`);
          console.log(`  └───────────────────────────────────────────────┘`);
          
          const outputToks = msg.usage.output;
          const inputToks = msg.usage.input;
          
          // Estimate prompt components
          console.log(`\n  ESTIMATED PROMPT BREAKDOWN:`);
          console.log(`    User message:     ~${Math.ceil(prompt.length / 4)} tokens`);
          console.log(`    System prompt:    ~${inputToks - Math.ceil(prompt.length / 4)} tokens (everything else)`);
          console.log(`    Output (total):   ${outputToks} tokens`);
          
          // Count thinking vs text in output
          if (Array.isArray(msg.content)) {
            const thinkChars = msg.content.filter(c => c.type === "thinking").reduce((s, c) => s + (c.thinking?.length ?? 0), 0);
            const textChars = msg.content.filter(c => c.type === "text").reduce((s, c) => s + (c.text?.length ?? 0), 0);
            const thinkToks = Math.ceil(thinkChars / 4);
            const textToks = Math.ceil(textChars / 4);
            console.log(`    Output thinking:  ~${thinkToks} tokens (${thinkChars} chars)`);
            console.log(`    Output text:      ~${textToks} tokens (${textChars} chars)`);
          }
        }
      }
    }
  }

  // NOTE about what's missing
  console.log(`\n${"─".repeat(70)}`);
  console.log("NOTE: The session JSONL does NOT contain the raw system prompt.");
  console.log("The system prompt is assembled at runtime by OpenClaw's agent runner");
  console.log("from: tool schemas + system rules + SOUL.md + workspace context + env.");
  console.log("");
  console.log("To capture the FULL raw API request (all messages incl. system prompt),");
  console.log("you need one of:");
  console.log("  1. Modify acaclaw-logger to log event.messages from llm_input hook");
  console.log("  2. Use mitmproxy to intercept HTTPS to dashscope.aliyuncs.com");
  console.log("  3. Set OPENCLAW_LOG_LEVEL=debug (if supported)");
  console.log(`${"─".repeat(70)}\n`);

  if (outputPath) {
    const output = { sessionKey: result.sessionKey, entries, file: files[0].name };
    writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Full data saved to: ${outputPath}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
