import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-academic-env";
import {
	resolveConfig,
	readInstalledDiscipline,
	detectEnvironment,
	condaRunPrefix,
	writeEnvManifest,
	buildEnvContext,
	DISCIPLINE_ENVS,
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
			parameters: Type.Object({}),
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
