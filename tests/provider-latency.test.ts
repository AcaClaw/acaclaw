/**
 * Provider API Latency Tests
 *
 * Tests each provider's API directly (bypasses gateway) using streaming completions.
 * Automatically skips providers without a configured API key.
 * These are "live" tests — they make real API calls and are NOT run in CI.
 *
 * Run:
 *   npx vitest run tests/provider-latency.test.ts
 *   OPENROUTER_API_KEY=sk-or-... npx vitest run tests/provider-latency.test.ts
 */
import { describe, it, expect } from "vitest";
import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OPENCLAW_CONFIG = join(process.env.HOME ?? "~", ".openclaw", "openclaw.json");

/** Read an API key from env or openclaw.json */
function resolveKey(envVar: string): string {
	if (process.env[envVar]) return process.env[envVar]!;
	try {
		if (existsSync(OPENCLAW_CONFIG)) {
			const cfg = JSON.parse(readFileSync(OPENCLAW_CONFIG, "utf-8"));
			return cfg?.env?.[envVar] ?? "";
		}
	} catch {}
	return "";
}

/** Call a streaming OpenAI-compatible endpoint and measure latency */
function testProviderLatency(baseUrl: string, apiKey: string, model: string): {
	ok: boolean;
	ttft_ms?: number;
	total_ms: number;
	response_preview?: string;
	error?: string;
	detail?: string;
} {
	const script = join(__dirname, "..", "scripts", "test-providers.sh");

	// Use the Python streaming test directly via the script's core function
	const result = execSync(
		`python3 -c '
import json, time, urllib.request, ssl, os

base_url = "${baseUrl}".rstrip("/")
api_key = "${apiKey}"
model = "${model}"
prompt = "Reply with exactly one word: hello"

url = base_url + "/chat/completions"
body = json.dumps({
    "model": model,
    "messages": [{"role": "user", "content": prompt}],
    "stream": True,
    "max_tokens": 64,
    "temperature": 0
}).encode()

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {api_key}"
}
req = urllib.request.Request(url, data=body, headers=headers, method="POST")
ctx = ssl.create_default_context()

t0 = time.time()
t_first = None
full_text = ""

try:
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line.startswith("data: "):
                continue
            data = line[6:]
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue
            choices = chunk.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                content = delta.get("content", "")
                if content and t_first is None:
                    t_first = time.time()
                if content:
                    full_text += content
    t_end = time.time()
    print(json.dumps({
        "ok": True,
        "ttft_ms": int((t_first - t0) * 1000) if t_first else None,
        "total_ms": int((t_end - t0) * 1000),
        "response_preview": full_text[:120].strip()
    }))
except urllib.error.HTTPError as e:
    t_end = time.time()
    error_body = ""
    try: error_body = e.read().decode("utf-8", errors="replace")[:200]
    except: pass
    print(json.dumps({
        "ok": False,
        "error": f"HTTP {e.code}",
        "detail": error_body,
        "total_ms": int((t_end - t0) * 1000)
    }))
except Exception as e:
    t_end = time.time()
    print(json.dumps({
        "ok": False,
        "error": str(e),
        "total_ms": int((t_end - t0) * 1000)
    }))
'`,
		{ encoding: "utf-8", timeout: 90_000 } as ExecSyncOptionsWithStringEncoding,
	).trim();

	return JSON.parse(result);
}

// ─── Provider Definitions ───

interface ProviderDef {
	name: string;
	envVar: string;
	baseUrl: string;
	model: string;
	/** Max acceptable TTFT in ms (raw API, no system prompt) */
	ttftThreshold: number;
	/** Max acceptable total response time in ms */
	totalThreshold: number;
}

