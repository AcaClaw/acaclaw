/**
 * Live integration test: send a real query to the gateway, track tool calls,
 * measure latency, and report results.
 *
 * Usage: node scripts/test-tool-display.mjs
 */
import WebSocket from "ws";

const QUERY = "search aptamer drugs in recent 5 years and write a report in word";
const TIMEOUT_MS = 60_000; // 1 min for diagnostic run
const SESSION_KEY = `agent:main:web:test-tool-${Date.now()}`;

const ws = new WebSocket("ws://localhost:2090/", {
  headers: { Origin: "http://localhost:2090" },
});

let authenticated = false;
let runId = null;
const toolEvents = []; // { toolCallId, toolName, input, startMs, endMs, state, outputLen }
const t0 = performance.now();
let firstToolMs = null;
let firstDeltaMs = null;
let finalMs = null;
let finalText = "";
let totalSearchResults = 0;

function elapsed() {
  return ((performance.now() - t0) / 1000).toFixed(2) + "s";
}

function report() {
  console.log("\n" + "=".repeat(60));
  console.log("  TOOL DISPLAY TEST REPORT");
  console.log("=".repeat(60));
  console.log(`  Query: "${QUERY}"`);
  console.log(`  Session: ${SESSION_KEY}`);
  console.log("");

  // Timing
  console.log("  TIMING");
  console.log(`  ├─ First tool triggered:  ${firstToolMs ? (firstToolMs / 1000).toFixed(2) + "s" : "N/A"}`);
  console.log(`  ├─ First text delta:      ${firstDeltaMs ? (firstDeltaMs / 1000).toFixed(2) + "s" : "N/A"}`);
  console.log(`  └─ Total completion:      ${finalMs ? (finalMs / 1000).toFixed(2) + "s" : "N/A"}`);
  console.log("");

  // Tool calls
  console.log(`  TOOL CALLS (${toolEvents.length} total)`);
  const grouped = {};
  for (const t of toolEvents) {
    if (!grouped[t.toolName]) grouped[t.toolName] = [];
    grouped[t.toolName].push(t);
  }
  for (const [name, calls] of Object.entries(grouped)) {
    console.log(`  ├─ ${name}: ${calls.length} call(s)`);
    for (const c of calls) {
      const dur = c.endMs ? ((c.endMs - c.startMs) / 1000).toFixed(2) + "s" : "running...";
      const inputSummary = c.input
        ? JSON.stringify(c.input).slice(0, 80)
        : "?";
      console.log(`  │  └─ ${dur} | output: ${c.outputLen ?? 0} chars | ${inputSummary}`);
    }
  }
  console.log("");

  // Search results
  console.log(`  PAPERS / SEARCH RESULTS`);
  console.log(`  └─ Total search result entries parsed: ${totalSearchResults}`);
  console.log("");

  // Final answer length
  console.log(`  FINAL ANSWER`);
  console.log(`  └─ Length: ${finalText.length} chars`);
  console.log("=".repeat(60));
}

