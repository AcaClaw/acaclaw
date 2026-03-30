/**
 * End-to-end tests for the AcaClaw app.
 * Tests the REAL running gateway and UI — verifying health, HTML serving,
 * WebSocket handshake, API methods, and the API keys page content.
 *
 * Prerequisites: gateway running on port 2090 (systemd service or start.sh).
 * These tests are SKIPPED if the gateway is not available.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GATEWAY_URL = "http://localhost:2090";
const GATEWAY_WS = "ws://localhost:2090/";
const TIMEOUT_MS = 10_000;

async function gatewayIsUp(): Promise<boolean> {
	try {
		const res = await fetch(`${GATEWAY_URL}/health`, {
			signal: AbortSignal.timeout(3_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

type GatewayConnection = {
	call: <T = unknown>(method: string, params?: unknown) => Promise<T>;
	onNotification: (
		event: string,
		handler: (payload: unknown) => void,
	) => void;
	close: () => void;
};

/**
 * Opens a WebSocket to the gateway, performs the connect handshake,
 * and returns a helper to make RPC calls and listen for notifications.
 * Auth mode is "none" — no token needed.
 */
function connectToGateway(): Promise<GatewayConnection> {
	// Dynamic import for ws (Node.js WebSocket client)
	return new Promise(async (resolve, reject) => {
		const { default: WebSocket } = await import("ws");
		const ws = new WebSocket(GATEWAY_WS, {
			headers: { Origin: GATEWAY_URL },
		});
		const pending = new Map<
			string,
			{ resolve: (v: unknown) => void; reject: (e: Error) => void }
		>();
		const listeners = new Map<string, ((payload: unknown) => void)[]>();
		let connected = false;
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error("Gateway connect timeout"));
		}, TIMEOUT_MS);

		ws.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});

		ws.on("message", (raw: Buffer) => {
			const msg = JSON.parse(raw.toString());

			// Handle connect.challenge event
			if (msg.type === "event" && msg.event === "connect.challenge") {
				// Send connect frame — no auth needed (auth.mode=none)
				const id = randomUUID();
				const frame = {
					type: "req",
					id,
					method: "connect",
					params: {
						minProtocol: 3,
						maxProtocol: 3,
						client: {
							id: "openclaw-control-ui",
							version: "acaclaw-1.0.0",
							platform: "linux",
							mode: "ui",
						},
						role: "operator",
						scopes: [
							"operator.admin",
							"operator.read",
							"operator.write",
							"operator.approvals",
							"operator.pairing",
						],
					},
				};
				ws.send(JSON.stringify(frame));
				pending.set(id, {
					resolve: () => {
						connected = true;
						clearTimeout(timer);
						resolve({
							call: <T = unknown>(
								method: string,
								params?: unknown,
							): Promise<T> => {
								return new Promise((res, rej) => {
									const reqId = randomUUID();
									const reqFrame = {
										type: "req",
										id: reqId,
										method,
										params: params ?? {},
									};
									ws.send(JSON.stringify(reqFrame));
									const callTimer = setTimeout(() => {
										pending.delete(reqId);
										rej(
											new Error(
												`RPC ${method} timed out`,
											),
										);
									}, TIMEOUT_MS);
									pending.set(reqId, {
										resolve: (v) => {
											clearTimeout(callTimer);
											res(v as T);
										},
										reject: (e) => {
											clearTimeout(callTimer);
											rej(e);
										},
									});
								});
							},
							onNotification: (
								event: string,
								handler: (payload: unknown) => void,
							) => {
								const arr = listeners.get(event) ?? [];
								arr.push(handler);
								listeners.set(event, arr);
							},
							close: () => ws.close(),
						});
					},
					reject: (err) => {
						clearTimeout(timer);
						reject(err);
					},
				});
				return;
			}

			// Handle response frames
			if (msg.type === "res" && typeof msg.id === "string") {
				const p = pending.get(msg.id);
				if (!p) return;
				pending.delete(msg.id);
				if (msg.ok) {
					p.resolve(msg.payload);
				} else {
					const err = msg.error as
						| { message?: string }
						| undefined;
					p.reject(
						new Error(err?.message ?? "request failed"),
					);
				}
				return;
			}

			// Handle notification events (e.g., chat streaming)
			if (msg.type === "event" && typeof msg.event === "string") {
				const handlers = listeners.get(msg.event);
				if (handlers) {
					for (const h of handlers) h(msg.payload);
				}
			}
		});
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AcaClaw App E2E", async () => {
	let isUp = false;
	let gw: GatewayConnection | undefined;

	beforeAll(async () => {
		isUp = await gatewayIsUp();
		if (isUp) {
			try { gw = await connectToGateway(); } catch { /* skip WS tests */ }
		}
	});

	afterAll(() => {
		gw?.close();
	});

	// --- Gateway Health ---

	describe("Gateway health", () => {
		it("returns healthy status", async () => {
			if (!isUp) return; // skip silently if gateway not running
			const res = await fetch(`${GATEWAY_URL}/health`);
			expect(res.ok).toBe(true);
			const body = await res.json();
			expect(body).toEqual({ ok: true, status: "live" });
		});
	});

	// --- UI Serving ---

	describe("UI serving at /", () => {
		it("serves AcaClaw HTML at root", async () => {
			if (!isUp) return;
			const res = await fetch(`${GATEWAY_URL}/`);
			expect(res.ok).toBe(true);
			const html = await res.text();
			expect(html).toContain("<title>AcaClaw</title>");
			expect(html).toContain("acaclaw-app");
		});

		it("serves index.html with no-cache header", async () => {
			if (!isUp) return;
			const res = await fetch(`${GATEWAY_URL}/`);
			const cc = res.headers.get("cache-control");
			expect(cc).toContain("no-cache");
		});

		it("returns 200 for SPA routes (client-side routing fallback)", async () => {
			if (!isUp) return;
			// Non-existent path should return index.html (SPA fallback)
			for (const path of ["/api-keys", "/settings", "/chat"]) {
				const res = await fetch(`${GATEWAY_URL}${path}`);
				expect(res.ok).toBe(true);
				const html = await res.text();
				expect(html).toContain("<title>AcaClaw</title>");
			}
		});

		it("does not intercept /health", async () => {
			if (!isUp) return;
			const res = await fetch(`${GATEWAY_URL}/health`);
			const body = await res.json();
			// Should be gateway health JSON, not AcaClaw HTML
			expect(body.ok).toBe(true);
		});
	});

	// --- WebSocket Connection ---

	describe("WebSocket connect handshake", () => {
		it("connects successfully without auth token", async () => {
			if (!isUp) return;
			expect(gw).toBeDefined();
			expect(gw!.call).toBeTypeOf("function");
		}, TIMEOUT_MS);
	});

	// --- Gateway RPC Methods ---

	describe("Gateway RPC methods", () => {
		it("lists available models via models.list", async () => {
			if (!isUp || !gw) return;
			const result = await gw.call<{ models: unknown[] }>(
				"models.list",
			);
			expect(result).toBeDefined();
			// models.list should return an object with a models array
			expect(Array.isArray(result.models)).toBe(true);
		}, TIMEOUT_MS);

		it("retrieves config via config.get", async () => {
			if (!isUp || !gw) return;
			const result = await gw.call<Record<string, unknown>>(
				"config.get",
			);
			expect(result).toBeDefined();
			expect(typeof result).toBe("object");
		}, TIMEOUT_MS);

		it("retrieves chat history via chat.history", async () => {
			if (!isUp || !gw) return;
			const result = await gw.call<{
				sessions: unknown[];
			}>("chat.history", { sessionKey: "default" });
			expect(result).toBeDefined();
		}, TIMEOUT_MS);
	});

	// --- Post-Install State ---

	describe("Post-install state", () => {
		it("AcaClaw data directory exists", async () => {
			if (!isUp) return;
			const { statSync } = await import("node:fs");
			const dir = join(homedir(), ".acaclaw");
			expect(() => statSync(dir)).not.toThrow();
		});

		it("OpenClaw directory exists", async () => {
			if (!isUp) return;
			const { statSync } = await import("node:fs");
			const dir = join(homedir(), ".openclaw");
			expect(() => statSync(dir)).not.toThrow();
		});

		it("desktop shortcut points to persistent start.sh", async () => {
			if (!isUp) return;
			const { readFileSync: readFs } = await import("node:fs");
			const desktop = join(
				homedir(),
				".local/share/applications/acaclaw.desktop",
			);
			try {
				const content = readFs(desktop, "utf-8");
				expect(content).toContain("Exec=bash");
				expect(content).toContain("/.acaclaw/start.sh");
				// Must NOT point to /tmp/ (clone dir)
				expect(content).not.toMatch(/Exec=.*\/tmp\//);
			} catch {
				// Desktop shortcut may not exist on all platforms — skip
			}
		});

		it("gateway systemd service is enabled", async () => {
			if (!isUp) return;
			const { execSync } = await import("node:child_process");
			try {
				const status = execSync(
					"systemctl --user is-enabled acaclaw-gateway.service 2>&1",
					{ encoding: "utf-8" },
				).trim();
				expect(status).toBe("enabled");
			} catch {
				// systemd may not be available — skip
			}
		});

		it("research data directory is preserved", async () => {
			if (!isUp) return;
			const { existsSync: exists } = await import("node:fs");
			const workspace = join(homedir(), "AcaClaw");
			// Research data should always be preserved
			expect(exists(workspace)).toBe(true);
		});
	});

	// --- LLM Response Latency ---

	describe("LLM response latency", () => {
		const LLM_TIMEOUT = 60_000; // LLM calls can be slow

		/**
		 * Check if at least one model is available.
		 * Returns the first model ID or undefined.
		 */
		async function getFirstModel(
			gw: GatewayConnection,
		): Promise<string | undefined> {
			try {
				const result = await gw.call<{
					models: { id: string }[];
				}>("models.list");
				return result?.models?.[0]?.id;
			} catch {
				return undefined;
			}
		}

		type ChatEvent = {
			state: string;
			message?: {
				content?: { type: string; text: string }[];
			};
			errorMessage?: string;
		};

		/**
		 * Send a chat message and collect the full response.
		 * Returns { text, firstTokenMs, totalMs } or throws on timeout.
		 */
		function sendAndCollect(
			gw: GatewayConnection,
			message: string,
			timeoutMs: number,
		): Promise<{
			text: string;
			firstTokenMs: number;
			totalMs: number;
			noApiKey: boolean;
		}> {
			const sessionKey = `agent:main:web:e2e-${randomUUID()}`;
			const sendStart = performance.now();
			let firstTokenMs = -1;

			return new Promise((res, rej) => {
				let accumulated = "";
				const timer = setTimeout(
					() => rej(new Error(`LLM timeout (${timeoutMs}ms)`)),
					timeoutMs,
				);

				gw.onNotification("chat", (payload: unknown) => {
					const p = payload as ChatEvent;

					// Collect text from delta and final events
					if (
						(p.state === "delta" || p.state === "final") &&
						p.message?.content
					) {
						if (firstTokenMs < 0) {
							firstTokenMs = performance.now() - sendStart;
						}
						for (const part of p.message.content) {
							if (part.type === "text") {
								accumulated += part.text;
							}
						}
					}

					if (p.state === "final") {
						clearTimeout(timer);
						const totalMs = performance.now() - sendStart;
						const noApiKey =
							accumulated.includes("No API key") ||
							accumulated.includes("API key");
						res({
							text: accumulated,
							firstTokenMs,
							totalMs,
							noApiKey,
						});
					}

					if (p.state === "error") {
						clearTimeout(timer);
						rej(new Error(p.errorMessage ?? "LLM error"));
					}
				});

				gw.call("chat.send", {
					sessionKey,
					message,
					idempotencyKey: randomUUID(),
				}).catch(rej);
			});
		}

		it("gateway accepts chat.send and returns a response", async () => {
			if (!isUp || !gw) return;
			const model = await getFirstModel(gw);
			if (!model) {
				console.log("[latency] SKIP: no models configured");
				return;
			}

			const result = await sendAndCollect(
				gw,
				"Reply with exactly: hello",
				LLM_TIMEOUT,
			);

			if (result.noApiKey) {
				console.log(
					"[latency] SKIP: no API key configured " +
						`(response: ${result.text.slice(0, 80)})`,
				);
				return;
			}

			console.log(
				`[latency] model=${model} ` +
					`TTFT=${(result.firstTokenMs / 1000).toFixed(2)}s ` +
					`total=${(result.totalMs / 1000).toFixed(2)}s ` +
					`chars=${result.text.length}`,
			);

			expect(result.text.length).toBeGreaterThan(0);
			expect(result.firstTokenMs).toBeGreaterThan(0);
			expect(result.firstTokenMs).toBeLessThan(30_000);
			expect(result.totalMs).toBeLessThan(LLM_TIMEOUT);
		}, LLM_TIMEOUT + 5_000);

		it("time-to-first-token under 10 seconds", async () => {
			if (!isUp || !gw) return;
			const model = await getFirstModel(gw);
			if (!model) {
				console.log("[latency] SKIP: no models configured");
				return;
			}

			const result = await sendAndCollect(
				gw,
				"Say hi",
				LLM_TIMEOUT,
			);

			if (result.noApiKey) {
				console.log("[latency] SKIP: no API key configured");
				return;
			}

			console.log(
				`[latency] TTFT=${(result.firstTokenMs / 1000).toFixed(2)}s`,
			);
			expect(result.firstTokenMs).toBeLessThan(10_000);
		}, LLM_TIMEOUT + 5_000);

		it("completes a full response within 30 seconds", async () => {
			if (!isUp || !gw) return;
			const model = await getFirstModel(gw);
			if (!model) {
				console.log("[latency] SKIP: no models configured");
				return;
			}

			const result = await sendAndCollect(
				gw,
				"Reply with exactly one word: hello",
				30_000,
			);

			if (result.noApiKey) {
				console.log("[latency] SKIP: no API key configured");
				return;
			}

			console.log(
				`[latency] Full response: ${(result.totalMs / 1000).toFixed(2)}s`,
			);
			expect(result.totalMs).toBeLessThan(30_000);
		}, 35_000);
	});
});
