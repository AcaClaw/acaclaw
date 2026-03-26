import { execSync } from "node:child_process";

export interface CompatConfig {
	minOpenClawVersion: string;
	checkOnStartup: boolean;
}

export const DEFAULT_CONFIG: CompatConfig = {
	minOpenClawVersion: "2026.3.24",
	checkOnStartup: true,
};

export function resolveConfig(raw: Record<string, unknown>): CompatConfig {
	return {
		minOpenClawVersion:
			typeof raw.minOpenClawVersion === "string" && raw.minOpenClawVersion.trim()
				? raw.minOpenClawVersion
				: DEFAULT_CONFIG.minOpenClawVersion,
		checkOnStartup:
			typeof raw.checkOnStartup === "boolean" ? raw.checkOnStartup : DEFAULT_CONFIG.checkOnStartup,
	};
}

export interface CompatCheckResult {
	passed: boolean;
	openClawVersion: string | null;
	checks: CompatCheck[];
}

export interface CompatCheck {
	name: string;
	passed: boolean;
	detail: string;
}

/**
 * Compare version strings (semver-ish: YYYY.M.D).
 * Returns true if actual >= required.
 */
export function versionGte(actual: string, required: string): boolean {
	const a = actual.split(".").map(Number);
	const b = required.split(".").map(Number);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const av = a[i] ?? 0;
		const bv = b[i] ?? 0;
		if (av > bv) return true;
		if (av < bv) return false;
	}
	return true; // equal
}

/**
 * Detect the installed OpenClaw version.
 */
export function detectOpenClawVersion(): string | null {
	try {
		const output = execSync("openclaw --version", { stdio: "pipe", encoding: "utf-8" });
		const match = output.match(/(\d+\.\d+\.\d+)/);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}

/**
 * Run all compatibility checks.
 */
export function runCompatChecks(config: CompatConfig): CompatCheckResult {
	const checks: CompatCheck[] = [];
	const ocVersion = detectOpenClawVersion();

	// Check 1: OpenClaw installed
	checks.push({
		name: "OpenClaw installed",
		passed: ocVersion !== null,
		detail: ocVersion ? `v${ocVersion}` : "OpenClaw not found",
	});

	// Check 2: Minimum version
	if (ocVersion) {
		const meetsMin = versionGte(ocVersion, config.minOpenClawVersion);
		checks.push({
			name: "Minimum version",
			passed: meetsMin,
			detail: meetsMin
				? `v${ocVersion} >= v${config.minOpenClawVersion}`
				: `v${ocVersion} < v${config.minOpenClawVersion} — upgrade required`,
		});
	}

	// Check 3: Plugin SDK available
	try {
		require.resolve("openclaw/plugin-sdk");
		checks.push({ name: "Plugin SDK", passed: true, detail: "Available" });
	} catch {
		checks.push({ name: "Plugin SDK", passed: false, detail: "Could not resolve openclaw/plugin-sdk" });
	}

	// Check 4: Node.js version
	const nodeVersion = process.version;
	const nodeMajor = parseInt(nodeVersion.slice(1), 10);
	checks.push({
		name: "Node.js version",
		passed: nodeMajor >= 22,
		detail: nodeMajor >= 22 ? `${nodeVersion} (>= 22)` : `${nodeVersion} — Node 22+ required`,
	});

	const allPassed = checks.every((c) => c.passed);

	return { passed: allPassed, openClawVersion: ocVersion, checks };
}
