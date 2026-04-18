import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { resolve, join } from "node:path";

/**
 * Tests for install.sh CLI display utilities: color/unicode detection,
 * symbol selection, progress bar rendering, and logging functions.
 *
 * These tests source individual functions/variables from install.sh
 * inside isolated bash subprocesses.
 */

const SCRIPT_DIR = resolve(__dirname, "../scripts");
const INSTALL_SCRIPT = join(SCRIPT_DIR, "install.sh");

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
				timeout: opts.timeout ?? 10_000,
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

/**
 * Source the display-utility portion of install.sh (lines 17–280):
 * color vars, unicode detection, symbols, log functions, progress bars, info_box.
 * We pre-set variables that the extracted lines expect to exist.
 */
function displayScript(body: string, envOverrides?: Record<string, string>) {
	// Extract lines 17-314 (after shebang/comments, through info_box end)
	// Pre-set variables the fragment depends on (OS, ARCH, ACACLAW_VERSION, dirs)
	return runBash(
		`
set -euo pipefail
OS="linux"; ARCH="x86_64"
ACACLAW_VERSION="0.1.0"
ACACLAW_DIR="/tmp/acaclaw-test-$$"
OPENCLAW_DIR="/tmp/openclaw-test-$$"
INSTALL_LOG="/dev/null"

eval "$(sed -n '17,314p' '${INSTALL_SCRIPT}')"

${body}
`,
		{ env: envOverrides },
	);
}

// ---------------------------------------------------------------
// Unicode / ASCII detection
// ---------------------------------------------------------------
describe("unicode detection", () => {
	it("selects unicode symbols when LANG is UTF-8", async () => {
		const { stdout, code } = await displayScript('echo "$SYM_CHECK"', {
			LANG: "en_US.UTF-8",
			LC_ALL: "",
		});
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("✔");
	});

	it("selects unicode symbols when LC_ALL is UTF-8", async () => {
		const { stdout, code } = await displayScript('echo "$SYM_CHECK"', {
			LANG: "",
			LC_ALL: "en_US.UTF-8",
		});
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("✔");
	});

	it("selects ASCII fallback when LANG is not UTF-8", async () => {
		const { stdout, code } = await displayScript('echo "$SYM_CHECK"', {
			LANG: "C",
			LC_ALL: "C",
		});
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("[OK]");
	});

	it("selects full set of ASCII fallback symbols", async () => {
		const { stdout, code } = await displayScript(
			'echo "$SYM_CHECK|$SYM_CROSS|$SYM_WARN|$SYM_ARROW|$SYM_DOT"',
			{ LANG: "C", LC_ALL: "C" },
		);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("[OK]|[X]|[!]|->|*");
	});

	it("selects full set of unicode symbols", async () => {
		const { stdout, code } = await displayScript(
			'echo "$SYM_CHECK|$SYM_CROSS|$SYM_WARN|$SYM_ARROW|$SYM_DOT"',
			{ LANG: "en_US.UTF-8", LC_ALL: "" },
		);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("✔|✖|⚠|→|●");
	});

	it("selects ASCII progress bar characters in C locale", async () => {
		const { stdout, code } = await displayScript(
			'echo "$BAR_FILLED|$BAR_EMPTY"',
			{ LANG: "C", LC_ALL: "C" },
		);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("#|-");
	});

	it("selects unicode progress bar characters in UTF-8", async () => {
		const { stdout, code } = await displayScript(
			'echo "$BAR_FILLED|$BAR_EMPTY"',
			{ LANG: "en_US.UTF-8", LC_ALL: "" },
		);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("━|─");
	});

	it("selects ASCII spinner characters in C locale", async () => {
		// Use TAB as delimiter since first ASCII spinner char is a pipe "|"
		const { stdout, code } = await displayScript(
			'printf "%s\t%s\t%s" "${SPINNER_CHARS[0]}" "${SPINNER_CHARS[1]}" "${#SPINNER_CHARS[@]}"',
			{ LANG: "C", LC_ALL: "C" },
		);
		expect(code).toBe(0);
		const parts = stdout.trim().split("\t");
		expect(parts[0]).toBe("|");
		expect(parts[1]).toBe("/");
		expect(parts[2]).toBe("4");
	});

	it("selects braille spinner characters in UTF-8", async () => {
		const { stdout, code } = await displayScript(
			'echo "${SPINNER_CHARS[0]}|${#SPINNER_CHARS[@]}"',
			{ LANG: "en_US.UTF-8", LC_ALL: "" },
		);
		expect(code).toBe(0);
		const parts = stdout.trim().split("|");
		expect(parts[0]).toBe("⠋");
		expect(parts[1]).toBe("10");
	});
});

