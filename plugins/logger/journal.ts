import { appendFile, mkdir, readFile, readdir, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// --- Types ---

export interface EventEntry {
	ts: string;
	event: string;
	level: "debug" | "info" | "warn" | "error";
	source: "ui" | "plugin" | "gateway" | "script";
	traceId?: string;
	agentId?: string;
	sessionKey?: string;
	connId?: string;
	durationMs?: number;
	error?: string;
	[key: string]: unknown;
}

export interface JournalConfig {
	enabled: boolean;
	level: "debug" | "info" | "warn" | "error";
	logDir: string;
	retentionDays: number;
	maxEventFileMB: number;
}

// --- Defaults ---

export const DEFAULT_CONFIG: JournalConfig = {
	enabled: true,
	level: "info",
	logDir: join(homedir(), ".acaclaw", "logs"),
	retentionDays: 30,
	maxEventFileMB: 100,
};

const LEVEL_PRIORITY: Record<string, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const MAX_ENTRY_BYTES = 4096;

export function resolveConfig(pluginConfig: Record<string, unknown>): JournalConfig {
	const journal = (pluginConfig.eventJournal as Record<string, unknown>) ?? {};
	return {
		enabled: (journal.enabled as boolean) ?? DEFAULT_CONFIG.enabled,
		level: (journal.level as JournalConfig["level"]) ?? DEFAULT_CONFIG.level,
		logDir: (journal.logDir as string) ?? DEFAULT_CONFIG.logDir,
		retentionDays: (journal.retentionDays as number) ?? DEFAULT_CONFIG.retentionDays,
		maxEventFileMB: (journal.maxEventFileMB as number) ?? DEFAULT_CONFIG.maxEventFileMB,
	};
}

// --- EventJournal ---

export class EventJournal {
	private _config: JournalConfig;
	private _sizeCache = new Map<string, number>();

	constructor(config: JournalConfig) {
		this._config = config;
	}

	/** Write a structured event entry to today's JSONL log file. */
	async write(
		event: string,
		level: EventEntry["level"],
		fields: Record<string, unknown>,
	): Promise<void> {
		if (!this._config.enabled) return;
		if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this._config.level]) return;

		const entry: EventEntry = {
			ts: new Date().toISOString(),
			event,
			level,
			source: "plugin",
			...fields,
		};

		await this._append(entry);
	}

	/** Write a raw event entry (used for UI-forwarded events). */
	async writeRaw(entry: EventEntry): Promise<void> {
		if (!this._config.enabled) return;
		if (LEVEL_PRIORITY[entry.level] < LEVEL_PRIORITY[this._config.level]) return;

		await this._append(entry);
	}

	/** Read event entries for a given date. */
	async read(date: string): Promise<EventEntry[]> {
		const logPath = join(this._config.logDir, `events-${date}.jsonl`);

		try {
			await stat(logPath);
		} catch {
			return [];
		}

		const content = await readFile(logPath, "utf-8");
		return content
			.split("\n")
			.filter((line) => line.trim())
			.map((line) => JSON.parse(line) as EventEntry);
	}

	/** Delete log files older than retentionDays. */
	async pruneOldFiles(): Promise<number> {
		const dir = this._config.logDir;
		const cutoff = Date.now() - this._config.retentionDays * 86_400_000;
		let pruned = 0;

		let files: string[];
		try {
			files = await readdir(dir);
		} catch {
			return 0;
		}

		for (const file of files) {
			const match = file.match(/^events-(\d{4}-\d{2}-\d{2})\.jsonl$/);
			if (!match) continue;
			const fileDate = new Date(match[1]).getTime();
			if (Number.isNaN(fileDate) || fileDate >= cutoff) continue;

			await unlink(join(dir, file));
			pruned++;
		}

		return pruned;
	}

	private async _append(entry: EventEntry): Promise<void> {
		const date = entry.ts.slice(0, 10); // YYYY-MM-DD
		const logPath = join(this._config.logDir, `events-${date}.jsonl`);

		// Check size cap (cached per file to avoid stat on every write)
		const maxBytes = this._config.maxEventFileMB * 1_048_576;
		const cachedSize = this._sizeCache.get(logPath) ?? 0;
		if (cachedSize >= maxBytes) return;

		await mkdir(dirname(logPath), { recursive: true });

		const line = JSON.stringify(entry) + "\n";
		// Enforce max entry size to prevent log injection with huge payloads
		if (line.length > MAX_ENTRY_BYTES) return;

		await appendFile(logPath, line, "utf-8");
		this._sizeCache.set(logPath, cachedSize + line.length);
	}
}
