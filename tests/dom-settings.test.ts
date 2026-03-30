/**
 * DOM component tests for SettingsView.
 * Verifies tabs, theme switcher, and uninstall tab rendering.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCall = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
const mockOnNotification = vi.fn(() => vi.fn());

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: mockCall,
    state: "connected" as const,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
    onNotification: mockOnNotification,
  },
}));

const { SettingsView } = await import("../ui/src/views/settings.js");

type SV = InstanceType<typeof SettingsView>;

async function createElement(): Promise<SV> {
  mockCall.mockImplementation(async (method: string) => {
    if (method === "config.get") return { config: { security: {} }, baseHash: "abc" };
    if (method === "ping") return { ts: Date.now() };
    return undefined;
  });
  const el = document.createElement("acaclaw-settings") as SV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: SV) {
  document.body.removeChild(el);
}

function q(el: SV, selector: string) {
  return el.shadowRoot!.querySelector(selector);
}
function qa(el: SV, selector: string) {
  return el.shadowRoot!.querySelectorAll(selector);
}

describe("SettingsView DOM", () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it("renders heading", async () => {
    const el = await createElement();
    expect(q(el, "h1")?.textContent).toBe("Settings");
    cleanup(el);
  });

  it("renders 8 tabs including Debug and Logs", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    expect(tabs.length).toBe(8);
    const labels = Array.from(tabs).map((t) => t.textContent?.trim());
    expect(labels).toContain("Appearance");
    expect(labels).toContain("Security");
    expect(labels).toContain("Connection");
    expect(labels).toContain("Advanced");
    expect(labels).toContain("OpenClaw");
    expect(labels).toContain("Debug");
    expect(labels).toContain("Logs");
    expect(labels).toContain("Uninstall");
    cleanup(el);
  });

  it("starts on appearance tab", async () => {
    const el = await createElement();
    const activeTab = q(el, ".tab.active");
    expect(activeTab?.textContent?.trim()).toBe("Appearance");
    expect(q(el, ".theme-options")).toBeTruthy();
    cleanup(el);
  });

  it("switches to security tab", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const secTab = Array.from(tabs).find((t) => t.textContent?.trim() === "Security");
    (secTab as HTMLElement).click();
    await el.updateComplete;
    expect(secTab?.classList.contains("active")).toBe(true);
    expect(q(el, ".mode-options")).toBeTruthy();
    cleanup(el);
  });

  it("switches to connection tab", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const connTab = Array.from(tabs).find((t) => t.textContent?.trim() === "Connection");
    (connTab as HTMLElement).click();
    await el.updateComplete;
    expect(connTab?.classList.contains("active")).toBe(true);
    expect(q(el, ".status-badge")).toBeTruthy();
    cleanup(el);
  });

  it("switches to uninstall tab and shows warning", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const uninstallTab = Array.from(tabs).find((t) => t.textContent?.trim() === "Uninstall");
    (uninstallTab as HTMLElement).click();
    await el.updateComplete;
    expect(uninstallTab?.classList.contains("active")).toBe(true);
    expect(q(el, ".uninstall-warning")).toBeTruthy();
    cleanup(el);
  });

  it("uninstall tab shows removal list", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const uninstallTab = Array.from(tabs).find((t) => t.textContent?.trim() === "Uninstall");
    (uninstallTab as HTMLElement).click();
    await el.updateComplete;
    const removeItems = qa(el, ".removes-list li");
    expect(removeItems.length).toBe(4);
    cleanup(el);
  });

  it("uninstall tab shows command box with copy button", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const uninstallTab = Array.from(tabs).find((t) => t.textContent?.trim() === "Uninstall");
    (uninstallTab as HTMLElement).click();
    await el.updateComplete;
    const cmdBoxes = qa(el, ".cmd-box");
    expect(cmdBoxes.length).toBe(1);
    const copyBtns = qa(el, ".btn-copy");
    expect(copyBtns.length).toBe(1);
    const codes = qa(el, ".cmd-code");
    expect(codes[0]?.textContent).toContain("uninstall-all.sh");
    cleanup(el);
  });

  it("uninstall tab shows action button", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const uninstallTab = Array.from(tabs).find((t) => t.textContent?.trim() === "Uninstall");
    (uninstallTab as HTMLElement).click();
    await el.updateComplete;
    const dangerBtn = q(el, ".btn-danger");
    expect(dangerBtn?.textContent?.trim()).toBe("Remove everything");
    cleanup(el);
  });

  it("clicking 'Remove everything' shows confirmation mentioning OpenClaw", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const uninstallTab = Array.from(tabs).find((t) => t.textContent?.trim() === "Uninstall");
    (uninstallTab as HTMLElement).click();
    await el.updateComplete;
    const dangerBtn = q(el, ".btn-danger") as HTMLButtonElement;
    dangerBtn.click();
    await el.updateComplete;
    const confirm = q(el, ".uninstall-confirm");
    expect(confirm).toBeTruthy();
    expect(confirm?.textContent).toContain("AcaClaw AND OpenClaw");
    cleanup(el);
  });

  it("cancel button dismisses confirmation", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const uninstallTab = Array.from(tabs).find((t) => t.textContent?.trim() === "Uninstall");
    (uninstallTab as HTMLElement).click();
    await el.updateComplete;
    (q(el, ".btn-danger") as HTMLButtonElement).click();
    await el.updateComplete;
    expect(q(el, ".uninstall-confirm")).toBeTruthy();
    (q(el, ".btn-action") as HTMLButtonElement).click();
    await el.updateComplete;
    expect(q(el, ".uninstall-confirm")).toBeFalsy();
    cleanup(el);
  });

  it("theme buttons include light, dark, system", async () => {
    const el = await createElement();
    const themeBtns = qa(el, ".theme-btn");
    // 2 language buttons (English, 中文) + 3 theme buttons = 5 total
    expect(themeBtns.length).toBe(5);
    const labels = Array.from(themeBtns).map((b) => b.textContent?.trim());
    expect(labels).toEqual(["English", "中文", "Light", "Dark", "System"]);
    cleanup(el);
  });

  it("security tab renders toggle switches", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const secTab = Array.from(tabs).find((t) => t.textContent?.trim() === "Security");
    (secTab as HTMLElement).click();
    await el.updateComplete;
    const toggles = qa(el, ".toggle");
    expect(toggles.length).toBe(3);
    cleanup(el);
  });
});
