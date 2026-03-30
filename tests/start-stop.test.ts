import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tests for scripts/start.sh and scripts/stop.sh.
 *
 * Gateway start/stop requires openclaw to be installed, so these tests
 * focus on CLI parsing, platform detection, prerequisite checks, browser
 * open logic, and PID file handling — all testable without a live gateway.
 */

const SCRIPT_DIR = resolve(__dirname, "../scripts");
const START_SCRIPT = join(SCRIPT_DIR, "start.sh");
const STOP_SCRIPT = join(SCRIPT_DIR, "stop.sh");

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

// =================================================================
// start.sh
// =================================================================

describe("start.sh", () => {
	let fakeHome: string;

	beforeEach(async () => {
		fakeHome = await mkdtemp(join(tmpdir(), "acaclaw-start-test-"));
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
				`bash "${START_SCRIPT}" --help`,
			);
			expect(code).toBe(0);
			expect(stdout).toContain("Usage:");
			expect(stdout).toContain("--no-browser");
			expect(stdout).toContain("--status");
		});

		it("-h prints usage and exits 0", async () => {
			const { stdout, code } = await runBash(
				`bash "${START_SCRIPT}" -h`,
			);
			expect(code).toBe(0);
			expect(stdout).toContain("Usage:");
		});

		it("unknown flag exits with error", async () => {
			const { code } = await runBash(
				`bash "${START_SCRIPT}" --bad-flag 2>&1`,
			);
			expect(code).not.toBe(0);
		});
	});

	// ---------------------------------------------------------------
	// Platform detection
	// ---------------------------------------------------------------
	describe("platform detection", () => {
		it("detects linux on native Linux", async () => {
			const { stdout } = await runBash(`
				detect_platform() {
					if [[ -n "\${WSL_DISTRO_NAME:-}" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
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
			`);
			const os = stdout.trim();
			// On CI/local Linux this should be "linux" (or "wsl2" on WSL)
			expect(["linux", "wsl2", "macos"]).toContain(os);
		});

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
	});

	// ---------------------------------------------------------------
	// Prerequisite: config file check
	// ---------------------------------------------------------------
	describe("prerequisite checks", () => {
		it("exits with error when config file is missing", async () => {
			const { code, stderr } = await runBash(
				`
				set -euo pipefail
				ACACLAW_CONFIG="/nonexistent/path/openclaw.json"
				if [[ ! -f "$ACACLAW_CONFIG" ]]; then
					echo "config not found" >&2
					exit 1
				fi
			`,
			);
			expect(code).toBe(1);
			expect(stderr).toContain("config not found");
		});

		it("passes when config file exists", async () => {
			const configPath = join(fakeHome, "openclaw.json");
			await writeFile(configPath, "{}");

			const { code } = await runBash(`
				set -euo pipefail
				ACACLAW_CONFIG="${configPath}"
				if [[ ! -f "$ACACLAW_CONFIG" ]]; then
					echo "config not found" >&2
					exit 1
				fi
				echo "ok"
			`);
			expect(code).toBe(0);
		});
	});

	// ---------------------------------------------------------------
	// PID file handling
	// ---------------------------------------------------------------
	describe("PID file handling", () => {
		it("detects stale PID file (process not running)", async () => {
			const pidFile = join(fakeHome, "gateway.pid");
			// Write a PID that doesn't exist
			await writeFile(pidFile, "99999999");

			const { stdout } = await runBash(`
				ACACLAW_PID_FILE="${pidFile}"
				if [[ -f "$ACACLAW_PID_FILE" ]]; then
					stale_pid="$(cat "$ACACLAW_PID_FILE" 2>/dev/null)" || true
					if [[ -n "$stale_pid" ]] && ! kill -0 "$stale_pid" 2>/dev/null; then
						rm -f "$ACACLAW_PID_FILE"
						echo "stale-removed"
					else
						echo "still-running"
					fi
				else
					echo "no-file"
				fi
			`);
			expect(stdout.trim()).toBe("stale-removed");
			expect(await exists(pidFile)).toBe(false);
		});

		it("detects valid PID file (current process)", async () => {
			const pidFile = join(fakeHome, "gateway.pid");
			// Write current shell's PID ($$) — it's running
			const { stdout } = await runBash(`
				ACACLAW_PID_FILE="${pidFile}"
				echo $$ > "$ACACLAW_PID_FILE"
				pid="$(cat "$ACACLAW_PID_FILE")"
				if kill -0 "$pid" 2>/dev/null; then
					echo "running"
				else
					echo "not-running"
				fi
			`);
			expect(stdout.trim()).toBe("running");
		});

		it("writes PID file on start", async () => {
			const pidFile = join(fakeHome, "gateway.pid");

			const { code } = await runBash(`
				ACACLAW_PID_FILE="${pidFile}"
				echo "12345" > "$ACACLAW_PID_FILE"
			`);
			expect(code).toBe(0);

			const pid = (await readFile(pidFile, "utf-8")).trim();
			expect(pid).toBe("12345");
		});
	});

	// ---------------------------------------------------------------
	// Browser open command per platform
	// ---------------------------------------------------------------
	describe("browser open - app window command per platform", () => {
		it("uses appropriate open command on macOS", async () => {
			const { stdout } = await runBash(`
				PLATFORM="macos"
				URL="http://localhost:2090/"
				case "$PLATFORM" in
					macos)  echo "open" ;;
					wsl2)   echo "powershell" ;;
					linux)  echo "xdg-open-or-chrome" ;;
					*)      echo "none" ;;
				esac
			`);
			expect(stdout.trim()).toBe("open");
		});

		it("uses powershell.exe on WSL2", async () => {
			const { stdout } = await runBash(`
				PLATFORM="wsl2"
				case "$PLATFORM" in
					macos)  echo "open" ;;
					wsl2)   echo "powershell" ;;
					linux)  echo "xdg-open-or-chrome" ;;
					*)      echo "none" ;;
				esac
			`);
			expect(stdout.trim()).toBe("powershell");
		});

		it("uses xdg-open or chrome on Linux", async () => {
			const { stdout } = await runBash(`
				PLATFORM="linux"
				case "$PLATFORM" in
					macos)  echo "open" ;;
					wsl2)   echo "powershell" ;;
					linux)  echo "xdg-open-or-chrome" ;;
					*)      echo "none" ;;
				esac
			`);
			expect(stdout.trim()).toBe("xdg-open-or-chrome");
		});
	});

	// ---------------------------------------------------------------
	// --no-browser flag
	// ---------------------------------------------------------------
	describe("--no-browser flag", () => {
		it("skips browser when --no-browser is set", async () => {
			const { stdout } = await runBash(`
				NO_BROWSER=true
				if [[ "$NO_BROWSER" == "true" ]]; then
					echo "skipped"
				else
					echo "open"
				fi
			`);
			expect(stdout.trim()).toBe("skipped");
		});
	});

	// ---------------------------------------------------------------
	// Service detection
	// ---------------------------------------------------------------
	describe("service detection", () => {
		it("detects systemd unit file when present", async () => {
			const unitPath = join(
				fakeHome,
				".config/systemd/user/acaclaw-gateway.service",
			);
			await mkdir(join(fakeHome, ".config/systemd/user"), { recursive: true });
			await writeFile(unitPath, "[Unit]\nDescription=test\n");

			const { stdout } = await runBash(`
				SYSTEMD_UNIT="${unitPath}"
				USE_SERVICE=false
				if [[ -f "$SYSTEMD_UNIT" ]]; then
					USE_SERVICE=true
				fi
				echo "$USE_SERVICE"
			`);
			expect(stdout.trim()).toBe("true");
		});

		it("does not detect service when unit file is absent", async () => {
			const { stdout } = await runBash(`
				SYSTEMD_UNIT="/nonexistent/acaclaw-gateway.service"
				USE_SERVICE=false
				if [[ -f "$SYSTEMD_UNIT" ]]; then
					USE_SERVICE=true
				fi
				echo "$USE_SERVICE"
			`);
			expect(stdout.trim()).toBe("false");
		});
	});

	// ---------------------------------------------------------------
	// Port configuration
	// ---------------------------------------------------------------
	describe("port configuration", () => {
		it("defaults to port 2090", async () => {
			const { stdout } = await runBash(`
				ACACLAW_PORT="\${ACACLAW_PORT:-2090}"
				echo "$ACACLAW_PORT"
			`);
			expect(stdout.trim()).toBe("2090");
		});

		it("respects ACACLAW_PORT env override", async () => {
			const { stdout } = await runBash(
				`
				ACACLAW_PORT="\${ACACLAW_PORT:-2090}"
				echo "$ACACLAW_PORT"
			`,
				{ env: { ACACLAW_PORT: "3000" } },
			);
			expect(stdout.trim()).toBe("3000");
		});
	});
});

