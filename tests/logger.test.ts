import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	EventJournal,
	resolveConfig,
	DEFAULT_CONFIG,
	type JournalConfig,
	type EventEntry,
} from "../plugins/logger/journal.ts";

describe("@acaclaw/logger", () => {
	let tempDir: string;
	let logDir: string;
	let config: JournalConfig;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "acaclaw-logger-test-"));
		logDir = join(tempDir, "logs");
		config = { ...DEFAULT_CONFIG, logDir };
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("resolveConfig", () => {
		it("uses defaults when no config provided", () => {
			const result = resolveConfig({});
			expect(result.enabled).toBe(true);
			expect(result.level).toBe("info");
			expect(result.retentionDays).toBe(30);
			expect(result.maxEventFileMB).toBe(100);
		});

		it("overrides with provided values", () => {
			const result = resolveConfig({
				eventJournal: { enabled: false, level: "warn", retentionDays: 7 },
			});
			expect(result.enabled).toBe(false);
			expect(result.level).toBe("warn");
			expect(result.retentionDays).toBe(7);
			expect(result.maxEventFileMB).toBe(100); // default kept
		});
	});

	describe("EventJournal.write", () => {
		it("writes an event entry to a JSONL file", async () => {
			const journal = new EventJournal(config);
			await journal.write("tool.invoke", "info", { toolName: "bash", toolCallId: "t1" });

			const date = new Date().toISOString().slice(0, 10);
			const content = await readFile(join(logDir, `events-${date}.jsonl`), "utf-8");
			const lines = content.trim().split("\n");
			expect(lines).toHaveLength(1);

			const entry = JSON.parse(lines[0]) as EventEntry;
			expect(entry.event).toBe("tool.invoke");
			expect(entry.level).toBe("info");
			expect(entry.source).toBe("plugin");
			expect(entry.toolName).toBe("bash");
			expect(entry.ts).toBeTruthy();
		});

		it("writes multiple events to the same file", async () => {
			const journal = new EventJournal(config);
			await journal.write("tool.invoke", "info", { toolName: "bash" });
			await journal.write("tool.complete", "info", { toolName: "bash", durationMs: 42 });
			await journal.write("chat.send", "info", { messageLength: 100 });

			const date = new Date().toISOString().slice(0, 10);
			const content = await readFile(join(logDir, `events-${date}.jsonl`), "utf-8");
			const lines = content.trim().split("\n");
			expect(lines).toHaveLength(3);

			const events = lines.map((l) => (JSON.parse(l) as EventEntry).event);
			expect(events).toEqual(["tool.invoke", "tool.complete", "chat.send"]);
		});

		it("respects level filtering", async () => {
			const warnConfig = { ...config, level: "warn" as const };
			const journal = new EventJournal(warnConfig);

			await journal.write("tool.invoke", "info", {});
			await journal.write("tool.invoke", "debug", {});
			await journal.write("tool.error", "warn", { error: "timeout" });
			await journal.write("chat.error", "error", { error: "crash" });

			const date = new Date().toISOString().slice(0, 10);
			const content = await readFile(join(logDir, `events-${date}.jsonl`), "utf-8");
			const lines = content.trim().split("\n");
			expect(lines).toHaveLength(2);

			const events = lines.map((l) => (JSON.parse(l) as EventEntry).event);
			expect(events).toEqual(["tool.error", "chat.error"]);
		});

		it("does not write when disabled", async () => {
			const disabledConfig = { ...config, enabled: false };
			const journal = new EventJournal(disabledConfig);

			await journal.write("tool.invoke", "info", {});

			let files: string[];
			try {
				files = await readdir(logDir);
			} catch {
				files = [];
			}
			expect(files).toHaveLength(0);
		});

		it("enforces max entry size", async () => {
			const journal = new EventJournal(config);
			const hugeField = "x".repeat(5000);
			await journal.write("malicious.event", "info", { payload: hugeField });

			let files: string[];
			try {
				files = await readdir(logDir);
			} catch {
				files = [];
			}
			expect(files).toHaveLength(0);
		});
	});

	describe("EventJournal.writeRaw", () => {
		it("forces source field from raw entries", async () => {
			const journal = new EventJournal(config);
			const raw: EventEntry = {
				ts: new Date().toISOString(),
				event: "connection.open",
				level: "info",
				source: "ui",
				connId: "conn-1",
			};
			await journal.writeRaw(raw);

			const date = new Date().toISOString().slice(0, 10);
			const content = await readFile(join(logDir, `events-${date}.jsonl`), "utf-8");
			const entry = JSON.parse(content.trim()) as EventEntry;
			expect(entry.event).toBe("connection.open");
			expect(entry.source).toBe("ui");
			expect(entry.connId).toBe("conn-1");
		});
	});

	describe("EventJournal.read", () => {
		it("reads entries for a given date", async () => {
			const journal = new EventJournal(config);
			await journal.write("tool.invoke", "info", { toolName: "bash" });
			await journal.write("chat.send", "info", { messageLength: 50 });

			const date = new Date().toISOString().slice(0, 10);
			const entries = await journal.read(date);
			expect(entries).toHaveLength(2);
			expect(entries[0].event).toBe("tool.invoke");
			expect(entries[1].event).toBe("chat.send");
		});

		it("returns empty array for non-existent date", async () => {
			const journal = new EventJournal(config);
			const entries = await journal.read("1999-01-01");
			expect(entries).toEqual([]);
		});
	});

	describe("EventJournal.pruneOldFiles", () => {
		it("deletes files older than retention period", async () => {
			const shortRetention = { ...config, retentionDays: 1 };
			const journal = new EventJournal(shortRetention);

			// Write today's entry
			await journal.write("today.event", "info", {});

			// Create an "old" file manually
			const { writeFile: wf, mkdir: mk } = await import("node:fs/promises");
			await mk(logDir, { recursive: true });
			const oldDate = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
			await wf(join(logDir, `events-${oldDate}.jsonl`), '{"ts":"...","event":"old","level":"info","source":"plugin"}\n');

			const pruned = await journal.pruneOldFiles();
			expect(pruned).toBe(1);

			const files = await readdir(logDir);
			expect(files.some((f) => f.includes(oldDate))).toBe(false);
		});

		it("keeps files within retention period", async () => {
			const journal = new EventJournal(config);
			await journal.write("today.event", "info", {});

			const pruned = await journal.pruneOldFiles();
			expect(pruned).toBe(0);

			const files = await readdir(logDir);
			expect(files.length).toBeGreaterThan(0);
		});

		it("returns 0 when log dir does not exist", async () => {
			const noDir = { ...config, logDir: join(tempDir, "nonexistent") };
			const journal = new EventJournal(noDir);
			const pruned = await journal.pruneOldFiles();
			expect(pruned).toBe(0);
		});
	});

	describe("EventJournal.maxEventFileMB", () => {
		it("stops writing when file exceeds size cap", async () => {
			// Use a tiny cap (1 byte) to trigger the size guard
			const tinyConfig = { ...config, maxEventFileMB: 0.000001 };
			const journal = new EventJournal(tinyConfig);

			// First write succeeds (cache starts at 0)
			await journal.write("first", "info", {});
			// Second write should be blocked by size cap
			await journal.write("second", "info", {});

			const date = new Date().toISOString().slice(0, 10);
			const content = await readFile(join(logDir, `events-${date}.jsonl`), "utf-8");
			const lines = content.trim().split("\n");
			expect(lines).toHaveLength(1);
			expect((JSON.parse(lines[0]) as EventEntry).event).toBe("first");
		});
	});
});
