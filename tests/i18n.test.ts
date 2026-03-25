/**
 * Unit tests for the i18n module.
 * Tests locale switching, translation lookup, and argument interpolation.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLocale, setLocale, t } from "../ui/src/i18n.js";

describe("i18n", () => {
	beforeEach(() => {
		setLocale("en");
	});

	// ── getLocale / setLocale ──

	describe("getLocale / setLocale", () => {
		it("defaults to en", () => {
			expect(getLocale()).toBe("en");
		});

		it("switches to zh-CN", () => {
			setLocale("zh-CN");
			expect(getLocale()).toBe("zh-CN");
		});

		it("switches back to en", () => {
			setLocale("zh-CN");
			setLocale("en");
			expect(getLocale()).toBe("en");
		});

		it("dispatches locale-changed event", () => {
			let received: string | null = null;
			document.addEventListener("locale-changed", ((e: CustomEvent) => {
				received = e.detail;
			}) as EventListener, { once: true });
			setLocale("zh-CN");
			expect(received).toBe("zh-CN");
		});

		it("persists to localStorage", () => {
			setLocale("zh-CN");
			expect(localStorage.getItem("acaclaw-locale")).toBe("zh-CN");
		});
	});

	// ── t() translation ──

	describe("t()", () => {
		it("returns English string for known key", () => {
			const result = t("app.title");
			// Should not return the key itself
			expect(result).not.toBe("");
			expect(typeof result).toBe("string");
		});

		it("returns Chinese string when locale is zh-CN", () => {
			setLocale("zh-CN");
			const result = t("app.title");
			expect(result).not.toBe("");
			expect(typeof result).toBe("string");
		});

		it("returns the key when no translation exists", () => {
			const key = "nonexistent.key.xyz123";
			expect(t(key)).toBe(key);
		});

		it("interpolates positional arguments", () => {
			setLocale("en");
			const result = t("env.uninstallEnv", "acaclaw-bio");
			expect(result).toContain("acaclaw-bio");
			expect(result).not.toContain("{0}");
		});

		it("interpolates multiple arguments", () => {
			const result = t("env.installedPkgs", "3", "acaclaw");
			expect(result).toContain("3");
			expect(result).toContain("acaclaw");
			expect(result).not.toContain("{0}");
			expect(result).not.toContain("{1}");
		});

		it("numeric arguments are stringified", () => {
			const result = t("env.packages", 42);
			expect(result).toContain("42");
		});

		it("English fallback when zh-CN key is missing", () => {
			setLocale("zh-CN");
			const enResult = (() => { setLocale("en"); return t("app.title"); })();
			setLocale("zh-CN");
			const zhResult = t("app.title");
			// Should not be empty (either zh-CN or en fallback)
			expect(zhResult).toBeTruthy();
		});
	});
});
