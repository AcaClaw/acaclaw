import { describe, expect, it } from "vitest";
import {
	resolveConfig,
	condaRunPrefix,
	buildEnvContext,
	DISCIPLINE_ENVS,
	DEFAULT_CONFIG,
	type EnvStatus,
} from "../plugins/academic-env/academic-env.ts";

describe("@acaclaw/academic-env", () => {
	// ── DISCIPLINE_ENVS ──

	describe("DISCIPLINE_ENVS", () => {
		it("maps general to acaclaw", () => {
			expect(DISCIPLINE_ENVS.general).toBe("acaclaw");
		});

		it("maps biology to acaclaw-bio", () => {
			expect(DISCIPLINE_ENVS.biology).toBe("acaclaw-bio");
		});

		it("maps chemistry to acaclaw-chem", () => {
			expect(DISCIPLINE_ENVS.chemistry).toBe("acaclaw-chem");
		});

		it("maps medicine to acaclaw-med", () => {
			expect(DISCIPLINE_ENVS.medicine).toBe("acaclaw-med");
		});

		it("maps physics to acaclaw-phys", () => {
			expect(DISCIPLINE_ENVS.physics).toBe("acaclaw-phys");
		});

		it("has exactly 5 disciplines", () => {
			expect(Object.keys(DISCIPLINE_ENVS)).toHaveLength(5);
		});
	});

	// ── resolveConfig ──

	describe("resolveConfig", () => {
		it("returns defaults for empty input", () => {
			const c = resolveConfig({});
			expect(c.discipline).toBe("general");
			expect(c.autoActivate).toBe(true);
		});

		it("accepts valid discipline", () => {
			const c = resolveConfig({ discipline: "biology" });
			expect(c.discipline).toBe("biology");
		});

		it("normalizes discipline to lowercase", () => {
			const c = resolveConfig({ discipline: "Biology" });
			expect(c.discipline).toBe("biology");
		});

		it("falls back to general for unknown discipline", () => {
			const c = resolveConfig({ discipline: "astrology" });
			expect(c.discipline).toBe("general");
		});

		it("falls back to general for non-string discipline", () => {
			const c = resolveConfig({ discipline: 42 });
			expect(c.discipline).toBe("general");
		});

		it("falls back to general for empty string", () => {
			const c = resolveConfig({ discipline: "  " });
			expect(c.discipline).toBe("general");
		});

		it("overrides autoActivate", () => {
			const c = resolveConfig({ autoActivate: false });
			expect(c.autoActivate).toBe(false);
		});

		it("ignores non-boolean autoActivate", () => {
			const c = resolveConfig({ autoActivate: "yes" });
			expect(c.autoActivate).toBe(true);
		});
	});

	// ── condaRunPrefix ──

	describe("condaRunPrefix", () => {
		it("formats conda run command", () => {
			const prefix = condaRunPrefix("/usr/bin/conda", "acaclaw-bio");
			expect(prefix).toBe('"/usr/bin/conda" run -n acaclaw-bio');
		});

		it("handles path with spaces", () => {
			const prefix = condaRunPrefix("/home/user name/conda", "acaclaw");
			expect(prefix).toContain('"/home/user name/conda"');
		});
	});

	// ── buildEnvContext ──

	describe("buildEnvContext", () => {
		const baseStatus: EnvStatus = {
			condaAvailable: true,
			condaPath: "/opt/conda/bin/conda",
			discipline: "biology",
			envName: "acaclaw-bio",
			envExists: true,
			pythonVersion: "3.12.8",
			rVersion: "4.3.2",
			installedPackages: [
				{ name: "numpy", version: "1.26.0" },
				{ name: "pandas", version: "2.1.0" },
				{ name: "biopython", version: "1.82" },
			],
		};

		it("includes env name", () => {
			const ctx = buildEnvContext(baseStatus);
			expect(ctx).toContain("acaclaw-bio");
		});

		it("includes Python version", () => {
			const ctx = buildEnvContext(baseStatus);
			expect(ctx).toContain("3.12.8");
		});

		it("includes R version", () => {
			const ctx = buildEnvContext(baseStatus);
			expect(ctx).toContain("4.3.2");
		});

		it("lists available packages", () => {
			const ctx = buildEnvContext(baseStatus);
			expect(ctx).toContain("numpy");
			expect(ctx).toContain("pandas");
		});

		it("filters internal packages (prefixed with _)", () => {
			const status: EnvStatus = {
				...baseStatus,
				installedPackages: [
					{ name: "_internal", version: "1.0" },
					{ name: "numpy", version: "1.26.0" },
				],
			};
			const ctx = buildEnvContext(status);
			expect(ctx).not.toContain("_internal");
			expect(ctx).toContain("numpy");
		});

		it("filters lib-prefixed packages", () => {
			const status: EnvStatus = {
				...baseStatus,
				installedPackages: [
					{ name: "libffi", version: "3.4" },
					{ name: "scipy", version: "1.11" },
				],
			};
			const ctx = buildEnvContext(status);
			expect(ctx).not.toContain("libffi");
			expect(ctx).toContain("scipy");
		});

		it("reports no env when envExists is false", () => {
			const status: EnvStatus = { ...baseStatus, envExists: false };
			const ctx = buildEnvContext(status);
			expect(ctx).toContain("not available");
			expect(ctx).not.toContain("acaclaw-bio");
		});

		it("shows R not detected when rVersion is null", () => {
			const status: EnvStatus = { ...baseStatus, rVersion: null };
			const ctx = buildEnvContext(status);
			expect(ctx).toContain("not detected");
		});
	});
});
