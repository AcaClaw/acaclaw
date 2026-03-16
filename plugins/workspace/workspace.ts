import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

// --- Types ---

export interface WorkspaceConfig {
	name: string;
	discipline: string;
	createdAt: string;
	workspaceId: string;
}

export interface WorkspaceInfo {
	root: string;
	config: WorkspaceConfig | null;
	exists: boolean;
	fileCount: number;
	totalSizeBytes: number;
	tree: TreeNode[];
}

export interface TreeNode {
	name: string;
	type: "file" | "directory";
	size?: number;
	children?: TreeNode[];
}

// --- Constants ---

/** Default workspace root — researcher-friendly, visible in home dir */
export const DEFAULT_WORKSPACE_ROOT = join(homedir(), "AcaClaw");

/** Metadata directory inside each workspace */
const META_DIR = ".acaclaw";

/** Project config file inside workspace metadata */
const CONFIG_FILE = "workspace.json";

/** Standard project scaffold directories */
export const SCAFFOLD_DIRS = [
	"data/raw",
	"data/processed",
	"documents/drafts",
	"documents/final",
	"figures",
	"references",
	"notes",
	"output",
] as const;

/** Files to ignore when scanning workspace tree */
const IGNORE_PATTERNS = [
	".acaclaw",
	".git",
	"node_modules",
	"__pycache__",
	".DS_Store",
	"Thumbs.db",
];

// --- Functions ---

/**
 * Generate a stable workspace ID from the workspace root path.
 * Used to organize backups per workspace.
 */
export function workspaceId(root: string): string {
	const absRoot = resolve(root);
	const hash = createHash("sha256").update(absRoot).digest("hex").slice(0, 12);
	const dirName = basename(absRoot).replace(/[^a-zA-Z0-9_-]/g, "_");
	return `${dirName}-${hash}`;
}

/**
 * Read workspace config from .acaclaw/workspace.json.
 * Returns null if workspace is not initialized.
 */
export function readWorkspaceConfig(root: string): WorkspaceConfig | null {
	const configPath = join(root, META_DIR, CONFIG_FILE);
	if (!existsSync(configPath)) return null;
	try {
		const raw = readFileSync(configPath, "utf-8");
		return JSON.parse(raw) as WorkspaceConfig;
	} catch {
		return null;
	}
}

/**
 * Write workspace config to .acaclaw/workspace.json.
 */
export function writeWorkspaceConfig(root: string, config: WorkspaceConfig): void {
	const metaDir = join(root, META_DIR);
	mkdirSync(metaDir, { recursive: true });

	const configPath = join(metaDir, CONFIG_FILE);
	writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

	// Also write a .gitignore for the metadata dir
	const gitignorePath = join(metaDir, ".gitignore");
	if (!existsSync(gitignorePath)) {
		writeFileSync(gitignorePath, "# AcaClaw workspace metadata\n*\n");
	}
}

/**
 * Initialize a workspace: create directories + config.
 * If scaffold is true, create standard project directories.
 */
export function initWorkspace(
	root: string,
	options: { name?: string; discipline?: string; scaffold?: boolean },
): WorkspaceConfig {
	const absRoot = resolve(root);
	mkdirSync(absRoot, { recursive: true });

	// Create scaffold if requested
	if (options.scaffold !== false) {
		for (const dir of SCAFFOLD_DIRS) {
			const dirPath = join(absRoot, dir);
			mkdirSync(dirPath, { recursive: true });
		}

		// Create a README for the researcher
		const readmePath = join(absRoot, "README.md");
		if (!existsSync(readmePath)) {
			const dirName = options.name ?? basename(absRoot);
			writeFileSync(
				readmePath,
				[
					`# ${dirName}`,
					"",
					"AcaClaw research workspace.",
					"",
					"## Directory Structure",
					"",
					"| Folder | Contents |",
					"|--------|----------|",
					"| `data/raw/` | Original data files — AcaClaw never modifies these |",
					"| `data/processed/` | Analysis outputs and processed data |",
					"| `documents/drafts/` | Manuscript and report drafts |",
					"| `documents/final/` | Finalized documents ready for submission |",
					"| `figures/` | Generated plots and visualizations |",
					"| `references/` | Papers (PDFs), bibliography files (.bib, .ris) |",
					"| `notes/` | Research notes, meeting minutes, lab notebooks |",
					"| `output/` | AcaClaw-generated outputs (citations, summaries, etc.) |",
					"",
					"## Data Safety",
					"",
					"Every file is automatically backed up before AcaClaw modifies it.",
					"Backups are stored at `~/.acaclaw/backups/` — outside this workspace.",
					"",
					"To restore a file: `openclaw acaclaw-backup restore <file>`",
					"To list versions:  `openclaw acaclaw-backup list <file>`",
					"",
				].join("\n"),
			);
		}

		// Create a .gitignore for the data/raw directory so raw data isn't modified
		const rawGitignore = join(absRoot, "data", "raw", ".gitkeep");
		if (!existsSync(rawGitignore)) {
			writeFileSync(rawGitignore, "");
		}
	}

	const config: WorkspaceConfig = {
		name: options.name ?? basename(absRoot),
		discipline: options.discipline ?? "general",
		createdAt: new Date().toISOString(),
		workspaceId: workspaceId(absRoot),
	};

	writeWorkspaceConfig(absRoot, config);
	return config;
}

