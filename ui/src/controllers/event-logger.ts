/**
 * Browser-side event logger.
 * Buffers UI events and forwards them to the gateway via the log.forward RPC.
 * Used for events that only happen in the browser (connection, auth, API key, etc.).
 */

import type { GatewayState } from "./gateway.ts";

/** Minimal gateway interface for the EventLogger. */
interface GatewayLike {
	state: GatewayState;
	call<T = unknown>(method: string, params?: unknown): Promise<T>;
}

interface EventEntry {
	ts: string;
	event: string;
	level: "debug" | "info" | "warn" | "error";
	source: "ui";
	traceId?: string;
	[key: string]: unknown;
}

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER_SIZE = 50;
const MAX_BATCH_SIZE = 100;

export class EventLogger {
	private _buffer: EventEntry[] = [];
	private _flushTimer: ReturnType<typeof setInterval>;
	private _gateway: GatewayLike;

	constructor(gateway: GatewayLike) {
		this._gateway = gateway;
		this._flushTimer = setInterval(() => this._flush(), FLUSH_INTERVAL_MS);
	}

	log(event: string, level: EventEntry["level"], fields: Record<string, unknown> = {}) {
		this._buffer.push({
			ts: new Date().toISOString(),
			event,
			level,
			source: "ui",
			...fields,
		});
		if (this._buffer.length >= MAX_BUFFER_SIZE) {
			this._flush();
		}
	}

	/** Generate a short trace ID for correlating related events. */
	static traceId(): string {
		return crypto.randomUUID?.().slice(0, 8) ?? `${Date.now().toString(36)}`;
	}

	dispose() {
		clearInterval(this._flushTimer);
		this._flush(); // Best-effort final flush
	}

	private async _flush() {
		if (this._buffer.length === 0) return;
		if (this._gateway.state !== "connected") return;

		const batch = this._buffer.splice(0, MAX_BATCH_SIZE);
		try {
			await this._gateway.call("log.forward", { entries: batch });
		} catch {
			// Re-queue on failure (will retry next interval)
			this._buffer.unshift(...batch);
			// Cap buffer to prevent unbounded growth on persistent failures
			if (this._buffer.length > MAX_BATCH_SIZE * 3) {
				this._buffer.splice(0, this._buffer.length - MAX_BATCH_SIZE);
			}
		}
	}
}
