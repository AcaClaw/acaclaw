import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

// --- Types ---

export interface WorkspaceConfig {
	name: string;
	discipline: string;
	createdAt: string;
	workspaceId: string;
	activeProject?: string;
}

export interface ProjectConfig {
	name: string;
	description: string;
	discipline: string;
	createdAt: string;
	env?: string;
}

export interface ProjectInfo {
	name: string;
	path: string;
	config: ProjectConfig;
	fileCount: number;
	totalSizeBytes: number;
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

/** Infrastructure directory for AcaClaw (hidden) */
const INFRA_DIR = join(homedir(), ".acaclaw");

/** Workdir overrides file — per-agent custom working directories */
const WORKDIR_OVERRIDES_FILE = join(INFRA_DIR, "workdir-overrides.json");

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

/** Per-project scaffold directories */
export const PROJECT_DIRS = [
	"data",
	"figures",
	"reports",
	"notes",
	"output",
	"memory",
	"logs",
] as const;

/** Projects directory inside workspace */
export const PROJECTS_DIR = "Projects";

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

// --- Workdir Overrides ---

interface WorkdirOverrides {
	[agentId: string]: string;
}

function readWorkdirOverrides(): WorkdirOverrides {
	try {
		if (existsSync(WORKDIR_OVERRIDES_FILE)) {
			return JSON.parse(readFileSync(WORKDIR_OVERRIDES_FILE, "utf-8")) as WorkdirOverrides;
		}
	} catch {
		// Corrupted file — return empty
	}
	return {};
}

function writeWorkdirOverrides(overrides: WorkdirOverrides): void {
	mkdirSync(INFRA_DIR, { recursive: true });
	writeFileSync(WORKDIR_OVERRIDES_FILE, JSON.stringify(overrides, null, 2) + "\n");
}

/**
 * Get the effective workdir for an agent.
 * Returns the override if set, otherwise the provided default.
 */
export function getEffectiveWorkdir(agentId: string, defaultWorkdir: string): string {
	const overrides = readWorkdirOverrides();
	return overrides[agentId] ?? defaultWorkdir;
}

/**
 * Set a workdir override for an agent.
 * Pass null to clear the override and revert to default.
 */
export function setWorkdirOverride(agentId: string, workdir: string | null): void {
	const overrides = readWorkdirOverrides();
	if (workdir === null) {
		delete overrides[agentId];
	} else {
		const absPath = resolve(workdir.replace(/^~/, homedir()));
		overrides[agentId] = absPath;
	}
	writeWorkdirOverrides(overrides);
}

/**
 * Get all workdir overrides.
 */
export function getAllWorkdirOverrides(): WorkdirOverrides {
	return readWorkdirOverrides();
}

// --- Project Management ---

/** Get the projects root directory */
export function projectsRoot(workspaceRoot: string): string {
	return join(resolve(workspaceRoot), PROJECTS_DIR);
}

/** Read a project config from its project.json */
export function readProjectConfig(projectPath: string): ProjectConfig | null {
	const configPath = join(projectPath, ".acaclaw", "project.json");
	if (!existsSync(configPath)) return null;
	try {
		return JSON.parse(readFileSync(configPath, "utf-8")) as ProjectConfig;
	} catch {
		return null;
	}
}

/** Create a new project with scaffold directories */
export function createProject(
	workspaceRoot: string,
	options: { name: string; description?: string; discipline?: string; env?: string },
): ProjectConfig {
	const safeSlug = options.name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
	if (!safeSlug) throw new Error("Invalid project name");

	const projDir = join(projectsRoot(workspaceRoot), safeSlug);
	if (existsSync(join(projDir, ".acaclaw", "project.json"))) {
		throw new Error(`Project "${safeSlug}" already exists`);
	}

	mkdirSync(projDir, { recursive: true });
	for (const dir of PROJECT_DIRS) {
		mkdirSync(join(projDir, dir), { recursive: true });
	}

	const config: ProjectConfig = {
		name: safeSlug,
		description: options.description ?? "",
		discipline: options.discipline ?? "general",
		createdAt: new Date().toISOString(),
		env: options.env,
	};

	const metaDir = join(projDir, ".acaclaw");
	mkdirSync(metaDir, { recursive: true });
	writeFileSync(join(metaDir, "project.json"), JSON.stringify(config, null, 2) + "\n");

	// README
	writeFileSync(
		join(projDir, "README.md"),
		[
			`# ${safeSlug}`,
			"",
			config.description || "AcaClaw research project.",
			"",
			"## Structure",
			"",
			"| Folder | Purpose |",
			"|--------|---------|",
			"| `data/` | Datasets, raw and processed |",
			"| `figures/` | Plots and visualizations |",
			"| `reports/` | Manuscripts, reports, drafts |",
			"| `notes/` | Research notes and observations |",
			"| `output/` | AI-generated outputs |",
			"| `memory/` | Project-specific agent memory |",
			"| `logs/` | Experiment and session logs |",
			"",
		].join("\n"),
	);

	return config;
}

/** List all projects in the workspace */
export function listProjects(workspaceRoot: string): ProjectInfo[] {
	const root = projectsRoot(workspaceRoot);
	if (!existsSync(root)) return [];

	const projects: ProjectInfo[] = [];
	try {
		const entries = readdirSync(root, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith(".")) continue;
			const projPath = join(root, entry.name);
			const config = readProjectConfig(projPath);
			if (!config) {
				// Bare directory without config — create a minimal config
				projects.push({
					name: entry.name,
					path: projPath,
					config: { name: entry.name, description: "", discipline: "general", createdAt: "" },
					fileCount: 0,
					totalSizeBytes: 0,
				});
				continue;
			}
			const stats = workspaceStats(projPath);
			projects.push({
				name: config.name,
				path: projPath,
				config,
				fileCount: stats.fileCount,
				totalSizeBytes: stats.totalSizeBytes,
			});
		}
	} catch { /* empty */ }

