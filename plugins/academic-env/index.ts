import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-academic-env";
import { spawn } from "node:child_process";
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
		function runWithProgress(
			cmd: string,
			args: string[],
			broadcast: (event: string, payload: unknown) => void,
			progressEvent: string,
			envName: string,
		): Promise<{ code: number; output: string }> {
			return new Promise((resolve) => {
				const lines: string[] = [];
				const proc = spawn(cmd, args, { shell: true, stdio: ["ignore", "pipe", "pipe"] });

				const onData = (chunk: Buffer) => {
					const text = chunk.toString();
					for (const line of text.split("\n")) {
						const trimmed = line.trimEnd();
						if (!trimmed) continue;
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
				args = ["env", "create", "-f", yamlPath, "--yes"];
			} else {
				// No YAML — create from base and name it accordingly
				cmd = conda.path;
				args = ["create", "-n", condaName, "python=3.12", "--yes"];
			}

			context.broadcast("acaclaw.env.install.progress", { name: rawName, line: `$ conda ${args.join(" ")}` });

			const result = await runWithProgress(cmd, args, context.broadcast, "acaclaw.env.install.progress", rawName);

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
				respond(true, { envs: [] });
				return;
			}

			const envs: Array<{ name: string; exists: boolean; packages: number }> = [];
			for (const [uiId, condaName] of Object.entries(UI_TO_CONDA)) {
				const disc = Object.entries(DISCIPLINE_ENVS).find(([, v]) => v === condaName)?.[0] ?? "general";
				const status = detectEnvironment(disc);
				envs.push({ name: uiId, exists: status.envExists, packages: status.installedPackages.length });
			}
			respond(true, { envs });
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

			const pipCmd = `"${conda.path}" run --no-banner -n ${condaName} pip install ${packages.join(" ")}`;
			context.broadcast("acaclaw.env.install.progress", { name: rawEnv, line: `$ ${pipCmd}` });

			const result = await runWithProgress("bash", ["-c", pipCmd], context.broadcast, "acaclaw.env.install.progress", rawEnv);

			if (result.code === 0) {
				respond(true, { packages, installed: true });
			} else {
				respond(false, undefined, { code: "PIP_FAILED", message: `pip install failed (exit ${result.code})` });
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
