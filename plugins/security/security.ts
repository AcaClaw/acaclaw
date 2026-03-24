import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

// --- Types ---

export interface AuditEntry {
	timestamp: string;
	event: "tool_call" | "tool_blocked" | "credential_scrubbed" | "injection_warning" | "network_blocked";
	toolName?: string;
	detail: string;
	filePath?: string;
	runId?: string;
	workspace?: string;
}

export interface SecurityConfig {
	mode: "standard" | "maximum";
	auditLogDir: string;
	enableNetworkPolicy: boolean;
	enableCredentialScrubbing: boolean;
	enableInjectionDetection: boolean;
	customDenyCommands: string[];
	customAllowedDomains: string[];
}

// --- Defaults ---

export const DEFAULT_CONFIG: SecurityConfig = {
	mode: "standard",
	auditLogDir: join(homedir(), ".acaclaw", "audit"),
	enableNetworkPolicy: false,
	enableCredentialScrubbing: true,
	enableInjectionDetection: true,
	customDenyCommands: [],
	customAllowedDomains: [],
};

export function resolveConfig(pluginConfig: Record<string, unknown>): SecurityConfig {
	return {
		mode: (pluginConfig.mode as SecurityConfig["mode"]) ?? DEFAULT_CONFIG.mode,
		auditLogDir: (pluginConfig.auditLogDir as string) ?? DEFAULT_CONFIG.auditLogDir,
		enableNetworkPolicy: (pluginConfig.enableNetworkPolicy as boolean) ?? DEFAULT_CONFIG.enableNetworkPolicy,
		enableCredentialScrubbing:
			(pluginConfig.enableCredentialScrubbing as boolean) ?? DEFAULT_CONFIG.enableCredentialScrubbing,
		enableInjectionDetection:
			(pluginConfig.enableInjectionDetection as boolean) ?? DEFAULT_CONFIG.enableInjectionDetection,
		customDenyCommands: (pluginConfig.customDenyCommands as string[]) ?? DEFAULT_CONFIG.customDenyCommands,
		customAllowedDomains: (pluginConfig.customAllowedDomains as string[]) ?? DEFAULT_CONFIG.customAllowedDomains,
	};
}

// --- Dangerous command patterns ---

const DANGEROUS_COMMAND_PATTERNS: readonly RegExp[] = [
	/\brm\s+(-[a-z]*r[a-z]*\s+)?(-[a-z]*f[a-z]*\s+)?(\/|~)/i, // rm -rf / or ~
	/\bchmod\s+(777|a\+[rwx]{3})\b/,
	/\bcurl\b.*\|\s*(ba)?sh\b/, // curl | sh
	/\bwget\b.*\|\s*(ba)?sh\b/,
	/\bdd\s+.*of=\/dev\//,
	/\bmkfs\b/,
	/\b:\(\)\s*\{\s*:\|\s*:&\s*\}\s*;/i, // fork bomb
	/\bsudo\s+rm\b/,
	/\bsudo\s+chmod\b/,
	/\bsudo\s+chown\b/,
	/\bnc\s+-[a-z]*l[a-z]*\s/i, // netcat listener
	/\beval\s*\(.*base64/i,
	/>\s*\/etc\/(passwd|shadow|hosts|sudoers)\b/,
	/\biptables\b/,
	/\bsystemctl\s+(disable|mask|stop)\b/,
];

// Control-plane tools that should be denied in academic contexts
const DENIED_TOOLS = new Set([
	"gateway",
	"cron",
	"sessions_spawn",
	"sessions_send",
	"mcp_install",
	"mcp_uninstall",
	"config_set",
]);

// Tools whose commands need shell inspection
const SHELL_TOOLS = new Set(["bash", "exec", "process", "run_command"]);

// --- Credential patterns for output scrubbing ---

const CREDENTIAL_PATTERNS: readonly RegExp[] = [
	/\b(sk-[a-zA-Z0-9]{20,})\b/g, // OpenAI keys
	/\b(ghp_[a-zA-Z0-9]{36,})\b/g, // GitHub PATs
	/\b(gho_[a-zA-Z0-9]{36,})\b/g, // GitHub OAuth
	/\b(glpat-[a-zA-Z0-9_-]{20,})\b/g, // GitLab PATs
	/\b(xoxb-[a-zA-Z0-9-]+)\b/g, // Slack bot tokens
	/\b(xoxp-[a-zA-Z0-9-]+)\b/g, // Slack user tokens
	/\bAKIA[0-9A-Z]{16}\b/g, // AWS access keys
	/\b(eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+)\b/g, // JWTs
	/\b([a-zA-Z0-9+/]{40,}={0,2})\b/g, // Long base64 (possible secrets)
	/-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
	/\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g, // AWS keys
];

// --- Prompt injection patterns ---

const INJECTION_PATTERNS: readonly RegExp[] = [
	/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i,
	/you\s+are\s+now\s+(a|an|the)\s+/i,
	/disregard\s+(all|any|your)\s+(previous|prior)/i,
	/new\s+instructions?\s*:/i,
	/\bsystem\s*:\s*you\s+are\b/i,
	/\bdo\s+not\s+follow\s+(any|the|your)\s+(previous|prior|original)/i,
	/\boverride\s+(?:(?:all|any|the|your)\s+)*(?:instructions|rules|guidelines)/i,
	/\bact\s+as\s+if\s+you\s+(have\s+)?no\s+(restrictions|rules|guidelines)/i,
];

// --- Academic network allowlist ---

const ACADEMIC_DOMAINS: readonly string[] = [
	// Research databases
	"arxiv.org",
	"api.semanticscholar.org",
	"eutils.ncbi.nlm.nih.gov",
	"api.crossref.org",
	"api.openalex.org",
	"doi.org",
	"unpaywall.org",
	"api.core.ac.uk",
	"api.dimensions.ai",
	"api.ror.org",
	"api.orcid.org",
	// Package registries
	"registry.npmjs.org",
	"pypi.org",
	"cran.r-project.org",
	// Version control
	"github.com",
	"api.github.com",
	"gitlab.com",
	"bitbucket.org",
	// Documentation
	"docs.python.org",
	"devdocs.io",
	"developer.mozilla.org",
	// LaTeX
	"ctan.org",
	"overleaf.com",
];

// --- Core functions ---

/**
 * Check whether a shell command contains dangerous patterns.
 * Returns the matching pattern description if dangerous, null otherwise.
 */
export function checkDangerousCommand(command: string, customDeny: string[]): string | null {
	for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
		if (pattern.test(command)) {
			return `Matches dangerous pattern: ${pattern.source}`;
		}
	}

	for (const denied of customDeny) {
		if (command.includes(denied)) {
			return `Matches custom deny rule: ${denied}`;
		}
	}

	return null;
}

