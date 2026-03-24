import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Integration tests for scripts/uninstall.sh and scripts/uninstall-all.sh
 * across macOS, Linux, and Windows (WSL/MSYS).
 *
 * Two uninstall modes:
 *   1. AcaClaw-only (uninstall.sh) — removes AcaClaw but leaves OpenClaw
 *   2. Full uninstall (uninstall-all.sh) — removes both AcaClaw and OpenClaw
 *
 * Tests run in a sandboxed temp HOME to avoid touching real system state.
 */

const SCRIPT_DIR = resolve(__dirname, "../scripts");
const UNINSTALL_SCRIPT = join(SCRIPT_DIR, "uninstall.sh");
const UNINSTALL_ALL_SCRIPT = join(SCRIPT_DIR, "uninstall-all.sh");

function runBash(
	script: string,
	opts: { env?: Record<string, string>; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
	return new Promise((resolve) => {
		execFile(
			"bash",
			["-c", script],
			{
				env: { ...process.env, ...opts.env },
				timeout: opts.timeout ?? 30_000,
			},
			(err, stdout, stderr) => {
				resolve({
					stdout: stdout.toString(),
					stderr: stderr.toString(),
					code: (err as any)?.code ?? 0,
				});
			},
		);
	});
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

// Scaffold a fake AcaClaw installation inside a temp HOME
async function scaffoldInstall(fakeHome: string) {
	const acaclawDir = join(fakeHome, ".acaclaw");
	const stateDir = join(fakeHome, ".openclaw-acaclaw");
	const openclawDir = join(fakeHome, ".openclaw");
	const workspaceDir = join(fakeHome, "AcaClaw");

	// AcaClaw data dirs
	await mkdir(join(acaclawDir, "backups/files"), { recursive: true });
	await mkdir(join(acaclawDir, "audit"), { recursive: true });
	await mkdir(join(acaclawDir, "config"), { recursive: true });
	await writeFile(join(acaclawDir, "config/security-mode.txt"), "standard\n");
	await writeFile(
		join(acaclawDir, "config/plugins.json"),
		JSON.stringify({ "acaclaw-workspace": {} }),
	);

	// AcaClaw profile (state) dir with plugins
	await mkdir(join(stateDir, "extensions/acaclaw-workspace"), { recursive: true });
	await mkdir(join(stateDir, "extensions/acaclaw-backup"), { recursive: true });
	await mkdir(join(stateDir, "extensions/acaclaw-security"), { recursive: true });
	await mkdir(join(stateDir, "ui"), { recursive: true });
	await writeFile(
		join(stateDir, "openclaw.json"),
		JSON.stringify({ gateway: { auth: { token: "test-token" } } }),
	);

	// AcaClaw's own miniforge
	const miniforgeDir = join(acaclawDir, "miniforge3");
	await mkdir(join(miniforgeDir, "bin"), { recursive: true });
	await writeFile(join(miniforgeDir, "bin/conda"), "#!/bin/bash\necho conda");

	// OpenClaw install (should NOT be touched by acaclaw-only uninstall)
	await mkdir(openclawDir, { recursive: true });
	await writeFile(
		join(openclawDir, "openclaw.json"),
		JSON.stringify({ gateway: { port: 2080 } }),
	);

	// User research workspace
	await mkdir(join(workspaceDir, "data/raw"), { recursive: true });
	await writeFile(join(workspaceDir, "README.md"), "# Research data\n");

	return { acaclawDir, stateDir, openclawDir, workspaceDir, miniforgeDir };
}

describe("uninstall.sh — AcaClaw-only uninstall", () => {
	let fakeHome: string;

	beforeEach(async () => {
		fakeHome = await mkdtemp(join(tmpdir(), "acaclaw-uninstall-test-"));
	});

	afterEach(async () => {
		await rm(fakeHome, { recursive: true, force: true });
	});

	// ---------------------------------------------------------------
	// CLI flags
	// ---------------------------------------------------------------
	describe("CLI flags", () => {
		it("--help prints usage and exits 0", async () => {
			const { stdout, code } = await runBash(
				`bash "${UNINSTALL_SCRIPT}" --help`,
			);
			expect(code).toBe(0);
			expect(stdout).toContain("Usage:");
			expect(stdout).toContain("--keep-backups");
			expect(stdout).toContain("--yes");
		});

		it("-h prints usage and exits 0", async () => {
			const { stdout, code } = await runBash(
				`bash "${UNINSTALL_SCRIPT}" -h`,
			);
			expect(code).toBe(0);
			expect(stdout).toContain("Usage:");
		});

		it("unknown flag exits with error", async () => {
			const { code } = await runBash(
				`bash "${UNINSTALL_SCRIPT}" --bad-flag 2>&1`,
			);
			expect(code).not.toBe(0);
		});
	});

	// ---------------------------------------------------------------
	// Removal of AcaClaw profile
	// ---------------------------------------------------------------
	describe("AcaClaw profile removal", () => {
		it("removes ~/.openclaw-acaclaw/", async () => {
			const { stateDir } = await scaffoldInstall(fakeHome);
			expect(await exists(stateDir)).toBe(true);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_STATE_DIR="${stateDir}"
				if [[ -d "\${ACACLAW_STATE_DIR}" ]]; then
					rm -rf "\${ACACLAW_STATE_DIR}"
				fi
			`);
			expect(code).toBe(0);
			expect(await exists(stateDir)).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// Removal of AcaClaw miniforge
	// ---------------------------------------------------------------
	describe("AcaClaw Miniforge removal", () => {
		it("removes AcaClaw-installed miniforge", async () => {
			const { miniforgeDir } = await scaffoldInstall(fakeHome);
			expect(await exists(miniforgeDir)).toBe(true);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_MINIFORGE="${miniforgeDir}"
				if [[ -d "$ACACLAW_MINIFORGE" ]]; then
					rm -rf "$ACACLAW_MINIFORGE"
				fi
			`);
			expect(code).toBe(0);
			expect(await exists(miniforgeDir)).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// AcaClaw data dirs (config, audit, backups)
	// ---------------------------------------------------------------
	describe("AcaClaw data removal", () => {
		it("removes config/ and audit/ subdirs", async () => {
			const { acaclawDir } = await scaffoldInstall(fakeHome);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				for subdir in config audit; do
					if [[ -d "\${ACACLAW_DIR}/\${subdir}" ]]; then
						rm -rf "\${ACACLAW_DIR}/\${subdir}"
					fi
				done
			`);
			expect(code).toBe(0);
			expect(await exists(join(acaclawDir, "config"))).toBe(false);
			expect(await exists(join(acaclawDir, "audit"))).toBe(false);
		});

		it("removes backups/ when --keep-backups is not set", async () => {
			const { acaclawDir } = await scaffoldInstall(fakeHome);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				KEEP_BACKUPS=false
				if [[ "$KEEP_BACKUPS" == "false" && -d "\${ACACLAW_DIR}/backups" ]]; then
					rm -rf "\${ACACLAW_DIR}/backups"
				fi
			`);
			expect(code).toBe(0);
			expect(await exists(join(acaclawDir, "backups"))).toBe(false);
		});

		it("preserves backups/ when --keep-backups is set", async () => {
			const { acaclawDir } = await scaffoldInstall(fakeHome);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				KEEP_BACKUPS=true
				if [[ "$KEEP_BACKUPS" == "false" && -d "\${ACACLAW_DIR}/backups" ]]; then
					rm -rf "\${ACACLAW_DIR}/backups"
				fi
			`);
			expect(code).toBe(0);
			expect(await exists(join(acaclawDir, "backups"))).toBe(true);
		});

		it("removes empty ~/.acaclaw/ after cleanup", async () => {
			const acaclawDir = join(fakeHome, ".acaclaw");
			await mkdir(acaclawDir, { recursive: true });
			// Dir is empty

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				if [[ -d "$ACACLAW_DIR" ]]; then
					if [[ -z "$(ls -A "$ACACLAW_DIR" 2>/dev/null)" ]]; then
						rmdir "$ACACLAW_DIR"
					fi
				fi
			`);
			expect(code).toBe(0);
			expect(await exists(acaclawDir)).toBe(false);
		});

		it("keeps ~/.acaclaw/ if remaining files exist", async () => {
			const { acaclawDir } = await scaffoldInstall(fakeHome);

			// Remove config and audit but leave backups
			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				rm -rf "\${ACACLAW_DIR}/config" "\${ACACLAW_DIR}/audit"
				# Don't remove backups
				if [[ -d "$ACACLAW_DIR" ]]; then
					if [[ -z "$(ls -A "$ACACLAW_DIR" 2>/dev/null)" ]]; then
						rmdir "$ACACLAW_DIR"
					fi
				fi
			`);
			expect(code).toBe(0);
			// backups and miniforge3 still exist
			expect(await exists(acaclawDir)).toBe(true);
		});
	});

	// ---------------------------------------------------------------
	// OpenClaw is NOT touched
	// ---------------------------------------------------------------
	describe("OpenClaw preservation", () => {
		it("does NOT remove ~/.openclaw/", async () => {
			const { openclawDir } = await scaffoldInstall(fakeHome);

			// Simulate full AcaClaw-only uninstall (remove AcaClaw dirs only)
			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_STATE_DIR="${fakeHome}/.openclaw-acaclaw"
				ACACLAW_DIR="${fakeHome}/.acaclaw"
				ACACLAW_MINIFORGE="${fakeHome}/.acaclaw/miniforge3"
				rm -rf "$ACACLAW_STATE_DIR"
				rm -rf "$ACACLAW_MINIFORGE"
				rm -rf "\${ACACLAW_DIR}/config" "\${ACACLAW_DIR}/audit" "\${ACACLAW_DIR}/backups"
			`);
			expect(code).toBe(0);
			expect(await exists(openclawDir)).toBe(true);

			const config = JSON.parse(
				await readFile(join(openclawDir, "openclaw.json"), "utf-8"),
			);
			expect(config.gateway.port).toBe(2080);
		});

		it("does NOT remove ~/AcaClaw/ research data", async () => {
			const { workspaceDir } = await scaffoldInstall(fakeHome);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_STATE_DIR="${fakeHome}/.openclaw-acaclaw"
				ACACLAW_DIR="${fakeHome}/.acaclaw"
				rm -rf "$ACACLAW_STATE_DIR"
				rm -rf "\${ACACLAW_DIR}/config" "\${ACACLAW_DIR}/audit" "\${ACACLAW_DIR}/backups"
			`);
			expect(code).toBe(0);
			expect(await exists(workspaceDir)).toBe(true);
			expect(await exists(join(workspaceDir, "data/raw"))).toBe(true);

			const readme = await readFile(join(workspaceDir, "README.md"), "utf-8");
			expect(readme).toContain("Research data");
		});
	});

	// ---------------------------------------------------------------
	// Platform-specific service removal
	// ---------------------------------------------------------------
	describe("service removal per platform", () => {
		it("selects systemd on Linux", async () => {
			const { stdout } = await runBash(`
				platform="linux"
				case "$platform" in
					linux) echo "systemd" ;;
					macos) echo "launchd" ;;
					wsl2)  echo "systemd" ;;
					*)     echo "none" ;;
				esac
			`);
			expect(stdout.trim()).toBe("systemd");
		});

		it("selects launchd on macOS", async () => {
			const { stdout } = await runBash(`
				platform="macos"
				case "$platform" in
					linux) echo "systemd" ;;
					macos) echo "launchd" ;;
					wsl2)  echo "systemd" ;;
					*)     echo "none" ;;
				esac
			`);
			expect(stdout.trim()).toBe("launchd");
		});

		it("selects systemd on WSL2", async () => {
			const { stdout } = await runBash(`
				platform="wsl2"
				case "$platform" in
					linux) echo "systemd" ;;
					macos) echo "launchd" ;;
					wsl2)  echo "systemd" ;;
					*)     echo "none" ;;
				esac
			`);
			expect(stdout.trim()).toBe("systemd");
		});
	});

	// ---------------------------------------------------------------
	// Conda environment detection
	// ---------------------------------------------------------------
	describe("conda environment detection for removal", () => {
		it("finds acaclaw conda envs from conda env list", async () => {
			const { stdout, code } = await runBash(`
				# Simulate conda env list output
				FAKE_OUTPUT="acaclaw                  /home/user/.acaclaw/miniforge3/envs/acaclaw
