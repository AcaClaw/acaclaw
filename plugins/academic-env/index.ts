import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-academic-env";
import { spawn, execFile, execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import { readFile, statfs } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, cpus as osCpus, totalmem, freemem, loadavg, hostname as osHostname, uptime as osUptime, type as osType } from "node:os";
import {
	resolveConfig,
	readInstalledDiscipline,
	detectEnvironment,
	condaRunPrefix,
	writeEnvManifest,
	buildEnvContext,
	DISCIPLINE_ENVS,
	findConda,
} from "./academic-env.js";

/**
 * Resolve the gateway's state directory.
 * 1. OPENCLAW_HOME env var
 * 2. Derive from this plugin's own location: <stateDir>/plugins/<id>/index.ts
 * 3. Fall back to ~/.openclaw
 */
function resolveStateDir(): string {
	const envHome = process.env.OPENCLAW_HOME?.trim();
	if (envHome) return envHome;

	// Derive from plugin file path: <stateDir>/plugins/acaclaw-academic-env/index.ts
	try {
		const pluginDir = dirname(fileURLToPath(import.meta.url));
		const candidate = resolve(pluginDir, "..", "..");
		if (fs.existsSync(join(candidate, "openclaw.json"))) return candidate;
	} catch { /* import.meta.url not available */ }

	return join(homedir(), ".openclaw");
}

