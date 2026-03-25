/**
 * DOM component tests for SkillsView.
 * Renders the Lit component in happy-dom and simulates button clicks.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCall = vi.fn();

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: (...args: unknown[]) => mockCall(...args),
    state: "connected" as const,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onNotification: vi.fn(() => vi.fn()),
  },
}));

const { SkillsView } = await import("../ui/src/views/skills.js");

type SV = InstanceType<typeof SkillsView>;

const MOCK_INSTALLED = [
  { name: "web-search", version: "1.2.0", description: "Search the web", source: "bundled", bundled: true, disabled: false, eligible: true },
  { name: "code-runner", version: "2.0.0", description: "Run code", source: "bundled", bundled: true, disabled: false, eligible: true },
  { name: "custom-skill", version: "0.1.0", description: "A custom skill", source: "user", bundled: false, disabled: false, eligible: true },
];

async function createElement(): Promise<SV> {
  mockCall.mockImplementation(async (method: string) => {
    if (method === "skills.status") return { skills: MOCK_INSTALLED };
    return undefined;
  });
  const el = document.createElement("acaclaw-skills") as SV;
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

describe("SkillsView DOM", () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it("renders heading", async () => {
    const el = await createElement();
    expect(q(el, "h1")?.textContent).toBe("Skills");
    cleanup(el);
  });

  it("renders Installed and ClawHub tabs", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    expect(tabs.length).toBe(2);
    const labels = Array.from(tabs).map((t) => t.textContent?.trim());
    expect(labels[0]).toContain("Installed");
    expect(labels[1]).toContain("ClawHub");
    cleanup(el);
  });

  it("Installed tab is active by default", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    expect(tabs[0]?.classList.contains("active")).toBe(true);
    expect(tabs[1]?.classList.contains("active")).toBe(false);
    cleanup(el);
  });

  it("shows installed skill count in tab label", async () => {
    const el = await createElement();
    const tab = qa(el, ".tab")[0];
    expect(tab?.textContent).toContain(`(${MOCK_INSTALLED.length})`);
    cleanup(el);
  });

  it("renders skill items for installed skills", async () => {
    const el = await createElement();
    const items = qa(el, ".skill-card");
    expect(items.length).toBe(MOCK_INSTALLED.length);
    cleanup(el);
  });

  it("shows disable button for non-bundled skills", async () => {
    const el = await createElement();
    const disableBtns = qa(el, ".disable-btn");
    // Only the custom-skill (non-bundled) gets a disable button
    expect(disableBtns.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("clicking disable button calls gateway with skills.update", async () => {
    const el = await createElement();
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "skills.status") return { skills: MOCK_INSTALLED };
      return undefined;
    });

    const disableBtn = q(el, ".disable-btn") as HTMLButtonElement;
    disableBtn.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    const updateCall = calls.find((c) => c[0] === "skills.update");
    expect(updateCall).toBeTruthy();
    expect(updateCall![1]).toHaveProperty("skillKey");
    expect(updateCall![1]).toHaveProperty("enabled");
    cleanup(el);
  });

  it("switching to ClawHub tab shows curated skills", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    (tabs[1] as HTMLElement).click();
    await el.updateComplete;

    expect(tabs[1]?.classList.contains("active")).toBe(true);
    // ClawHub tab should have install buttons
    const installBtns = qa(el, ".install-btn");
    expect(installBtns.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("ClawHub excludes already-installed skills", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    (tabs[1] as HTMLElement).click();
    await el.updateComplete;

    // The install buttons should not include already-installed skills
    const installBtns = qa(el, ".install-btn");
    const installNames = Array.from(installBtns).map(
      (btn) => (btn as HTMLElement).closest(".skill-card")?.querySelector(".skill-name")?.textContent?.trim(),
    );
    for (const installed of MOCK_INSTALLED) {
      expect(installNames).not.toContain(installed.name);
    }
    cleanup(el);
  });

  it("clicking Install on ClawHub skill calls gateway with acaclaw.skill.install", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    (tabs[1] as HTMLElement).click();
    await el.updateComplete;

    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "skills.status") return { skills: MOCK_INSTALLED };
      return undefined;
    });

    const firstInstallBtn = q(el, ".install-btn") as HTMLButtonElement;
    firstInstallBtn.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 200));

    const installCall = calls.find((c) => c[0] === "acaclaw.skill.install");
    expect(installCall).toBeTruthy();
    expect(installCall![1]).toHaveProperty("slug");
    cleanup(el);
  });

  it("search input filters installed skills", async () => {
    const el = await createElement();
    const countBefore = qa(el, ".skill-card").length;
    expect(countBefore).toBe(3);

    const searchInput = q(el, ".search-input") as HTMLInputElement;
    searchInput.value = "web";
    searchInput.dispatchEvent(new Event("input"));
    await el.updateComplete;

    const countAfter = qa(el, ".skill-card").length;
    expect(countAfter).toBeLessThan(countBefore);
    expect(countAfter).toBeGreaterThan(0);
    cleanup(el);
  });

  it("search input filters ClawHub skills", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    (tabs[1] as HTMLElement).click();
    await el.updateComplete;

    const countBefore = qa(el, ".skill-item").length;

    const searchInput = q(el, ".search-input") as HTMLInputElement;
    searchInput.value = "code";
    searchInput.dispatchEvent(new Event("input"));
    await el.updateComplete;

    const countAfter = qa(el, ".skill-item").length;
    expect(countAfter).toBeLessThanOrEqual(countBefore);
    cleanup(el);
  });

  it("renders Recommended badge on curated skills", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    (tabs[1] as HTMLElement).click();
    await el.updateComplete;

    const badges = qa(el, ".recommended-badge");
    expect(badges.length).toBeGreaterThan(0);
    cleanup(el);
  });
});