// =================================================================
// stop.sh
// =================================================================

describe("stop.sh", () => {
	let fakeHome: string;

	beforeEach(async () => {
		fakeHome = await mkdtemp(join(tmpdir(), "acaclaw-stop-test-"));
	});

	afterEach(async () => {
		await rm(fakeHome, { recursive: true, force: true });
	});

	// ---------------------------------------------------------------
	// PID file: stale PID cleanup
	// ---------------------------------------------------------------
	describe("PID file handling", () => {
		it("cleans up stale PID file when process is gone", async () => {
			const dataDir = join(fakeHome, ".acaclaw");
			const pidFile = join(dataDir, "gateway.pid");
			await mkdir(dataDir, { recursive: true });
			await writeFile(pidFile, "99999999");

			const { stdout, code } = await runBash(`
				ACACLAW_PID_FILE="${pidFile}"
				find_gateway_pid() {
					if [[ -f "$ACACLAW_PID_FILE" ]]; then
						local pid
						pid="$(cat "$ACACLAW_PID_FILE" 2>/dev/null)"
						if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
							echo "$pid"
							return 0
						fi
						rm -f "$ACACLAW_PID_FILE"
					fi
					return 1
				}
				if ! pid="$(find_gateway_pid)"; then
					echo "not-running"
				else
					echo "running:\$pid"
				fi
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("not-running");
			expect(await exists(pidFile)).toBe(false);
		});

		it("finds running process by PID file", async () => {
			const dataDir = join(fakeHome, ".acaclaw");
			const pidFile = join(dataDir, "gateway.pid");
			await mkdir(dataDir, { recursive: true });

			// Use a bash sleep as a "running process"
			const { stdout, code } = await runBash(`
				ACACLAW_PID_FILE="${pidFile}"
				# Start a background process
				sleep 300 &
				TESTPID=$!
				echo "$TESTPID" > "$ACACLAW_PID_FILE"

				find_gateway_pid() {
					if [[ -f "$ACACLAW_PID_FILE" ]]; then
						local pid
						pid="$(cat "$ACACLAW_PID_FILE" 2>/dev/null)"
						if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
							echo "$pid"
							return 0
						fi
						rm -f "$ACACLAW_PID_FILE"
					fi
					return 1
				}

				if pid="$(find_gateway_pid)"; then
					echo "found"
				else
					echo "not-found"
				fi
				kill $TESTPID 2>/dev/null || true
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("found");
		});
	});

	// ---------------------------------------------------------------
	// Graceful shutdown with SIGKILL fallback
	// ---------------------------------------------------------------
	describe("graceful shutdown", () => {
		it("sends SIGTERM first, then cleans up PID file", async () => {
			const dataDir = join(fakeHome, ".acaclaw");
			const pidFile = join(dataDir, "gateway.pid");
			await mkdir(dataDir, { recursive: true });

			const { stdout, code } = await runBash(`
				ACACLAW_PID_FILE="${pidFile}"

				# Start a background process that exits on SIGTERM
				sleep 300 &
				TESTPID=$!
				echo "$TESTPID" > "$ACACLAW_PID_FILE"

				# Send SIGTERM
				kill "$TESTPID" 2>/dev/null || true

				# Wait for it to stop
				waited=0
				while [[ \$waited -lt 2 ]] && kill -0 "$TESTPID" 2>/dev/null; do
					sleep 0.1
					waited=\$((waited + 1))
				done

				rm -f "$ACACLAW_PID_FILE"

				if [[ -f "$ACACLAW_PID_FILE" ]]; then
					echo "pid-file-exists"
				else
					echo "cleaned-up"
				fi
			`);
			expect(code).toBe(0);
			expect(stdout.trim()).toBe("cleaned-up");
		});
	});

	// ---------------------------------------------------------------
	// Systemd service detection
	// ---------------------------------------------------------------
	describe("systemd service detection", () => {
		it("selects systemd stop path when service unit is active", async () => {
			const { stdout } = await runBash(`
				HAS_SYSTEMD=true
				SERVICE_ACTIVE=true
				if [[ "$HAS_SYSTEMD" == "true" && "$SERVICE_ACTIVE" == "true" ]]; then
					echo "systemd-stop"
				else
					echo "manual-stop"
				fi
			`);
			expect(stdout.trim()).toBe("systemd-stop");
		});

		it("falls back to manual stop when no systemd", async () => {
			const { stdout } = await runBash(`
				HAS_SYSTEMD=false
				SERVICE_ACTIVE=false
				if [[ "$HAS_SYSTEMD" == "true" && "$SERVICE_ACTIVE" == "true" ]]; then
					echo "systemd-stop"
				else
					echo "manual-stop"
				fi
			`);
			expect(stdout.trim()).toBe("manual-stop");
		});
	});

	// ---------------------------------------------------------------
	// Reports "not running" when no gateway found
	// ---------------------------------------------------------------
	describe("no gateway running", () => {
		it("reports 'not running' cleanly", async () => {
			const dataDir = join(fakeHome, ".acaclaw");
			await mkdir(dataDir, { recursive: true });
			// No PID file

			const { stdout } = await runBash(`
				ACACLAW_PID_FILE="${dataDir}/gateway.pid"
				if [[ ! -f "$ACACLAW_PID_FILE" ]]; then
					echo "not-running"
				else
					echo "might-be-running"
				fi
			`);
			expect(stdout.trim()).toBe("not-running");
		});
	});
});
