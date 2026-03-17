
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-compat-checker";
import { resolveConfig, runCompatChecks } from "./compat-checker.js";

const compatCheckerPlugin = {
	id: "acaclaw-compat-checker",
	name: "AcaClaw Compatibility Checker",
	description: "Validates that OpenClaw version and environment meet AcaClaw requirements",

	register(api: OpenClawPluginApi) {
		const config = resolveConfig(api.pluginConfig ?? {});

		// Run checks on startup
		if (config.checkOnStartup) {
			const result = runCompatChecks(config);
			if (result.passed) {
				api.logger.info?.(
					`[acaclaw-compat] All checks passed (OpenClaw v${result.openClawVersion})`,
				);
			} else {
				const failed = result.checks.filter((c) => !c.passed);
				api.logger.warn?.(
					`[acaclaw-compat] ${failed.length} check(s) failed: ${failed.map((c) => c.name).join(", ")}`,
				);
			}
		}

		// Tool: run compatibility checks
		api.registerTool({
			name: "compat_check",
			description:
				"Run AcaClaw compatibility checks: OpenClaw version, Node.js version, plugin SDK, environment.",
			parameters: { type: "object" as const, properties: {} },
			async execute() {
				const result = runCompatChecks(config);

				const lines = [
					"# AcaClaw Compatibility Check",
					"",
					`Overall: ${result.passed ? "**PASSED**" : "**FAILED**"}`,
					"",
					"| Check | Status | Detail |",
					"|-------|--------|--------|",
					...result.checks.map(
						(c) => `| ${c.name} | ${c.passed ? "✓" : "✗"} | ${c.detail} |`,
					),
				];

				return { output: lines.join("\n") };
			},
		});

		// CLI: acaclaw-compat commands
		api.registerCli(
			({ program }) => {
				const cmd = program
					.command("acaclaw-compat")
					.description("AcaClaw compatibility checks");

				cmd
					.command("check")
					.description("Run all compatibility checks")
					.action(() => {
						const result = runCompatChecks(config);
						console.log(result.passed ? "All checks passed." : "Some checks failed.");
						for (const c of result.checks) {
							console.log(`  ${c.passed ? "✓" : "✗"} ${c.name}: ${c.detail}`);
						}
						if (!result.passed) process.exitCode = 1;
					});
			},
			{ commands: ["acaclaw-compat"] },
		);
	},
};

export default compatCheckerPlugin;