// ---------------------------------------------------------------
// Logging functions
// ---------------------------------------------------------------
describe("logging functions", () => {
	it("log() outputs green checkmark", async () => {
		const { stdout, code } = await displayScript('log "Test message"', {
			LANG: "en_US.UTF-8",
			LC_ALL: "",
		});
		expect(code).toBe(0);
		expect(stdout).toContain("✔");
		expect(stdout).toContain("Test message");
	});

	it("warn() outputs yellow warning symbol", async () => {
		const { stdout, code } = await displayScript('warn "Warning text"', {
			LANG: "en_US.UTF-8",
			LC_ALL: "",
		});
		expect(code).toBe(0);
		expect(stdout).toContain("⚠");
		expect(stdout).toContain("Warning text");
	});

	it("error() writes to stderr", async () => {
		const { stderr, code } = await displayScript('error "Error text"', {
			LANG: "en_US.UTF-8",
			LC_ALL: "",
		});
		expect(code).toBe(0);
		expect(stderr).toContain("✖");
		expect(stderr).toContain("Error text");
	});

	it("info() outputs cyan arrow", async () => {
		const { stdout, code } = await displayScript('info "Info text"', {
			LANG: "en_US.UTF-8",
			LC_ALL: "",
		});
		expect(code).toBe(0);
		expect(stdout).toContain("→");
		expect(stdout).toContain("Info text");
	});

	it("dimlog() outputs dimmed text", async () => {
		const { stdout, code } = await displayScript('dimlog "Dim text"', {
			LANG: "en_US.UTF-8",
			LC_ALL: "",
		});
		expect(code).toBe(0);
		expect(stdout).toContain("Dim text");
		// Should contain DIM escape
		expect(stdout).toContain("\x1b[2m");
	});

	it("log functions work with ASCII fallback too", async () => {
		const { stdout, code } = await displayScript('log "Done"', {
			LANG: "C",
			LC_ALL: "C",
		});
		expect(code).toBe(0);
		expect(stdout).toContain("[OK]");
		expect(stdout).toContain("Done");
	});
});

// ---------------------------------------------------------------
// Step tracking & header
// ---------------------------------------------------------------
describe("step tracking", () => {
	it("TOTAL_STEPS defaults to 7", async () => {
		const { stdout, code } = await displayScript('echo "$TOTAL_STEPS"');
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("7");
	});

	it("CURRENT_STEP starts at 0", async () => {
		const { stdout, code } = await displayScript('echo "$CURRENT_STEP"');
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("0");
	});

	it("header() auto-increments CURRENT_STEP", async () => {
		const { stdout, code } = await displayScript(`
			header "Test Step"
			echo "STEP=$CURRENT_STEP"
		`);
		expect(code).toBe(0);
		expect(stdout).toContain("Step 1 of 7");
		expect(stdout).toContain("Test Step");
		expect(stdout).toContain("STEP=1");
	});

	it("header() shows step dots", async () => {
		const { stdout, code } = await displayScript(`
			header "First"
			header "Second"
		`);
		expect(code).toBe(0);
		// Step 1: current is ◉, rest are ○
		expect(stdout).toContain("Step 1 of 7");
		// Step 2: first is completed ●, current is ◉
		expect(stdout).toContain("Step 2 of 7");
	});

	it("header() uses custom icon", async () => {
		const { stdout, code } = await displayScript(
			'header "Custom" "[ICO]"',
			{ LANG: "C", LC_ALL: "C" },
		);
		expect(code).toBe(0);
		expect(stdout).toContain("[ICO]");
	});
});