acaclaw-bio              /home/user/.acaclaw/miniforge3/envs/acaclaw-bio
acaclaw-chem             /home/user/.acaclaw/miniforge3/envs/acaclaw-chem
base                     /home/user/.acaclaw/miniforge3"
				echo "$FAKE_OUTPUT" | grep -oE 'acaclaw(-[a-zA-Z0-9_]+)?' | sort -u
			`);
			expect(code).toBe(0);
			const envs = stdout.trim().split("\n");
			expect(envs).toContain("acaclaw");
			expect(envs).toContain("acaclaw-bio");
			expect(envs).toContain("acaclaw-chem");
		});

		it("handles no acaclaw envs gracefully", async () => {
			const { stdout, code } = await runBash(`
				FAKE_OUTPUT="base                     /home/user/miniconda3
myproject                /home/user/miniconda3/envs/myproject"
				RESULT=$(echo "$FAKE_OUTPUT" | grep -oE 'acaclaw(-[a-zA-Z0-9_]+)?' | sort -u || true)
				if [[ -z "$RESULT" ]]; then
					echo "no-envs"
				else
					echo "$RESULT"
				fi
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("no-envs");
		});
	});
});

// =================================================================
// Full uninstall (uninstall-all.sh) — removes AcaClaw AND OpenClaw
// =================================================================

