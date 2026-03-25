import { describe, expect, it } from "vitest";
import {
	resolveConfig,
	versionGte,
	DEFAULT_CONFIG,
	type CompatConfig,
} from "../plugins/compat-checker/compat-checker.ts";

describe("@acaclaw/compat-checker", () => {
	// ── resolveConfig ──

	describe("resolveConfig", () => {
		it("returns defaults for empty input", () => {
			const c = resolveConfig({});
			expect(c.minOpenClawVersion).toBe(DEFAULT_CONFIG.minOpenClawVersion);
			expect(c.checkOnStartup).toBe(true);
		});

		it("overrides with provided values", () => {
			const c = resolveConfig({ minOpenClawVersion: "2025.1.1", checkOnStartup: false });
			expect(c.minOpenClawVersion).toBe("2025.1.1");
			expect(c.checkOnStartup).toBe(false);
		});

		it("ignores non-string version", () => {
			const c = resolveConfig({ minOpenClawVersion: 123 });
			expect(c.minOpenClawVersion).toBe(DEFAULT_CONFIG.minOpenClawVersion);
		});

		it("ignores empty string version", () => {
			const c = resolveConfig({ minOpenClawVersion: "  " });
			expect(c.minOpenClawVersion).toBe(DEFAULT_CONFIG.minOpenClawVersion);
		});

		it("ignores non-boolean checkOnStartup", () => {
			const c = resolveConfig({ checkOnStartup: "yes" });
			expect(c.checkOnStartup).toBe(DEFAULT_CONFIG.checkOnStartup);
		});
	});

	// ── versionGte ──

	describe("versionGte", () => {
		it("equal versions return true", () => {
			expect(versionGte("2026.3.7", "2026.3.7")).toBe(true);
		});

		it("higher year returns true", () => {
			expect(versionGte("2027.1.1", "2026.3.7")).toBe(true);
		});

		it("lower year returns false", () => {
			expect(versionGte("2025.12.31", "2026.1.1")).toBe(false);
		});

		it("higher month returns true", () => {
			expect(versionGte("2026.4.1", "2026.3.7")).toBe(true);
		});

		it("lower month returns false", () => {
			expect(versionGte("2026.2.28", "2026.3.7")).toBe(false);
		});

		it("higher day returns true", () => {
			expect(versionGte("2026.3.8", "2026.3.7")).toBe(true);
		});

		it("lower day returns false", () => {
			expect(versionGte("2026.3.6", "2026.3.7")).toBe(false);
		});

		it("shorter version pads with zero", () => {
			expect(versionGte("2026.3", "2026.3.0")).toBe(true);
			expect(versionGte("2026.3", "2026.3.1")).toBe(false);
		});

		it("single-segment versions", () => {
			expect(versionGte("2026", "2025")).toBe(true);
			expect(versionGte("2025", "2026")).toBe(false);
		});
	});
});
