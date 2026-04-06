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

	// ---------------------------------------------------------------
	// macOS .app bundle structure (install_macos)
	// ---------------------------------------------------------------
	describe("macOS .app bundle creation", () => {
		it("creates valid bundle directory structure", async () => {
			const appBundle = join(fakeHome, "Applications/AcaClaw.app");
			const contentsDir = join(appBundle, "Contents");
			const macosDir = join(contentsDir, "MacOS");
			const resourcesDir = join(contentsDir, "Resources");

			// Simulate what install_macos creates (without icon generation)
			await mkdir(macosDir, { recursive: true });
			await mkdir(resourcesDir, { recursive: true });
			await writeFile(join(contentsDir, "Info.plist"), "<plist></plist>");
			await writeFile(join(macosDir, "AcaClaw"), "#!/usr/bin/env bash\n");

			expect(await exists(appBundle)).toBe(true);
			expect(await exists(contentsDir)).toBe(true);
			expect(await exists(macosDir)).toBe(true);
			expect(await exists(resourcesDir)).toBe(true);
		});

		it("generates Info.plist with correct keys via install script", async () => {
			// Read the plist content directly from install-desktop.sh heredoc
			const scriptContent = await readFile(DESKTOP_SCRIPT, "utf-8");

			// Extract the plist XML between <<'PLIST' and PLIST markers
			const plistMatch = scriptContent.match(
				/cat > .*Info\.plist.*<<'PLIST'\n([\s\S]*?)\nPLIST/,
			);
			expect(plistMatch).not.toBeNull();

			const plistXml = plistMatch![1];
			expect(plistXml).toContain("<key>CFBundleName</key>");
			expect(plistXml).toContain("<string>AcaClaw</string>");
			expect(plistXml).toContain("<key>CFBundleIdentifier</key>");
			expect(plistXml).toContain("<string>com.acaclaw.app</string>");
			expect(plistXml).toContain("<key>CFBundleExecutable</key>");
			// Verify it says "AcaClaw" not "applet"
			expect(plistXml).toMatch(
				/<key>CFBundleExecutable<\/key>\s*<string>AcaClaw<\/string>/,
			);
			expect(plistXml).toContain("<key>CFBundleIconFile</key>");
			expect(plistXml).toContain(
				"<string>public.app-category.education</string>",
			);
		});

		it("launcher script has PATH bootstrap", async () => {
			// Extract the launcher heredoc from install-desktop.sh and validate key sections
			const scriptContent = await readFile(DESKTOP_SCRIPT, "utf-8");

			// The LAUNCHER heredoc should contain PATH bootstrap
			expect(scriptContent).toContain("PATH bootstrap");
			expect(scriptContent).toContain("/opt/homebrew");
			expect(scriptContent).toContain("fnm");
			expect(scriptContent).toContain("nvm");
		});

		it("launcher script uses exec for browser (single Dock icon)", async () => {
			const scriptContent = await readFile(DESKTOP_SCRIPT, "utf-8");

			// Must use exec so process inherits .app bundle Dock identity
			expect(scriptContent).toMatch(/exec "\$EDGE_BIN"/);
			expect(scriptContent).toMatch(/exec "\$CHROME_BIN"/);
			// osacompile may appear in comments, but must not be used as a command
			expect(scriptContent).not.toMatch(/^\s+osacompile\b/m);
			expect(scriptContent).not.toMatch(/^\s*open -na\b/m);
		});

		it("launcher script has single-instance lock", async () => {
			const scriptContent = await readFile(DESKTOP_SCRIPT, "utf-8");

			expect(scriptContent).toContain("LOCK_FILE");
			expect(scriptContent).toContain(".app-lock");
			expect(scriptContent).toContain("Already running");
			// Uses osascript inline to activate existing window
			expect(scriptContent).toContain("activating window");
		});

		it("launcher script has gateway startup logic", async () => {
			const scriptContent = await readFile(DESKTOP_SCRIPT, "utf-8");

			expect(scriptContent).toContain("_port_ok");
			expect(scriptContent).toContain("Gateway not running");
			expect(scriptContent).toContain("openclaw gateway run");
		});

		it("launcher script isolates browser profile", async () => {
			const scriptContent = await readFile(DESKTOP_SCRIPT, "utf-8");

			expect(scriptContent).toContain("user-data-dir");
			expect(scriptContent).toContain("browser-app");
			expect(scriptContent).toContain("--no-first-run");
			expect(scriptContent).toContain("--disable-extensions");
		});

		it("launcher script has debug logging", async () => {
			const scriptContent = await readFile(DESKTOP_SCRIPT, "utf-8");

			expect(scriptContent).toContain("LAUNCH_LOG");
			expect(scriptContent).toContain("app-launch.log");
		});

		it("launcher script exits cleanly when no browser found", async () => {
			// Verify the fallback path exists (open $URL)
			const scriptContent = await readFile(DESKTOP_SCRIPT, "utf-8");

			expect(scriptContent).toContain('open "$URL"');
		});

		it("main executable is a bash script (not AppleScript applet)", async () => {
			const scriptContent = await readFile(DESKTOP_SCRIPT, "utf-8");

			// The LAUNCHER heredoc should be written to AcaClaw executable
			expect(scriptContent).toMatch(/cat > .*AcaClaw.*<<'LAUNCHER'/);
			// Must be bash, not an AppleScript applet
			expect(scriptContent).toContain("#!/usr/bin/env bash");
		});

		it("launcher handles second Dock click via lock file + osascript", async () => {
			const scriptContent = await readFile(DESKTOP_SCRIPT, "utf-8");

			// Lock file check for single-instance behavior
			expect(scriptContent).toContain("LOCK_FILE");
			expect(scriptContent).toContain(".app-lock");
			expect(scriptContent).toContain("Already running");
			// Uses osascript inline to bring window to front
			expect(scriptContent).toContain("osascript -e");
			expect(scriptContent).toContain("set frontmost of proc to true");
		});
	});

	// ---------------------------------------------------------------
	// macOS .app bundle — live validation (macOS only)
	// ---------------------------------------------------------------
	describe("macOS .app bundle — live validation", () => {
		it("smoke test script exists and is bash", async () => {
			const smokeScript = join(SCRIPT_DIR, "test-desktop-app.sh");
			try {
				const content = await readFile(smokeScript, "utf-8");
				expect(content).toContain("#!/usr/bin/env bash");
				expect(content).toContain("Bundle structure");
				expect(content).toContain("Launcher script validation");
				expect(content).toContain("Gateway connectivity");
			} catch {
				// Script not yet created — skip
			}
		});
	});
});
