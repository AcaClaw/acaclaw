#!/usr/bin/env node
const { randomUUID } = require("node:crypto");
const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:2090/", { origin: "http://localhost:2090" });
let thinkingEvents = 0, textEvents = 0, finalReceived = false;
let firstThinkingAt = 0, firstTextAt = 0;
let connected = false, targetRunId = null;

ws.on("open", () => console.log("[ws] connected"));
ws.on("error", (err) => console.error("[ws error]", err.message));

ws.on("message", (data) => {
  const msg = JSON.parse(data);

  // Step 1: respond to challenge
  if (msg.type === "event" && msg.event === "connect.challenge") {
    ws.send(JSON.stringify({
      type: "req", id: randomUUID(), method: "connect",
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: "openclaw-control-ui", version: "1.0", platform: "darwin", mode: "ui" },
        role: "operator",
        scopes: ["operator.admin", "operator.read", "operator.write"]
      }
    }));
    return;
  }

  // Step 2: connect response -> send chat
  if (msg.type === "res" && !connected) {
    connected = true;
    if (msg.ok === false) {
      console.error("[connect failed]", msg.error || msg.payload);
      ws.close();
      return;
    }
    console.log("[connected] sending chat...");
    ws.send(JSON.stringify({
      type: "req", id: randomUUID(), method: "chat.send",
      params: {
        sessionKey: "thinking-stream-test-" + Date.now(),
        message: "25+36=? just answer",
        idempotencyKey: randomUUID()
      }
    }));
    return;
  }

  // Step 3: chat.send ack
  if (msg.type === "res" && connected && !targetRunId) {
    if (msg.ok && msg.payload && msg.payload.runId) {
      targetRunId = msg.payload.runId;
      console.log("[chat ack] runId:", targetRunId);
    } else {
      console.error("[chat.send failed]", msg.error || msg.payload);
      ws.close();
    }
    return;
  }

  // Step 4: events (chat deltas/finals)
  if (msg.type === "event" && msg.event === "chat") {
    const p = msg.payload;
    if (p.runId !== targetRunId) return;

    if (p.state === "delta" && p.message && p.message.content) {
      for (const c of p.message.content) {
        if (c.type === "thinking") {
          thinkingEvents++;
          if (thinkingEvents === 1) {
            firstThinkingAt = Date.now();
            console.log("[THINKING #1]", c.text.substring(0, 120) + "...");
          } else if (thinkingEvents % 5 === 0) {
            console.log("[THINKING #" + thinkingEvents + "] len=" + c.text.length);
          }
        }
        if (c.type === "text") {
          textEvents++;
          if (textEvents === 1) {
            firstTextAt = Date.now();
            console.log("[TEXT #1]", c.text.substring(0, 120));
          }
        }
      }
    }

    if (p.state === "final") {
      finalReceived = true;
      console.log("[final]");
      console.log("---");
      console.log("Thinking delta events:", thinkingEvents);
      console.log("Text delta events:", textEvents);
      if (firstThinkingAt && firstTextAt) {
        console.log("First thinking -> first text gap:", (firstTextAt - firstThinkingAt) + "ms");
        console.log("Thinking arrived BEFORE text:", firstThinkingAt < firstTextAt);
      } else if (thinkingEvents === 0) {
        console.log("WARNING: No thinking events received");
      }
      ws.close();
    }

    if (p.state === "error") {
      console.log("[error]", p.errorMessage);
      ws.close();
    }
  }
});

setTimeout(() => {
  if (finalReceived) return;
  console.log("TIMEOUT after 30s");
  console.log("Thinking events so far:", thinkingEvents);
  console.log("Text events so far:", textEvents);
  ws.close();
}, 30000);
