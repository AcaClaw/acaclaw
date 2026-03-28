import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-workspace";

import {
	DEFAULT_WORKSPACE_ROOT,
	buildWorkspaceContext,
	getWorkspaceInfo,
	initWorkspace,
	readWorkspaceConfig,
	SCAFFOLD_DIRS,
	createProject,
	listProjects,
	deleteProject,
	setActiveProject,
	getActiveProject,
	listProjectFiles,
	listWorkspaceFiles,
	createWorkspaceFolder,
	createWorkspaceFile,
	readWorkspaceFile,
	projectsRoot,
	readProjectConfig,
	getEffectiveWorkdir,
	setWorkdirOverride,
	getAllWorkdirOverrides,
} from "./workspace.js";
import { join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

function resolveAgentWorkspace(api: OpenClawPluginApi, agentId: string, defaultDir: string): string {
	const override = getEffectiveWorkdir(agentId, "");
	if (override) return override;

	const agents = (api.config as any)?.agents?.list ?? [];
	const agentCfg = agents.find((a: any) => a.id === agentId);
	if (agentCfg?.workspace) {
		return resolve(agentCfg.workspace.replace(/^~/, homedir()));
	}
	return defaultDir;
}

/** Build agent identity context from SOUL.md + config for LLM injection. */
function buildIdentityContext(api: OpenClawPluginApi, sessionKey: string, workspaceDir: string): string {
	// General chat session ("main") always gets Aca's identity — never a specialist's.
	// Agent-specific sessions have session keys like "agent:<id>:main".
	const isAgentSession = sessionKey.startsWith("agent:");
	const agentId = isAgentSession ? sessionKey.split(":")[1] : "";

	// "aca" is the dedicated general-tab agent; treat it the same as no-agent
	const isAcaOrGeneral = !isAgentSession || agentId === "aca";

	if (isAcaOrGeneral) {
		// Aca — read SOUL.md from workspaceDir if available, otherwise use hardcoded identity
		let soul = "";
		try {
			const soulPath = join(workspaceDir, "SOUL.md");
			if (existsSync(soulPath)) soul = readFileSync(soulPath, "utf-8").trim();
		} catch { /* ignore */ }

		if (soul) return soul;
		return [
			"## Your Identity",
			"You are **Aca**, a general-purpose academic research assistant.",
			"You help with any research question, writing, data analysis, or topic the user brings up.",
			"Be concise, helpful, and friendly.",
		].join("\n");
	}

	// Agent-specific session: look up config identity + SOUL.md
	const agents = (api.config as Record<string, unknown> & { agents?: { list?: Array<{ id: string; name?: string; identity?: { name?: string; emoji?: string } }> } })?.agents?.list ?? [];
	const agentCfg = agents.find((a) => a.id === agentId);
	const name = agentCfg?.identity?.name ?? agentCfg?.name;

	// Read SOUL.md from the agent's workspace directory
	let soul = "";
	try {
		const soulPath = join(workspaceDir, "SOUL.md");
		if (existsSync(soulPath)) {
			soul = readFileSync(soulPath, "utf-8").trim();
		}
	} catch { /* ignore */ }

	if (!name && !soul) return "";

	const lines: string[] = ["## Your Identity"];
	if (name) lines.push(`You are **${name}**.`);
	if (soul) lines.push("", soul);
	return lines.join("\n");
}

const workspacePlugin = {
	id: "acaclaw-workspace",
	name: "AcaClaw Workspace",
	description: "Workspace management — project scaffold, file tree context, and workspace-scoped operations",
	configSchema: {
		type: "object" as const,
		additionalProperties: false,
		properties: {},
	},

	register(api: OpenClawPluginApi) {
		// -------------------------------------------------------------------------
		// Hook: before_prompt_build — inject workspace file tree into LLM context
		// -------------------------------------------------------------------------
		// Cache workspace info per directory to avoid repeated sync fs walks (~0.1-0.5s each)
		const wsInfoCache = new Map<string, { data: ReturnType<typeof getWorkspaceInfo>; ts: number }>();
		const WS_INFO_CACHE_TTL = 120_000; // 2 minutes

		api.on(
			"before_prompt_build",
			async (_event, ctx) => {
				const defaultDir = ctx.workspaceDir;
				if (!defaultDir) return;

				// Extract agentId: session keys are "agent:<id>:main" or plain "main"
				const sk = ctx.sessionKey ?? "";
				const agentId = sk.startsWith("agent:") ? sk.split(":")[1] : (ctx.agentId ?? "");
				const workspaceDir = getEffectiveWorkdir(agentId, defaultDir);

				const cached = wsInfoCache.get(workspaceDir);
				const info = cached && Date.now() - cached.ts < WS_INFO_CACHE_TTL
					? cached.data
					: (() => {
						const fresh = getWorkspaceInfo(workspaceDir);
						wsInfoCache.set(workspaceDir, { data: fresh, ts: Date.now() });
						return fresh;
					})();

				const context = buildWorkspaceContext(info);

				// Inject agent identity — use session key to distinguish Aca vs specialist
				const identitySection = buildIdentityContext(api, sk, workspaceDir);

				const sections = identitySection ? [identitySection, context] : [context];
				return { prependSystemContext: sections.join("\n\n") };
			},
			{ priority: 150 }, // After academic-env (50), before backup/security
		);

		// -------------------------------------------------------------------------
		// Tool: workspace_info — show workspace metadata and file tree
		// -------------------------------------------------------------------------
		api.registerTool({
			name: "workspace_info",
			description:
				"Show the current workspace: project name, discipline, file tree, and statistics. Use this to understand what files are available before working with them.",
			parameters: { type: "object" as const, properties: {} },
			async execute(_id, _params, ctx) {
				const workspaceDir = ctx?.workspaceDir;
				if (!workspaceDir) {
					return { output: "No workspace directory configured." };
				}

				const info = getWorkspaceInfo(workspaceDir);
				if (!info.exists) {
					return {
						output: `Workspace directory ${workspaceDir} does not exist. Initialize it with: openclaw acaclaw-workspace init`,
					};
				}

				const sizeMB = (info.totalSizeBytes / (1024 * 1024)).toFixed(1);
				const lines = [
					`# Workspace Info`,
					``,
					`| Property | Value |`,
					`|----------|-------|`,
					`| Root | ${info.root} |`,
					`| Project | ${info.config?.name ?? "—"} |`,
					`| Discipline | ${info.config?.discipline ?? "—"} |`,
					`| Files | ${info.fileCount} |`,
					`| Size | ${sizeMB} MB |`,
					`| Created | ${info.config?.createdAt ?? "—"} |`,
					`| Workspace ID | ${info.config?.workspaceId ?? "—"} |`,
				];

				if (info.tree.length > 0) {
					lines.push("", "## File Tree", "");
					for (const node of info.tree) {
						formatNode(node, "", lines);
					}
				}

				return { output: lines.join("\n") };
			},
		});

		// -------------------------------------------------------------------------
		// Gateway: project management methods
		// -------------------------------------------------------------------------

		api.registerGatewayMethod("acaclaw.project.list", async ({ respond, context }) => {
			const root = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const projects = listProjects(root);
			const active = getActiveProject(root);
			respond(true, { projects, activeProject: active });
		});

		api.registerGatewayMethod("acaclaw.project.create", async ({ params, respond, context }) => {
			const root = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const { name, description, discipline, env } = params as {
				name: string; description?: string; discipline?: string; env?: string;
			};
			if (!name) {
				respond(false, { error: "Project name is required" });
				return;
			}
			try {
				const config = createProject(root, { name, description, discipline, env });
				respond(true, { project: config });
			} catch (err: unknown) {
				respond(false, { error: (err as Error).message });
			}
		});

		api.registerGatewayMethod("acaclaw.project.delete", async ({ params, respond, context }) => {
			const root = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const { name } = params as { name: string };
			if (!name) {
				respond(false, { error: "Project name is required" });
				return;
			}
			try {
				deleteProject(root, name);
				// If the deleted project was active, clear it
				const active = getActiveProject(root);
				if (active === name) {
					setActiveProject(root, null);
				}
				respond(true, { deleted: name });
			} catch (err: unknown) {
				respond(false, { error: (err as Error).message });
			}
		});

		api.registerGatewayMethod("acaclaw.project.setActive", async ({ params, respond, context }) => {
			const root = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const { name } = params as { name: string | null };
			try {
				if (name) {
					// Verify project exists
					const projPath = join(projectsRoot(root), name);
					const config = readProjectConfig(projPath);
					if (!config) {
						respond(false, { error: `Project "${name}" not found` });
						return;
					}
				}
				setActiveProject(root, name);
				respond(true, { activeProject: name });
			} catch (err: unknown) {
				respond(false, { error: (err as Error).message });
			}
		});

		api.registerGatewayMethod("acaclaw.project.files", async ({ params, respond, context }) => {
			const root = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const { name, path: subPath } = params as { name: string; path?: string };
			if (!name) {
				respond(false, { error: "Project name is required" });
				return;
			}
			const projPath = join(projectsRoot(root), name);
			const files = listProjectFiles(projPath, subPath);
			respond(true, { files, project: name, path: subPath ?? "" });
		});

		api.registerGatewayMethod("acaclaw.workspace.list", async ({ params, respond, context }) => {
			const root = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const { path: subPath } = (params ?? {}) as { path?: string };
			const files = listWorkspaceFiles(root, subPath);
			respond(true, { files, path: subPath ?? "" });
		});

		api.registerGatewayMethod("acaclaw.workspace.readFile", async ({ params, respond, context }) => {
			const root = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const { path: subPath } = params as { path: string };
			if (!subPath) {
				respond(false, { error: "File path is required" });
				return;
			}
			try {
				const preview = readWorkspaceFile(root, subPath);
				respond(true, preview);
			} catch (err: unknown) {
				respond(false, { error: (err as Error).message });
			}
		});

		api.registerGatewayMethod("acaclaw.workspace.createFolder", async ({ params, respond, context }) => {
			const root = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const { path: subPath } = params as { path: string };
			if (!subPath) {
				respond(false, { error: "Folder path is required" });
				return;
			}
			try {
				createWorkspaceFolder(root, subPath);
				respond(true, { created: subPath });
			} catch (err: unknown) {
				respond(false, { error: (err as Error).message });
			}
		});

		api.registerGatewayMethod("acaclaw.workspace.createFile", async ({ params, respond, context }) => {
			const root = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const { path: subPath, content } = params as { path: string; content?: string };
			if (!subPath) {
				respond(false, { error: "File path is required" });
				return;
			}
			try {
				createWorkspaceFile(root, subPath, content);
				respond(true, { created: subPath });
			} catch (err: unknown) {
				respond(false, { error: (err as Error).message });
			}
		});

		api.registerGatewayMethod("acaclaw.workspace.writeFile", async ({ params, respond, context }) => {
			const root = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const { path: subPath, content } = params as { path: string; content: string };
			if (!subPath) {
				respond(false, { error: "File path is required" });
				return;
			}
			if (typeof content !== "string") {
				respond(false, { error: "Content is required" });
				return;
			}
			try {
				createWorkspaceFile(root, subPath, content);
				respond(true, { written: subPath });
			} catch (err: unknown) {
				respond(false, { error: (err as Error).message });
			}
		});

		// -------------------------------------------------------------------------
		// Gateway: SOUL.md — read and write agent identity files
		// -------------------------------------------------------------------------

		api.registerGatewayMethod("acaclaw.soul.get", async ({ params, respond, context }) => {
			const { agentId } = (params ?? {}) as { agentId?: string };
			const defaultDir = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const workdir = agentId ? resolveAgentWorkspace(api, agentId, defaultDir) : defaultDir;
			const soulPath = join(workdir, "SOUL.md");
			try {
				if (existsSync(soulPath)) {
					respond(true, { content: readFileSync(soulPath, "utf-8"), path: soulPath });
				} else {
					respond(true, { content: "", path: soulPath });
				}
			} catch (err: unknown) {
				respond(false, { error: (err as Error).message });
			}
		});

		api.registerGatewayMethod("acaclaw.soul.set", async ({ params, respond, context }) => {
			const { agentId, content } = params as { agentId?: string; content: string };
			if (typeof content !== "string") {
				respond(false, { error: "Content is required" });
				return;
			}
			const defaultDir = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const workdir = agentId ? resolveAgentWorkspace(api, agentId, defaultDir) : defaultDir;
			const soulPath = join(workdir, "SOUL.md");
			try {
				writeFileSync(soulPath, content);
				respond(true, { written: soulPath });
			} catch (err: unknown) {
				respond(false, { error: (err as Error).message });
			}
		});

		// -------------------------------------------------------------------------
		// Gateway: workdir management — get and set per-agent working directory
		// -------------------------------------------------------------------------

		api.registerGatewayMethod("acaclaw.workspace.getWorkdir", async ({ params, respond, context }) => {
			const { agentId } = (params ?? {}) as { agentId?: string };
			const defaultDir = context?.workspaceDir ?? DEFAULT_WORKSPACE_ROOT;
			const effectiveDir = agentId
				? getEffectiveWorkdir(agentId, defaultDir)
				: defaultDir;
			respond(true, { workdir: effectiveDir, isOverride: effectiveDir !== defaultDir });
		});

		api.registerGatewayMethod("acaclaw.workspace.setWorkdir", async ({ params, respond }) => {
			const { agentId, path: newPath } = params as { agentId: string; path: string | null };
			if (!agentId) {
				respond(false, { error: "agentId is required" });
				return;
			}
			if (newPath !== null && typeof newPath !== "string") {
				respond(false, { error: "path must be a string or null (to reset)" });
				return;
			}
			setWorkdirOverride(agentId, newPath);
			const overrides = getAllWorkdirOverrides();
			respond(true, { agentId, workdir: overrides[agentId] ?? null });
		});

		api.registerGatewayMethod("acaclaw.workspace.listWorkdirs", async ({ respond }) => {
			const overrides = getAllWorkdirOverrides();
			respond(true, { overrides, defaultWorkdir: DEFAULT_WORKSPACE_ROOT });
		});

		// -------------------------------------------------------------------------
		// CLI: acaclaw-workspace commands
		// -------------------------------------------------------------------------
		api.registerCli(
			({ program }) => {
				const ws = program.command("acaclaw-workspace").description("AcaClaw workspace management");

				ws.command("init")
					.description("Initialize a new research workspace with standard project structure")
					.argument("[path]", `Workspace directory (default: ${DEFAULT_WORKSPACE_ROOT})`)
					.option("-n, --name <name>", "Project name")
					.option("-d, --discipline <disc>", "Research discipline (general, biology, chemistry, medicine, physics)", "general")
					.option("--no-scaffold", "Skip creating scaffold directories")
					.action(async (path: string | undefined, opts: { name?: string; discipline: string; scaffold: boolean }) => {
						const root = path ?? DEFAULT_WORKSPACE_ROOT;
						const config = initWorkspace(root, {
							name: opts.name,
							discipline: opts.discipline,
							scaffold: opts.scaffold,
						});

						console.log(`Workspace initialized: ${root}`);
						console.log(`  Name:       ${config.name}`);
						console.log(`  Discipline: ${config.discipline}`);
						console.log(`  ID:         ${config.workspaceId}`);

						if (opts.scaffold) {
							console.log("");
							console.log("  Directories created:");
							for (const dir of SCAFFOLD_DIRS) {
								console.log(`    ${dir}/`);
							}
						}

						console.log("");
						console.log("  Set as active workspace:");
						console.log(`    openclaw config set agents.defaults.workspace "${root}"`);
					});

				ws.command("info")
					.description("Show workspace information and file tree")
					.argument("[path]", "Workspace directory (default: configured workspace or ~/AcaClaw)")
					.action(async (path: string | undefined) => {
						const root = path ?? DEFAULT_WORKSPACE_ROOT;
						const info = getWorkspaceInfo(root);

						if (!info.exists) {
							console.error(`Workspace not found: ${root}`);
							console.error(`Initialize with: openclaw acaclaw-workspace init "${root}"`);
							process.exitCode = 1;
							return;
						}

						const sizeMB = (info.totalSizeBytes / (1024 * 1024)).toFixed(1);
						console.log(`Root:       ${info.root}`);
						console.log(`Project:    ${info.config?.name ?? "—"}`);
						console.log(`Discipline: ${info.config?.discipline ?? "—"}`);
						console.log(`Files:      ${info.fileCount}`);
						console.log(`Size:       ${sizeMB} MB`);
						console.log(`ID:         ${info.config?.workspaceId ?? "—"}`);
						console.log(`Created:    ${info.config?.createdAt ?? "—"}`);
					});

				ws.command("tree")
					.description("Show the workspace file tree")
					.argument("[path]", "Workspace directory")
					.action(async (path: string | undefined) => {
						const root = path ?? DEFAULT_WORKSPACE_ROOT;
						const info = getWorkspaceInfo(root);

						if (!info.exists) {
							console.error(`Workspace not found: ${root}`);
							process.exitCode = 1;
							return;
						}

						for (const node of info.tree) {
							printTreeNode(node, "");
						}
					});
			},
			{ commands: ["acaclaw-workspace"] },
		);
	},
};

function formatNode(node: { name: string; type: string; size?: number; children?: unknown[] }, indent: string, lines: string[]): void {
	if (node.type === "directory") {
		lines.push(`${indent}${node.name}/`);
		if (Array.isArray(node.children)) {
			for (const child of node.children) {
				formatNode(child as typeof node, indent + "  ", lines);
			}
		}
	} else {
		lines.push(`${indent}${node.name}`);
	}
}

function printTreeNode(node: { name: string; type: string; children?: unknown[] }, indent: string): void {
	if (node.type === "directory") {
		console.log(`${indent}${node.name}/`);
		if (Array.isArray(node.children)) {
			for (const child of node.children) {
				printTreeNode(child as typeof node, indent + "  ");
			}
		}
	} else {
		console.log(`${indent}${node.name}`);
	}
}

export default workspacePlugin;
