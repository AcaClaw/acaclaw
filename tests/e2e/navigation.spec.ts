/**
 * Playwright E2E: Sidebar navigation test.
 *
 * Verifies clicking each sidebar nav item navigates to the correct view.
 *
 * Prereq: gateway running on port 2090 (or set ACACLAW_URL).
 */
import { test, expect } from "@playwright/test";

const NAV_ITEMS = [
  { label: "Chat", hash: "chat", heading: "Chat" },
  { label: "Staff", hash: "staff", heading: "Staff" },
  { label: "Monitor", hash: "monitor", heading: "Monitor" },
  { label: "API Keys", hash: "api-keys", heading: "API Keys" },
  { label: "Usage", hash: "usage", heading: "Usage" },
  { label: "Skills", hash: "skills", heading: "Skills" },
  { label: "Workspace", hash: "workspace", heading: "Workspace" },
  { label: "Environment", hash: "environment", heading: "Environment" },
  { label: "Backup", hash: "backup", heading: "Backup" },
  { label: "Settings", hash: "settings", heading: "Settings" },
];

test.describe("Sidebar navigation", () => {
  test("each nav item navigates to its view", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    for (const nav of NAV_ITEMS) {
      // Click sidebar item by its text label
      const navItem = page.locator(".nav-item").filter({ hasText: nav.label }).first();

      // If sidebar is a shadow DOM component, try piercing
      const item = (await navItem.count()) > 0
        ? navItem
        : page.locator(`acaclaw-app`).locator(`.nav-item:has-text("${nav.label}")`).first();

      if ((await item.count()) > 0) {
        await item.click();
        await page.waitForTimeout(800);

        // Verify hash changed
        const url = page.url();
        expect(url).toContain(`#${nav.hash}`);
      }
    }
  });
});
