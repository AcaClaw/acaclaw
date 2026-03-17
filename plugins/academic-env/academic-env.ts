import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Discipline name → conda env name mapping
export const DISCIPLINE_ENVS: Record<string, string> = {
	general: "acaclaw",
	biology: "acaclaw-bio",
	chemistry: "acaclaw-chem",
	medicine: "acaclaw-med",
	physics: "acaclaw-phys",
};

// Discipline → human-readable description for LLM context
const DISCIPLINE_DESCRIPTIONS: Record<string, string> = {
	general: "General academic computing (Python: NumPy, SciPy, Pandas, Matplotlib, SymPy; R: tidyverse, ggplot2, dplyr; JupyterLab)",
	biology: "Biology & genomics (Python: Biopython, scikit-bio; R: BiocManager + base stacks)",
	chemistry: "Chemistry & molecular analysis (Python: RDKit; R: base stats + base stacks)",
	medicine: "Medicine & clinical research (Python: lifelines, pydicom; R: survival + base stacks)",
	physics: "Physics & astrophysics (Python: Astropy, lmfit; R: base stats + base stacks)",
};

export interface EnvConfig {
	discipline: string;
	autoActivate: boolean;
}

export const DEFAULT_CONFIG: EnvConfig = {
	discipline: "general",
	autoActivate: true,
};

export function resolveConfig(raw: Record<string, unknown>): EnvConfig {
	const disc = typeof raw.discipline === "string" && raw.discipline.trim()
		? raw.discipline.trim().toLowerCase()
		: DEFAULT_CONFIG.discipline;
	return {
		discipline: disc in DISCIPLINE_ENVS ? disc : DEFAULT_CONFIG.discipline,
		autoActivate:
			typeof raw.autoActivate === "boolean" ? raw.autoActivate : DEFAULT_CONFIG.autoActivate,
	};
}

/**
 * Read the selected discipline from the config file written at install time.
 * Falls back to the plugin config value.
 */
export function readInstalledDiscipline(configDiscipline: string): string {
	const profilePath = join(homedir(), ".acaclaw", "config", "profile.txt");
	if (existsSync(profilePath)) {
		const stored = readFileSync(profilePath, "utf-8").trim().toLowerCase();
		if (stored && stored in DISCIPLINE_ENVS) return stored;
		// legacy: empty string means "general"
		if (stored === "") return "general";
	}
	return configDiscipline;
}

export interface EnvStatus {
	condaAvailable: boolean;
	condaPath: string | null;
	discipline: string;
	envName: string;
	envExists: boolean;
	pythonVersion: string | null;
	rVersion: string | null;
	installedPackages: PackageInfo[];
}

export interface PackageInfo {
	name: string;
	version: string;
}

/**
 * Find the conda binary — checks stored prefix first, then AcaClaw's Miniforge,
 * then common user install paths, then system conda on PATH.
 */
export function findConda(): { available: boolean; path: string | null } {
	const home = homedir();

	// Check if installer saved a specific conda prefix
	const prefixFile = join(home, ".acaclaw", "config", "conda-prefix.txt");
	const storedPaths: string[] = [];
	if (existsSync(prefixFile)) {
		const stored = readFileSync(prefixFile, "utf-8").trim();
		if (stored) {
			storedPaths.push(join(stored, "bin", "conda"), join(stored, "condabin", "conda"));
		}
	}

	const miniforgeDir = join(home, ".acaclaw", "miniforge3");

	// Priority order: stored prefix → AcaClaw's own → common user installs → system PATH
	const condaPaths = [
		...storedPaths,
		join(miniforgeDir, "bin", "conda"),
		join(miniforgeDir, "condabin", "conda"),
		join(home, "miniforge3", "bin", "conda"),
		join(home, "miniforge3", "condabin", "conda"),
		join(home, "mambaforge", "bin", "conda"),
		join(home, "mambaforge", "condabin", "conda"),
		join(home, "miniconda3", "bin", "conda"),
		join(home, "miniconda3", "condabin", "conda"),
	];

	for (const p of condaPaths) {
		try {
			execSync(`"${p}" --version`, { stdio: "pipe" });
			return { available: true, path: p };
		} catch {
			// Try next path
		}
	}

	try {
		execSync("conda --version", { stdio: "pipe" });
		return { available: true, path: "conda" };
	} catch {
		return { available: false, path: null };
	}
}

/**
 * Detect the full environment status for a given discipline.
 */
