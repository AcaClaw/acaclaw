import WebSocket from "ws";

async function measure() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let firstAny = null, firstThinking = null, firstText = null;
    let thinkChars = 0, textChars = 0;
    let deltaCount = 0;
    const contentTypes = new Set();
    const firstFewDeltas = [];
    
    const ws = new WebSocket("ws://localhost:2090/", { headers: { Origin: "http://localhost:2090" } });
    const timer = setTimeout(() => { ws.close(); resolve({ error: "timeout" }); }, 45000);
    
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      
      if (msg.type === "event" && msg.event === "connect.challenge") {
        ws.send(JSON.stringify({ type: "req", id: "c1", method: "connect", params: {
          minProtocol: 3, maxProtocol: 3,
          client: { id: "openclaw-control-ui", version: "t", platform: "t", mode: "ui" },
          role: "operator",
          scopes: ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"]
        }}));
      }
      
      if (msg.type === "res" && msg.id === "c1" && msg.ok) {
        ws.send(JSON.stringify({ type: "req", id: "s1", method: "chat.send", params: {
          sessionKey: "agent:main:web:think-dbg-" + Date.now(),
          message: "what is 2+2?",
          idempotencyKey: "tk-" + Date.now()
        }}));
      }
      
      if (msg.type === "event" && msg.event === "chat") {
        const d = msg.payload;
        if (d.state === "delta") {
          const now = performance.now() - t0;
          deltaCount++;
          if (!firstAny) firstAny = now;
          
          // Log raw content structure for first 5 deltas
          if (deltaCount <= 5) {
            const contentSummary = (d.message?.content ?? []).map(c => {
              const keys = Object.keys(c);
              const type = c.type ?? "no-type";
              const textVal = c.text?.slice(0, 30) ?? "";
              const thinkVal = c.thinking?.slice(0, 30) ?? "";
              return `{type:${type}, keys:[${keys}], text:"${textVal}", thinking:"${thinkVal}"}`;
            });
            firstFewDeltas.push({ deltaNum: deltaCount, elapsed: (now/1000).toFixed(2), content: contentSummary });
          }
          
          for (const c of (d.message?.content ?? [])) {
            contentTypes.add(c.type ?? "unknown");
            if (c.type === "thinking" || c.type === "reasoning") {
              if (!firstThinking) firstThinking = now;
              thinkChars += (c.thinking?.length ?? c.text?.length ?? 0);
            }
            if (c.type === "text") {
              if (!firstText) firstText = now;
              textChars += (c.text?.length ?? 0);
            }
          }
        }
        if (d.state === "final") {
          // Check final message content types
          const finalTypes = (d.message?.content ?? []).map(c => c.type);
          const finalThink = (d.message?.content ?? []).filter(c => c.type === "thinking").map(c => c.thinking?.length ?? 0);
          const usage = d.message?.usage;
          
          clearTimeout(timer); ws.close();
          resolve({
            firstAny, firstThinking, firstText,
            thinkChars, textChars, deltaCount,
            contentTypes: [...contentTypes],
            firstFewDeltas,
            finalTypes,
            finalThinkLens: finalThink,
            usage,
            total: performance.now() - t0
          });
        }
        if (d.state === "error") {
          clearTimeout(timer); ws.close();
          resolve({ error: d.errorMessage });
        }
      }
    });
    ws.on("error", (e) => { clearTimeout(timer); resolve({ error: e.message }); });
  });
}

function fmt(ms) { return ms == null ? "N/A" : (ms/1000).toFixed(2) + "s"; }

console.log("=== DETAILED THINKING ANALYSIS ===\n");
const r = await measure();

if (r.error) { console.log("ERROR:", r.error); process.exit(1); }

console.log("First ANY token:      " + fmt(r.firstAny));
console.log("First THINKING token: " + fmt(r.firstThinking));
console.log("First TEXT token:     " + fmt(r.firstText));
console.log("Think→Text gap:       " + (r.firstText && r.firstThinking ? fmt(r.firstText - r.firstThinking) : "N/A (no thinking deltas)"));
console.log("Thinking chars (stream): " + r.thinkChars);
console.log("Text chars (stream):     " + r.textChars);
console.log("Delta count:          " + r.deltaCount);
console.log("Content types seen:   " + JSON.stringify(r.contentTypes));
console.log("Total:                " + fmt(r.total));

console.log("\n=== FIRST 5 DELTAS (raw content) ===");
for (const d of r.firstFewDeltas) {
  console.log(`  Delta #${d.deltaNum} @ ${d.elapsed}s:`);
  for (const c of d.content) console.log("    " + c);
}

console.log("\n=== FINAL MESSAGE ===");
console.log("Content types:", JSON.stringify(r.finalTypes));
console.log("Thinking block lengths:", JSON.stringify(r.finalThinkLens));
console.log("Usage:", JSON.stringify(r.usage));

process.exit(0);
