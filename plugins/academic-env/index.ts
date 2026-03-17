import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-academic-env";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
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
		api.on(
			"before_prompt_build",
			async () => {
				const current = detectEnvironment(discipline);
				return {
					appendSystemContext: buildEnvContext(current),
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
		): Promise<{ code: number; output: string }> {
			return new Promise((resolve) => {
				const lines: string[] = [];
				const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

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

		// --- Gateway: acaclaw.env.install ---
		api.registerGatewayMethod("acaclaw.env.install", async ({ params, respond, context }) => {
			const rawName = typeof params.name === "string" ? params.name : "";
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
				respond(true, { name: condaName, removed: true });
			} else {
				respond(false, undefined, { code: "REMOVE_FAILED", message: `Conda env removal failed (exit ${result.code})` });
			}
		});

		// --- Gateway: acaclaw.env.list ---
		api.registerGatewayMethod("acaclaw.env.list", async ({ respond }) => {
			const conda = findConda();
			if (!conda.available || !conda.path) {
				respond(true, { environments: [] });
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
			respond(true, { environments });
		});

		// --- Gateway: acaclaw.env.pip.list ---
		// List installed packages for a specific conda environment
		api.registerGatewayMethod("acaclaw.env.pip.list", async ({ params, respond }) => {
			const rawEnv = typeof params.env === "string" ? params.env : "";
			const condaName = UI_TO_CONDA[rawEnv] ?? rawEnv;
			const conda = findConda();

			if (!conda.available || !conda.path) {
				respond(true, { packages: [] });
				return;
			}

			try {
				const output = execSync(`"${conda.path}" list -n ${condaName} --json`, {
					stdio: "pipe",
					encoding: "utf-8",
					timeout: 30_000,
				});
				const raw = JSON.parse(output) as Array<{ name: string; version: string; channel: string }>;
				const packages = raw.map(p => ({
					name: p.name,
					version: p.version,
					source: p.channel || "conda",
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

		// --- Gateway: acaclaw.skill.install ---
		// Install a skill from ClawHub into the gateway's skills directory
		api.registerGatewayMethod("acaclaw.skill.install", async ({ params, respond, context }) => {
			const slug = typeof params.slug === "string" ? params.slug.trim() : "";
			if (!slug) {
				respond(false, undefined, { code: "MISSING_SLUG", message: "Missing skill slug" });
				return;
			}

			// Skills live in the gateway's home directory (OPENCLAW_HOME).
			const homeDir = process.env.OPENCLAW_HOME?.trim() || join(homedir(), ".openclaw");
			const skillsDir = join(homeDir, "skills");

			// Ensure skills directory exists
			try { fs.mkdirSync(skillsDir, { recursive: true }); } catch {}

			// Check if already installed
			if (fs.existsSync(join(skillsDir, slug, "SKILL.md"))) {
				respond(true, { slug, alreadyExists: true });
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

			// --workdir and --no-input are global flags (before the subcommand)
			const args = ["--workdir", homeDir, "--no-input", "install", "--force", slug];
			context.broadcast("acaclaw.skill.install.progress", { slug, line: `$ clawhub ${args.join(" ")}` });

			const result = await runWithProgress(clawhubPath, args, context.broadcast, "acaclaw.skill.install.progress", slug);

			if (result.code === 0) {
				context.broadcast("acaclaw.skill.install.progress", { slug, line: `✓ Skill "${slug}" installed` });
				respond(true, { slug, installed: true });
			} else {
				context.broadcast("acaclaw.skill.install.progress", { slug, line: `✗ Install failed (exit ${result.code})` });
				respond(false, undefined, { code: "INSTALL_FAILED", message: `clawhub install failed (exit ${result.code})` });
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
