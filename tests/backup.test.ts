import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	backupFile,
	listBackups,
	restoreFile,
	resolveConfig,
	DEFAULT_CONFIG,
	type BackupConfig,
} from "../plugins/backup/backup.ts";

describe("@acaclaw/backup", () => {
	let tempDir: string;
	let backupDir: string;
	let config: BackupConfig;

	const ctx = { toolName: "write", sessionId: "test-session" };

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "acaclaw-test-"));
		backupDir = join(tempDir, "backups");
		config = { ...DEFAULT_CONFIG, backupDir };
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("resolveConfig", () => {
		it("uses defaults when no config provided", () => {
			const result = resolveConfig({});
			expect(result.retentionDays).toBe(30);
			expect(result.maxStorageGB).toBe(10);
			expect(result.checksumAlgorithm).toBe("sha256");
		});

		it("returns defaults for undefined input", () => {
			const result = resolveConfig(undefined);
			expect(result.retentionDays).toBe(30);
		});

		it("overrides with provided values", () => {
			const result = resolveConfig({ retentionDays: 7, maxStorageGB: 5 });
			expect(result.retentionDays).toBe(7);
			expect(result.maxStorageGB).toBe(5);
			expect(result.checksumAlgorithm).toBe("sha256");
		});
	});

	describe("backupFile", () => {
		it("creates a backup of an existing file", async () => {
			const filePath = join(tempDir, "test.txt");
			await writeFile(filePath, "original content");

			const result = await backupFile(filePath, config, ctx);

			expect(result.backupPath).toBeTruthy();
			expect(result.metadataPath).toBeTruthy();

			const backupContent = await readFile(result.backupPath, "utf-8");
			expect(backupContent).toBe("original content");
		});

		it("returns empty paths for non-existent file", async () => {
			const filePath = join(tempDir, "nonexistent.txt");

			const result = await backupFile(filePath, config, ctx);

			expect(result.backupPath).toBe("");
			expect(result.metadataPath).toBe("");
		});

		it("preserves file content in backup", async () => {
			const content = "important research data\nline 2\nline 3";
			const filePath = join(tempDir, "data.csv");
			await writeFile(filePath, content);

			const result = await backupFile(filePath, config, ctx);
			expect(result.backupPath).toBeTruthy();

			const backupContent = await readFile(result.backupPath, "utf-8");
			expect(backupContent).toBe(content);
		});

		it("writes metadata JSON with tool and session info", async () => {
			const filePath = join(tempDir, "results.csv");
			await writeFile(filePath, "a,b,c\n1,2,3");

			const result = await backupFile(filePath, config, { toolName: "edit", sessionId: "sess-1" });

			const metaContent = await readFile(result.metadataPath, "utf-8");
			const meta = JSON.parse(metaContent);
			expect(meta.toolCall).toBe("edit");
			expect(meta.agentSession).toBe("sess-1");
			expect(meta.originalChecksum).toMatch(/^sha256:/);
			expect(meta.backupChecksum).toBe(meta.originalChecksum);
		});

		it("skips excluded files", async () => {
			const filePath = join(tempDir, "temp.tmp");
			await writeFile(filePath, "temporary");

			const result = await backupFile(filePath, config, ctx);

			expect(result.backupPath).toBe("");
			expect(result.metadataPath).toBe("");
		});

		it("skips files in excluded directories", async () => {
			const nodeModules = join(tempDir, "node_modules", "pkg");
			await mkdir(nodeModules, { recursive: true });
			const filePath = join(nodeModules, "index.js");
			await writeFile(filePath, "module code");

			const result = await backupFile(filePath, config, ctx);

			expect(result.backupPath).toBe("");
			expect(result.metadataPath).toBe("");
		});
	});

	describe("listBackups", () => {
		it("returns empty array for file with no backups", async () => {
			const backups = await listBackups(join(tempDir, "no-backup.txt"), config);
			expect(backups).toEqual([]);
		});

		it("lists backups after creating one", async () => {
			const filePath = join(tempDir, "document.docx");
			await writeFile(filePath, "content v1");
			await backupFile(filePath, config, ctx);

			const backups = await listBackups(filePath, config);
			expect(backups.length).toBe(1);
			expect(backups[0].originalPath).toContain("document.docx");
		});

		it("lists multiple backups in order", async () => {
			const filePath = join(tempDir, "evolving.txt");

			await writeFile(filePath, "version 1");
			await backupFile(filePath, config, ctx);

			// Delay to ensure different second-resolution timestamps
			await new Promise((r) => setTimeout(r, 1100));

			await writeFile(filePath, "version 2");
			await backupFile(filePath, config, { toolName: "edit", sessionId: "test" });

			const backups = await listBackups(filePath, config);
			expect(backups.length).toBe(2);
		});
	});

	describe("restoreFile", () => {
		it("restores a file from backup", async () => {
			const filePath = join(tempDir, "restore-test.txt");
			await writeFile(filePath, "original");
			const { backupPath } = await backupFile(filePath, config, ctx);

			await writeFile(filePath, "modified");

			await restoreFile(backupPath, filePath);

			const restored = await readFile(filePath, "utf-8");
			expect(restored).toBe("original");
		});

		it("throws when backup file does not exist", async () => {
			const fakePath = join(tempDir, "fake-backup.txt");

			await expect(restoreFile(fakePath, join(tempDir, "target.txt"))).rejects.toThrow(
				/Backup file not found/,
			);
		});
	});
});