export function detectEnvironment(discipline: string): EnvStatus {
	const envName = DISCIPLINE_ENVS[discipline] ?? DISCIPLINE_ENVS.general;
	const conda = findConda();

	const status: EnvStatus = {
		condaAvailable: conda.available,
		condaPath: conda.path,
		discipline,
		envName,
		envExists: false,
		pythonVersion: null,
		rVersion: null,
		installedPackages: [],
	};

	if (!conda.available || !conda.path) return status;

	// Check if the env exists
	try {
		const envList = execSync(`"${conda.path}" env list --json`, {
			stdio: "pipe",
			encoding: "utf-8",
		});
		const parsed = JSON.parse(envList);
		const envs: string[] = parsed.envs ?? [];
		status.envExists = envs.some((e: string) => e.endsWith(`/envs/${envName}`) || e.endsWith(`/${envName}`));
	} catch {
		return status;
	}

	if (!status.envExists) return status;

	// Get Python version
	try {
		const condaRun = `"${conda.path}" run -n ${envName}`;
		const version = execSync(`${condaRun} python --version`, {
			stdio: "pipe",
			encoding: "utf-8",
		}).trim();
		status.pythonVersion = version.replace("Python ", "");
	} catch {
		// Python not found in env
	}

	// Get R version
	try {
		const condaRun = `"${conda.path}" run -n ${envName}`;
		const rOut = execSync(`${condaRun} R --version`, {
			stdio: "pipe",
			encoding: "utf-8",
		}).trim();
		const match = rOut.match(/R version (\S+)/);
		if (match) status.rVersion = match[1];
	} catch {
		// R not found in env
	}

	// List installed packages with versions
	try {
		const output = execSync(`"${conda.path}" list -n ${envName} --json`, {
			stdio: "pipe",
			encoding: "utf-8",
		});
		const packages = JSON.parse(output) as Array<{ name: string; version: string }>;
		status.installedPackages = packages.map((p) => ({ name: p.name, version: p.version }));
	} catch {
		// Could not list packages
	}

	return status;
}

/**
 * Build the conda run prefix for executing commands in the env.
 */
export function condaRunPrefix(condaPath: string, envName: string): string {
	return `"${condaPath}" run -n ${envName}`;
}

/**
 * Write the env manifest so other OpenClaw packages can discover the env.
 * Written to ~/.acaclaw/config/env-manifest.json
 */
export function writeEnvManifest(status: EnvStatus): void {
	const manifestPath = join(homedir(), ".acaclaw", "config", "env-manifest.json");
	const manifest = {
		discipline: status.discipline,
		envName: status.envName,
		pythonVersion: status.pythonVersion,
		rVersion: status.rVersion,
		condaPath: status.condaPath,
		packages: status.installedPackages.map((p) => `${p.name}==${p.version}`),
		updatedAt: new Date().toISOString(),
	};
	try {
		const { mkdirSync, writeFileSync } = require("node:fs");
		mkdirSync(join(homedir(), ".acaclaw", "config"), { recursive: true });
		writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
	} catch {
		// Non-fatal — manifest is a convenience for other tools
	}
}

/**
 * Build the system prompt context describing the available computing environment.
 * Injected via before_prompt_build so the LLM knows what's available.
 */
export function buildEnvContext(status: EnvStatus): string {
	if (!status.envExists) {
		return [
			"## Computing Environment",
			"",
			"No AcaClaw Conda environment is currently installed.",
			"Python tools and scientific packages are not available.",
		].join("\n");
	}

	const keyPackages = status.installedPackages
		.filter((p) => !p.name.startsWith("_") && !p.name.startsWith("lib"))
		.slice(0, 50)
		.map((p) => `${p.name} ${p.version}`)
		.join(", ");

	const rLine = status.rVersion ? `R: ${status.rVersion}` : "R: not detected";

	const lines = [
		"## Computing Environment",
		"",
		`An AcaClaw Conda environment is active: \`${status.envName}\``,
		`Discipline: ${DISCIPLINE_DESCRIPTIONS[status.discipline] ?? status.discipline}`,
		`Python: ${status.pythonVersion ?? "unknown"}`,
		`${rLine}`,
		"",
		"All Python and R commands automatically run inside this environment.",
		"You do NOT need to install packages — they are already available.",
		"Do NOT run `pip install`, `conda install`, or `install.packages()` unless the user explicitly asks.",
		"",
		`Available packages: ${keyPackages}`,
		"",
		"When running Python code, use packages directly (e.g. `import numpy`, `import pandas`).",
		"When running R code, use packages directly (e.g. `library(ggplot2)`, `library(dplyr)`).",
		"JupyterLab supports both Python and R kernels (IRkernel).",
		"The environment is shared across all AcaClaw skills and sessions.",
	];

	return lines.join("\n");
}