/**
 * Check if a tool is denied in academic context.
 */
export function isToolDenied(toolName: string): boolean {
	return DENIED_TOOLS.has(toolName);
}

/**
 * Check if a tool involves shell execution.
 */
export function isShellTool(toolName: string): boolean {
	return SHELL_TOOLS.has(toolName);
}

/**
 * Extract the command string from tool params.
 */
export function extractCommand(params: Record<string, unknown>): string | null {
	if (typeof params.command === "string") return params.command;
	if (typeof params.cmd === "string") return params.cmd;
	if (typeof params.script === "string") return params.script;
	return null;
}

/**
 * Scrub credentials from text, replacing them with [REDACTED].
 */
export function scrubCredentials(text: string): { scrubbed: string; count: number } {
	let count = 0;
	let result = text;

	for (const pattern of CREDENTIAL_PATTERNS) {
		// Reset lastIndex for global patterns
		pattern.lastIndex = 0;
		const matches = result.match(pattern);
		if (matches) {
			count += matches.length;
			result = result.replace(pattern, "[REDACTED]");
		}
	}

	return { scrubbed: result, count };
}

/**
 * Detect prompt injection patterns in text.
 * Returns list of matched pattern descriptions.
 */
export function detectInjection(text: string): string[] {
	const matches: string[] = [];
	for (const pattern of INJECTION_PATTERNS) {
		if (pattern.test(text)) {
			matches.push(pattern.source);
		}
	}
	return matches;
}

/**
 * Check whether a URL is in the academic domain allowlist.
 */
export function isDomainAllowed(url: string, customDomains: string[]): boolean {
	let hostname: string;
	try {
		hostname = new URL(url).hostname;
	} catch {
		// Not a valid URL — allow (might be a relative path)
		return true;
	}

	const allDomains = [...ACADEMIC_DOMAINS, ...customDomains];
	return allDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

/**
 * Get the full list of allowed domains (built-in + custom).
 */
export function getAllowedDomains(customDomains: string[]): string[] {
	return [...ACADEMIC_DOMAINS, ...customDomains];
}

// --- Audit logging ---

/**
 * Write an audit entry to the log file.
 */
export async function writeAuditEntry(logDir: string, entry: AuditEntry): Promise<void> {
	const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
	const logPath = join(logDir, `${date}.jsonl`);

	await mkdir(dirname(logPath), { recursive: true });

	const line = JSON.stringify(entry) + "\n";
	await appendFile(logPath, line, "utf-8");
}

/**
 * Read audit entries for a given date.
 */
export async function readAuditLog(logDir: string, date: string): Promise<AuditEntry[]> {
	const logPath = join(logDir, `${date}.jsonl`);

	try {
		await stat(logPath);
	} catch {
		return [];
	}

	const content = await readFile(logPath, "utf-8");
	return content
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as AuditEntry);
}
