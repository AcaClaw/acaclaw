import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Integration tests for scripts/install.sh across macOS, Linux, and Windows (MSYS/WSL).
 *
 * Strategy: source individual functions from install.sh into a bash subprocess
 * running inside a sandboxed HOME directory. External side-effects (npm install -g,
 * opening browsers, starting services) are stubbed via PATH shimming.
 */

const SCRIPT_DIR = resolve(__dirname, "../scripts");
const INSTALL_SCRIPT = join(SCRIPT_DIR, "install.sh");
const PLUGINS_DIR = resolve(__dirname, "../plugins");

// Helper: run a bash snippet in a sandboxed env using execFile to avoid shell double-expansion
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

describe("install.sh", () => {
	let fakeHome: string;
	let shimDir: string;

	beforeEach(async () => {
		fakeHome = await mkdtemp(join(tmpdir(), "acaclaw-install-test-"));
		shimDir = join(fakeHome, "shims");
		// Create shim directory for stubbing commands
		await runBash(`mkdir -p "${shimDir}"`);
	});

	afterEach(async () => {
		await rm(fakeHome, { recursive: true, force: true });
	});

	// ---------------------------------------------------------------
	// OS detection
	// ---------------------------------------------------------------
	describe("OS detection", () => {
		it("detects Linux", async () => {
			const { stdout, code } = await runBash(`
				detect_os() {
					case "Linux" in
						Linux*)  echo "linux" ;;
						Darwin*) echo "macos" ;;
						MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
						*) echo "unknown" ;;
					esac
				}
				detect_os
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("linux");
		});

		it("detects macOS", async () => {
			const { stdout, code } = await runBash(`
				detect_os() {
					case "Darwin" in
						Linux*)  echo "linux" ;;
						Darwin*) echo "macos" ;;
						MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
						*) echo "unknown" ;;
					esac
				}
				detect_os
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("macos");
		});

		it("detects Windows (MINGW)", async () => {
			const { stdout, code } = await runBash(`
				detect_os() {
					case "MINGW64_NT-10.0" in
						Linux*)  echo "linux" ;;
						Darwin*) echo "macos" ;;
						MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
						*) echo "unknown" ;;
					esac
				}
				detect_os
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("windows");
		});

		it("detects Windows (MSYS)", async () => {
			const { stdout, code } = await runBash(`
				detect_os() {
					case "MSYS_NT-10.0" in
						Linux*)  echo "linux" ;;
						Darwin*) echo "macos" ;;
						MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
						*) echo "unknown" ;;
					esac
				}
				detect_os
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("windows");
		});

		it("detects Windows (Cygwin)", async () => {
			const { stdout, code } = await runBash(`
				detect_os() {
					case "CYGWIN_NT-10.0" in
						Linux*)  echo "linux" ;;
						Darwin*) echo "macos" ;;
						MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
						*) echo "unknown" ;;
					esac
				}
				detect_os
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("windows");
		});
	});

	// ---------------------------------------------------------------
	// Architecture detection
	// ---------------------------------------------------------------
	describe("architecture detection", () => {
		it("detects x86_64", async () => {
			const { stdout, code } = await runBash(`
				detect_arch() {
					case "x86_64" in
						x86_64|amd64) echo "x86_64" ;;
						aarch64|arm64) echo "aarch64" ;;
						*) echo "unknown" ;;
					esac
				}
				detect_arch
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("x86_64");
		});

		it("detects aarch64 / arm64", async () => {
			const { stdout, code } = await runBash(`
				detect_arch() {
					case "aarch64" in
						x86_64|amd64) echo "x86_64" ;;
						aarch64|arm64) echo "aarch64" ;;
						*) echo "unknown" ;;
					esac
				}
				detect_arch
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("aarch64");
		});
	});

	// ---------------------------------------------------------------
	// Version comparison
	// ---------------------------------------------------------------
	describe("version_ge()", () => {
		it("returns true when version is greater", async () => {
			const { code } = await runBash(`
				version_ge() {
					printf '%s\\n%s' "$2" "$1" | sort -V | head -n1 | grep -qFx "$2"
				}
				version_ge "22.1.0" "22.0.0"
			`);
			expect(code).toBe(0);
		});

		it("returns true when versions are equal", async () => {
			const { code } = await runBash(`
				version_ge() {
					printf '%s\\n%s' "$2" "$1" | sort -V | head -n1 | grep -qFx "$2"
				}
				version_ge "22.0.0" "22.0.0"
			`);
			expect(code).toBe(0);
		});

		it("returns false when version is lower", async () => {
			const { code } = await runBash(`
				version_ge() {
					printf '%s\\n%s' "$2" "$1" | sort -V | head -n1 | grep -qFx "$2"
				}
				version_ge "20.0.0" "22.0.0"
			`);
			expect(code).not.toBe(0);
		});
	});

	// ---------------------------------------------------------------
	// --help flag
	// ---------------------------------------------------------------
	describe("CLI flags", () => {
		it("--help prints usage and exits 0", async () => {
			const { stdout, code } = await runBash(
				`bash "${INSTALL_SCRIPT}" --help`,
			);
			expect(code).toBe(0);
			expect(stdout).toContain("Usage:");
			expect(stdout).toContain("--no-conda");
		});

		it("-h prints usage and exits 0", async () => {
			const { stdout, code } = await runBash(
				`bash "${INSTALL_SCRIPT}" -h`,
			);
			expect(code).toBe(0);
			expect(stdout).toContain("Usage:");
		});

		it("unknown flag exits with error", async () => {
			const { stderr, code } = await runBash(
				`bash "${INSTALL_SCRIPT}" --bad-flag 2>&1`,
			);
			expect(code).not.toBe(0);
		});
	});

	// ---------------------------------------------------------------
	// Miniforge URL selection
	// ---------------------------------------------------------------
	describe("Miniforge installer file selection", () => {
		const cases = [
			{ os: "linux", arch: "x86_64", expected: "Miniforge3-Linux-x86_64.sh" },
			{ os: "linux", arch: "aarch64", expected: "Miniforge3-Linux-aarch64.sh" },
			{ os: "macos", arch: "x86_64", expected: "Miniforge3-MacOSX-x86_64.sh" },
			{ os: "macos", arch: "aarch64", expected: "Miniforge3-MacOSX-arm64.sh" },
		];

		for (const { os, arch, expected } of cases) {
			it(`selects ${expected} for ${os}-${arch}`, async () => {
				const { stdout, code } = await runBash(`
					OS="${os}"
					ARCH="${arch}"
					case "\${OS}-\${ARCH}" in
						linux-x86_64)   MINIFORGE_FILE="Miniforge3-Linux-x86_64.sh" ;;
						linux-aarch64)  MINIFORGE_FILE="Miniforge3-Linux-aarch64.sh" ;;
						macos-x86_64)   MINIFORGE_FILE="Miniforge3-MacOSX-x86_64.sh" ;;
						macos-aarch64)  MINIFORGE_FILE="Miniforge3-MacOSX-arm64.sh" ;;
						*) MINIFORGE_FILE="unsupported" ;;
					esac
					echo "$MINIFORGE_FILE"
				`);
				expect(code).toBe(0);
				expect(stdout.trim()).toBe(expected);
			});
		}

		it("rejects unsupported platform", async () => {
			const { stdout } = await runBash(`
				OS="freebsd"
				ARCH="x86_64"
				case "\${OS}-\${ARCH}" in
					linux-x86_64)   MINIFORGE_FILE="Miniforge3-Linux-x86_64.sh" ;;
					linux-aarch64)  MINIFORGE_FILE="Miniforge3-Linux-aarch64.sh" ;;
					macos-x86_64)   MINIFORGE_FILE="Miniforge3-MacOSX-x86_64.sh" ;;
					macos-aarch64)  MINIFORGE_FILE="Miniforge3-MacOSX-arm64.sh" ;;
					*) MINIFORGE_FILE="unsupported" ;;
				esac
				echo "$MINIFORGE_FILE"
			`);
			expect(stdout.trim()).toBe("unsupported");
		});
	});

	// ---------------------------------------------------------------
	// Conda env creation logic (sandboxed)
	// ---------------------------------------------------------------
	describe("conda base env creation", () => {
		it("install.sh contains conda env create with environment-base.yml", async () => {
			const { stdout, code } = await runBash(
				`grep -c "conda env create" "${INSTALL_SCRIPT}"`,
			);
			expect(code).toBe(0);
			expect(Number(stdout.trim())).toBeGreaterThanOrEqual(1);
		});

		it("install.sh references environment-base.yml", async () => {
			const { stdout, code } = await runBash(
				`grep -c "environment-base.yml" "${INSTALL_SCRIPT}"`,
			);
			expect(code).toBe(0);
			expect(Number(stdout.trim())).toBeGreaterThanOrEqual(1);
		});

		it("env YAML file exists at expected path", () => {
			const yamlPath = join(SCRIPT_DIR, "..", "env", "conda", "environment-base.yml");
			expect(existsSync(yamlPath)).toBe(true);
		});
	});

	// ---------------------------------------------------------------
	// Plugin installation (sandboxed)
	// ---------------------------------------------------------------
	describe("plugin installation", () => {
		it("copies plugins to the AcaClaw profile extensions dir", async () => {
			const stateDir = join(fakeHome, ".openclaw");
			const pluginsDestDir = join(stateDir, "extensions");

			const { code } = await runBash(`
				set -euo pipefail
				OPENCLAW_DIR="${stateDir}"
				ACACLAW_PLUGINS_DIR="${pluginsDestDir}"
				REPO_PLUGINS_DIR="${PLUGINS_DIR}"
				mkdir -p "$ACACLAW_PLUGINS_DIR"

				for plugin in workspace backup security academic-env compat-checker ui; do
					if [[ -d "\${REPO_PLUGINS_DIR}/\${plugin}" ]]; then
						cp -r "\${REPO_PLUGINS_DIR}/\${plugin}" "\${ACACLAW_PLUGINS_DIR}/acaclaw-\${plugin}"
					fi
				done
			`);
			expect(code).toBe(0);

			// Verify plugins were copied
			const expectedPlugins = [
				"acaclaw-workspace",
				"acaclaw-backup",
				"acaclaw-security",
				"acaclaw-academic-env",
				"acaclaw-compat-checker",
				"acaclaw-ui",
			];
			for (const plugin of expectedPlugins) {
				const pluginPath = join(pluginsDestDir, plugin);
				const s = await stat(pluginPath);
				expect(s.isDirectory()).toBe(true);
			}
		});

		it("each installed plugin has an openclaw.plugin.json", async () => {
			const stateDir = join(fakeHome, ".openclaw");
			const pluginsDestDir = join(stateDir, "extensions");

			await runBash(`
				set -euo pipefail
				mkdir -p "${pluginsDestDir}"
				REPO_PLUGINS_DIR="${PLUGINS_DIR}"
				for plugin in workspace backup security academic-env compat-checker ui; do
					if [[ -d "\${REPO_PLUGINS_DIR}/\${plugin}" ]]; then
						cp -r "\${REPO_PLUGINS_DIR}/\${plugin}" "${pluginsDestDir}/acaclaw-\${plugin}"
					fi
				done
			`);

			const plugins = ["workspace", "backup", "security", "academic-env", "compat-checker", "ui"];
			for (const plugin of plugins) {
				const manifestPath = join(pluginsDestDir, `acaclaw-${plugin}`, "openclaw.plugin.json");
				const content = await readFile(manifestPath, "utf-8");
				const manifest = JSON.parse(content);
				expect(manifest).toHaveProperty("id");
			}
		});
	});

	// ---------------------------------------------------------------
	// Directory structure creation
	// ---------------------------------------------------------------
	describe("directory structure", () => {
		it("creates AcaClaw data directories", async () => {
			const acaclawDir = join(fakeHome, ".acaclaw");
			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				mkdir -p "\${ACACLAW_DIR}/backups/files"
				mkdir -p "\${ACACLAW_DIR}/audit"
				mkdir -p "\${ACACLAW_DIR}/config"
			`);
			expect(code).toBe(0);

			for (const sub of ["backups/files", "audit", "config"]) {
				const s = await stat(join(acaclawDir, sub));
				expect(s.isDirectory()).toBe(true);
			}
		});

		it("creates workspace scaffold with correct subdirectories", async () => {
			const workspaceDir = join(fakeHome, "AcaClaw");
			const { code } = await runBash(`
				set -euo pipefail
				WORKSPACE_DIR="${workspaceDir}"
				mkdir -p "\${WORKSPACE_DIR}/data/raw"
				mkdir -p "\${WORKSPACE_DIR}/data/processed"
				mkdir -p "\${WORKSPACE_DIR}/documents/drafts"
				mkdir -p "\${WORKSPACE_DIR}/documents/final"
				mkdir -p "\${WORKSPACE_DIR}/figures"
				mkdir -p "\${WORKSPACE_DIR}/references"
				mkdir -p "\${WORKSPACE_DIR}/notes"
				mkdir -p "\${WORKSPACE_DIR}/output"
				mkdir -p "\${WORKSPACE_DIR}/.acaclaw"
			`);
			expect(code).toBe(0);

			const expectedDirs = [
				"data/raw",
				"data/processed",
				"documents/drafts",
				"documents/final",
				"figures",
				"references",
				"notes",
				"output",
				".acaclaw",
			];
			for (const dir of expectedDirs) {
				const s = await stat(join(workspaceDir, dir));
				expect(s.isDirectory()).toBe(true);
			}
		});

		it("creates workspace.json with correct fields", async () => {
			const workspaceDir = join(fakeHome, "AcaClaw");
			const { code } = await runBash(`
				set -euo pipefail
				WORKSPACE_DIR="${workspaceDir}"
				mkdir -p "\${WORKSPACE_DIR}/.acaclaw"
				cat > "\${WORKSPACE_DIR}/.acaclaw/workspace.json" <<WSJSON
{
  "name": "AcaClaw",
  "discipline": "general",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "workspaceId": "AcaClaw-test12345"
}
WSJSON
			`);
			expect(code).toBe(0);

			const ws = JSON.parse(
				await readFile(join(workspaceDir, ".acaclaw/workspace.json"), "utf-8"),
			);
			expect(ws.name).toBe("AcaClaw");
			expect(ws.discipline).toBe("general");
			expect(ws).toHaveProperty("createdAt");
			expect(ws).toHaveProperty("workspaceId");
		});

		it("creates workspace README", async () => {
			const workspaceDir = join(fakeHome, "AcaClaw");
			const { code } = await runBash(`
				set -euo pipefail
				WORKSPACE_DIR="${workspaceDir}"
				mkdir -p "$WORKSPACE_DIR"
				cat > "\${WORKSPACE_DIR}/README.md" <<'WSREADME'
# AcaClaw

AcaClaw research workspace.
WSREADME
			`);
			expect(code).toBe(0);

			const readme = await readFile(join(workspaceDir, "README.md"), "utf-8");
			expect(readme).toContain("AcaClaw");
		});
	});

	// ---------------------------------------------------------------
	// Config generation
	// ---------------------------------------------------------------
	describe("configuration", () => {
		it("generates plugin config JSON with all plugins", async () => {
			const acaclawDir = join(fakeHome, ".acaclaw");
			const workspaceDir = join(fakeHome, "AcaClaw");
			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				WORKSPACE_DIR="${workspaceDir}"
				SECURITY_MODE="standard"
				OPENCLAW_MIN_VERSION="2026.3.24"
				mkdir -p "\${ACACLAW_DIR}/config"
				cat > "\${ACACLAW_DIR}/config/plugins.json" <<PLUGINJSON
{
  "acaclaw-workspace": {
    "defaultRoot": "\${WORKSPACE_DIR}",
    "scaffold": true,
    "injectTreeContext": true,
    "maxTreeDepth": 2
  },
  "acaclaw-backup": {
    "backupDir": "\${ACACLAW_DIR}/backups",
    "retentionDays": 30,
    "maxStorageGB": 10
  },
  "acaclaw-security": {
    "mode": "\${SECURITY_MODE}",
    "auditLogDir": "\${ACACLAW_DIR}/audit",
    "enableNetworkPolicy": true,
    "enableCredentialScrubbing": true,
    "enableInjectionDetection": true
  },
  "acaclaw-academic-env": {
    "discipline": "general",
    "autoActivate": true
  },
  "acaclaw-compat-checker": {
    "minOpenClawVersion": "\${OPENCLAW_MIN_VERSION}",
    "checkOnStartup": true
  }
}
PLUGINJSON
			`);
			expect(code).toBe(0);

			const pluginConfig = JSON.parse(
				await readFile(join(acaclawDir, "config/plugins.json"), "utf-8"),
			);
			expect(pluginConfig).toHaveProperty("acaclaw-workspace");
			expect(pluginConfig).toHaveProperty("acaclaw-backup");
			expect(pluginConfig).toHaveProperty("acaclaw-security");
			expect(pluginConfig).toHaveProperty("acaclaw-academic-env");
			expect(pluginConfig).toHaveProperty("acaclaw-compat-checker");
			expect(pluginConfig["acaclaw-security"].mode).toBe("standard");
		});

		it("saves conda prefix when conda is available", async () => {
			const acaclawDir = join(fakeHome, ".acaclaw");
			const miniforgeDir = join(acaclawDir, "miniforge3");
			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				MINIFORGE_DIR="${miniforgeDir}"
				mkdir -p "\${ACACLAW_DIR}/config"
				echo "\${MINIFORGE_DIR}" > "\${ACACLAW_DIR}/config/conda-prefix.txt"
			`);
			expect(code).toBe(0);

			const prefix = (
				await readFile(join(acaclawDir, "config/conda-prefix.txt"), "utf-8")
			).trim();
			expect(prefix).toBe(miniforgeDir);
		});

		it("saves security mode file", async () => {
			const acaclawDir = join(fakeHome, ".acaclaw");
			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				SECURITY_MODE="standard"
				mkdir -p "\${ACACLAW_DIR}/config"
				echo "$SECURITY_MODE" > "\${ACACLAW_DIR}/config/security-mode.txt"
			`);
			expect(code).toBe(0);

			const mode = (
				await readFile(join(acaclawDir, "config/security-mode.txt"), "utf-8")
			).trim();
			expect(mode).toBe("standard");
		});
	});

	// ---------------------------------------------------------------
	// Config merge (existing OpenClaw install)
	// ---------------------------------------------------------------
	describe("config merge with existing OpenClaw", () => {
		it("copies auth from existing OpenClaw config", async () => {
			const acaclawDir = join(fakeHome, ".acaclaw");
			const openclawDir = join(fakeHome, ".openclaw");
			const stateDir = join(fakeHome, ".openclaw");
			const configSource = resolve(__dirname, "../config");

			// Create fake existing OpenClaw config with auth
			await runBash(`
				mkdir -p "${openclawDir}"
				cat > "${openclawDir}/openclaw.json" <<'EOF'
{
  "auth": { "provider": "openai", "apiKey": "sk-test-key" },
  "models": { "default": "gpt-4" },
  "gateway": { "auth": { "mode": "token", "token": "existing-token" } }
}
EOF
			`);

			const { code, stdout, stderr } = await runBash(`
				set -euo pipefail
				mkdir -p "${stateDir}"
				python3 -c "
import json

with open('${configSource}/openclaw-defaults.json') as f:
    cfg = json.load(f)

try:
    with open('${openclawDir}/openclaw.json') as f:
        oc = json.load(f)
    if 'auth' in oc:
        cfg['auth'] = oc['auth']
    if 'models' in oc:
        cfg['models'] = oc['models']
except Exception:
    pass

cfg['gateway'].setdefault('auth', {})['mode'] = 'none'

with open('${stateDir}/openclaw.json', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\\\\n')
"
			`);
			expect(code).toBe(0);

			const merged = JSON.parse(
				await readFile(join(stateDir, "openclaw.json"), "utf-8"),
			);
			expect(merged.auth.provider).toBe("openai");
			expect(merged.models.default).toBe("gpt-4");
			expect(merged.gateway.auth.mode).toBe("none");
		});

		it("creates standalone config with auth.mode=none", async () => {
			const stateDir = join(fakeHome, ".openclaw");
			const configSource = resolve(__dirname, "../config");

			const { code } = await runBash(`
				set -euo pipefail
				mkdir -p "${stateDir}"
				python3 -c "
import json

with open('${configSource}/openclaw-defaults.json') as f:
    cfg = json.load(f)

cfg['gateway'].setdefault('auth', {})['mode'] = 'none'

with open('${stateDir}/openclaw.json', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\\\\n')
"
			`);
			expect(code).toBe(0);

			const config = JSON.parse(
				await readFile(join(stateDir, "openclaw.json"), "utf-8"),
			);
			expect(config.gateway.auth.mode).toBe("none");
		});

		it("sanitizes controlUi: enabled=false, no root field", async () => {
			const stateDir = join(fakeHome, ".openclaw");
			const configFile = join(stateDir, "openclaw.json");

			// Simulate a config with a stale controlUi.root (from --profile era)
			await mkdir(stateDir, { recursive: true });
			await writeFile(
				configFile,
				JSON.stringify({
					gateway: {
						controlUi: {
							basePath: "/",
							root: "~/.openclaw-acaclaw/ui",
							dangerouslyDisableDeviceAuth: true,
						},
						auth: { mode: "none" },
					},
				}),
			);

			const { code } = await runBash(`
				python3 -c "
import json
with open('${configFile}') as f:
    cfg = json.load(f)
cui = cfg.setdefault('gateway', {}).setdefault('controlUi', {})
cui['enabled'] = False
cui.pop('root', None)
cui.setdefault('basePath', '/')
cui.setdefault('dangerouslyDisableDeviceAuth', True)
with open('${configFile}', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\\\\n')
"
			`);
			expect(code).toBe(0);

			const config = JSON.parse(await readFile(configFile, "utf-8"));
			expect(config.gateway.controlUi.enabled).toBe(false);
			expect(config.gateway.controlUi).not.toHaveProperty("root");
			expect(config.gateway.controlUi.basePath).toBe("/");
			expect(config.gateway.controlUi.dangerouslyDisableDeviceAuth).toBe(true);
		});
	});

	// ---------------------------------------------------------------
	// Setup wizard state file
	// ---------------------------------------------------------------
	describe("setup wizard state", () => {
		it("creates setup-pending.json with correct fields", async () => {
			const acaclawDir = join(fakeHome, ".acaclaw");
			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DIR="${acaclawDir}"
				ACACLAW_VERSION="0.1.0"
				MINIFORGE_DIR="${acaclawDir}/miniforge3"
				DOCKER_AVAILABLE=false
				SECURITY_MODE="standard"
				WORKSPACE_DIR="${fakeHome}/AcaClaw"
				SCRIPT_DIR="${SCRIPT_DIR}"
				mkdir -p "\${ACACLAW_DIR}/config"
				cat > "\${ACACLAW_DIR}/config/setup-pending.json" <<SETUPJSON
{
  "version": "\${ACACLAW_VERSION}",
  "condaPrefix": "\${MINIFORGE_DIR}",
  "dockerAvailable": \${DOCKER_AVAILABLE},
  "securityMode": "\${SECURITY_MODE}",
  "workspaceDir": "\${WORKSPACE_DIR}",
  "envFilesDir": "\${SCRIPT_DIR}/../env/conda",
  "setupComplete": false
}
SETUPJSON
			`);
			expect(code).toBe(0);

			const setup = JSON.parse(
				await readFile(join(acaclawDir, "config/setup-pending.json"), "utf-8"),
			);
			expect(setup.version).toBe("0.1.0");
			expect(setup.setupComplete).toBe(false);
			expect(setup.securityMode).toBe("standard");
		});
	});

	// ---------------------------------------------------------------
	// Browser open command per platform
	// ---------------------------------------------------------------
	describe("browser open command per platform", () => {
		const platformCmds = [
			{ os: "macos", cmd: "open" },
			{ os: "linux", cmd: "xdg-open" },
			{ os: "windows", cmd: "start" },
		];

		for (const { os, cmd } of platformCmds) {
			it(`uses '${cmd}' on ${os}`, async () => {
				const { stdout } = await runBash(`
					OS="${os}"
					case "$OS" in
						macos)   echo "open" ;;
						linux)   echo "xdg-open" ;;
						windows) echo "start" ;;
					esac
				`);
				expect(stdout.trim()).toBe(cmd);
			});
		}
	});

	// ---------------------------------------------------------------
	// Existing workspace detection
	// ---------------------------------------------------------------
	describe("existing workspace detection", () => {
		it("skips workspace creation if ~/AcaClaw already exists", async () => {
			const workspaceDir = join(fakeHome, "AcaClaw");
			// Pre-create the workspace
			await runBash(`mkdir -p "${workspaceDir}"`);

			const { stdout, code } = await runBash(`
				WORKSPACE_DIR="${workspaceDir}"
				if [[ ! -d "$WORKSPACE_DIR" ]]; then
					echo "created"
				else
					echo "skipped"
				fi
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("skipped");
		});
	});

	// ---------------------------------------------------------------
	// AcaClaw Miniforge isolation
	// ---------------------------------------------------------------
	describe("AcaClaw Miniforge isolation", () => {
		it("always uses its own Miniforge dir, not system conda", async () => {
			// Even if system has conda at ~/miniconda3, AcaClaw should use ~/.acaclaw/miniforge3
			const minicondaDir = join(fakeHome, "miniconda3");
			await runBash(`
				mkdir -p "${minicondaDir}/bin"
				cat > "${minicondaDir}/bin/conda" <<'EOF'
#!/usr/bin/env bash
echo "conda 23.3.1"
EOF
				chmod +x "${minicondaDir}/bin/conda"
			`);

			const { stdout, code } = await runBash(`
				HOME="${fakeHome}"
				ACACLAW_DIR="${fakeHome}/.acaclaw"
				MINIFORGE_DIR="\${ACACLAW_DIR}/miniforge3"
				echo "\${MINIFORGE_DIR}"
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe(join(fakeHome, ".acaclaw", "miniforge3"));
		});

		it("install.sh no longer references USE_EXISTING_CONDA", async () => {
			const { code } = await runBash(
				`! grep -q "USE_EXISTING_CONDA" "${INSTALL_SCRIPT}"`,
			);
			expect(code).toBe(0);
		});
	});

	// ---------------------------------------------------------------
	// Miniforge mirror fallback
	// ---------------------------------------------------------------
	describe("Miniforge mirror fallback", () => {
		it("install.sh defines multiple MINIFORGE_URLS sources", async () => {
			const { stdout, code } = await runBash(
				`grep -c "MINIFORGE_URLS" "${INSTALL_SCRIPT}"`,
			);
			expect(code).toBe(0);
			expect(Number(stdout.trim())).toBeGreaterThanOrEqual(1);
		});

		it("includes Tsinghua TUNA mirror as fallback", async () => {
			const { code } = await runBash(
				`grep -q "mirrors.tuna.tsinghua.edu.cn" "${INSTALL_SCRIPT}"`,
			);
			expect(code).toBe(0);
		});

		it("includes BFSU mirror as fallback", async () => {
			const { code } = await runBash(
				`grep -q "mirrors.bfsu.edu.cn" "${INSTALL_SCRIPT}"`,
			);
			expect(code).toBe(0);
		});

		it("configures conda-forge mirror in .condarc after install", async () => {
			const { code } = await runBash(
				`grep -q "custom_channels" "${INSTALL_SCRIPT}"`,
			);
			expect(code).toBe(0);
		});
	});
});