const academicEnvPlugin = {
	id: "acaclaw-academic-env",
	name: "AcaClaw Academic Environment",
	description:
		"Detects and activates discipline-specific Conda environments, injects computing context into the LLM",

	register(api: OpenClawPluginApi) {
		const rawConfig = resolveConfig(api.pluginConfig ?? {});
		// The actual discipline comes from install-time profile.txt, with plugin config as fallback
		const discipline = readInstalledDiscipline(rawConfig.discipline);
		const env = detectEnvironment(discipline);

		if (env.condaAvailable && env.envExists) {
			api.logger.info?.(
				`[acaclaw-env] Conda env '${env.envName}' detected (${discipline}, Python ${env.pythonVersion ?? "unknown"}, R ${env.rVersion ?? "unknown"})`,
			);
			// Write manifest so other OpenClaw packages can discover the env
			writeEnvManifest(env);
		} else if (env.condaAvailable) {
			api.logger.warn?.(
				`[acaclaw-env] Conda available but env '${env.envName}' not found. Run the installer to create it.`,
			);
		} else {
			api.logger.warn?.(
				"[acaclaw-env] Conda not detected. Scientific Python features may be limited.",
			);
		}

		// --- LLM context injection ---
		// Inject the computing environment description into the system prompt
		// so the LLM knows which packages are available and doesn't try to install them.
		// Cache detectEnvironment() to avoid 4 synchronous conda subprocess calls (~1.5s) per message.
		let envDetectCache: { data: ReturnType<typeof detectEnvironment>; ts: number } | null = null;
		const ENV_DETECT_CACHE_TTL = 300_000; // 5 minutes — env rarely changes mid-session
		function invalidateEnvDetectCache() { envDetectCache = null; }

		api.on(
			"before_prompt_build",
			async () => {
				if (!envDetectCache || Date.now() - envDetectCache.ts > ENV_DETECT_CACHE_TTL) {
					envDetectCache = { data: detectEnvironment(discipline), ts: Date.now() };
				}
				return {
					appendSystemContext: buildEnvContext(envDetectCache.data),
				};
			},
			{ priority: 50 },
		);

		// --- Auto-activate: prefix shell commands with conda run ---
		if (rawConfig.autoActivate && env.condaAvailable && env.envExists && env.condaPath) {
			api.on(
				"before_tool_call",
				async (event) => {
					if (event.toolName !== "bash" && event.toolName !== "exec") return;
					const params = event.params ?? {};
					if (typeof params.command !== "string") return;

					// Skip if already using conda/mamba or R's own install
					if (params.command.includes("conda ") || params.command.includes("mamba ")) return;

					const prefix = condaRunPrefix(env.condaPath!, env.envName);
					return {
						params: { ...params, command: `${prefix} ${params.command}` },
					};
				},
				{ priority: 50 },
			);
		}

		// --- Tool: env_status ---
		api.registerTool({
			name: "env_status",
			description:
				"Show the AcaClaw computing environment status: discipline, Conda env, Python version, installed packages.",
			parameters: { type: "object" as const, properties: {} },
			async execute() {
				const current = detectEnvironment(discipline);
				const lines = [
					"# AcaClaw Environment Status",
					"",
					`| Setting | Value |`,
					`|---------|-------|`,
					`| Discipline | ${current.discipline} |`,
					`| Conda env name | ${current.envName} |`,
					`| Conda available | ${current.condaAvailable ? "yes" : "no"} |`,
					`| Conda path | ${current.condaPath ?? "—"} |`,
					`| Environment exists | ${current.envExists ? "yes" : "not found"} |`,
					`| Python version | ${current.pythonVersion ?? "—"} |`,
					`| R version | ${current.rVersion ?? "—"} |`,
					`| Installed packages | ${current.installedPackages.length} |`,
				];

				if (current.installedPackages.length > 0) {
					lines.push("", "## Key Packages", "");
					const keyPackages = [
						"numpy",
						"scipy",
						"pandas",
						"matplotlib",
						"statsmodels",
						"sympy",
						"jupyterlab",
						"pymupdf",
						// R packages
						"r-base",
						"r-irkernel",
						"r-essentials",
						// discipline-specific
						"biopython",
						"scikit-bio",
						"r-biocmanager",
						"rdkit",
						"lifelines",
						"pydicom",
						"r-survival",
						"astropy",
						"lmfit",
					];
					for (const pkg of keyPackages) {
						const found = current.installedPackages.find((p) => p.name === pkg);
						if (found) {
							lines.push(`- ${pkg}: ${found.version}`);
						}
					}
				}

				return { output: lines.join("\n") };
			},
		});

		// --- CLI: acaclaw-env commands ---

		// UI env id → conda env name
		const UI_TO_CONDA: Record<string, string> = {
			aca: "acaclaw",
			"aca-bio": "acaclaw-bio",
			"aca-med": "acaclaw-med",
			"aca-chem": "acaclaw-chem",
			"aca-phys": "acaclaw-phys",
			"aca-ai": "acaclaw-ai",
			"aca-data": "acaclaw-data",
			"aca-cs": "acaclaw-cs",
		};

		// UI env id → YAML file (disciplines with a dedicated env spec)
		const UI_TO_YAML: Record<string, string> = {
			aca: "environment-base.yml",
			"aca-bio": "environment-bio.yml",
			"aca-med": "environment-med.yml",
			"aca-chem": "environment-chem.yml",
			"aca-phys": "environment-phys.yml",
		};

		// Resolve env YAML directory: try plugin-relative first, fall back to known repo checkout
		const pluginRelative = join(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..", "..", "env", "conda");
		const repoCheckout = join(homedir(), "github", "acaclaw", "env", "conda");
		const envDir = fs.existsSync(pluginRelative) ? pluginRelative : repoCheckout;

		/** Run a shell command, streaming each line to broadcast, resolve on exit */
		// Strip ANSI escape codes and conda spinner/progress characters
		const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]|\r/g, "");
		const isSpinnerLine = (s: string) => /^[\\|\/-\s.]+$/.test(s) || /^\s*Collecting package metadata/.test(s) && s.includes('...');

		function runWithProgress(
			cmd: string,
			args: string[],
			broadcast: (event: string, payload: unknown) => void,
			progressEvent: string,
			envName: string,
			spawnEnv?: Record<string, string | undefined>,
		): Promise<{ code: number; output: string }> {
			return new Promise((resolve) => {
				const lines: string[] = [];
				const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...(spawnEnv ? { env: spawnEnv } : {}) });

				const onData = (chunk: Buffer) => {
					const text = stripAnsi(chunk.toString());
					for (const line of text.split("\n")) {
						const trimmed = line.trim();
						if (!trimmed || isSpinnerLine(trimmed)) continue;
						lines.push(trimmed);
						broadcast(progressEvent, { name: envName, line: trimmed });
					}
				};

				proc.stdout?.on("data", onData);
				proc.stderr?.on("data", onData);

				proc.on("close", (code) => {
					resolve({ code: code ?? 1, output: lines.join("\n") });
				});
				proc.on("error", (err) => {
					lines.push(`Error: ${err.message}`);
					resolve({ code: 1, output: lines.join("\n") });
				});
			});
		}

		// Discipline name → UI env id (for onboarding which sends { discipline: "biology" })
		const DISCIPLINE_TO_UI: Record<string, string> = {
			general: "aca",
			biology: "aca-bio",
			chemistry: "aca-chem",
			medicine: "aca-med",
			physics: "aca-phys",
		};

		// --- Gateway: acaclaw.env.install ---
		api.registerGatewayMethod("acaclaw.env.install", async ({ params, respond, context }) => {
			// Accept both { name: "aca-bio" } (environment page) and { discipline: "biology" } (onboarding wizard)
			let rawName = typeof params.name === "string" ? params.name : "";
			if (!rawName && typeof params.discipline === "string") {
				rawName = DISCIPLINE_TO_UI[params.discipline] ?? params.discipline;
			}
			const condaName = UI_TO_CONDA[rawName] ?? rawName;
			const yamlFile = UI_TO_YAML[rawName];
			const conda = findConda();

			if (!conda.available || !conda.path) {
				respond(false, undefined, { code: "NO_CONDA", message: "Conda is not installed. Run the AcaClaw installer first." });
				return;
			}

			// Check if env already exists
			const status = detectEnvironment(
				Object.entries(DISCIPLINE_ENVS).find(([, v]) => v === condaName)?.[0] ?? discipline,
			);
			if (status.envExists) {
				respond(true, { name: condaName, alreadyExists: true });
				return;
			}

			let cmd: string;
			let args: string[];

			if (yamlFile) {
				const yamlPath = join(envDir, yamlFile);
				cmd = conda.path;
				args = ["env", "create", "-f", yamlPath];
			} else {
				// No YAML — create from base and name it accordingly
				cmd = conda.path;
				args = ["create", "-n", condaName, "python=3.12", "-y"];
			}

			context.broadcast("acaclaw.env.install.progress", { name: rawName, line: `$ conda ${args.join(" ")}` });

			let result = await runWithProgress(cmd, args, context.broadcast, "acaclaw.env.install.progress", rawName);

			// Retry once on transient network errors (IncompleteRead, ConnectionError)
			if (result.code !== 0 && /IncompleteRead|ConnectionError|Connection broken/i.test(result.output)) {
				context.broadcast("acaclaw.env.install.progress", { name: rawName, line: "⟳ Network error — retrying…" });
				result = await runWithProgress(cmd, args, context.broadcast, "acaclaw.env.install.progress", rawName);
			}

			if (result.code === 0) {
				invalidateEnvListCache();
				respond(true, { name: condaName, installed: true });
			} else {
				respond(false, undefined, { code: "INSTALL_FAILED", message: `Conda env creation failed (exit ${result.code})` });
			}
		});

		// --- Gateway: acaclaw.env.remove ---
		api.registerGatewayMethod("acaclaw.env.remove", async ({ params, respond, context }) => {
			const rawName = typeof params.name === "string" ? params.name : "";
			const condaName = UI_TO_CONDA[rawName] ?? rawName;
			const conda = findConda();

			if (!conda.available || !conda.path) {
				respond(false, undefined, { code: "NO_CONDA", message: "Conda is not installed." });
				return;
			}

			const args = ["env", "remove", "-n", condaName, "--yes"];
			context.broadcast("acaclaw.env.remove.progress", { name: rawName, line: `$ conda ${args.join(" ")}` });

			const result = await runWithProgress(conda.path, args, context.broadcast, "acaclaw.env.remove.progress", rawName);

			if (result.code === 0) {
				invalidateEnvListCache();
				respond(true, { name: condaName, removed: true });
			} else {
				respond(false, undefined, { code: "REMOVE_FAILED", message: `Conda env removal failed (exit ${result.code})` });
			}
		});

		// --- Gateway: acaclaw.env.list ---
		// Cache env list results to avoid expensive conda subprocess calls on every poll
		let envListCache: { data: unknown; ts: number } | null = null;
		const ENV_LIST_CACHE_TTL = 60_000; // 60 seconds

		function invalidateEnvListCache() { envListCache = null; invalidateEnvDetectCache(); }

		api.registerGatewayMethod("acaclaw.env.list", async ({ respond }) => {
			// Return cached result if fresh
			if (envListCache && Date.now() - envListCache.ts < ENV_LIST_CACHE_TTL) {
				respond(true, envListCache.data);
				return;
			}

			const conda = findConda();
			if (!conda.available || !conda.path) {
				const result = { environments: [] };
				envListCache = { data: result, ts: Date.now() };
				respond(true, result);
				return;
			}

			// Get conda version string
			let condaVersion = "Miniforge";
			try {
				const ver = execSync(`"${conda.path}" --version`, { stdio: "pipe", encoding: "utf-8" }).trim();
				condaVersion = ver.replace("conda ", "Miniforge ");
			} catch { /* keep default */ }

			// Get all conda envs ONCE (the most expensive call)
			let envPaths: string[] = [];
			try {
				const envListJson = execSync(`"${conda.path}" env list --json`, { stdio: "pipe", encoding: "utf-8" });
				envPaths = JSON.parse(envListJson).envs ?? [];
			} catch { /* empty list */ }

			const environments: Array<{
				name: string; python: string; rVersion: string;
				condaVersion: string; path: string; sizeGB: number;
				active: boolean; installed: boolean;
			}> = [];

			for (const [uiId, condaName] of Object.entries(UI_TO_CONDA)) {
				const envExists = envPaths.some((e: string) => e.endsWith(`/envs/${condaName}`) || e.endsWith(`/${condaName}`));

				// Only fetch python/R version for installed envs
				let python = "—";
				let rVersion = "not installed";
				if (envExists) {
					try {
						const ver = execSync(`"${conda.path}" run -n ${condaName} python --version`, { stdio: "pipe", encoding: "utf-8" }).trim();
						python = ver.replace("Python ", "");
					} catch { /* not available */ }
					try {
						const rOut = execSync(`"${conda.path}" run -n ${condaName} R --version`, { stdio: "pipe", encoding: "utf-8" }).trim();
						const m = rOut.match(/R version (\S+)/);
						if (m) rVersion = m[1];
					} catch { /* not available */ }
				}

				environments.push({
					name: uiId,
					python,
					rVersion,
					condaVersion,
					path: `~/.acaclaw/miniforge3/envs/${condaName}`,
					sizeGB: 0,
					active: false,
					installed: envExists,
				});
			}
			const result = { environments };
			envListCache = { data: result, ts: Date.now() };
			respond(true, result);
		});

		// --- Gateway: acaclaw.env.pip.list ---
		// List installed Python packages for a specific conda environment.
		// Uses `pip list` (Python-only) instead of `conda list` (which includes
		// system libraries like alsa-lib, binutils, etc. that aren't Python packages).
		api.registerGatewayMethod("acaclaw.env.pip.list", async ({ params, respond }) => {
			const rawEnv = typeof params.env === "string" ? params.env : "";
			const condaName = UI_TO_CONDA[rawEnv] ?? rawEnv;
			const conda = findConda();

			if (!conda.available || !conda.path) {
				respond(true, { packages: [] });
				return;
			}

			try {
				const condaRun = `"${conda.path}" run -n ${condaName}`;

				// Get Python packages via pip (excludes system/C libraries)
				const pipOutput = execSync(`${condaRun} pip list --format=json`, {
					stdio: "pipe",
					encoding: "utf-8",
					timeout: 30_000,
				});
				const pipPkgs = JSON.parse(pipOutput) as Array<{ name: string; version: string }>;

				// Cross-reference with conda list to get channel/source info
				const normalize = (n: string) => n.toLowerCase().replace(/-/g, "_");
				let condaChannels = new Map<string, string>();
				try {
					const condaOutput = execSync(`"${conda.path}" list -n ${condaName} --json`, {
						stdio: "pipe",
						encoding: "utf-8",
						timeout: 30_000,
					});
					const condaAll = JSON.parse(condaOutput) as Array<{ name: string; channel: string }>;
					condaChannels = new Map(condaAll.map(p => [normalize(p.name), p.channel]));
				} catch { /* source info unavailable — default to "pip" */ }

				const packages = pipPkgs.map(p => ({
					name: p.name,
					version: p.version,
					source: condaChannels.get(normalize(p.name)) || "pip",
				}));
				respond(true, { packages });
			} catch {
				respond(true, { packages: [] });
			}
		});

		// --- Gateway: acaclaw.env.pip.install ---
		api.registerGatewayMethod("acaclaw.env.pip.install", async ({ params, respond, context }) => {
			const packages = Array.isArray(params.packages) ? params.packages.filter((p: unknown): p is string => typeof p === "string") : [];
			const rawEnv = typeof params.env === "string" ? params.env : "";
			const condaName = UI_TO_CONDA[rawEnv] ?? rawEnv;
			const conda = findConda();

			if (!conda.available || !conda.path) {
				respond(false, undefined, { code: "NO_CONDA", message: "Conda is not installed." });
				return;
			}

			if (packages.length === 0) {
				respond(false, undefined, { code: "NO_PACKAGES", message: "No packages specified." });
				return;
			}

			const pipCmd = `"${conda.path}" run -n ${condaName} pip install ${packages.join(" ")}`;
			context.broadcast("acaclaw.env.install.progress", { name: rawEnv, line: `$ ${pipCmd}` });

			const result = await runWithProgress("bash", ["-c", pipCmd], context.broadcast, "acaclaw.env.install.progress", rawEnv);

			if (result.code === 0) {
				respond(true, { packages, installed: true });
			} else {
				respond(false, undefined, { code: "PIP_FAILED", message: `pip install failed (exit ${result.code})` });
			}
		});

		// --- Gateway: acaclaw.env.pip.uninstall ---
		api.registerGatewayMethod("acaclaw.env.pip.uninstall", async ({ params, respond, context }) => {
			const packages = Array.isArray(params.packages) ? params.packages.filter((p: unknown): p is string => typeof p === "string") : [];
			const rawEnv = typeof params.env === "string" ? params.env : "";
			const condaName = UI_TO_CONDA[rawEnv] ?? rawEnv;
			const conda = findConda();

			if (!conda.available || !conda.path) {
				respond(false, undefined, { code: "NO_CONDA", message: "Conda is not installed." });
				return;
			}

			if (packages.length === 0) {
				respond(false, undefined, { code: "NO_PACKAGES", message: "No packages specified." });
				return;
			}

			const pipCmd = `"${conda.path}" run -n ${condaName} pip uninstall -y ${packages.join(" ")}`;
			context.broadcast("acaclaw.env.uninstall.progress", { name: rawEnv, line: `$ ${pipCmd}` });

			const result = await runWithProgress("bash", ["-c", pipCmd], context.broadcast, "acaclaw.env.uninstall.progress", rawEnv);

			if (result.code === 0) {
				respond(true, { packages, uninstalled: true });
			} else {
				respond(false, undefined, { code: "PIP_FAILED", message: `pip uninstall failed (exit ${result.code})` });
			}
		});

		// --- Gateway: acaclaw.env.r.list ---
		// List installed R packages (conda env first, then system R).
		api.registerGatewayMethod("acaclaw.env.r.list", async ({ params, respond }) => {
			const rawEnv = typeof params.env === "string" ? params.env : "";
			const condaName = UI_TO_CONDA[rawEnv] ?? rawEnv;
			const conda = findConda();

			// Find Rscript binary: conda env → system PATH
			let rscriptBin = "";
			let rSource = "system";

			if (conda.available && conda.path) {
				try {
					const envInfo = execSync(`"${conda.path}" env list --json`, {
						stdio: "pipe", encoding: "utf-8", timeout: 10_000,
					});
					const envs = (JSON.parse(envInfo) as { envs: string[] }).envs ?? [];
					const envPrefix = envs.find(p => p.endsWith(`/${condaName}`) || p.endsWith(`/envs/${condaName}`)) ?? "";
					if (envPrefix) {
						const condaRscript = join(envPrefix, "bin", "Rscript");
						if (fs.existsSync(condaRscript)) {
							rscriptBin = condaRscript;
							rSource = "conda";
						}
					}
				} catch { /* can't resolve env prefix */ }
			}

			// Fall back to system Rscript
			if (!rscriptBin) {
				try {
					rscriptBin = execSync("which Rscript", { stdio: "pipe", encoding: "utf-8", timeout: 3_000 }).trim();
				} catch { /* Rscript not on PATH */ }
			}

			if (!rscriptBin) {
				respond(true, { packages: [], installed: false });
				return;
			}

			try {
				const output = execSync(
					`"${rscriptBin}" -e "pkgs <- installed.packages(); cat(jsonlite::toJSON(data.frame(name=pkgs[,'Package'], version=pkgs[,'Version'], stringsAsFactors=FALSE)))"`,
					{ stdio: "pipe", encoding: "utf-8", timeout: 30_000 },
				);
				const rPkgs = JSON.parse(output) as Array<{ name: string; version: string }>;
				const packages = rPkgs.map(p => ({
					name: p.name,
					version: p.version,
					source: rSource,
				}));
				respond(true, { packages, installed: true });
			} catch {
				// jsonlite may not be installed; fall back to CSV
				try {
					const output = execSync(
						`"${rscriptBin}" -e "pkgs <- installed.packages(); write.csv(data.frame(name=pkgs[,'Package'], version=pkgs[,'Version']), stdout(), row.names=FALSE)"`,
						{ stdio: "pipe", encoding: "utf-8", timeout: 30_000 },
					);
					const lines = output.trim().split("\n").slice(1);
					const packages = lines.map(line => {
						const m = line.match(/"([^"]+)","([^"]+)"/);
						return m ? { name: m[1], version: m[2], source: rSource } : null;
					}).filter((p): p is { name: string; version: string; source: string } => p !== null);
					respond(true, { packages, installed: true });
				} catch {
					respond(true, { packages: [], installed: true });
				}
			}
		});

		// --- Gateway: acaclaw.env.sys.list ---
		// List installed system tools available in the conda environment or system PATH.
		api.registerGatewayMethod("acaclaw.env.sys.list", async ({ params, respond }) => {
			const rawEnv = typeof params.env === "string" ? params.env : "";
			const condaName = UI_TO_CONDA[rawEnv] ?? rawEnv;
			const conda = findConda();

			// Tool-specific version flags (some tools don't support --version)
			const TOOLS: Array<{ cmd: string; name: string; description: string; versionArgs: string[] }> = [
				{ cmd: "pdftk", name: "pdftk", description: "PDF toolkit (merge, split, stamp)", versionArgs: ["--version"] },
				{ cmd: "pandoc", name: "pandoc", description: "Document format converter", versionArgs: ["--version"] },
				{ cmd: "pdftotext", name: "poppler-utils", description: "PDF rendering (pdftotext, pdfinfo)", versionArgs: ["-v"] },
				{ cmd: "ffmpeg", name: "ffmpeg", description: "Audio/video processing", versionArgs: ["-version"] },
				{ cmd: "dot", name: "graphviz", description: "Graph visualization (dot)", versionArgs: ["-V"] },
				{ cmd: "convert", name: "imagemagick", description: "Image conversion & editing", versionArgs: ["--version"] },
				{ cmd: "gs", name: "ghostscript", description: "PostScript/PDF interpreter", versionArgs: ["--version"] },
				{ cmd: "latex", name: "texlive", description: "LaTeX typesetting", versionArgs: ["--version"] },
				{ cmd: "git", name: "git", description: "Version control", versionArgs: ["--version"] },
				{ cmd: "curl", name: "curl", description: "URL transfer tool", versionArgs: ["--version"] },
				{ cmd: "wget", name: "wget", description: "Network downloader", versionArgs: ["--version"] },
				{ cmd: "jq", name: "jq", description: "JSON processor", versionArgs: ["--version"] },
				{ cmd: "tree", name: "tree", description: "Directory listing", versionArgs: ["--version"] },
			];

			// Resolve conda env prefix for fast bin-dir lookup (avoids slow per-tool `conda run`)
			let condaBinDir = "";
			if (conda.available && conda.path) {
				try {
					const envInfo = execSync(`"${conda.path}" env list --json`, {
						stdio: "pipe", encoding: "utf-8", timeout: 10_000,
					});
					const envs = (JSON.parse(envInfo) as { envs: string[] }).envs ?? [];
					const match = envs.find(p => p.endsWith(`/${condaName}`) || p.endsWith(`/envs/${condaName}`));
					if (match) condaBinDir = join(match, "bin");
				} catch { /* can't resolve env prefix */ }
			}

			const packages: Array<{ name: string; version: string; source: string; description: string }> = [];

			for (const tool of TOOLS) {
				let version = "";
				let source = "";
				const versionFlag = tool.versionArgs[0];

				// Fast check: look for binary in conda env bin directory
				if (condaBinDir) {
					const binPath = join(condaBinDir, tool.cmd);
					if (fs.existsSync(binPath)) {
						try {
							const out = execSync(`"${binPath}" ${versionFlag} 2>&1`, {
								stdio: "pipe", encoding: "utf-8", timeout: 5_000,
							}).trim();
							const ver = out.match(/(\d+\.\d+[\w.-]*)/);
							if (ver) { version = ver[1]; source = "conda"; }
						} catch { /* binary exists but version check failed */ }
					}
				}

				// Fallback: system PATH
				if (!version) {
					try {
						const out = execSync(`${tool.cmd} ${versionFlag} 2>&1`, {
							stdio: "pipe", encoding: "utf-8", timeout: 5_000,
						}).trim();
						const ver = out.match(/(\d+\.\d+[\w.-]*)/);
						if (ver) { version = ver[1]; source = "system"; }
					} catch { /* not installed */ }
				}

				if (version) {
					packages.push({ name: tool.name, version, source, description: tool.description });
				}
			}

			respond(true, { packages });
		});

		// --- Gateway: acaclaw.env.node.list ---
		// List Node.js version and globally installed npm packages.
		api.registerGatewayMethod("acaclaw.env.node.list", async ({ respond }) => {
			const packages: Array<{ name: string; version: string; source: string; description?: string }> = [];

			// Node.js version
			try {
				const nodeVer = execSync("node --version", { stdio: "pipe", encoding: "utf-8", timeout: 5_000 }).trim();
				packages.push({ name: "node", version: nodeVer.replace(/^v/, ""), source: "system", description: "JavaScript runtime" });
			} catch { /* not installed */ }

			// npm version + global packages
			try {
				const output = execSync("npm list -g --json --depth=0", {
					stdio: "pipe", encoding: "utf-8", timeout: 10_000,
				});
				const parsed = JSON.parse(output) as { dependencies?: Record<string, { version: string }> };
				if (parsed.dependencies) {
					for (const [name, info] of Object.entries(parsed.dependencies)) {
						packages.push({ name, version: info.version, source: "npm" });
					}
				}
			} catch { /* no npm or failed */ }

			respond(true, { packages });
		});

		// --- Gateway: acaclaw.skill.install ---
		// Install a skill from ClawHub into the gateway's skills directory
		api.registerGatewayMethod("acaclaw.skill.install", async ({ params, respond, context }) => {
			const slug = typeof params.slug === "string" ? params.slug.trim() : "";
			if (!slug) {
				respond(false, undefined, { code: "MISSING_SLUG", message: "Missing skill slug" });
				return;
			}

			// Detect the gateway's state directory
			const homeDir = resolveStateDir();
			const skillsDir = join(homeDir, "skills");

			// Ensure skills directory exists
			try { fs.mkdirSync(skillsDir, { recursive: true }); } catch {}

			const alreadyExists = fs.existsSync(join(skillsDir, slug, "SKILL.md"));

			// Find clawhub CLI
			let clawhubPath = "clawhub";
			try {
				const resolved = execSync("which clawhub", { encoding: "utf-8" }).trim();
				if (resolved) clawhubPath = resolved;
			} catch {
				respond(false, undefined, { code: "NO_CLAWHUB", message: "clawhub CLI not found. Run: npm i -g clawhub" });
				return;
			}

			// --workdir and --no-input are global flags (before the subcommand)
			// Always use --force so files are refreshed and the gateway re-registers the skill
			const args = ["--workdir", homeDir, "--no-input", "install", "--force", slug];
			context.broadcast("acaclaw.skill.install.progress", { slug, line: `$ clawhub ${args.join(" ")}` });

			// Strip proxy env vars — gateway may have a proxy configured that isn't always running
			const cleanEnv = { ...process.env };
			delete cleanEnv.HTTP_PROXY;
			delete cleanEnv.HTTPS_PROXY;
			delete cleanEnv.http_proxy;
			delete cleanEnv.https_proxy;

			// Retry on rate limit errors (up to 3 attempts with 3s backoff)
			let result: { code: number; output: string };
			let attempts = 0;
			const maxAttempts = 3;
			do {
				if (attempts > 0) {
					context.broadcast("acaclaw.skill.install.progress", { slug, line: `⏳ Rate limit hit — retrying in 3s (attempt ${attempts + 1}/${maxAttempts})…` });
					await new Promise(r => setTimeout(r, 3000));
				}
				result = await runWithProgress(clawhubPath, args, context.broadcast, "acaclaw.skill.install.progress", slug, cleanEnv);
				attempts++;
			} while (result.code !== 0 && result.output.includes("Rate limit exceeded") && attempts < maxAttempts);

			if (result.code === 0) {
				context.broadcast("acaclaw.skill.install.progress", { slug, line: `✓ Skill "${slug}" installed` });
				respond(true, { slug, installed: true, alreadyExists });
			} else {
				context.broadcast("acaclaw.skill.install.progress", { slug, line: `✗ Install failed (exit ${result.code})` });
				respond(false, undefined, { code: "INSTALL_FAILED", message: `clawhub install failed (exit ${result.code})` });
			}
		});

		// --- Gateway: acaclaw.skill.uninstall ---
		// Uninstall a skill using the clawhub CLI
		api.registerGatewayMethod("acaclaw.skill.uninstall", async ({ params, respond, context }) => {
			const slug = typeof params.slug === "string" ? params.slug.trim() : "";
			if (!slug) {
				respond(false, undefined, { code: "MISSING_SLUG", message: "Missing skill slug" });
				return;
			}

			const homeDir = resolveStateDir();
			const skillDir = join(homeDir, "skills", slug);

			// Check if the skill directory exists
			if (!fs.existsSync(skillDir)) {
				respond(false, undefined, { code: "NOT_INSTALLED", message: `Skill "${slug}" is not installed` });
				return;
			}

			// Find clawhub CLI
			let clawhubPath = "clawhub";
			try {
				const resolved = execSync("which clawhub", { encoding: "utf-8" }).trim();
				if (resolved) clawhubPath = resolved;
			} catch {
				respond(false, undefined, { code: "NO_CLAWHUB", message: "clawhub CLI not found. Run: npm i -g clawhub" });
				return;
			}

			const args = ["--workdir", homeDir, "--no-input", "uninstall", "--yes", slug];
			context.broadcast("acaclaw.skill.uninstall.progress", { slug, line: `$ clawhub ${args.join(" ")}` });

			const cleanEnv = { ...process.env };
			delete cleanEnv.HTTP_PROXY;
			delete cleanEnv.HTTPS_PROXY;
			delete cleanEnv.http_proxy;
			delete cleanEnv.https_proxy;
			const result = await runWithProgress(clawhubPath, args, context.broadcast, "acaclaw.skill.uninstall.progress", slug, cleanEnv);

			if (result.code === 0) {
				context.broadcast("acaclaw.skill.uninstall.progress", { slug, line: `✓ Skill "${slug}" uninstalled` });
				respond(true, { slug, uninstalled: true });
			} else {
				context.broadcast("acaclaw.skill.uninstall.progress", { slug, line: `✗ Uninstall failed (exit ${result.code})` });
				respond(false, undefined, { code: "UNINSTALL_FAILED", message: `clawhub uninstall failed (exit ${result.code})` });
			}
		});

		// --- Gateway: acaclaw.skill.search ---
		// Search the ClawHub registry using the clawhub CLI's vector search
		api.registerGatewayMethod("acaclaw.skill.search", async ({ params, respond }) => {
			const query = typeof params.query === "string" ? params.query.trim() : "";
			if (!query) {
				respond(false, undefined, { code: "MISSING_QUERY", message: "Missing search query" });
				return;
			}

			// Find clawhub CLI
			let clawhubPath = "clawhub";
			try {
				const resolved = execSync("which clawhub", { encoding: "utf-8" }).trim();
				if (resolved) clawhubPath = resolved;
			} catch {
				respond(false, undefined, { code: "NO_CLAWHUB", message: "clawhub CLI not found. Run: npm i -g clawhub" });
				return;
			}

			const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
			const args = ["search", "--limit", String(limit), query];
			// Strip proxy env vars — gateway may have a proxy configured that isn't always running
			const searchEnv = { ...process.env, NO_COLOR: "1" };
			delete searchEnv.HTTP_PROXY;
			delete searchEnv.HTTPS_PROXY;
			delete searchEnv.http_proxy;
			delete searchEnv.https_proxy;
			try {
				const output = execFileSync(clawhubPath, args, {
					encoding: "utf-8",
					timeout: 15_000,
					env: searchEnv,
				}).trim();

				// CLI outputs plain text: "slug  Name  (score)" per line
				const results = output
					.split("\n")
					.filter(l => l.trim())
					.map(line => {
						const scoreMatch = line.match(/\(([0-9.]+)\)\s*$/);
						const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
						const withoutScore = scoreMatch ? line.slice(0, scoreMatch.index).trim() : line.trim();
						// First token is slug, rest is display name
						const parts = withoutScore.split(/\s{2,}/);
						const slug = parts[0] ?? withoutScore;
						const name = parts[1] ?? slug;
						return { slug, name, score };
					});
				respond(true, { results });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				respond(false, undefined, { code: "SEARCH_FAILED", message: `clawhub search failed: ${msg}` });
			}
		});

		// --- Gateway: acaclaw.system.stats ---
		// Expose CPU, memory, disk, and GPU usage metrics
		{
			let prevCpu: { idle: number; total: number } | null = null;
			let prevRc6: { residency: number; time: number } | null = null;

			function cpuSnap() {
				const cores = osCpus();
				let idle = 0, total = 0;
				for (const c of cores) {
					idle += c.times.idle;
					total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
				}
				return { idle, total };
			}

			function cpuPct(): number {
				const curr = cpuSnap();
				if (!prevCpu) { prevCpu = curr; return 0; }
				const dIdle = curr.idle - prevCpu.idle;
				const dTotal = curr.total - prevCpu.total;
				prevCpu = curr;
				return dTotal === 0 ? 0 : Math.round((1 - dIdle / dTotal) * 100);
			}

			/** Try NVIDIA GPU via nvidia-smi */
			async function nvidiGpu(): Promise<{
				name: string; usagePercent: number; memTotal: number;
				memUsed: number; memFree: number; memPercent: number;
				temperature: number; driver: string;
			} | null> {
				return new Promise((resolve) => {
					execFile("nvidia-smi", [
						"--query-gpu=name,utilization.gpu,memory.total,memory.used,memory.free,temperature.gpu,driver_version",
						"--format=csv,noheader,nounits",
					], { timeout: 3000 }, (err, stdout) => {
						if (err || !stdout.trim()) return resolve(null);
						const parts = stdout.trim().split(", ");
						if (parts.length < 7) return resolve(null);
						const memTotal = parseFloat(parts[2]) * 1048576; // MiB → bytes
						const memUsed = parseFloat(parts[3]) * 1048576;
						const memFree = parseFloat(parts[4]) * 1048576;
						resolve({
							name: parts[0],
							usagePercent: parseFloat(parts[1]),
							memTotal, memUsed, memFree,
							memPercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
							temperature: parseFloat(parts[5]),
							driver: parts[6],
						});
					});
				});
			}

			/** Try Intel iGPU via sysfs (rc6 residency + frequency) */
			async function intelGpu(): Promise<{
				name: string; usagePercent: number; freqMhz: number; maxFreqMhz: number;
			} | null> {
				// Find the DRM card with Intel vendor (0x8086)
				const drmCards = ["/sys/class/drm/card0", "/sys/class/drm/card1", "/sys/class/drm/card2"];
				let cardPath = "";
				for (const card of drmCards) {
					try {
						const vendor = (await readFile(`${card}/device/vendor`, "utf-8")).trim();
						if (vendor === "0x8086") { cardPath = card; break; }
					} catch { /* try next */ }
				}
				if (!cardPath) return null;

				const gt0 = `${cardPath}/gt/gt0`;
				try {
					const [actFreqStr, maxFreqStr, rc6Str] = await Promise.all([
						readFile(`${gt0}/rps_act_freq_mhz`, "utf-8").catch(() => "0"),
						readFile(`${gt0}/rps_max_freq_mhz`, "utf-8").catch(() => "0"),
						readFile(`${gt0}/rc6_residency_ms`, "utf-8").catch(() => ""),
					]);

					const actFreq = parseInt(actFreqStr.trim(), 10) || 0;
					const maxFreq = parseInt(maxFreqStr.trim(), 10) || 0;

					// Calculate GPU active % from RC6 residency delta
					let usagePercent = 0;
					const rc6Ms = parseInt(rc6Str.trim(), 10);
					if (!isNaN(rc6Ms)) {
						const now = Date.now();
						if (prevRc6) {
							const dt = now - prevRc6.time;
							const dRc6 = rc6Ms - prevRc6.residency;
							if (dt > 0) usagePercent = Math.max(0, Math.min(100, Math.round((1 - dRc6 / dt) * 100)));
						}
						prevRc6 = { residency: rc6Ms, time: now };
					}

					// Detect model name from lspci (cached)
					let name = "Intel Integrated GPU";
					try {
						const lspci = execSync("lspci -s 00:02.0 2>/dev/null", { timeout: 2000, encoding: "utf-8" });
						const m = lspci.match(/\[(.+?)\]/);
						if (m) name = m[1];
					} catch { /* keep generic name */ }

					return { name, usagePercent, freqMhz: actFreq, maxFreqMhz: maxFreq };
				} catch { return null; }
			}

			api.registerGatewayMethod("acaclaw.system.stats", async ({ respond }) => {
				try {
					const totalMem = totalmem();
					let usedMem: number;
					let freeMem: number;

					// macOS os.freemem() only reports truly free pages, ignoring
					// inactive/purgeable/speculative memory that is reclaimable.
					// Use vm_stat to compute actual app memory (active + wired).
					if (process.platform === "darwin") {
						try {
							const vmRaw = execSync("vm_stat", { encoding: "utf8", timeout: 3000 });
							const pageMatch = vmRaw.match(/page size of (\d+) bytes/);
							const pageSize = pageMatch ? Number(pageMatch[1]) : 16384;
							const grab = (label: string) => {
								const m = vmRaw.match(new RegExp(label + ":\\s+(\\d+)"));
								return m ? Number(m[1]) * pageSize : 0;
							};
							const active = grab("Pages active");
							const wired = grab("Pages wired down");
							const compressed = grab("Pages occupied by compressor");
							usedMem = active + wired + compressed;
							freeMem = totalMem - usedMem;
						} catch {
							freeMem = freemem();
							usedMem = totalMem - freeMem;
						}
					} else {
						freeMem = freemem();
						usedMem = totalMem - freeMem;
					}
					let disk = { total: 0, free: 0, used: 0 };
					try {
						const st = await statfs(homedir());
						const t = st.blocks * st.bsize;
						const f = st.bavail * st.bsize;
						disk = { total: t, free: f, used: t - f };
					} catch {}
					const cores = osCpus();

					// GPU detection: try NVIDIA first, then Intel iGPU
					let gpu: Record<string, unknown> | null = null;
					const nv = await nvidiGpu();
					if (nv) {
						gpu = { type: "nvidia", name: nv.name, usagePercent: nv.usagePercent,
							memTotal: nv.memTotal, memUsed: nv.memUsed, memFree: nv.memFree,
							memPercent: nv.memPercent, temperature: nv.temperature, driver: nv.driver };
					} else {
						const intel = await intelGpu();
						if (intel) {
							gpu = { type: "intel", name: intel.name, usagePercent: intel.usagePercent,
								freqMhz: intel.freqMhz, maxFreqMhz: intel.maxFreqMhz };
						}
					}

					respond(true, {
						cpu: { cores: cores.length, model: cores[0]?.model ?? "unknown", usagePercent: cpuPct(), loadAvg: loadavg() },
						memory: { total: totalMem, used: usedMem, free: freeMem, usagePercent: Math.round((usedMem / totalMem) * 100) },
						disk: { total: disk.total, used: disk.used, free: disk.free, usagePercent: disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0 },
						gpu,
						system: { hostname: osHostname(), uptime: osUptime(), platform: osType() },
					});
				} catch (err) {
					respond(false, undefined, { code: "SYSTEM_STATS_ERROR", message: String(err) });
				}
			});
		}

		// --- Gateway: acaclaw.uninstall ---
		api.registerGatewayMethod("acaclaw.uninstall", async ({ params, respond, context }) => {
			const mode = typeof params.mode === "string" && params.mode === "all" ? "all" : "acaclaw";
			const dryRun = params.dryRun === true;
			const scriptName = mode === "all" ? "uninstall-all.sh" : "uninstall.sh";

			// Resolve scripts dir: plugin-relative → repo checkout fallback
			const pluginScripts = resolve(import.meta.dirname ?? dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "scripts");
			const repoScripts = join(homedir(), "github", "acaclaw", "scripts");
			const scriptsDir = fs.existsSync(join(pluginScripts, scriptName)) ? pluginScripts : repoScripts;
			const scriptPath = join(scriptsDir, scriptName);

			if (!fs.existsSync(scriptPath)) {
				respond(false, undefined, { code: "SCRIPT_NOT_FOUND", message: `${scriptName} not found` });
				return;
			}

			if (dryRun) {
				respond(true, { mode, dryRun: true, scriptPath });
				return;
			}

			context.broadcast("acaclaw.uninstall.progress", { line: `Starting ${mode} uninstall…` });

			const result = await runWithProgress(
				"bash", [scriptPath, "--yes"],
				context.broadcast,
				"acaclaw.uninstall.progress",
				mode,
			);

			if (result.code === 0) {
				respond(true, { mode, success: true });
			} else {
				respond(false, undefined, { code: "UNINSTALL_FAILED", message: `Uninstall exited with code ${result.code}` });
			}
		});

		api.registerCli(
			({ program }) => {
				const cmd = program.command("acaclaw-env").description("AcaClaw environment management");

				cmd
					.command("status")
					.description("Show environment status")
					.action(() => {
						const current = detectEnvironment(discipline);
						console.log(`Discipline: ${current.discipline}`);
						console.log(`Conda env:  ${current.envName}`);
						console.log(`Conda:      ${current.condaAvailable ? "available" : "not found"}`);
						console.log(`Env exists: ${current.envExists ? "yes" : "no"}`);
						console.log(`Python:     ${current.pythonVersion ?? "not detected"}`);
						console.log(`R:          ${current.rVersion ?? "not detected"}`);
						console.log(`Packages:   ${current.installedPackages.length} installed`);
					});

				cmd
					.command("packages")
					.description("List installed packages in the AcaClaw environment")
					.action(() => {
						const current = detectEnvironment(discipline);
						if (!current.envExists) {
							console.error(`Environment '${current.envName}' not found.`);
							process.exitCode = 1;
							return;
						}
						for (const pkg of current.installedPackages) {
							console.log(`${pkg.name}==${pkg.version}`);
						}
					});

				cmd
					.command("disciplines")
					.description("List available discipline environments")
					.action(() => {
						for (const [disc, envName] of Object.entries(DISCIPLINE_ENVS)) {
							const marker = disc === discipline ? " (active)" : "";
							console.log(`${disc}: ${envName}${marker}`);
						}
					});
			},
			{ commands: ["acaclaw-env"] },
		);
	},
};

export default academicEnvPlugin;
