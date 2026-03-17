import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-workspace";

import {
	DEFAULT_WORKSPACE_ROOT,
	buildWorkspaceContext,
	getWorkspaceInfo,
	initWorkspace,
	readWorkspaceConfig,
	SCAFFOLD_DIRS,
} from "./workspace.js";

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
		api.on(
			"before_prompt_build",
			async (_event, ctx) => {
				const workspaceDir = ctx.workspaceDir;
				if (!workspaceDir) return;

				const info = getWorkspaceInfo(workspaceDir);
				const context = buildWorkspaceContext(info);

				return { systemPromptSections: [context] };
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
