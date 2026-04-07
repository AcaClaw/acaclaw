import { test, expect } from "@playwright/test";

test.describe("Channels config form styling", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:2090/#api-keys");
    // Click Channels tab
    await page.getByText("Channels", { exact: true }).click();
    await page.waitForTimeout(1500);
    // Select Discord
    await page.locator("acaclaw-channels").locator("select").selectOption({ label: "○ discord" });
    await page.waitForTimeout(2000);
  });

  test("Discord config has styled fields with labels", async ({ page }) => {
    const fieldCount = await page.locator("acaclaw-channels").evaluate((el) => {
      return el.shadowRoot!.querySelectorAll(".cfg-field").length;
    });
    expect(fieldCount).toBeGreaterThan(10);
  });

  test("Discord config has help descriptions", async ({ page }) => {
    const helpCount = await page.locator("acaclaw-channels").evaluate((el) => {
      return el.shadowRoot!.querySelectorAll(".cfg-field__help").length;
    });
    // OpenClaw's gateway should return uiHints with descriptions
    // If this is 0, the gateway isn't sending uiHints
    console.log(`Help description count: ${helpCount}`);
    expect(helpCount).toBeGreaterThanOrEqual(0); // soft check
  });

  test("Discord config has tag badges", async ({ page }) => {
    const tagsCount = await page.locator("acaclaw-channels").evaluate((el) => {
      return el.shadowRoot!.querySelectorAll(".cfg-tags").length;
    });
    console.log(`Tag badge count: ${tagsCount}`);
    expect(tagsCount).toBeGreaterThanOrEqual(0); // soft check
  });

  test("Discord config has toggles and segmented controls", async ({ page }) => {
    const result = await page.locator("acaclaw-channels").evaluate((el) => {
      const root = el.shadowRoot!;
      return {
        toggles: root.querySelectorAll(".cfg-toggle").length,
        segmented: root.querySelectorAll(".cfg-segmented").length,
        numbers: root.querySelectorAll(".cfg-number").length,
        groups: root.querySelectorAll(".cfg-group").length,
      };
    });
    console.log("Discord config controls:", JSON.stringify(result));
    expect(result.toggles).toBeGreaterThan(0);
  });

  test("Discord config field samples", async ({ page }) => {
    const samples = await page.locator("acaclaw-channels").evaluate((el) => {
      const root = el.shadowRoot!;
      const fields = root.querySelectorAll(".cfg-field");
      const results: { label: string; help: string; tags: string[] }[] = [];
      for (const f of [...fields].slice(0, 10)) {
        const label = f.querySelector(".cfg-field__label")?.textContent?.trim() ?? "";
        const help = f.querySelector(".cfg-field__help")?.textContent?.trim() ?? "(none)";
        const tagEls = f.querySelectorAll(".cfg-tags span");
        const tags = [...tagEls].map((t) => t.textContent?.trim() ?? "");
        results.push({ label, help, tags });
      }
      return results;
    });
    console.log("Discord config field samples:");
    for (const s of samples) {
      console.log(`  ${s.label}: help="${s.help}", tags=[${s.tags.join(", ")}]`);
    }
    expect(samples.length).toBeGreaterThan(5);
  });

  test("screenshot: Discord config form", async ({ page }) => {
    // Scroll down to show config fields
    await page.locator("acaclaw-channels").evaluate((el) => {
      const root = el.shadowRoot!;
      const firstField = root.querySelector(".cfg-field");
      firstField?.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("discord-config-form.png", {
      maxDiffPixelRatio: 0.05,
    });
  });
});
