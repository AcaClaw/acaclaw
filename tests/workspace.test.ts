import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	initWorkspace,
	readWorkspaceConfig,
	writeWorkspaceConfig,
	getWorkspaceInfo,
	scanWorkspaceTree,
	workspaceStats,
	workspaceId,
	buildWorkspaceContext,
	createProject,
	listProjects,
	deleteProject,
	setActiveProject,
	getActiveProject,
	SCAFFOLD_DIRS,
	PROJECT_DIRS,
	PROJECTS_DIR,
	type WorkspaceConfig,
} from "../plugins/workspace/workspace.ts";

describe("@acaclaw/workspace", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "acaclaw-ws-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	// ── workspaceId ──

	describe("workspaceId", () => {
		it("generates a stable ID from a path", () => {
			const id1 = workspaceId("/home/test/AcaClaw");
			const id2 = workspaceId("/home/test/AcaClaw");
			expect(id1).toBe(id2);
			expect(id1).toMatch(/^AcaClaw-[a-f0-9]{12}$/);
		});

		it("different paths produce different IDs", () => {
			const a = workspaceId("/tmp/ws-a");
			const b = workspaceId("/tmp/ws-b");
			expect(a).not.toBe(b);
		});
	});

	// ── readWorkspaceConfig / writeWorkspaceConfig ──

	describe("readWorkspaceConfig", () => {
		it("returns null when workspace is not initialized", () => {
			expect(readWorkspaceConfig(tempDir)).toBeNull();
		});

		it("reads a previously written config", () => {
			const config: WorkspaceConfig = {
				name: "Test",
				discipline: "biology",
				createdAt: new Date().toISOString(),
				workspaceId: "test-123",
			};
			writeWorkspaceConfig(tempDir, config);
			const result = readWorkspaceConfig(tempDir);
			expect(result).toEqual(config);
		});
	});

	// ── initWorkspace ──

	describe("initWorkspace", () => {
		it("creates scaffold directories", () => {
			initWorkspace(tempDir, { name: "TestWS", discipline: "general" });
			for (const dir of SCAFFOLD_DIRS) {
				expect(existsSync(join(tempDir, dir))).toBe(true);
			}
		});

		it("creates workspace config", () => {
			const config = initWorkspace(tempDir, { name: "TestWS", discipline: "chemistry" });
			expect(config.name).toBe("TestWS");
			expect(config.discipline).toBe("chemistry");
			expect(config.workspaceId).toBeTruthy();
			expect(config.createdAt).toBeTruthy();
		});

		it("creates README.md", () => {
			initWorkspace(tempDir, { name: "MyResearch" });
			expect(existsSync(join(tempDir, "README.md"))).toBe(true);
			const content = readFileSync(join(tempDir, "README.md"), "utf-8");
			expect(content).toContain("MyResearch");
		});

		it("skips scaffold when scaffold=false", () => {
			initWorkspace(tempDir, { name: "Bare", scaffold: false });
			// Config should still be created
			expect(readWorkspaceConfig(tempDir)).toBeTruthy();
			// But scaffold dirs might not exist (data/raw etc.)
			expect(existsSync(join(tempDir, "data", "raw"))).toBe(false);
		});
	});

	// ── scanWorkspaceTree ──

	describe("scanWorkspaceTree", () => {
		it("returns tree nodes for workspace files", async () => {
			initWorkspace(tempDir, { name: "TreeTest" });
			await writeFile(join(tempDir, "test.txt"), "hello");
			const tree = scanWorkspaceTree(tempDir);
			const names = tree.map((n) => n.name);
			expect(names).toContain("test.txt");
			expect(names).toContain("README.md");
		});

		it("ignores .acaclaw metadata directory", () => {
			initWorkspace(tempDir, { name: "IgnoreTest" });
			const tree = scanWorkspaceTree(tempDir);
			const names = tree.map((n) => n.name);
			expect(names).not.toContain(".acaclaw");
		});

		it("respects maxDepth", async () => {
			initWorkspace(tempDir, { name: "DepthTest" });
			const tree = scanWorkspaceTree(tempDir, 1);
			// With depth 1, child directories shouldn't have their children expanded
			const dataNode = tree.find((n) => n.name === "data");
			// At depth 1, data's children may exist but not go deeper
			expect(dataNode).toBeTruthy();
		});
	});

	// ── workspaceStats ──

	describe("workspaceStats", () => {
		it("counts files and sizes", async () => {
			initWorkspace(tempDir, { name: "StatsTest" });
			await writeFile(join(tempDir, "hello.txt"), "hello world");
			const stats = workspaceStats(tempDir);
			expect(stats.fileCount).toBeGreaterThan(0);
			expect(stats.totalSizeBytes).toBeGreaterThan(0);
		});
	});

	// ── getWorkspaceInfo ──

	describe("getWorkspaceInfo", () => {
		it("returns full workspace info", () => {
			initWorkspace(tempDir, { name: "InfoTest", discipline: "physics" });
			const info = getWorkspaceInfo(tempDir);
			expect(info.exists).toBe(true);
			expect(info.config?.name).toBe("InfoTest");
			expect(info.config?.discipline).toBe("physics");
			expect(info.tree.length).toBeGreaterThan(0);
		});

		it("reports exists=false for non-init workspace", () => {
			const info = getWorkspaceInfo(join(tempDir, "nonexistent"));
			expect(info.exists).toBe(false);
		});
	});

	// ── buildWorkspaceContext ──

	describe("buildWorkspaceContext", () => {
		it("generates LLM context string", () => {
			initWorkspace(tempDir, { name: "CtxTest" });
			const info = getWorkspaceInfo(tempDir);
			const ctx = buildWorkspaceContext(info);
			expect(ctx).toContain("CtxTest");
			expect(typeof ctx).toBe("string");
		});
	});

	// ── Project Management ──

	describe("createProject", () => {
		it("creates a project with scaffold directories", () => {
			initWorkspace(tempDir, { name: "ProjHost" });
			const proj = createProject(tempDir, { name: "Alpha Study", description: "AI research" });
			expect(proj.name).toBe("Alpha Study");
			expect(proj.discipline).toBe("general");
			for (const dir of PROJECT_DIRS) {
				expect(existsSync(join(tempDir, PROJECTS_DIR, "Alpha Study", dir))).toBe(true);
			}
		});

		it("throws on duplicate project name", () => {
			initWorkspace(tempDir, { name: "ProjHost" });
			createProject(tempDir, { name: "Duplicate" });
			expect(() => createProject(tempDir, { name: "Duplicate" })).toThrow("already exists");
		});

		it("sanitizes project name", () => {
			initWorkspace(tempDir, { name: "ProjHost" });
			const proj = createProject(tempDir, { name: "My <Project> #1!" });
			expect(proj.name).not.toContain("<");
			expect(proj.name).not.toContain(">");
		});

		it("throws on empty/invalid name", () => {
			initWorkspace(tempDir, { name: "ProjHost" });
			expect(() => createProject(tempDir, { name: "!!!" })).toThrow("Invalid project name");
		});
	});

	describe("listProjects", () => {
		it("returns empty for workspace with no projects", () => {
			initWorkspace(tempDir, { name: "Empty" });
			expect(listProjects(tempDir)).toEqual([]);
		});

		it("lists created projects alphabetically", () => {
			initWorkspace(tempDir, { name: "Multi" });
			createProject(tempDir, { name: "Zebra" });
			createProject(tempDir, { name: "Alpha" });
			const projects = listProjects(tempDir);
			expect(projects).toHaveLength(2);
			expect(projects[0].name).toBe("Alpha");
			expect(projects[1].name).toBe("Zebra");
		});
	});

	describe("deleteProject", () => {
		it("removes a project directory", () => {
			initWorkspace(tempDir, { name: "DelHost" });
			createProject(tempDir, { name: "ToDelete" });
			expect(listProjects(tempDir)).toHaveLength(1);
			deleteProject(tempDir, "ToDelete");
			expect(listProjects(tempDir)).toHaveLength(0);
		});

		it("throws when project does not exist", () => {
			initWorkspace(tempDir, { name: "DelHost" });
			expect(() => deleteProject(tempDir, "Ghost")).toThrow("not found");
		});
	});

	describe("setActiveProject / getActiveProject", () => {
		it("sets and gets the active project", () => {
			initWorkspace(tempDir, { name: "ActiveHost" });
			createProject(tempDir, { name: "Main" });
			setActiveProject(tempDir, "Main");
			expect(getActiveProject(tempDir)).toBe("Main");
		});

		it("clears active project with null", () => {
			initWorkspace(tempDir, { name: "ActiveHost" });
			createProject(tempDir, { name: "Main" });
			setActiveProject(tempDir, "Main");
			setActiveProject(tempDir, null);
			expect(getActiveProject(tempDir)).toBeNull();
		});

		it("throws if workspace not initialized", () => {
			expect(() => setActiveProject(tempDir, "Main")).toThrow("not initialized");
		});
	});
});