const PROVIDERS: ProviderDef[] = [
	{
		name: "DashScope (Aliyun Bailian)",
		envVar: "MODELSTUDIO_API_KEY",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		model: "qwen-plus",
		ttftThreshold: 5_000,
		totalThreshold: 30_000,
	},
	{
		name: "OpenRouter",
		envVar: "OPENROUTER_API_KEY",
		baseUrl: "https://openrouter.ai/api/v1",
		model: "anthropic/claude-sonnet-4",
		ttftThreshold: 5_000,
		totalThreshold: 30_000,
	},
	{
		name: "Moonshot (Kimi)",
		envVar: "MOONSHOT_API_KEY",
		baseUrl: "https://api.moonshot.cn/v1",
		model: "kimi-k2.5",
		ttftThreshold: 5_000,
		totalThreshold: 30_000,
	},
];

/** Max TTFT through the gateway (includes ~15K token system prompt) */
const GATEWAY_TTFT_THRESHOLD = 5_000;
const GATEWAY_PORT = process.env.ACACLAW_PORT ?? "2090";

/**
 * Measure TTFT through the gateway WebSocket — this reflects real user experience
 * including system prompt, agent instructions, and tool definitions.
 */
function testGatewayTTFT(port: string): {
	ok: boolean;
	ttft_ms?: number;
	total_ms: number;
	delta_count?: number;
	response_preview?: string;
	error?: string;
} {
	const result = execSync(
		`node --no-warnings -e '
const WebSocket = require("ws");
const {randomUUID} = require("crypto");
const port = ${JSON.stringify(port)};
const MESSAGE = "What is 2+2? Reply with just the number.";
const SESSION_KEY = "agent:main:web:ttft-test-" + Date.now();

const t0 = Date.now();
let t_connected, t_first_delta, t_final;
let responseText = "";
let deltaCount = 0;
let targetRunId = null;

const ws = new WebSocket("ws://localhost:" + port + "/", { origin: "http://localhost:" + port });

ws.on("message", (data) => {
    const msg = JSON.parse(data);

    if (msg.type === "event" && msg.event === "connect.challenge") {
        ws.send(JSON.stringify({
            type: "req", id: randomUUID(), method: "connect",
            params: {
                minProtocol: 3, maxProtocol: 3,
                client: { id: "openclaw-control-ui", version: "ttft-test", platform: "test", mode: "ui" },
                role: "operator",
                scopes: ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"]
            }
        }));
    } else if (msg.type === "res" && !t_connected) {
        t_connected = Date.now();
        if (msg.ok === false) {
            console.log(JSON.stringify({ ok: false, error: "connect_failed", total_ms: t_connected - t0 }));
            ws.close(); process.exit(0);
        }
        ws.send(JSON.stringify({
            type: "req", id: randomUUID(), method: "chat.send",
            params: { sessionKey: SESSION_KEY, message: MESSAGE, idempotencyKey: randomUUID() }
        }));
    } else if (msg.type === "res" && t_connected && !targetRunId) {
        if (msg.ok && msg.payload && msg.payload.runId) {
            targetRunId = msg.payload.runId;
        } else {
            console.log(JSON.stringify({ ok: false, error: "chat_send_failed", total_ms: Date.now() - t0 }));
            ws.close(); process.exit(0);
        }
    } else if (msg.type === "event" && msg.event === "chat") {
        const d = msg.payload || {};
        if (d.runId !== targetRunId) return;

        if (d.state === "delta") {
            deltaCount++;
            if (!t_first_delta) t_first_delta = Date.now();
            const text = (d.message?.content || []).filter(c => c.type === "text").map(c => c.text || "").join("");
            if (text) responseText = text;
        } else if (d.state === "final") {
            t_final = Date.now();
            const text = (d.message?.content || []).filter(c => c.type === "text").map(c => c.text || "").join("");
            if (text) responseText = text;
            console.log(JSON.stringify({
                ok: true,
                ttft_ms: t_first_delta ? t_first_delta - t_connected : null,
                total_ms: t_final - t_connected,
                delta_count: deltaCount,
                response_preview: responseText.substring(0, 120)
            }));
            ws.close(); process.exit(0);
        } else if (d.state === "error") {
            t_final = Date.now();
            console.log(JSON.stringify({
                ok: false, error: d.errorMessage || "agent_error",
                ttft_ms: t_first_delta ? t_first_delta - t_connected : null,
                total_ms: t_final - t_connected
            }));
            ws.close(); process.exit(0);
        }
    }
});

ws.on("error", (e) => {
    console.log(JSON.stringify({ ok: false, error: e.message, total_ms: Date.now() - t0 }));
    process.exit(0);
});

setTimeout(() => {
    console.log(JSON.stringify({
        ok: false, error: "timeout_60s",
        ttft_ms: t_first_delta ? t_first_delta - (t_connected || t0) : null,
        total_ms: Date.now() - t0
    }));
    ws.close(); process.exit(0);
}, 60000);
'`,
		{ encoding: "utf-8", timeout: 90_000 } as ExecSyncOptionsWithStringEncoding,
	).trim();

	return JSON.parse(result);
}

