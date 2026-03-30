const WebSocket = require("ws");
const ws = new WebSocket("ws://localhost:2090/", { headers: { Origin: "http://localhost:2090" } });
let step = 0;
let savedConfig = null;
let savedHash = null;

ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  console.log("step:", step, "type:", m.type, "id:", m.id, "event:", m.event, "ok:", m.ok);
  if (step === 0 && m.event === "connect.challenge") {
    step = 1;
    ws.send(JSON.stringify({ type: "req", id: "c1", method: "connect", params: { minProtocol: 3, maxProtocol: 3, client: { id: "openclaw-control-ui", version: "1.0", platform: "linux", mode: "ui" }, role: "operator", scopes: ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"] } }));
    return;
  }
  if (step === 1 && m.id === "c1") {
    if (!m.ok) {
      console.log("CONNECT FAILED:", JSON.stringify(m.error));
      ws.close();
      return;
    }
    step = 2;
    ws.send(JSON.stringify({ type: "req", id: "c2", method: "config.get", params: {} }));
    return;
  }
  if (step === 2 && m.id === "c2") {
    step = 3;
    const p = m.payload;
    savedHash = p.hash;
    savedConfig = p.config;
    console.log("Got config, hash:", savedHash);
    console.log("Config auth.profiles:", JSON.stringify(savedConfig?.auth?.profiles));
    
    // Try config.set with the same config (no changes, just test roundtrip)
    const config = JSON.parse(JSON.stringify(savedConfig));
    // Add a test models.providers entry
    if (!config.models) config.models = {};
    if (!config.models.providers) config.models.providers = {};
    config.models.providers.openrouter = { apiKey: "test-key-123" };
    
    console.log("Sending config.set with raw JSON...");
    ws.send(JSON.stringify({ type: "req", id: "c3", method: "config.set", params: { raw: JSON.stringify(config, null, 2), baseHash: savedHash } }));
    return;
  }
  if (step === 3 && m.id === "c3") {
    console.log("config.set response:", JSON.stringify(m, null, 2).slice(0, 1000));
    ws.close();
  }
});
ws.on("close", () => process.exit(0));
ws.on("error", (e) => { console.error("ERR:", e.message); process.exit(1); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 10000);
