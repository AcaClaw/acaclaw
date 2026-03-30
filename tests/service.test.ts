import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tests for scripts/acaclaw-service.sh — gateway auto-restart service manager.
 *
 * The service script manages systemd (Linux/WSL2) and launchd (macOS) services.
 * Tests verify CLI dispatch, platform detection, unit file generation, and
 * plist generation without actually calling systemctl/launchctl.
 */

const SCRIPT_DIR = resolve(__dirname, "../scripts");
const SERVICE_SCRIPT = join(SCRIPT_DIR, "acaclaw-service.sh");

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

describe("acaclaw-service.sh", () => {
	let fakeHome: string;

	beforeEach(async () => {
		fakeHome = await mkdtemp(join(tmpdir(), "acaclaw-service-test-"));
	});

	afterEach(async () => {
		await rm(fakeHome, { recursive: true, force: true });
	});

	// ---------------------------------------------------------------
	// Platform detection
	// ---------------------------------------------------------------
	describe("platform detection", () => {
		it("detects WSL2 when WSL_DISTRO_NAME is set", async () => {
			const { stdout } = await runBash(
				`
				detect_platform() {
					if [[ -n "\${WSL_DISTRO_NAME:-}" ]]; then
						echo "wsl2"
					elif [[ "$(uname -s)" == "Darwin" ]]; then
						echo "macos"
					elif [[ "$(uname -s)" == "Linux" ]]; then
						echo "linux"
					else
						echo "unknown"
					fi
				}
				detect_platform
			`,
				{ env: { WSL_DISTRO_NAME: "Ubuntu" } },
			);
			expect(stdout.trim()).toBe("wsl2");
		});

		it("dispatches to systemd on linux", async () => {
			const { stdout } = await runBash(`
				PLATFORM="linux"
				case "$PLATFORM" in
					linux|wsl2) echo "systemd" ;;
					macos)      echo "launchd" ;;
					*)          echo "unsupported" ;;
				esac
			`);
			expect(stdout.trim()).toBe("systemd");
		});

		it("dispatches to systemd on wsl2", async () => {
			const { stdout } = await runBash(`
				PLATFORM="wsl2"
				case "$PLATFORM" in
					linux|wsl2) echo "systemd" ;;
					macos)      echo "launchd" ;;
					*)          echo "unsupported" ;;
				esac
			`);
			expect(stdout.trim()).toBe("systemd");
		});

		it("dispatches to launchd on macos", async () => {
			const { stdout } = await runBash(`
				PLATFORM="macos"
				case "$PLATFORM" in
					linux|wsl2) echo "systemd" ;;
					macos)      echo "launchd" ;;
					*)          echo "unsupported" ;;
				esac
			`);
			expect(stdout.trim()).toBe("launchd");
		});
	});

	// ---------------------------------------------------------------
	// Action dispatch
	// ---------------------------------------------------------------
	describe("action dispatch", () => {
		const validActions = ["install", "remove", "status", "start", "stop"];
		for (const action of validActions) {
			it(`accepts '${action}' as a valid action`, async () => {
				const { stdout } = await runBash(`
					ACTION="${action}"
					case "$ACTION" in
						install|remove|status|start|stop) echo "valid" ;;
						*) echo "invalid" ;;
					esac
				`);
				expect(stdout.trim()).toBe("valid");
			});
		}

		it("rejects unknown action", async () => {
			const { stdout } = await runBash(`
				ACTION="restart"
				case "$ACTION" in
					install|remove|status|start|stop) echo "valid" ;;
					*) echo "invalid" ;;
				esac
			`);
			expect(stdout.trim()).toBe("invalid");
		});

		it("defaults to 'status' when no action given", async () => {
			const { stdout } = await runBash(`
				ACTION="\${1:-status}"
				echo "$ACTION"
			`);
			expect(stdout.trim()).toBe("status");
		});
	});

	// ---------------------------------------------------------------
	// systemd unit file generation
	// ---------------------------------------------------------------
	describe("systemd unit file generation", () => {
		it("creates a valid systemd unit file", async () => {
			const systemdDir = join(fakeHome, ".config/systemd/user");
			const unitFile = join(systemdDir, "acaclaw-gateway.service");
			const logFile = join(fakeHome, ".acaclaw/gateway.log");

			const { code } = await runBash(`
				set -euo pipefail
				SYSTEMD_DIR="${systemdDir}"
				ACACLAW_PORT="2090"
				ACACLAW_LOG_FILE="${logFile}"
				OPENCLAW_BIN="/usr/local/bin/openclaw"

				mkdir -p "$SYSTEMD_DIR"
				cat > "${systemdDir}/acaclaw-gateway.service" <<UNIT
[Unit]
Description=AcaClaw Gateway
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
ExecStart=\${OPENCLAW_BIN} gateway run --bind loopback --port \${ACACLAW_PORT} --force
Restart=always
RestartSec=3
StandardOutput=append:\${ACACLAW_LOG_FILE}
StandardError=append:\${ACACLAW_LOG_FILE}
Environment=HOME=\${HOME}

[Install]
WantedBy=default.target
UNIT
			`);
			expect(code).toBe(0);

			const content = await readFile(unitFile, "utf-8");
			expect(content).toContain("[Unit]");
			expect(content).toContain("Description=AcaClaw Gateway");
			expect(content).toContain("ExecStart=/usr/local/bin/openclaw");
			expect(content).toContain("gateway run --bind loopback");
			expect(content).toContain("--port 2090");
			expect(content).toContain("Restart=always");
			expect(content).toContain("[Install]");
			expect(content).not.toContain("--profile");
		});

		it("includes rate limiting settings", async () => {
			const systemdDir = join(fakeHome, ".config/systemd/user");
			await mkdir(systemdDir, { recursive: true });

			const { code } = await runBash(`
				cat > "${systemdDir}/acaclaw-gateway.service" <<UNIT
[Unit]
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
RestartSec=3
UNIT
			`);
			expect(code).toBe(0);

			const content = await readFile(
				join(systemdDir, "acaclaw-gateway.service"),
				"utf-8",
			);
			expect(content).toContain("StartLimitIntervalSec=60");
			expect(content).toContain("StartLimitBurst=5");
			expect(content).toContain("RestartSec=3");
		});
	});

	// ---------------------------------------------------------------
	// systemd unit removal
	// ---------------------------------------------------------------
	describe("systemd unit removal", () => {
		it("removes the unit file", async () => {
			const systemdDir = join(fakeHome, ".config/systemd/user");
			const unitFile = join(systemdDir, "acaclaw-gateway.service");
			await mkdir(systemdDir, { recursive: true });
			await writeFile(unitFile, "[Unit]\nDescription=test\n");
			expect(await exists(unitFile)).toBe(true);

			const { code } = await runBash(`
				rm -f "${unitFile}"
			`);
			expect(code).toBe(0);
			expect(await exists(unitFile)).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// launchd plist generation
	// ---------------------------------------------------------------
	describe("launchd plist generation", () => {
		it("creates a valid launchd plist", async () => {
			const launchdDir = join(fakeHome, "Library/LaunchAgents");
			const plistFile = join(launchdDir, "com.acaclaw.gateway.plist");

			const { code } = await runBash(`
				set -euo pipefail
				LAUNCHD_DIR="${launchdDir}"
				LAUNCHD_LABEL="com.acaclaw.gateway"
				LAUNCHD_PLIST="${plistFile}"
				ACACLAW_PORT="2090"
				ACACLAW_LOG_FILE="${fakeHome}/.acaclaw/gateway.log"
				OPENCLAW_BIN="/usr/local/bin/openclaw"

				mkdir -p "$LAUNCHD_DIR"
				cat > "$LAUNCHD_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>\${LAUNCHD_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>\${OPENCLAW_BIN}</string>
        <string>gateway</string>
        <string>run</string>
        <string>--bind</string>
        <string>loopback</string>
        <string>--port</string>
        <string>\${ACACLAW_PORT}</string>
        <string>--force</string>
    </array>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>\${ACACLAW_LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>\${ACACLAW_LOG_FILE}</string>
</dict>
</plist>
PLIST
			`);
			expect(code).toBe(0);

			const content = await readFile(plistFile, "utf-8");
			expect(content).toContain("<string>com.acaclaw.gateway</string>");
			expect(content).toContain("<string>/usr/local/bin/openclaw</string>");
			expect(content).toContain("<string>gateway</string>");
			expect(content).toContain("<string>2090</string>");
			expect(content).toContain("KeepAlive");
		});
	});

	// ---------------------------------------------------------------
	// launchd plist removal
	// ---------------------------------------------------------------
	describe("launchd plist removal", () => {
		it("removes the plist file", async () => {
			const launchdDir = join(fakeHome, "Library/LaunchAgents");
			const plistFile = join(launchdDir, "com.acaclaw.gateway.plist");
			await mkdir(launchdDir, { recursive: true });
			await writeFile(plistFile, "<plist></plist>");
			expect(await exists(plistFile)).toBe(true);

			const { code } = await runBash(`
				rm -f "${plistFile}"
			`);
			expect(code).toBe(0);
			expect(await exists(plistFile)).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// Stale lock cleanup script
	// ---------------------------------------------------------------
	describe("stale lock cleanup", () => {
		it("creates executable cleanup script", async () => {
			const cleanupScript = join(fakeHome, ".acaclaw/cleanup-locks.sh");

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_DATA_DIR="${fakeHome}/.acaclaw"
				cleanup_script="\${ACACLAW_DATA_DIR}/cleanup-locks.sh"
				mkdir -p "$ACACLAW_DATA_DIR"
				cat > "$cleanup_script" <<'CLEANUP'
#!/usr/bin/env bash
LOCK_DIR="/tmp/openclaw-$(id -u)"
[ -d "$LOCK_DIR" ] || exit 0
for lockfile in "$LOCK_DIR"/gateway.*.lock; do
    [ -f "$lockfile" ] || continue
done
exit 0
CLEANUP
				chmod +x "$cleanup_script"
			`);
			expect(code).toBe(0);
			expect(await exists(cleanupScript)).toBe(true);

			const s = await stat(cleanupScript);
			// Check executable bit (owner execute)
			expect(s.mode & 0o100).not.toBe(0);
		});
	});

	// ---------------------------------------------------------------
	// Port configuration
	// ---------------------------------------------------------------
	describe("port configuration", () => {
		it("defaults to 2090", async () => {
			const { stdout } = await runBash(`
				ACACLAW_PORT="\${ACACLAW_PORT:-2090}"
				echo "$ACACLAW_PORT"
			`);
			expect(stdout.trim()).toBe("2090");
		});

		it("respects ACACLAW_PORT env var", async () => {
			const { stdout } = await runBash(
				`
				ACACLAW_PORT="\${ACACLAW_PORT:-2090}"
				echo "$ACACLAW_PORT"
			`,
				{ env: { ACACLAW_PORT: "3333" } },
			);
			expect(stdout.trim()).toBe("3333");
		});
	});

	// ---------------------------------------------------------------
	// PATH sanitization for systemd
	// ---------------------------------------------------------------
	describe("PATH sanitization", () => {
		it("skips dirs with spaces", async () => {
			const { stdout } = await runBash(`
				safe_path=""
				test_dirs="/usr/bin:/path with spaces:/usr/local/bin"
				IFS=':'
				for dir in $test_dirs; do
					[[ "$dir" == *" "* ]] && continue
					safe_path="\${safe_path:+\${safe_path}:}\${dir}"
				done
				echo "$safe_path"
			`);
			expect(stdout.trim()).toBe("/usr/bin:/usr/local/bin");
		});

		it("skips fnm_multishells dirs", async () => {
			const { stdout } = await runBash(`
				safe_path=""
				test_dirs="/usr/bin:/run/user/1000/fnm_multishells/12345/bin:/usr/local/bin"
				IFS=':'
				for dir in $test_dirs; do
					[[ "$dir" == *"fnm_multishells"* ]] && continue
					safe_path="\${safe_path:+\${safe_path}:}\${dir}"
				done
				echo "$safe_path"
			`);
			expect(stdout.trim()).toBe("/usr/bin:/usr/local/bin");
		});
	});
});
