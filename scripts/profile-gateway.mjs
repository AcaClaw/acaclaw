#!/usr/bin/env node
/**
 * Gateway Overhead Profiler
 *
 * Sends a chat message through the gateway and then reads the event journal
 * to produce a millisecond-level timeline of every hook that fired.
 *
 * Usage:
 *   node scripts/profile-gateway.mjs
 */

import WebSocket from "ws";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const GATEWAY_URL = "ws://localhost:2090/";
const LOG_DIR = join(homedir(), ".acaclaw", "logs");

function fmt(ms) {
  if (ms == null) return "N/A";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

async function sendChat(message) {
  const sessionKey = `agent:main:web:profile-${Date.now()}`;

  return new Promise((resolve) => {
    const ws = new WebSocket(GATEWAY_URL, {
      headers: { Origin: "http://localhost:2090" },
    });
    const timer = setTimeout(() => { ws.close(); resolve({ error: "timeout" }); }, 60000);
    let wsSendTime = null;
    let firstDeltaTime = null;

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
        wsSendTime = new Date();
        ws.send(JSON.stringify({
          type: "req", id: "s1", method: "chat.send",
          params: { sessionKey, message, idempotencyKey: `prof-${Date.now()}` },
        }));
      }

      if (msg.type === "event" && msg.event === "chat") {
        const d = msg.payload;
        if (d.state === "delta" && !firstDeltaTime) {
          firstDeltaTime = new Date();
        }
        if (d.state === "final" || d.state === "error") {
          clearTimeout(timer);
          ws.close();
          resolve({ sessionKey, wsSendTime, firstDeltaTime, finalTime: new Date() });
        }
      }
    });

    ws.on("error", (e) => { clearTimeout(timer); resolve({ error: e.message }); });
  });
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  GATEWAY OVERHEAD PROFILER                                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const RUNS = 3;

  for (let run = 0; run < RUNS; run++) {
    console.log(`\n${"─".repeat(65)}`);
    console.log(`  RUN ${run + 1} of ${RUNS}`);
    console.log(`${"─".repeat(65)}`);

    const result = await sendChat("25+36=? just answer");

    if (result.error) {
      console.error("  Error:", result.error);
      continue;
    }

    // Wait for events to flush
    await new Promise(r => setTimeout(r, 500));

    // Read the event log
    const today = new Date().toISOString().slice(0, 10);
    const logPath = join(LOG_DIR, `events-${today}.jsonl`);
    const lines = readFileSync(logPath, "utf-8").split("\n").filter(l => l.trim());
    const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    // Find events from this session
    const sessionEvents = events.filter(e =>
      e.sessionKey === result.sessionKey ||
      e.event?.startsWith("profile.") ||
      e.event === "session.start" ||
      e.event === "chat.stream_start" ||
      e.event === "chat.stream_end" ||
      e.event === "agent.end"
    );

    // Find the sequence: look for events between our session.start and agent.end
    const wsSendMs = result.wsSendTime.getTime();
    const firstDeltaMs = result.firstDeltaTime?.getTime();

    // Filter to events that happened after our wsSendTime
    const relevant = sessionEvents.filter(e => {
      const ts = new Date(e.ts).getTime();
      return ts >= wsSendMs - 100 && ts <= (firstDeltaMs || wsSendMs + 30000) + 5000;
    });

    // Sort by timestamp
    relevant.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    if (!relevant.length) {
      console.log("  No profile events found. Check if plugin loaded correctly.");
      continue;
    }

    // Print timeline
    const baseTs = wsSendMs;
    console.log(`\n  Timeline (relative to chat.send):`)
    console.log(`  ${"─".repeat(55)}`);
    console.log(`  ${"+0ms".padStart(10)}  [${"chat.send".padEnd(30)}]  WebSocket request sent`);

    for (const e of relevant) {
      const ts = new Date(e.ts).getTime();
      const delta = ts - baseTs;
      const label = e.event;
      const extra = [];
      if (e.sessionKey) extra.push(`session=${e.sessionKey.split(":").pop().slice(0, 12)}`);
      if (e.model) extra.push(`model=${e.model}`);
      if (e.durationMs) extra.push(`duration=${e.durationMs}ms`);
      if (e.agentId) extra.push(`agent=${e.agentId}`);

      console.log(`  ${("+" + fmt(delta)).padStart(10)}  [${label.padEnd(30)}]  ${extra.join(", ")}`);
    }

    if (firstDeltaMs) {
      const delta = firstDeltaMs - baseTs;
      console.log(`  ${("+" + fmt(delta)).padStart(10)}  [${"FIRST WS DELTA".padEnd(30)}]  First content from gateway`);
    }

    // Compute gaps
    console.log(`\n  Gap analysis:`);
    const sessionStart = relevant.find(e => e.event === "session.start");
    const promptBuild = relevant.find(e => e.event === "profile.before_prompt_build");
    const agentStart = relevant.find(e => e.event === "profile.before_agent_start");
    const modelResolve = relevant.find(e => e.event === "profile.before_model_resolve");
    const agentReply = relevant.find(e => e.event === "profile.before_agent_reply");
    const dispatch = relevant.find(e => e.event === "profile.before_dispatch");
    const msgReceived = relevant.find(e => e.event === "profile.message_received");
    const streamStart = relevant.find(e => e.event === "chat.stream_start");
    const agentEnd = relevant.find(e => e.event === "agent.end");
    const streamEnd = relevant.find(e => e.event === "chat.stream_end");

    const t = (e) => e ? new Date(e.ts).getTime() : null;

    const gaps = [];

    gaps.push(["WS send → session.start", wsSendMs, t(sessionStart)]);
    gaps.push(["session.start → message_received", t(sessionStart), t(msgReceived)]);
    gaps.push(["message_received → before_prompt_build", t(msgReceived), t(promptBuild)]);
    gaps.push(["before_prompt_build → before_agent_start", t(promptBuild), t(agentStart)]);
    gaps.push(["before_agent_start → before_model_resolve", t(agentStart), t(modelResolve)]);
    gaps.push(["before_model_resolve → before_agent_reply", t(modelResolve), t(agentReply)]);
    gaps.push(["before_agent_reply → before_dispatch", t(agentReply), t(dispatch)]);
    gaps.push(["before_dispatch → llm_input (stream_start)", t(dispatch), t(streamStart)]);
    gaps.push(["llm_input → FIRST WS DELTA", t(streamStart), firstDeltaMs]);
    gaps.push(["FIRST DELTA → agent.end", firstDeltaMs, t(agentEnd)]);
    gaps.push(["TOTAL: WS send → FIRST DELTA", wsSendMs, firstDeltaMs]);

    for (const [label, start, end] of gaps) {
      if (start != null && end != null) {
        const gap = end - start;
        const bar = "█".repeat(Math.max(0, Math.min(Math.round(gap / 100), 30)));
        console.log(`    ${label.padEnd(45)} ${fmt(gap).padStart(8)}  ${bar}`);
      } else {
        console.log(`    ${label.padEnd(45)} ${("(no data)").padStart(8)}`);
      }
    }
  }

  // Summary
  console.log(`\n${"═".repeat(65)}`);
  console.log("  NOTE: Events without data mean that hook is not registered or");
  console.log("  not exposed by OpenClaw for this event lifecycle.");
  console.log("  The gap between the last registered hook and llm_input / ");
  console.log("  first delta is the unaccounted gateway internal time.");
  console.log(`${"═".repeat(65)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
