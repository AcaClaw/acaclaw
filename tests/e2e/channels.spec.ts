/**
 * Playwright E2E: Channels tab inside the API Config view.
 *
 * Tests navigation to the channels tab, channel dropdown rendering,
 * per-channel card display, and config form presence.
 *
 * Prereq: gateway running on port 2090 (or set ACACLAW_URL).
 *
 * The channels tab lives inside the api-keys view (#api-keys)
 * and is activated by clicking the "Channels" tab.
 *
 * Playwright's built-in locators pierce shadow DOM automatically,
 * so we use `page.locator()` and `page.getByText()` directly.
 */
import { test, expect } from "@playwright/test";

/** Navigate to #api-keys and click the Channels tab. Returns whether channels rendered. */
async function navigateToChannelsTab(page: import("@playwright/test").Page) {
  await page.goto("/#api-keys");
  await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle");

  // Click the Channels tab — Playwright locators pierce shadow DOM
  const channelsTab = page.getByText("Channels", { exact: true });
  if (!(await channelsTab.isVisible())) return false;
  await channelsTab.click();

  // Wait for lazy-loaded acaclaw-channels to render
  await page.waitForTimeout(2500);
  await page.waitForLoadState("networkidle");

  // Check the channels component rendered (select dropdown appears inside it)
  const channelsSelect = page.locator("acaclaw-channels select");
  try {
    await channelsSelect.waitFor({ state: "attached", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

test.describe("Channels tab", () => {
  test("channels tab is clickable and renders component", async ({ page }) => {
    const reachable = await navigateToChannelsTab(page);
    expect(reachable).toBe(true);
  });

  test("has a channel selector dropdown", async ({ page }) => {
    const reachable = await navigateToChannelsTab(page);
    test.skip(!reachable, "Channels tab not reachable");

    const dropdown = page.locator("acaclaw-channels select");
    await expect(dropdown).toBeVisible();
  });

  test("dropdown contains known channel options", async ({ page }) => {
    const reachable = await navigateToChannelsTab(page);
    test.skip(!reachable, "Channels tab not reachable");

    const options = page.locator("acaclaw-channels select option");
    const count = await options.count();
    expect(count).toBeGreaterThan(0);

    // Collect all option values
    const values: string[] = [];
    for (let i = 0; i < count; i++) {
      const val = await options.nth(i).getAttribute("value");
      if (val) values.push(val.toLowerCase());
    }

    // At least one known channel should be present
    const knownChannels = ["whatsapp", "telegram", "discord", "slack", "signal", "nostr", "imessage", "googlechat"];
    const hasKnown = knownChannels.some(ch => values.some(v => v.includes(ch)));
    expect(hasKnown).toBe(true);
  });

  test("auto-selected channel shows a status card", async ({ page }) => {
    const reachable = await navigateToChannelsTab(page);
    test.skip(!reachable, "Channels tab not reachable");

    // The component auto-selects the first enabled channel on load.
    // The card shows the channel name as a heading inside .card-title.
    // Use text matching for status labels — Playwright pierces shadow DOM for getByText.
    const configuredLabel = page.getByText("Configured");
    await expect(configuredLabel.first()).toBeVisible({ timeout: 5000 });
  });

  test("refresh / probe button exists", async ({ page }) => {
    const reachable = await navigateToChannelsTab(page);
    test.skip(!reachable, "Channels tab not reachable");

    const buttons = page.locator("acaclaw-channels button");
    const count = await buttons.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const text = (await buttons.nth(i).textContent())?.toLowerCase() ?? "";
      if (text.includes("refresh") || text.includes("probe") || text.includes("reload")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  test("last-refreshed info is shown after load", async ({ page }) => {
    const reachable = await navigateToChannelsTab(page);
    test.skip(!reachable, "Channels tab not reachable");

    await page.waitForTimeout(1500);

    // "0s ago" is rendered inside the shadow DOM — use getByText which pierces shadow DOM
    const agoText = page.getByText(/\d+s? ago/);
    await expect(agoText.first()).toBeVisible({ timeout: 5000 });
  });

  test("screenshot: channels tab baseline", async ({ page }) => {
    const reachable = await navigateToChannelsTab(page);
    test.skip(!reachable, "Channels tab not reachable");

    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot("channels-tab.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    });
  });
});