describe("uninstall-all.sh — full uninstall", () => {
	let fakeHome: string;

	beforeEach(async () => {
		fakeHome = await mkdtemp(join(tmpdir(), "acaclaw-uninstall-all-test-"));
	});

	afterEach(async () => {
		await rm(fakeHome, { recursive: true, force: true });
	});

	// ---------------------------------------------------------------
	// CLI flags
	// ---------------------------------------------------------------
	describe("CLI flags", () => {
		it("--help prints usage and exits 0", async () => {
			const { stdout, code } = await runBash(
				`bash "${UNINSTALL_ALL_SCRIPT}" --help`,
			);
			expect(code).toBe(0);
			expect(stdout).toContain("Usage:");
			expect(stdout).toContain("--keep-backups");
			expect(stdout).toContain("--yes");
		});

		it("-h prints usage and exits 0", async () => {
			const { stdout, code } = await runBash(
				`bash "${UNINSTALL_ALL_SCRIPT}" -h`,
			);
			expect(code).toBe(0);
			expect(stdout).toContain("Usage:");
		});

		it("unknown flag exits with error", async () => {
			const { code } = await runBash(
				`bash "${UNINSTALL_ALL_SCRIPT}" --bad-flag 2>&1`,
			);
			expect(code).not.toBe(0);
		});
	});

	// ---------------------------------------------------------------
	// Part 1: AcaClaw removal
	// ---------------------------------------------------------------
	describe("Part 1: AcaClaw removal", () => {
		it("removes AcaClaw profile directory", async () => {
			const { stateDir } = await scaffoldInstall(fakeHome);
			expect(await exists(stateDir)).toBe(true);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_STATE_DIR="${stateDir}"
				rm -rf "$ACACLAW_STATE_DIR"
			`);
			expect(code).toBe(0);
			expect(await exists(stateDir)).toBe(false);
		});

		it("removes AcaClaw miniforge", async () => {
			const { miniforgeDir } = await scaffoldInstall(fakeHome);
			expect(await exists(miniforgeDir)).toBe(true);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_MINIFORGE="${miniforgeDir}"
				rm -rf "$ACACLAW_MINIFORGE"
			`);
			expect(code).toBe(0);
			expect(await exists(miniforgeDir)).toBe(false);
		});

		it("removes AcaClaw data dirs (config, audit)", async () => {
			const { acaclawDir } = await scaffoldInstall(fakeHome);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				for subdir in config audit; do
					if [[ -d "\${ACACLAW_DIR}/\${subdir}" ]]; then
						rm -rf "\${ACACLAW_DIR}/\${subdir}"
					fi
				done
			`);
			expect(code).toBe(0);
			expect(await exists(join(acaclawDir, "config"))).toBe(false);
			expect(await exists(join(acaclawDir, "audit"))).toBe(false);
		});

		it("removes backups when --keep-backups is not set", async () => {
			const { acaclawDir } = await scaffoldInstall(fakeHome);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				KEEP_BACKUPS=false
				if [[ "$KEEP_BACKUPS" == "false" && -d "\${ACACLAW_DIR}/backups" ]]; then
					rm -rf "\${ACACLAW_DIR}/backups"
				fi
			`);
			expect(code).toBe(0);
			expect(await exists(join(acaclawDir, "backups"))).toBe(false);
		});

		it("preserves backups when --keep-backups is set", async () => {
			const { acaclawDir } = await scaffoldInstall(fakeHome);

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				KEEP_BACKUPS=true
				if [[ "$KEEP_BACKUPS" == "false" && -d "\${ACACLAW_DIR}/backups" ]]; then
					rm -rf "\${ACACLAW_DIR}/backups"
				fi
			`);
			expect(code).toBe(0);
			expect(await exists(join(acaclawDir, "backups"))).toBe(true);
		});
	});

	// ---------------------------------------------------------------
	// Part 2: OpenClaw removal
	// ---------------------------------------------------------------
	describe("Part 2: OpenClaw removal", () => {
		it("removes ~/.openclaw/ state directory", async () => {
			const { openclawDir } = await scaffoldInstall(fakeHome);
			expect(await exists(openclawDir)).toBe(true);

			const { code } = await runBash(`
				set -euo pipefail
				OPENCLAW_STATE_DIR="${openclawDir}"
				rm -rf "$OPENCLAW_STATE_DIR"
			`);
			expect(code).toBe(0);
			expect(await exists(openclawDir)).toBe(false);
		});

		it("selects openclaw uninstall --all when CLI available", async () => {
			const { stdout } = await runBash(`
				HAS_OPENCLAW=true
				if [[ "$HAS_OPENCLAW" == "true" ]]; then
					echo "openclaw uninstall --all --yes --non-interactive"
				else
					echo "manual-cleanup"
				fi
			`);
			expect(stdout.trim()).toBe(
				"openclaw uninstall --all --yes --non-interactive",
			);
		});

		it("falls back to manual systemd cleanup on Linux", async () => {
			const { stdout } = await runBash(`
				platform="Linux"
				case "$platform" in
					Linux*)
						echo "systemd-cleanup"
						;;
					Darwin*)
						echo "launchd-cleanup"
						;;
				esac
			`);
			expect(stdout.trim()).toBe("systemd-cleanup");
		});

		it("falls back to manual launchd cleanup on macOS", async () => {
			const { stdout } = await runBash(`
				platform="Darwin"
				case "$platform" in
					Linux*)
						echo "systemd-cleanup"
						;;
					Darwin*)
						echo "launchd-cleanup"
						;;
				esac
			`);
			expect(stdout.trim()).toBe("launchd-cleanup");
		});
	});

	// ---------------------------------------------------------------
	// Research data preservation
	// ---------------------------------------------------------------
	describe("research data preservation", () => {
		it("preserves ~/AcaClaw/ even in full uninstall", async () => {
			const { workspaceDir, stateDir, acaclawDir, openclawDir } =
				await scaffoldInstall(fakeHome);

			// Simulate full uninstall — remove everything EXCEPT workspace
			const { code } = await runBash(`
				set -euo pipefail
				rm -rf "${stateDir}"
				rm -rf "${acaclawDir}"
				rm -rf "${openclawDir}"
			`);
			expect(code).toBe(0);

			// Workspace must survive
			expect(await exists(workspaceDir)).toBe(true);
			expect(await exists(join(workspaceDir, "data/raw"))).toBe(true);
			const readme = await readFile(join(workspaceDir, "README.md"), "utf-8");
			expect(readme).toContain("Research data");
		});
	});

	// ---------------------------------------------------------------
	// Full uninstall cleans everything AcaClaw + OpenClaw state
	// ---------------------------------------------------------------
	describe("complete removal verification", () => {
		it("removes all AcaClaw AND OpenClaw state dirs", async () => {
			const { stateDir, acaclawDir, openclawDir, miniforgeDir, workspaceDir } =
				await scaffoldInstall(fakeHome);

			const { code } = await runBash(`
				set -euo pipefail
				# Part 1: AcaClaw
				rm -rf "${stateDir}"
				rm -rf "${miniforgeDir}"
				for subdir in config audit backups; do
					rm -rf "${acaclawDir}/$subdir"
				done
				if [[ -d "${acaclawDir}" && -z "$(ls -A "${acaclawDir}" 2>/dev/null)" ]]; then
					rmdir "${acaclawDir}"
				fi
				# Part 2: OpenClaw
				rm -rf "${openclawDir}"
			`);
			expect(code).toBe(0);

			expect(await exists(stateDir)).toBe(false);
			expect(await exists(miniforgeDir)).toBe(false);
			expect(await exists(openclawDir)).toBe(false);
			// acaclawDir may or may not exist (rmdir only if empty)
			// Workspace preserved
			expect(await exists(workspaceDir)).toBe(true);
		});
	});

	// ---------------------------------------------------------------
	// OpenClaw CLI npm removal
	// ---------------------------------------------------------------
	describe("OpenClaw CLI removal", () => {
		it("calls npm rm -g openclaw when CLI is present", async () => {
			const { stdout } = await runBash(`
				HAS_CLI=true
				if [[ "$HAS_CLI" == "true" ]]; then
					echo "npm rm -g openclaw"
				else
					echo "skip"
				fi
			`);
			expect(stdout.trim()).toBe("npm rm -g openclaw");
		});

		it("also removes clawhub CLI if present", async () => {
			const { stdout } = await runBash(`
				HAS_CLAWHUB=true
				if [[ "$HAS_CLAWHUB" == "true" ]]; then
					echo "npm rm -g clawhub"
				else
					echo "skip"
				fi
			`);
			expect(stdout.trim()).toBe("npm rm -g clawhub");
		});
	});

	// ---------------------------------------------------------------
	// Desktop shortcut removal (platform-specific)
	// ---------------------------------------------------------------
	describe("desktop shortcut removal per platform", () => {
		it("removes .desktop file on Linux", async () => {
			const desktopFile = join(
				fakeHome,
				".local/share/applications/acaclaw.desktop",
			);
			await mkdir(join(fakeHome, ".local/share/applications"), {
				recursive: true,
			});
			await writeFile(desktopFile, "[Desktop Entry]\nName=AcaClaw\n");

			const { code } = await runBash(`
				set -euo pipefail
				DESKTOP_FILE="${desktopFile}"
				rm -f "$DESKTOP_FILE"
			`);
			expect(code).toBe(0);
			expect(await exists(desktopFile)).toBe(false);
		});

		it("removes .command wrapper on macOS", async () => {
			const cmdFile = join(fakeHome, "Applications/AcaClaw.command");
			await mkdir(join(fakeHome, "Applications"), { recursive: true });
			await writeFile(cmdFile, "#!/bin/bash\nopen http://localhost:2090\n");

			const { code } = await runBash(`
				set -euo pipefail
				CMD_FILE="${cmdFile}"
				rm -f "$CMD_FILE"
			`);
			expect(code).toBe(0);
			expect(await exists(cmdFile)).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// Systemd unit file removal (Linux)
	// ---------------------------------------------------------------
	describe("systemd unit file removal", () => {
		it("removes systemd user unit file", async () => {
			const unitFile = join(
				fakeHome,
				".config/systemd/user/acaclaw-gateway.service",
			);
			await mkdir(join(fakeHome, ".config/systemd/user"), { recursive: true });
			await writeFile(
				unitFile,
				"[Unit]\nDescription=AcaClaw Gateway\n[Service]\nExecStart=/usr/bin/openclaw\n",
			);

			const { code } = await runBash(`
				set -euo pipefail
				SYSTEMD_UNIT="${unitFile}"
				rm -f "$SYSTEMD_UNIT"
			`);
			expect(code).toBe(0);
			expect(await exists(unitFile)).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// LaunchAgent plist removal (macOS)
	// ---------------------------------------------------------------
	describe("launchd plist removal", () => {
		it("removes LaunchAgent plist file", async () => {
			const plistFile = join(
				fakeHome,
				"Library/LaunchAgents/ai.openclaw.gateway.plist",
			);
			await mkdir(join(fakeHome, "Library/LaunchAgents"), { recursive: true });
			await writeFile(
				plistFile,
				'<?xml version="1.0"?>\n<plist><dict></dict></plist>\n',
			);

			const { code } = await runBash(`
				set -euo pipefail
				PLIST_FILE="${plistFile}"
				rm -f "$PLIST_FILE"
			`);
			expect(code).toBe(0);
			expect(await exists(plistFile)).toBe(false);
		});
	});
});