// ─── Tests ───

describe("Provider Raw API Latency", () => {
	for (const provider of PROVIDERS) {
		describe(provider.name, () => {
			const apiKey = resolveKey(provider.envVar);

			it("responds to a simple prompt", { timeout: 90_000 }, () => {
				if (!apiKey) {
					console.log(`  [skip] ${provider.envVar} not set`);
					return;
				}

				const result = testProviderLatency(provider.baseUrl, apiKey, provider.model);
				console.log(`  [${provider.name}] result:`, JSON.stringify(result, null, 2));

				expect(result.ok, `API error: ${result.error} — ${result.detail}`).toBe(true);
				expect(result.response_preview).toBeTruthy();
			});

			it("raw API TTFT is within threshold", { timeout: 90_000 }, () => {
				if (!apiKey) {
					console.log(`  [skip] ${provider.envVar} not set`);
					return;
				}

				const result = testProviderLatency(provider.baseUrl, apiKey, provider.model);

				if (!result.ok) {
					console.log(`  [${provider.name}] API error, skipping TTFT check: ${result.error}`);
					return;
				}

				if (result.ttft_ms != null) {
					console.log(`  [${provider.name}] Raw API TTFT: ${result.ttft_ms}ms (threshold: ${provider.ttftThreshold}ms)`);
					expect(result.ttft_ms).toBeLessThan(provider.ttftThreshold);
				}
			});

			it("total response time is within threshold", { timeout: 90_000 }, () => {
				if (!apiKey) {
					console.log(`  [skip] ${provider.envVar} not set`);
					return;
				}

				const result = testProviderLatency(provider.baseUrl, apiKey, provider.model);

				if (!result.ok) {
					console.log(`  [${provider.name}] API error, skipping total time check: ${result.error}`);
					return;
				}

				console.log(
					`  [${provider.name}] Total: ${result.total_ms}ms (threshold: ${provider.totalThreshold}ms)`,
				);
				expect(result.total_ms).toBeLessThan(provider.totalThreshold);
			});
		});
	}
});

describe("Gateway TTFT (real user experience)", () => {
	it("TTFT through gateway is under 5s", { timeout: 90_000 }, () => {
		const result = testGatewayTTFT(GATEWAY_PORT);

		if (!result.ok) {
			console.log(`  [Gateway] Error: ${result.error}`);
			// If gateway is not running, skip rather than fail
			if (result.error?.includes("ECONNREFUSED") || result.error?.includes("connect_failed")) {
				console.log("  [skip] Gateway not running");
				return;
			}
			expect.fail(`Gateway error: ${result.error}`);
		}

		console.log(`  [Gateway] TTFT: ${result.ttft_ms}ms (threshold: ${GATEWAY_TTFT_THRESHOLD}ms)`);
		console.log(`  [Gateway] Total: ${result.total_ms}ms | Deltas: ${result.delta_count} | Response: "${result.response_preview}"`);

		if (result.ttft_ms != null) {
			expect(result.ttft_ms).toBeLessThan(GATEWAY_TTFT_THRESHOLD);
		}
	});
});
