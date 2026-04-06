/**
 * Playwright E2E: Screenshot baselines for all AcaClaw views.
 *
 * Captures a screenshot of each view at the current viewport size
 * and compares it against a saved baseline. Fails on visual regression.
 *
 * Prereq: gateway running on port 2090 (or set ACACLAW_URL).
 */
import { test, expect } from "@playwright/test";

const VIEWS = [
  "api-keys",
  "chat",
  "staff",
  "monitor",
  "usage",
  "skills",
  "workspace",
  "environment",
  "backup",
  "settings",
] as const;

test.describe("Screenshot baselines", () => {
  for (const view of VIEWS) {
    test(`${view} view renders`, async ({ page }) => {
      // Navigate directly via hash route
      await page.goto(`/#${view}`);
      // Wait for Lit components to settle
      await page.waitForTimeout(1500);
      // Wait for network to idle (data loads)
      await page.waitForLoadState("networkidle");
      // Extra settle for lazy-loaded views
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot(`${view}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.03,
      });
    });
  }
});
