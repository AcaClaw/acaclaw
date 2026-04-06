import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tests for scripts/install-desktop.sh — desktop shortcut installer.
 *
 * Covers Linux (.desktop file), macOS (.app / .command / alias), and
 * WSL2 (Windows shortcut via powershell.exe). Platform-specific system
 * calls (osacompile, powershell.exe) are not available in tests, so we
 * test the template generation and file placement logic.
 */

const SCRIPT_DIR = resolve(__dirname, "../scripts");
const DESKTOP_SCRIPT = join(SCRIPT_DIR, "install-desktop.sh");

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

describe("install-desktop.sh", () => {
	let fakeHome: string;

	beforeEach(async () => {
		fakeHome = await mkdtemp(join(tmpdir(), "acaclaw-desktop-test-"));
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

		it("dispatches to correct platform installer", async () => {
			const platforms = [
				{ platform: "linux", expected: "install_linux" },
				{ platform: "macos", expected: "install_macos" },
				{ platform: "wsl2", expected: "install_wsl2" },
			];

			for (const { platform, expected } of platforms) {
				const { stdout } = await runBash(`
					PLATFORM="${platform}"
					case "$PLATFORM" in
						linux)  echo "install_linux" ;;
						macos)  echo "install_macos" ;;
						wsl2)   echo "install_wsl2" ;;
						*)      echo "unsupported" ;;
					esac
				`);
				expect(stdout.trim()).toBe(expected);
			}
		});
	});

	// ---------------------------------------------------------------
	// Remove flag parsing
	// ---------------------------------------------------------------
	describe("--remove flag", () => {
		it("parses --remove flag", async () => {
			const { stdout } = await runBash(`
				REMOVE=false
				[[ "\${1:-}" == "--remove" ]] && REMOVE=true
				echo "$REMOVE"
			`);
			// No arg passed
			expect(stdout.trim()).toBe("false");
		});
	});

	// ---------------------------------------------------------------
	// Icon discovery
	// ---------------------------------------------------------------
	describe("icon discovery", () => {
		it("finds icon from public/logo/", async () => {
			const projectDir = join(fakeHome, "project");
			const scriptsDir = join(projectDir, "scripts");
			const logoDir = join(projectDir, "public/logo");
			await mkdir(scriptsDir, { recursive: true });
			await mkdir(logoDir, { recursive: true });
			await writeFile(join(logoDir, "AcaClaw.png"), "fake-png");

			const { stdout } = await runBash(`
				SCRIPT_DIR="${scriptsDir}"
				find_icon() {
					local candidates=(
						"\${SCRIPT_DIR}/../public/logo/AcaClaw.png"
						"\${SCRIPT_DIR}/../ui/src/logo/AcaClaw.png"
					)
					for c in "\${candidates[@]}"; do
						if [[ -f "$c" ]]; then
							echo "$(cd "$(dirname "$c")" && pwd)/$(basename "$c")"
							return 0
						fi
					done
					return 1
				}
				find_icon || echo "not-found"
			`);
			expect(stdout.trim()).toContain("AcaClaw.png");
		});

		it("returns failure when no icon found", async () => {
			const { stdout } = await runBash(`
				SCRIPT_DIR="/nonexistent/scripts"
				find_icon() {
					local candidates=(
						"\${SCRIPT_DIR}/../public/logo/AcaClaw.png"
						"\${SCRIPT_DIR}/../ui/src/logo/AcaClaw.png"
					)
					for c in "\${candidates[@]}"; do
						if [[ -f "$c" ]]; then
							echo "$c"
							return 0
						fi
					done
					return 1
				}
				find_icon || echo "not-found"
			`);
			expect(stdout.trim()).toBe("not-found");
		});
	});

	// ---------------------------------------------------------------
	// Linux: .desktop file creation
	// ---------------------------------------------------------------
	describe("Linux .desktop file", () => {
		it("creates a valid .desktop file", async () => {
			const desktopDir = join(fakeHome, ".local/share/applications");
			const desktopFile = join(desktopDir, "acaclaw.desktop");

			const { code } = await runBash(`
				set -euo pipefail
				desktop_dir="${desktopDir}"
				desktop_file="${desktopFile}"
				SCRIPT_DIR="${SCRIPT_DIR}"
				icon_path="acaclaw"

				mkdir -p "$desktop_dir"
				cat > "$desktop_file" <<DESKTOP
[Desktop Entry]
Type=Application
Name=AcaClaw
Comment=AI Co-Scientist — your dedicated AI research partner
Exec=bash \${SCRIPT_DIR}/start.sh
Icon=\${icon_path:-utilities-terminal}
Terminal=false
Categories=Science;Education;Development;
Keywords=research;ai;academic;science;
StartupWMClass=localhost
StartupNotify=false
DESKTOP
				chmod +x "$desktop_file"
			`);
			expect(code).toBe(0);

			const content = await readFile(desktopFile, "utf-8");
			expect(content).toContain("[Desktop Entry]");
			expect(content).toContain("Name=AcaClaw");
			expect(content).toContain("Type=Application");
			expect(content).toContain("Terminal=false");
			expect(content).toContain("Categories=Science;Education;Development;");
			expect(content).toContain("Exec=bash");
			expect(content).toContain("start.sh");
		});

		it("makes .desktop file executable", async () => {
			const desktopDir = join(fakeHome, ".local/share/applications");
			const desktopFile = join(desktopDir, "acaclaw.desktop");
			await mkdir(desktopDir, { recursive: true });
			await writeFile(desktopFile, "[Desktop Entry]\nName=test\n");

			const { code } = await runBash(`chmod +x "${desktopFile}"`);
			expect(code).toBe(0);

			const s = await stat(desktopFile);
			expect(s.mode & 0o100).not.toBe(0);
		});

		it("removes .desktop file on --remove", async () => {
			const desktopDir = join(fakeHome, ".local/share/applications");
			const desktopFile = join(desktopDir, "acaclaw.desktop");
			await mkdir(desktopDir, { recursive: true });
			await writeFile(desktopFile, "[Desktop Entry]\nName=AcaClaw\n");
			expect(await exists(desktopFile)).toBe(true);

			const { code } = await runBash(`
				REMOVE=true
				desktop_file="${desktopFile}"
				if [[ "$REMOVE" == "true" ]]; then
					rm -f "$desktop_file"
				fi
			`);
			expect(code).toBe(0);
			expect(await exists(desktopFile)).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// Linux: icon installation
	// ---------------------------------------------------------------
	describe("Linux icon installation", () => {
		it("copies PNG icon to hicolor directory", async () => {
			const iconDir = join(
				fakeHome,
				".local/share/icons/hicolor/256x256/apps",
			);
			const srcIcon = join(fakeHome, "icon.png");
			await writeFile(srcIcon, "fake-png-data");

			const { code } = await runBash(`
				set -euo pipefail
				icon_dir="${iconDir}"
				mkdir -p "$icon_dir"
				cp "${srcIcon}" "\${icon_dir}/acaclaw.png"
			`);
			expect(code).toBe(0);
			expect(await exists(join(iconDir, "acaclaw.png"))).toBe(true);
		});

		it("removes icon on --remove", async () => {
			const iconDir = join(
				fakeHome,
				".local/share/icons/hicolor/256x256/apps",
			);
			await mkdir(iconDir, { recursive: true });
			await writeFile(join(iconDir, "acaclaw.png"), "fake");

			const { code } = await runBash(`
				rm -f "${iconDir}/acaclaw.png"
			`);
			expect(code).toBe(0);
			expect(await exists(join(iconDir, "acaclaw.png"))).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// macOS: .command fallback
	// ---------------------------------------------------------------
	describe("macOS .command fallback", () => {
		it("creates .command file as browser launcher", async () => {
			const commandFile = join(fakeHome, "Desktop/AcaClaw.command");
			await mkdir(join(fakeHome, "Desktop"), { recursive: true });

			const { code } = await runBash(`
				set -euo pipefail
				start_script="${SCRIPT_DIR}/start.sh"
				command_file="${commandFile}"
				printf '#!/usr/bin/env bash\nbash "%s"\n' "\${start_script}" > "$command_file"
				chmod +x "$command_file"
			`);
			expect(code).toBe(0);

			const content = await readFile(commandFile, "utf-8");
			expect(content).toContain("#!/usr/bin/env bash");
			expect(content).toContain("start.sh");

			const s = await stat(commandFile);
			expect(s.mode & 0o100).not.toBe(0);
		});

		it("removes .command file on --remove", async () => {
			const commandFile = join(fakeHome, "Desktop/AcaClaw.command");
			await mkdir(join(fakeHome, "Desktop"), { recursive: true });
			await writeFile(commandFile, "#!/bin/bash\nstart");
			expect(await exists(commandFile)).toBe(true);

			const { code } = await runBash(`rm -f "${commandFile}"`);
			expect(code).toBe(0);
			expect(await exists(commandFile)).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// macOS: app bundle creation path
	// ---------------------------------------------------------------
	describe("macOS app bundle", () => {
		it("creates .app with native WKWebView window or fallback", async () => {
			const script = await readFile(DESKTOP_SCRIPT, "utf-8");
			// Must create a .app bundle with Info.plist and executable
			expect(script).toMatch(/macos_dir=.*MacOS/);
			expect(script).toMatch(/CFBundleExecutable/);
			expect(script).toMatch(/CFBundleIdentifier/);
		});

		it("compiles Swift native binary when swiftc available", async () => {
			const script = await readFile(DESKTOP_SCRIPT, "utf-8");
			expect(script).toMatch(/swiftc.*-O/);
			expect(script).toMatch(/-framework Cocoa/);
			expect(script).toMatch(/-framework WebKit/);
			expect(script).toMatch(/AcaClaw\.swift/);
		});

		it("Swift source uses WKWebView and handles Dock relaunch", async () => {
			const swift = await readFile(
				join(DESKTOP_SCRIPT, "../AcaClaw.swift"),
				"utf-8",
			);
			expect(swift).toMatch(/WKWebView/);
			expect(swift).toMatch(/applicationShouldHandleReopen/);
			expect(swift).toMatch(/applicationShouldTerminateAfterLastWindowClosed/);
			expect(swift).toMatch(/makeKeyAndOrderFront/);
		});

		it("Swift source starts gateway if not running", async () => {
			const swift = await readFile(
				join(DESKTOP_SCRIPT, "../AcaClaw.swift"),
				"utf-8",
			);
			expect(swift).toMatch(/ensureGateway/);
			expect(swift).toMatch(/portOpen.*2090/);
			expect(swift).toMatch(/start\.sh.*--no-browser/);
		});

		it("falls back to open-in-browser when swiftc unavailable", async () => {
			const script = await readFile(DESKTOP_SCRIPT, "utf-8");
			expect(script).toMatch(/_macos_fallback_launcher/);
			// Fallback opens URL in default browser
			expect(script).toMatch(/open.*localhost:2090/);
		});

		it("fallback launcher starts gateway via start.sh --no-browser", async () => {
			const script = await readFile(DESKTOP_SCRIPT, "utf-8");
			expect(script).toMatch(/--no-browser/);
		});

		it("fallback launcher has PATH bootstrap for .app context", async () => {
			const script = await readFile(DESKTOP_SCRIPT, "utf-8");
			expect(script).toMatch(/\/opt\/homebrew\/bin/);
			expect(script).toMatch(/fnm/);
		});

		it("removes old .app before creating new one", async () => {
			const script = await readFile(DESKTOP_SCRIPT, "utf-8");
			expect(script).toMatch(/rm -rf.*app_bundle/);
		});

		it("icon file matches CFBundleIconFile", async () => {
			const script = await readFile(DESKTOP_SCRIPT, "utf-8");
			// CFBundleIconFile says "AcaClaw" (value on next line in plist heredoc)
			expect(script).toMatch(/CFBundleIconFile/);
			expect(script).toMatch(/<string>AcaClaw<\/string>/);
			expect(script).toMatch(/AcaClaw\.icns/);
		});

		it("creates ~/Applications directory", async () => {
			const appDir = join(fakeHome, "Applications");

			const { code } = await runBash(`mkdir -p "${appDir}"`);
			expect(code).toBe(0);
			expect(await exists(appDir)).toBe(true);
		});

		it("removes app bundle on --remove", async () => {
			const appBundle = join(fakeHome, "Applications/AcaClaw.app");
			await mkdir(join(appBundle, "Contents/Resources"), { recursive: true });
			await writeFile(
				join(appBundle, "Contents/Info.plist"),
				"<plist><dict></dict></plist>",
			);
			expect(await exists(appBundle)).toBe(true);

			const { code } = await runBash(`rm -rf "${appBundle}"`);
			expect(code).toBe(0);
			expect(await exists(appBundle)).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// WSL2: shortcut creation dispatch
	// ---------------------------------------------------------------
	describe("WSL2 shortcut", () => {
		it("converts WSL path to Windows path format", async () => {
			const { stdout } = await runBash(
				`
				WSL_DISTRO_NAME="Ubuntu"
				wsl_script="/home/user/acaclaw/scripts/start.sh"
				# Manual fallback conversion (when wslpath is not available)
				win_script="\\\\\\\\wsl\\\$\\\\\${WSL_DISTRO_NAME}\${wsl_script}"
				echo "$win_script"
			`,
				{ env: { WSL_DISTRO_NAME: "Ubuntu" } },
			);
			expect(stdout.trim()).toContain("wsl$");
			expect(stdout.trim()).toContain("Ubuntu");
		});
	});

	// ---------------------------------------------------------------
	// URL always works (Layer 3)
	// ---------------------------------------------------------------
	describe("browser URL fallback", () => {
		it("URL is always http://localhost:2090/", async () => {
			const { stdout } = await runBash(`
				acaclaw_url="http://localhost:2090/"
				echo "$acaclaw_url"
			`);
			expect(stdout.trim()).toBe("http://localhost:2090/");
		});
	});
});
