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
	/** Max acceptable TTFT in ms */
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
		ttftThreshold: 10_000,
		totalThreshold: 30_000,
	},
	{
		name: "OpenRouter",
		envVar: "OPENROUTER_API_KEY",
		baseUrl: "https://openrouter.ai/api/v1",
		model: "anthropic/claude-sonnet-4",
		ttftThreshold: 10_000,
		totalThreshold: 30_000,
	},
	{
		name: "Moonshot (Kimi)",
		envVar: "MOONSHOT_API_KEY",
		baseUrl: "https://api.moonshot.cn/v1",
		model: "kimi-k2.5",
		ttftThreshold: 10_000,
		totalThreshold: 30_000,
	},
];

// ─── Tests ───

describe("Provider API Latency", () => {
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

			it("TTFT is within threshold", { timeout: 90_000 }, () => {
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
					console.log(`  [${provider.name}] TTFT: ${result.ttft_ms}ms (threshold: ${provider.ttftThreshold}ms)`);
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