	return projects.sort((a, b) => a.name.localeCompare(b.name));
}

/** Delete a project directory (move to trash would be better, but rm for now) */
export function deleteProject(workspaceRoot: string, projectName: string): void {
	const projPath = join(projectsRoot(workspaceRoot), projectName);
	if (!existsSync(projPath)) throw new Error(`Project "${projectName}" not found`);
	// Safety: only delete if it's inside Projects dir
	const resolved = resolve(projPath);
	const rootResolved = resolve(projectsRoot(workspaceRoot));
	if (!resolved.startsWith(rootResolved + "/")) throw new Error("Invalid project path");
	rmSync(projPath, { recursive: true, force: true });
}

/** Set the active project in workspace config */
export function setActiveProject(workspaceRoot: string, projectName: string | null): void {
	const config = readWorkspaceConfig(workspaceRoot);
	if (!config) throw new Error("Workspace not initialized");
	config.activeProject = projectName ?? undefined;
	writeWorkspaceConfig(workspaceRoot, config);
}

/** Get the active project name */
export function getActiveProject(workspaceRoot: string): string | null {
	const config = readWorkspaceConfig(workspaceRoot);
	return config?.activeProject ?? null;
}

/** List files in a project directory */
export function listProjectFiles(projectPath: string, subPath?: string): FileEntry[] {
	const targetDir = subPath ? join(projectPath, subPath) : projectPath;
	if (!existsSync(targetDir)) return [];

	const entries: FileEntry[] = [];
	try {
		for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
			if (IGNORE_PATTERNS.includes(entry.name)) continue;
			if (entry.name.startsWith(".")) continue;
			const fullPath = join(targetDir, entry.name);
			if (entry.isDirectory()) {
				entries.push({ name: entry.name, type: "dir" });
			} else if (entry.isFile()) {
				try {
					const s = statSync(fullPath);
					entries.push({
						name: entry.name,
						type: "file",
						size: s.size,
						modified: s.mtime.toISOString().split("T")[0],
					});
				} catch {
					entries.push({ name: entry.name, type: "file" });
				}
			}
		}
	} catch { /* empty */ }

	// Sort: directories first, then alphabetical
	return entries.sort((a, b) => {
		if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}

export interface FileEntry {
	name: string;
	type: "file" | "dir";
	size?: number;
	modified?: string;
}

/** List files in any path under the workspace root */
export function listWorkspaceFiles(workspaceRoot: string, subPath?: string): FileEntry[] {
	const targetDir = subPath ? join(resolve(workspaceRoot), subPath) : resolve(workspaceRoot);
	// Safety: must be inside workspace root
	if (!resolve(targetDir).startsWith(resolve(workspaceRoot))) return [];
	return listProjectFiles(targetDir);
}

/** Create a folder inside the workspace */
export function createWorkspaceFolder(workspaceRoot: string, subPath: string): void {
	const targetDir = join(resolve(workspaceRoot), subPath);
	if (!resolve(targetDir).startsWith(resolve(workspaceRoot))) {
		throw new Error("Invalid path");
	}
	mkdirSync(targetDir, { recursive: true });
}

/** Create (or overwrite) a file inside the workspace */
export function createWorkspaceFile(workspaceRoot: string, subPath: string, content?: string): void {
	const targetFile = join(resolve(workspaceRoot), subPath);
	if (!resolve(targetFile).startsWith(resolve(workspaceRoot))) {
		throw new Error("Invalid path");
	}
	// Ensure parent dir exists
	const parentDir = join(targetFile, "..");
	mkdirSync(parentDir, { recursive: true });
	writeFileSync(targetFile, content ?? "");
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const TEXT_EXTS = new Set([
	"md", "txt", "py", "r", "js", "ts", "jsx", "tsx", "json", "yml", "yaml",
	"sh", "bash", "csv", "html", "css", "xml", "toml", "ini", "cfg", "conf",
	"ipynb", "tex", "bib", "sql", "rb", "rs", "c", "cpp", "h", "hpp", "java",
	"go", "lua", "pl", "m", "jl", "rmd", "qmd", "nix", "dockerfile", "makefile",
]);
const MAX_TEXT_SIZE = 512 * 1024; // 512 KB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

export interface FilePreview {
	type: "image" | "text" | "unsupported";
	name: string;
	ext: string;
	size: number;
	/** base64-encoded image data (for images) */
	data?: string;
	/** MIME type (for images) */
	mime?: string;
	/** text content (for text files) */
	content?: string;
	/** true when file was truncated */
	truncated?: boolean;
}

/** Read a file for preview — returns text content or base64 image data */
export function readWorkspaceFile(workspaceRoot: string, subPath: string): FilePreview {
	const targetFile = join(resolve(workspaceRoot), subPath);
	if (!resolve(targetFile).startsWith(resolve(workspaceRoot))) {
		throw new Error("Invalid path");
	}
	if (!existsSync(targetFile)) throw new Error("File not found");
	const st = statSync(targetFile);
	if (!st.isFile()) throw new Error("Not a file");

	const name = basename(targetFile);
	const ext = name.split(".").pop()?.toLowerCase() ?? "";

	// Image preview
	if (IMAGE_EXTS.has(ext)) {
		if (st.size > MAX_IMAGE_SIZE) {
			return { type: "image", name, ext, size: st.size, truncated: true };
		}
		const buf = readFileSync(targetFile);
		const mimeMap: Record<string, string> = {
			png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
			gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
			bmp: "image/bmp", ico: "image/x-icon",
		};
		return {
			type: "image", name, ext, size: st.size,
			data: buf.toString("base64"),
			mime: mimeMap[ext] ?? "application/octet-stream",
		};
	}

	// Text preview
	if (TEXT_EXTS.has(ext) || ext === "" || name.toLowerCase() === "makefile" || name.toLowerCase() === "dockerfile") {
		const truncated = st.size > MAX_TEXT_SIZE;
		const buf = readFileSync(targetFile, { encoding: "utf-8" });
		const content = truncated ? buf.slice(0, MAX_TEXT_SIZE) : buf;
		return { type: "text", name, ext, size: st.size, content, truncated };
	}

	return { type: "unsupported", name, ext, size: st.size };
}
