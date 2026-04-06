import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-security";

import {
	checkDangerousCommand,
	detectInjection,
	extractCommand,
	getAllowedDomains,
	isDomainAllowed,
	isShellTool,
	isToolDenied,
	readAuditLog,
	resolveConfig,
	scrubCredentials,
	writeAuditEntry,
} from "./security.ts";

const securityPlugin = {
	id: "acaclaw-security",

	register(api: OpenClawPluginApi) {
		const config = resolveConfig(api.pluginConfig ?? {});

		// --- before_tool_call: deny dangerous tools & commands (priority 100, after backup at 200) ---
		api.on(
			"before_tool_call",
			async (event, ctx) => {
				const { toolName, params, runId } = event;
				const workspaceDir = ctx?.workspaceDir;

				// Deny control-plane tools
				if (isToolDenied(toolName)) {
					await writeAuditEntry(config.auditLogDir, {
						timestamp: new Date().toISOString(),
						event: "tool_blocked",
						toolName,
						detail: `Control-plane tool denied in academic mode`,
						runId,
						workspace: workspaceDir,
					});
					return {
						block: true,
						blockReason: `AcaClaw security: "${toolName}" is not available in academic mode`,
					};
				}

				// Inspect shell commands for dangerous patterns
				if (isShellTool(toolName)) {
					const command = extractCommand(params);
					if (command) {
						const danger = checkDangerousCommand(command, config.customDenyCommands);
						if (danger) {
							await writeAuditEntry(config.auditLogDir, {
								timestamp: new Date().toISOString(),
								event: "tool_blocked",
								toolName,
								detail: danger,
								runId,
								workspace: workspaceDir,
							});
							return {
								block: true,
								blockReason: `AcaClaw security: command blocked — ${danger}`,
							};
						}
					}
				}

				// Network policy: check URL params
				if (config.enableNetworkPolicy && params) {
					const urlFields = ["url", "uri", "endpoint", "href"];
					for (const field of urlFields) {
						const value = params[field];
						if (typeof value === "string" && !isDomainAllowed(value, config.customAllowedDomains)) {
							await writeAuditEntry(config.auditLogDir, {
								timestamp: new Date().toISOString(),
								event: "network_blocked",
								toolName,
								detail: `Domain not in academic allowlist: ${value}`,
								runId,
								workspace: workspaceDir,
							});
							return {
								block: true,
								blockReason: `AcaClaw security: domain not in academic allowlist. Allowed: ${getAllowedDomains(config.customAllowedDomains).join(", ")}`,
							};
						}
					}
				}

				// Log all tool calls for audit trail
				await writeAuditEntry(config.auditLogDir, {
					timestamp: new Date().toISOString(),
					event: "tool_call",
					toolName,
					detail: `Tool invoked`,
					runId,
					workspace: workspaceDir,
				});

				return {};
			},
			{ priority: 100 },
		);

		// --- llm_input: detect prompt injection ---
		if (config.enableInjectionDetection) {
			api.on("llm_input", async (event) => {
				const messages = event.messages ?? [];
				for (const msg of messages) {
					if (typeof msg.content !== "string") continue;
					const injections = detectInjection(msg.content);
					if (injections.length > 0) {
						await writeAuditEntry(config.auditLogDir, {
							timestamp: new Date().toISOString(),
							event: "injection_warning",
							detail: `Suspected injection patterns: ${injections.join("; ")}`,
						});
						api.logger.warn(
							`AcaClaw: suspected prompt injection detected (${injections.length} pattern(s)). Logged for review.`,
						);
					}
				}
			});
		}

		// --- llm_output: scrub credentials ---
		if (config.enableCredentialScrubbing) {
			api.on("llm_output", async (event) => {
				if (typeof event.output !== "string") return;

				const { scrubbed, count } = scrubCredentials(event.output);
				if (count > 0) {
					await writeAuditEntry(config.auditLogDir, {
						timestamp: new Date().toISOString(),
						event: "credential_scrubbed",
						detail: `Scrubbed ${count} credential pattern(s) from output`,
					});
					return { output: scrubbed };
				}
				return {};
			});

			// --- before_agent_reply: scrub credentials from final reply (4.2) ---
			api.on("before_agent_reply", async (event) => {
				if (typeof event.reply !== "string") return {};

				const { scrubbed, count } = scrubCredentials(event.reply);
				if (count > 0) {
					await writeAuditEntry(config.auditLogDir, {
						timestamp: new Date().toISOString(),
						event: "credential_scrubbed",
						detail: `Scrubbed ${count} credential pattern(s) from agent reply`,
					});
					return { reply: scrubbed };
				}
				return {};
			});
		}

		// --- Tools ---

		api.registerTool({
			name: "security_audit",
			description: "View AcaClaw security audit log for a given date (YYYY-MM-DD). Shows all tool calls, blocks, and warnings.",
			parameters: {
				type: "object" as const,
				properties: {
					date: { type: "string" as const, description: "Date to query (YYYY-MM-DD). Defaults to today." },
				},
				required: ["date"],
			},
			async execute(_id, params) {
				const date = params.date || new Date().toISOString().slice(0, 10);
				const entries = await readAuditLog(config.auditLogDir, date);

				if (entries.length === 0) {
					return { output: `No audit entries for ${date}.` };
				}

				const summary = {
					date,
					totalEntries: entries.length,
					blocked: entries.filter((e) => e.event === "tool_blocked" || e.event === "network_blocked").length,
					warnings: entries.filter((e) => e.event === "injection_warning").length,
					scrubbed: entries.filter((e) => e.event === "credential_scrubbed").length,
					toolCalls: entries.filter((e) => e.event === "tool_call").length,
				};

				const lines = entries.map(
					(e) => `[${e.timestamp}] ${e.event}: ${e.detail}${e.toolName ? ` (tool: ${e.toolName})` : ""}`,
				);

				return {
					output: [
						`# Audit Log — ${date}`,
						``,
						`| Metric | Count |`,
						`|--------|-------|`,
						`| Tool calls | ${summary.toolCalls} |`,
						`| Blocked | ${summary.blocked} |`,
						`| Injection warnings | ${summary.warnings} |`,
						`| Credentials scrubbed | ${summary.scrubbed} |`,
						``,
						`## Entries`,
						``,
						...lines,
					].join("\n"),
				};
			},
		});

		api.registerTool({
			name: "security_status",
			description: "Show current AcaClaw security configuration and mode.",
			parameters: { type: "object" as const, properties: {} },
			async execute() {
				const domains = getAllowedDomains(config.customAllowedDomains);
				return {
					output: [
						`# AcaClaw Security Status`,
						``,
						`| Setting | Value |`,
						`|---------|-------|`,
						`| Mode | ${config.mode} |`,
						`| Network policy | ${config.enableNetworkPolicy ? "enabled" : "disabled"} |`,
						`| Credential scrubbing | ${config.enableCredentialScrubbing ? "enabled" : "disabled"} |`,
						`| Injection detection | ${config.enableInjectionDetection ? "enabled" : "disabled"} |`,
						`| Custom deny commands | ${config.customDenyCommands.length} |`,
						`| Audit log dir | ${config.auditLogDir} |`,
						``,
						`## Allowed Domains (${domains.length})`,
						``,
						domains.map((d) => `- ${d}`).join("\n"),
					].join("\n"),
				};
			},
		});

		// --- CLI ---

		api.registerCli(
			({ program }) => {
				const cmd = program.command("acaclaw-security").description("AcaClaw security management");

				cmd
					.command("audit")
					.description("View audit log for a date")
					.argument("[date]", "Date in YYYY-MM-DD format (defaults to today)")
					.action(async (date?: string) => {
						const d = date ?? new Date().toISOString().slice(0, 10);
						const entries = await readAuditLog(config.auditLogDir, d);
						if (entries.length === 0) {
							console.log(`No audit entries for ${d}.`);
							return;
						}
						for (const entry of entries) {
							console.log(`[${entry.timestamp}] ${entry.event}: ${entry.detail}`);
						}
					});

				cmd
					.command("status")
					.description("Show current security configuration")
					.action(() => {
						console.log(`Mode: ${config.mode}`);
						console.log(`Network policy: ${config.enableNetworkPolicy ? "enabled" : "disabled"}`);
						console.log(`Credential scrubbing: ${config.enableCredentialScrubbing ? "enabled" : "disabled"}`);
						console.log(`Injection detection: ${config.enableInjectionDetection ? "enabled" : "disabled"}`);
						console.log(`Audit dir: ${config.auditLogDir}`);
					});

				cmd
					.command("domains")
					.description("List allowed network domains")
					.action(() => {
						const domains = getAllowedDomains(config.customAllowedDomains);
						for (const d of domains) {
							console.log(d);
						}
					});
			},
			{ commands: ["acaclaw-security"] },
		);
	},
};

export default securityPlugin;
