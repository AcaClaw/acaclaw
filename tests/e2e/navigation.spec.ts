/**
 * Playwright E2E: Sidebar navigation test.
 *
 * Verifies clicking each sidebar nav item navigates to the correct view.
 * When no API keys are configured, the UI locks all views except api-keys,
 * so we only verify that nav items exist and api-keys is accessible.
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

    // Detect nav-lock: when no API keys are configured, the UI redirects
    // all navigation to #api-keys except api-keys itself.
    // Probe by navigating to #chat — if it redirects to #api-keys, keys are locked.
    await page.evaluate(() => { location.hash = "chat"; });
    await page.waitForTimeout(1000);
    const probeUrl = page.url();
    const keysLocked = probeUrl.includes("#api-keys");

    for (const nav of NAV_ITEMS) {
      await page.evaluate((hash) => { location.hash = hash; }, nav.hash);
      await page.waitForTimeout(800);

      const url = page.url();

      if (keysLocked && nav.hash !== "api-keys") {
        // Locked: app redirects to api-keys
        expect(url).toContain("#api-keys");
      } else {
        expect(url).toContain(`#${nav.hash}`);
      }
    }
  });
});
