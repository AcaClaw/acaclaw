import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-logger";
import { EventJournal, resolveConfig } from "./journal.ts";
import type { EventEntry } from "./journal.ts";

const MAX_FORWARD_BATCH = 100;

const loggerPlugin = {
	id: "acaclaw-logger",

	register(api: OpenClawPluginApi) {
		const config = resolveConfig(api.pluginConfig ?? {});

		if (!config.enabled) {
			api.logger.info?.("[acaclaw-logger] Disabled by config");
			return;
		}

		const journal = new EventJournal(config);
		api.logger.info?.(`[acaclaw-logger] Writing events to ${config.logDir}`);

		// --- Tool events ---

		api.on("before_tool_call", async (event) => {
			await journal.write("tool.invoke", "info", {
				toolName: event.toolName,
				toolCallId: event.toolCallId,
			});
		});

		api.on("after_tool_call", async (event) => {
			const level = event.error ? "warn" : "info";
			await journal.write(event.error ? "tool.error" : "tool.complete", level, {
				toolName: event.toolName,
				toolCallId: event.toolCallId,
				durationMs: event.durationMs,
				success: !event.error,
				error: event.error,
			});
		});

		// --- LLM events ---

		api.on("llm_input", async (event) => {
			await journal.write("chat.stream_start", "info", {
				model: event.model,
				provider: event.provider,
			});
			// Dump full prompt to dedicated file for token-counting
			await journal.writeLlmInput(event as unknown as Record<string, unknown>);
		});

		api.on("llm_output", async (event) => {
			await journal.write("chat.stream_end", "info", {
				model: event.model,
				durationMs: event.durationMs,
				tokenCount: event.usage?.totalTokens,
			});
		});

		// --- Prompt / Agent lifecycle (profiling) ---

		api.on("message_received", async (event) => {
			await journal.write("profile.message_received", "info", {
				sessionKey: (event as Record<string, unknown>).sessionKey,
			});
		});

		api.on("before_prompt_build", async (event) => {
			await journal.write("profile.before_prompt_build", "info", {
				agentId: (event as Record<string, unknown>).agentId,
			});
		});

		api.on("before_agent_start", async (event) => {
			await journal.write("profile.before_agent_start", "info", {
				agentId: (event as Record<string, unknown>).agentId,
			});
		});

		api.on("before_dispatch", async (event) => {
			await journal.write("profile.before_dispatch", "info", {
				agentId: (event as Record<string, unknown>).agentId,
			});
		});

		api.on("before_model_resolve", async () => {
			await journal.write("profile.before_model_resolve", "info", {});
		});

		api.on("before_agent_reply", async (event) => {
			await journal.write("profile.before_agent_reply", "info", {
				agentId: event.agentId,
			});
		});

		api.on("session_start", async (event) => {
			await journal.write("session.start", "info", {
				sessionKey: event.sessionKey,
				agentId: event.agentId,
			});
		});

		api.on("session_end", async (event) => {
			await journal.write("session.end", "info", {
				sessionKey: event.sessionKey,
				durationMs: event.durationMs,
				messageCount: event.messageCount,
			});
		});

		// --- Message events ---

		api.on("message_sent", async (event) => {
			await journal.write("chat.delivered", "info", {
				success: event.success,
				error: event.error,
			});
		});

		// --- Agent events ---

		api.on("agent_end", async (event) => {
			const level = event.error ? "warn" : "info";
			await journal.write("agent.end", level, {
				success: !event.error,
				error: event.error,
				durationMs: event.durationMs,
			});
		});

		// --- Subagent events ---

		api.on("subagent_spawned", async (event) => {
			await journal.write("subagent.start", "info", {
				runId: event.runId,
				agentId: event.agentId,
			});
		});

		api.on("subagent_ended", async (event) => {
			await journal.write("subagent.end", "info", {
				runId: event.runId,
				outcome: event.outcome,
			});
		});

		// --- Gateway lifecycle ---

		api.on("gateway_start", async () => {
			await journal.write("gateway.start", "info", {});
		});

		api.on("gateway_stop", async () => {
			await journal.write("gateway.stop", "info", {});
		});

		// --- UI-forwarded events (connection, auth, API keys) ---

		api.registerGatewayMethod(
			"log.forward",
			async ({ respond, params }) => {
				const { entries } = params as { entries: EventEntry[] };
				if (!Array.isArray(entries)) {
					respond(false, { error: "entries must be an array" });
					return;
				}

				let accepted = 0;
				for (const entry of entries.slice(0, MAX_FORWARD_BATCH)) {
					if (!entry.ts || !entry.event || !entry.level) continue;
					entry.source = "ui"; // Force — never trust client source claim
					await journal.writeRaw(entry);
					accepted++;
				}

				respond(true, { ok: true, accepted });
			},
		);

		// --- event_log agent tool ---

		api.registerTool({
			name: "event_log",
			description:
				"Query the AcaClaw event journal. Returns structured JSONL entries for tool calls, chat, sessions, connections, and other activity. Use date and event filters to narrow results.",
			parameters: {
				type: "object",
				properties: {
					date: {
						type: "string",
						description: "Date to query (YYYY-MM-DD). Defaults to today.",
					},
					event: {
						type: "string",
						description:
							"Event name prefix filter (e.g. 'chat', 'tool.invoke', 'session').",
					},
					level: {
						type: "string",
						description:
							"Minimum log level: debug, info, warn, error. Defaults to config level.",
					},
					limit: {
						type: "number",
						description: "Maximum entries to return. Default: 100.",
					},
				},
				required: [],
			},
			async execute(_id, params) {
				const p = params as {
					date?: string;
					event?: string;
					level?: string;
					limit?: number;
				};

				const date = p.date ?? new Date().toISOString().slice(0, 10);
				const limit = Math.min(p.limit ?? 100, 1000);
				const levelFilter = p.level ?? config.level;

				const LEVELS: Record<string, number> = {
					debug: 0,
					info: 1,
					warn: 2,
					error: 3,
				};
				const minLevel = LEVELS[levelFilter] ?? 1;

				let entries = await journal.read(date);

				// Filter by event prefix
				if (p.event) {
					const prefix = p.event;
					entries = entries.filter((e) => e.event.startsWith(prefix));
				}

				// Filter by level
				entries = entries.filter(
					(e) => (LEVELS[e.level] ?? 0) >= minLevel,
				);

				// Apply limit (take last N entries — most recent)
				if (entries.length > limit) {
					entries = entries.slice(-limit);
				}

				return {
					output: entries.length === 0
						? `No events found for ${date}${p.event ? ` matching "${p.event}"` : ""}`
						: entries.map((e) => JSON.stringify(e)).join("\n"),
				};
			},
		});

		// Prune old log files on startup
		journal.pruneOldFiles().then((pruned) => {
			if (pruned > 0) {
				api.logger.info?.(`[acaclaw-logger] Pruned ${pruned} old event log files`);
			}
		});
	},
};

export default loggerPlugin;
