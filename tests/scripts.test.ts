import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";

/**
 * Tests for scripts/measure-latency.sh and scripts/test-performance.sh.
 * Validates script structure, syntax, helper functions, and CLI flags.
 */

const SCRIPT_DIR = resolve(__dirname, "../scripts");
const LATENCY_SCRIPT = join(SCRIPT_DIR, "measure-latency.sh");
const PERF_SCRIPT = join(SCRIPT_DIR, "test-performance.sh");
const OPEN_UI_SCRIPT = join(SCRIPT_DIR, "open-ui.sh");

function bashSyntaxCheck(path: string): Promise<{ ok: boolean; stderr: string }> {
	return new Promise((resolve) => {
		execFile("bash", ["-n", path], (err, _stdout, stderr) => {
			resolve({ ok: !err, stderr: stderr.toString() });
		});
	});
}

describe("scripts/measure-latency.sh", () => {
	let content: string;

	it("has valid bash syntax", async () => {
		const result = await bashSyntaxCheck(LATENCY_SCRIPT);
		expect(result.ok).toBe(true);
	});

	it("starts with shebang", async () => {
		content = await readFile(LATENCY_SCRIPT, "utf-8");
		expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
	});

	it("uses set -euo pipefail", async () => {
		content ??= await readFile(LATENCY_SCRIPT, "utf-8");
		expect(content).toContain("set -euo pipefail");
	});

	it("defines ACACLAW_PORT with default", async () => {
		content ??= await readFile(LATENCY_SCRIPT, "utf-8");
		expect(content).toMatch(/ACACLAW_PORT=.*2090/);
	});

	it("has timing helper _now_ms", async () => {
		content ??= await readFile(LATENCY_SCRIPT, "utf-8");
		expect(content).toContain("_now_ms()");
	});

	it("has timing helper _fmt_ms", async () => {
		content ??= await readFile(LATENCY_SCRIPT, "utf-8");
		expect(content).toContain("_fmt_ms()");
	});

	it("has color output helper _color_ms", async () => {
		content ??= await readFile(LATENCY_SCRIPT, "utf-8");
		expect(content).toContain("_color_ms()");
	});

	it("supports --cold flag", async () => {
		content ??= await readFile(LATENCY_SCRIPT, "utf-8");
		expect(content).toContain("--cold");
	});

	it("supports --warm flag", async () => {
		content ??= await readFile(LATENCY_SCRIPT, "utf-8");
		expect(content).toContain("--warm");
	});

	it("supports --browser flag", async () => {
		content ??= await readFile(LATENCY_SCRIPT, "utf-8");
		expect(content).toContain("--browser");
	});

	it("measures PATH bootstrap phase", async () => {
		content ??= await readFile(LATENCY_SCRIPT, "utf-8");
		expect(content).toContain("measure_path_bootstrap");
	});
});

describe("scripts/test-performance.sh", () => {
	let content: string;

	it("has valid bash syntax", async () => {
		const result = await bashSyntaxCheck(PERF_SCRIPT);
		expect(result.ok).toBe(true);
	});

	it("starts with shebang", async () => {
		content = await readFile(PERF_SCRIPT, "utf-8");
		expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
	});

	it("uses set -euo pipefail", async () => {
		content ??= await readFile(PERF_SCRIPT, "utf-8");
		expect(content).toContain("set -euo pipefail");
	});

	it("supports --perf flag", async () => {
		content ??= await readFile(PERF_SCRIPT, "utf-8");
		expect(content).toContain("--perf");
	});

	it("supports --avail flag", async () => {
		content ??= await readFile(PERF_SCRIPT, "utf-8");
		expect(content).toContain("--avail");
	});

	it("supports --json output", async () => {
		content ??= await readFile(PERF_SCRIPT, "utf-8");
		expect(content).toContain("--json");
	});

	it("tracks pass/fail/warn/skip counts", async () => {
		content ??= await readFile(PERF_SCRIPT, "utf-8");
		expect(content).toContain("PASS_COUNT");
		expect(content).toContain("FAIL_COUNT");
		expect(content).toContain("WARN_COUNT");
		expect(content).toContain("SKIP_COUNT");
	});

	it("has result recording helpers (_pass, _fail)", async () => {
		content ??= await readFile(PERF_SCRIPT, "utf-8");
		expect(content).toContain("_pass()");
		expect(content).toContain("_fail()");
	});

	it("defines ACACLAW_PORT and OPENCLAW_PORT", async () => {
		content ??= await readFile(PERF_SCRIPT, "utf-8");
		expect(content).toMatch(/ACACLAW_PORT=.*2090/);
		expect(content).toMatch(/OPENCLAW_PORT=.*18789/);
	});
});

describe("scripts/open-ui.sh", () => {
	it("has valid bash syntax", async () => {
		const result = await bashSyntaxCheck(OPEN_UI_SCRIPT);
		expect(result.ok).toBe(true);
	});

	it("delegates to start.sh", async () => {
		const content = await readFile(OPEN_UI_SCRIPT, "utf-8");
		expect(content).toContain("start.sh");
	});

	it("uses exec for clean delegation", async () => {
		const content = await readFile(OPEN_UI_SCRIPT, "utf-8");
		expect(content).toContain("exec bash");
	});
});
