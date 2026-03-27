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

/** Switch to the Installed tab and wait for render. */
async function switchToInstalled(el: SV) {
  const tabs = qa(el, ".tab");
  (tabs[1] as HTMLElement).click();
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
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

  it("renders Featured and Installed tabs", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    expect(tabs.length).toBe(2);
    const labels = Array.from(tabs).map((t) => t.textContent?.trim());
    expect(labels[0]).toContain("Featured");
    expect(labels[1]).toContain("Installed");
    cleanup(el);
  });

  it("Featured tab is active by default", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    expect(tabs[0]?.classList.contains("active")).toBe(true);
    expect(tabs[1]?.classList.contains("active")).toBe(false);
    cleanup(el);
  });

  it("shows installed skill count in Installed tab label", async () => {
    const el = await createElement();
    // Installed tab is tab[1]; count shows user-installed (non-bundled) skills
    const tab = qa(el, ".tab")[1];
    expect(tab?.textContent).toContain("(");
    cleanup(el);
  });

  it("renders skill items on Installed tab", async () => {
    const el = await createElement();
    await switchToInstalled(el);
    const items = qa(el, ".skill-card");
    // 3 mock skills + 4 BASE_SKILLS (clawhub-repo synthetics)
    expect(items.length).toBeGreaterThanOrEqual(MOCK_INSTALLED.length);
    cleanup(el);
  });

  it("shows disable button for non-bundled skills", async () => {
    const el = await createElement();
    await switchToInstalled(el);
    const disableBtns = qa(el, ".disable-btn");
    expect(disableBtns.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("clicking disable button calls gateway with skills.update", async () => {
    const el = await createElement();
    await switchToInstalled(el);
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

  it("Featured tab shows hero cards and GET buttons", async () => {
    const el = await createElement();
    // Featured is the default tab — renders hero cards with GET buttons
    const heroCards = qa(el, ".hero-card");
    expect(heroCards.length).toBeGreaterThan(0);
    const getButtons = qa(el, ".get-btn");
    expect(getButtons.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("Featured tab shows category sections", async () => {
    const el = await createElement();
    const categories = qa(el, ".category-section");
    expect(categories.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("clicking GET button on Featured tab calls _installSkill", async () => {
    const el = await createElement();
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "skills.status") return { skills: MOCK_INSTALLED };
      return undefined;
    });

    // Find a GET button that is not already installed (not .installed class)
    const getBtn = q(el, ".get-btn:not(.installed)") as HTMLButtonElement;
    if (getBtn) {
      getBtn.click();
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 200));

      const installCall = calls.find((c) => c[0] === "acaclaw.skill.install");
      expect(installCall).toBeTruthy();
      expect(installCall![1]).toHaveProperty("slug");
    }
    cleanup(el);
  });

  it("search input filters installed skills", async () => {
    const el = await createElement();
    await switchToInstalled(el);
    const countBefore = qa(el, ".skill-card").length;
    expect(countBefore).toBeGreaterThanOrEqual(3);

    const searchInput = q(el, ".search-input") as HTMLInputElement;
    searchInput.value = "web";
    searchInput.dispatchEvent(new Event("input"));
    await el.updateComplete;

    const countAfter = qa(el, ".skill-card").length;
    expect(countAfter).toBeLessThan(countBefore);
    expect(countAfter).toBeGreaterThan(0);
    cleanup(el);
  });

  it("Featured tab has filter chips", async () => {
    const el = await createElement();
    const chips = qa(el, ".filter-chip");
    expect(chips.length).toBeGreaterThan(0);
    cleanup(el);
  });
});