ws.on("open", () => {});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  // Connect challenge
  if (msg.type === "event" && msg.event === "connect.challenge") {
    ws.send(
      JSON.stringify({
        type: "req",
        id: "c1",
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: { id: "openclaw-control-ui", version: "acaclaw-test", platform: "test", mode: "ui" },
          role: "operator",
          scopes: ["operator.admin", "operator.read", "operator.write", "operator.approvals", "operator.pairing"],
        },
      })
    );
    return;
  }

  // Connect response
  if (msg.type === "res" && msg.id === "c1") {
    if (!msg.ok) {
      console.error("Connect failed:", msg.error);
      process.exit(1);
    }
    authenticated = true;
    console.log(`[${elapsed()}] Connected. Sending query: "${QUERY}"`);
    ws.send(
      JSON.stringify({
        type: "req",
        id: "s1",
        method: "chat.send",
        params: {
          sessionKey: SESSION_KEY,
          message: QUERY,
          idempotencyKey: `test-${Date.now()}`,
        },
      })
    );
    return;
  }

  // chat.send response
  if (msg.type === "res" && msg.id === "s1") {
    if (!msg.ok) {
      console.error("chat.send failed:", msg.error);
      process.exit(1);
    }
    runId = msg.payload?.runId;
    console.log(`[${elapsed()}] Run started: ${runId}`);
    console.log(`[${elapsed()}] chat.send payload keys:`, JSON.stringify(msg.payload).slice(0, 300));
    return;
  }

  // session.tool event
  if (msg.type === "event" && msg.event === "session.tool") {
    const d = msg.payload;
    if (d.runId !== runId) return;

    const now = performance.now() - t0;
    if (d.state === "running") {
      if (firstToolMs === null) firstToolMs = now;
      const entry = {
        toolCallId: d.toolCallId,
        toolName: d.toolName,
        input: d.input,
        startMs: now,
        endMs: null,
        state: "running",
        outputLen: null,
      };
      toolEvents.push(entry);
      console.log(`[${elapsed()}] ⚡ ${d.toolName} started | ${JSON.stringify(d.input ?? {}).slice(0, 100)}`);
    } else if (d.state === "done" || d.state === "error") {
      const entry = toolEvents.find((t) => t.toolCallId === d.toolCallId);
      if (entry) {
        entry.endMs = now;
        entry.state = d.state;
        entry.outputLen = d.output?.length ?? 0;
      }
      // Try to count search results from output
      if (d.toolName === "web_search" && d.output) {
        try {
          const parsed = JSON.parse(d.output);
          const count = parsed.count ?? parsed.results?.length ?? 0;
          totalSearchResults += count;
        } catch {
          // Count occurrences of "title" as rough proxy
          const titleMatches = d.output.match(/"title"/g);
          if (titleMatches) totalSearchResults += titleMatches.length;
        }
      }
      const dur = entry ? ((now - entry.startMs) / 1000).toFixed(2) : "?";
      console.log(`[${elapsed()}] ✓ ${d.toolName} ${d.state} (${dur}s) | output: ${d.output?.length ?? 0} chars`);
    }
    return;
  }

  // Log ALL events for diagnostics
  if (msg.type === "event") {
    const evName = msg.event;
    const payload = msg.payload;
    if (evName !== "connect.challenge") {
      const payloadRunId = payload?.runId ?? "no-runId";
      const payloadState = payload?.state ?? "no-state";
      // Log any event (except heartbeat/ping) to understand event flow 
      if (evName === "chat" || evName === "session.tool") {
        console.log(`[${elapsed()}] EVENT ${evName} | runId=${payloadRunId} | state=${payloadState} | our runId=${runId}`);
      }
    }
  }

  // chat event
  if (msg.type === "event" && msg.event === "chat") {
    const d = msg.payload;
    if (d.runId !== runId) return;

    if (d.state === "delta") {
      if (firstDeltaMs === null) {
        const now = performance.now() - t0;
        firstDeltaMs = now;
        console.log(`[${elapsed()}] First text delta received`);
      }
      // Accumulate text and track toolCall content types
      if (d.message?.content) {
        for (const c of d.message.content) {
          if (c.type === "text" && c.text) {
            finalText = c.text;
          }
          if (c.type === "toolCall") {
            console.log(`[${elapsed()}] ⚡ toolCall in delta: ${c.name} | id=${c.id}`);
            if (firstToolMs === null) firstToolMs = performance.now() - t0;
            const existing = toolEvents.find((t) => t.toolCallId === c.id);
            if (!existing) {
              toolEvents.push({
                toolCallId: c.id,
                toolName: c.name,
                input: c.arguments,
                startMs: performance.now() - t0,
                endMs: null,
                state: "running",
                outputLen: null,
              });
            }
          }
        }
      }
    } else if (d.state === "final") {
      finalMs = performance.now() - t0;
      // Dump the full final payload for debugging
      console.log(`[${elapsed()}] FINAL payload (first 2000 chars):`, JSON.stringify(d).slice(0, 2000));
      if (d.message?.content) {
        for (const c of d.message.content) {
          if (c.type === "text" && c.text) {
            finalText = c.text;
          }
          // Also extract toolCalls from final event
          if (c.type === "toolCall") {
            console.log(`[${elapsed()}] ⚡ toolCall in final: ${c.name} | id=${c.id}`);
            if (firstToolMs === null) firstToolMs = performance.now() - t0;
            const existing = toolEvents.find((t) => t.toolCallId === c.id);
            if (!existing) {
              toolEvents.push({
                toolCallId: c.id,
                toolName: c.name,
                input: c.arguments,
                startMs: performance.now() - t0,
                endMs: null,
                state: "running",
                outputLen: null,
              });
            }
          }
        }
      }
      // Check if this is a tool-use stop (model wants to call tools)
      // vs a real stop (model finished answering)
      const stopReason = d.message?.stopReason ?? d.stopReason;
      if (stopReason === "toolUse" || stopReason === "tool_calls") {
        console.log(`[${elapsed()}] Final (stopReason: ${stopReason}) — waiting for tool results + next turn...`);
        // Don't exit — tools are about to run, then model will continue
      } else {
        console.log(`[${elapsed()}] Final response received (stopReason: ${stopReason})`);
        report();
        ws.close();
        process.exit(0);
      }
    } else if (d.state === "error") {
      console.error(`[${elapsed()}] ERROR: ${d.errorMessage}`);
      finalMs = performance.now() - t0;
      report();
      ws.close();
      process.exit(1);
    }
  }
});

ws.on("error", (e) => {
  console.error("WebSocket error:", e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error(`\n[TIMEOUT] ${TIMEOUT_MS / 1000}s exceeded — dumping partial report`);
  finalMs = performance.now() - t0;
  report();
  ws.close();
  process.exit(1);
}, TIMEOUT_MS);