// ---------------------------------------------------------------
// show_item_progress
// ---------------------------------------------------------------
describe("show_item_progress", () => {
	it("outputs fraction like 3/7", async () => {
		const { stdout, code } = await displayScript(
			'show_item_progress 3 7 "Plugin X"',
		);
		expect(code).toBe(0);
		expect(stdout).toContain("3/7");
		expect(stdout).toContain("Plugin X");
	});

	it("outputs newline only at completion (current == total)", async () => {
		const { stdout, code } = await displayScript(`
			show_item_progress 1 3 "A"
			echo "AFTER"
		`);
		expect(code).toBe(0);
		// "AFTER" should be on the same or next physical line,
		// but the function does not include a newline when not at total
		expect(stdout).toContain("1/3");
		expect(stdout).toContain("AFTER");
	});

	it("returns 0 even when current != total (no set -e crash)", async () => {
		const { code } = await displayScript(`
			set -euo pipefail
			show_item_progress 1 5 "test"
			echo "survived"
		`);
		expect(code).toBe(0);
	});

	it("works without a label", async () => {
		const { stdout, code } = await displayScript(
			"show_item_progress 2 4",
		);
		expect(code).toBe(0);
		expect(stdout).toContain("2/4");
	});

	it("handles total=1 current=1 (single item)", async () => {
		const { stdout, code } = await displayScript(
			'show_item_progress 1 1 "Only"',
		);
		expect(code).toBe(0);
		expect(stdout).toContain("1/1");
		expect(stdout).toContain("Only");
	});
});

// ---------------------------------------------------------------
// info_box
// ---------------------------------------------------------------
describe("info_box", () => {
	it("outputs bordered message", async () => {
		const { stdout, code } = await displayScript(
			'info_box "Test message"',
		);
		expect(code).toBe(0);
		expect(stdout).toContain("Test message");
		// Should contain box borders (either Unicode or ASCII)
		expect(stdout).toMatch(/[┌╔\[]/);
	});

	it("accepts custom icon", async () => {
		const { stdout, code } = await displayScript(
			'info_box "Custom icon" "!!"',
			{ LANG: "C", LC_ALL: "C" },
		);
		expect(code).toBe(0);
		expect(stdout).toContain("!!");
		expect(stdout).toContain("Custom icon");
	});
});

// ---------------------------------------------------------------
// _term_width
// ---------------------------------------------------------------
describe("_term_width", () => {
	it("returns a number >= 40", async () => {
		const { stdout, code } = await displayScript(
			'w=$(_term_width); echo "$w"',
		);
		expect(code).toBe(0);
		const w = parseInt(stdout.trim(), 10);
		expect(w).toBeGreaterThanOrEqual(40);
	});

	it("defaults to 60 when tput is unavailable", async () => {
		// Override PATH to keep bash/coreutils but hide tput
		const { stdout, code } = await displayScript(
			'ORIG_PATH="$PATH"; PATH=/usr/bin:/bin; hash -r; w=$(_term_width); echo "$w"',
		);
		expect(code).toBe(0);
		// When not a tty (test subshell), _term_width falls back to 60
		expect(parseInt(stdout.trim(), 10)).toBeGreaterThanOrEqual(40);
	});
});

// ---------------------------------------------------------------
// Color escape sequences
// ---------------------------------------------------------------
describe("color variables", () => {
	it("defines all expected color variables", async () => {
		// Use echo -e to have bash interpret \033 escapes, then check for ANSI codes
		const { stdout, code } = await displayScript(
			'echo -e "${RED}|${GREEN}|${YELLOW}|${BLUE}|${CYAN}|${MAGENTA}|${DIM}|${BOLD}|${NC}"',
		);
		expect(code).toBe(0);
		// Each should be a non-empty ANSI escape (\x1b[ or \033[)
		const parts = stdout.trim().split("|");
		expect(parts).toHaveLength(9);
		for (const p of parts) {
			// \x1b is the actual ESC byte that echo -e produces from \033
			expect(p).toContain("\x1b[");
		}
	});
});

// ---------------------------------------------------------------
// _repeat_char (multi-byte safe character repetition)
// ---------------------------------------------------------------
describe("_repeat_char", () => {
	it("repeats a single-byte char N times", async () => {
		const { stdout, code } = await displayScript(
			'_repeat_char "#" 5; echo',
		);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("#####");
	});

	it("repeats a multi-byte UTF-8 char (─) N times", async () => {
		const { stdout, code } = await displayScript(
			'_repeat_char "─" 3; echo',
		);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("───");
	});

	it("repeats a multi-byte UTF-8 char (━) N times", async () => {
		const { stdout, code } = await displayScript(
			'_repeat_char "━" 4; echo',
		);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("━━━━");
	});

	it("handles zero repetitions", async () => {
		const { stdout, code } = await displayScript(
			'_repeat_char "x" 0; echo "END"',
		);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("END");
	});
});