/**
 * Scan the workspace and return a tree representation (max 2 levels deep).
 */
export function scanWorkspaceTree(root: string, maxDepth = 2): TreeNode[] {
	return scanDir(root, 0, maxDepth);
}

function scanDir(dir: string, depth: number, maxDepth: number): TreeNode[] {
	if (depth >= maxDepth) return [];

	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		const nodes: TreeNode[] = [];

		for (const entry of entries) {
			if (IGNORE_PATTERNS.includes(entry.name)) continue;
			if (entry.name.startsWith(".") && depth === 0) continue;

			if (entry.isDirectory()) {
				const children = scanDir(join(dir, entry.name), depth + 1, maxDepth);
				nodes.push({ name: entry.name, type: "directory", children });
			} else if (entry.isFile()) {
				try {
					const s = statSync(join(dir, entry.name));
					nodes.push({ name: entry.name, type: "file", size: s.size });
				} catch {
					nodes.push({ name: entry.name, type: "file" });
				}
			}
		}

		return nodes.sort((a, b) => {
			// Directories first, then alphabetical
			if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	} catch {
		return [];
	}
}

/**
 * Count files and total size in workspace (excluding ignored dirs).
 */
export function workspaceStats(root: string): { fileCount: number; totalSizeBytes: number } {
	let fileCount = 0;
	let totalSizeBytes = 0;

	function walk(dir: string) {
		try {
			const entries = readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				if (IGNORE_PATTERNS.includes(entry.name)) continue;
				const fullPath = join(dir, entry.name);
				if (entry.isDirectory()) {
					walk(fullPath);
				} else if (entry.isFile()) {
					fileCount++;
					try {
						totalSizeBytes += statSync(fullPath).size;
					} catch {
						// skip
					}
				}
			}
		} catch {
			// skip
		}
	}

	walk(root);
	return { fileCount, totalSizeBytes };
}

/**
 * Get full workspace info.
 */
export function getWorkspaceInfo(root: string): WorkspaceInfo {
	const absRoot = resolve(root);
	const config = readWorkspaceConfig(absRoot);
	const exists = existsSync(absRoot);
	const stats = exists ? workspaceStats(absRoot) : { fileCount: 0, totalSizeBytes: 0 };
	const tree = exists ? scanWorkspaceTree(absRoot) : [];

	return {
		root: absRoot,
		config,
		exists,
		fileCount: stats.fileCount,
		totalSizeBytes: stats.totalSizeBytes,
		tree,
	};
}

/**
 * Build workspace context for LLM injection.
 * Describes what's in the workspace so the AI knows its working environment.
 */
export function buildWorkspaceContext(info: WorkspaceInfo): string {
	if (!info.exists) {
		return [
			"## Workspace",
			"No workspace directory found. All file operations are restricted to the workspace.",
		].join("\n");
	}

	const lines = [
		"## Workspace",
		`Working directory: ${info.root}`,
		`Project: ${info.config?.name ?? basename(info.root)}`,
	];

	if (info.config?.discipline && info.config.discipline !== "general") {
		lines.push(`Discipline: ${info.config.discipline}`);
	}

	const sizeMB = (info.totalSizeBytes / (1024 * 1024)).toFixed(1);
	lines.push(`Files: ${info.fileCount} (${sizeMB} MB)`);

	if (info.tree.length > 0) {
		lines.push("", "Directory structure:");
		for (const node of info.tree) {
			formatTreeNode(node, "", lines);
		}
	}

	lines.push(
		"",
		"IMPORTANT: All file operations (read, write, edit, delete) are restricted to this workspace directory.",
		"Files outside this directory cannot be accessed.",
		"Every file is automatically backed up before modification.",
		"The `data/raw/` directory contains original data — prefer writing processed results to `data/processed/`.",
	);

	return lines.join("\n");
}

function formatTreeNode(node: TreeNode, indent: string, lines: string[]): void {
	if (node.type === "directory") {
		lines.push(`${indent}${node.name}/`);
		if (node.children) {
			for (const child of node.children) {
				formatTreeNode(child, indent + "  ", lines);
			}
		}
	} else {
		const sizeStr = node.size != null ? ` (${formatSize(node.size)})` : "";
		lines.push(`${indent}${node.name}${sizeStr}`);
	}
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
