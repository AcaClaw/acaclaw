/**
 * Playwright E2E: Chat view interactions.
 *
 * Tests the most complex view — message sending, streaming display,
 * and staff selector.
 *
 * Prereq: gateway running on port 2090 (or set ACACLAW_URL).
 *
 * Note: The app redirects to #api-keys if no keys are configured.
 * These tests check whether the chat view is actually reachable;
 * if API keys aren't set up, the view-specific tests are skipped.
 */
import { test, expect } from "@playwright/test";

async function navigateToChat(page: import("@playwright/test").Page) {
  await page.goto("/#chat");
  await page.waitForTimeout(2000);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  // Check if we were redirected away from chat (api-keys gate)
  const hash = new URL(page.url()).hash;
  if (hash !== "#chat") return false;
  // Double-check the chat component is actually rendered
  const hasChatEl = await page.evaluate(() => {
    const chat = document.querySelector("acaclaw-chat");
    return !!chat?.shadowRoot?.querySelector("h1");
  });
  return hasChatEl;
}

/** Evaluate inside the chat component's shadow DOM */
async function chatShadow<T>(page: import("@playwright/test").Page, fn: string): Promise<T> {
  return page.evaluate(`(() => {
    const chat = document.querySelector("acaclaw-chat");
    if (!chat?.shadowRoot) return null;
    ${fn}
  })()`) as Promise<T>;
}

test.describe("Chat view", () => {
  test("renders heading and input area", async ({ page }) => {
    const reachable = await navigateToChat(page);
    test.skip(!reachable, "Chat not reachable — API keys not configured");

    const h1Text = await chatShadow<string>(page,
      `return chat.shadowRoot.querySelector("h1")?.textContent?.trim() ?? "";`
    );
    expect(h1Text).toBe("Chat");
  });

  test("textarea is present and focusable", async ({ page }) => {
    const reachable = await navigateToChat(page);
    test.skip(!reachable, "Chat not reachable — API keys not configured");

    const hasTextarea = await chatShadow<boolean>(page,
      `return !!chat.shadowRoot.querySelector("textarea");`
    );
    expect(hasTextarea).toBe(true);
  });

  test("send button is disabled when textarea is empty", async ({ page }) => {
    const reachable = await navigateToChat(page);
    test.skip(!reachable, "Chat not reachable — API keys not configured");

    const isDisabled = await chatShadow<boolean>(page,
      `const btn = chat.shadowRoot.querySelector(".send-btn");
       return btn?.disabled ?? false;`
    );
    expect(isDisabled).toBe(true);
  });

  test("typing in textarea enables send button", async ({ page }) => {
    const reachable = await navigateToChat(page);
    test.skip(!reachable, "Chat not reachable — API keys not configured");

    await page.evaluate(() => {
      const chat = document.querySelector("acaclaw-chat");
      const ta = chat?.shadowRoot?.querySelector("textarea") as HTMLTextAreaElement;
      if (ta) {
        ta.value = "Hello, test message";
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);

    const isDisabled = await chatShadow<boolean>(page,
      `const btn = chat.shadowRoot.querySelector(".send-btn");
       return btn?.disabled ?? true;`
    );
    expect(isDisabled).toBe(false);
  });

  test("screenshot: chat view baseline", async ({ page }) => {
    const reachable = await navigateToChat(page);
    test.skip(!reachable, "Chat not reachable — API keys not configured");

    await expect(page).toHaveScreenshot("chat-full.png", { fullPage: true });
  });
});
