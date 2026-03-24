/**
 * DOM component tests for StaffView.
 * Renders the Lit component in happy-dom and simulates button clicks.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCall = vi.fn();
const mockOnNotification = vi.fn().mockReturnValue(() => {});

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: (...args: unknown[]) => mockCall(...args),
    state: "connected" as const,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onNotification: (...args: unknown[]) => mockOnNotification(...args),
  },
}));

const { StaffView } = await import("../ui/src/views/staff.js");

type STV = InstanceType<typeof StaffView>;

const MOCK_ENVS = [
  { name: "aca", installed: true },
  { name: "aca-bio", installed: false },
  { name: "aca-med", installed: false },
  { name: "aca-ai", installed: false },
  { name: "aca-data", installed: false },
  { name: "aca-cs", installed: false },
];

async function createElement(): Promise<STV> {
  // Clear localStorage to avoid state leaking between tests
  localStorage.removeItem("acaclaw-staff-customizations");
  localStorage.removeItem("acaclaw-staff-added");

  mockCall.mockImplementation(async (method: string) => {
    if (method === "acaclaw.env.list") return { environments: MOCK_ENVS };
    return undefined;
  });
  const el = document.createElement("acaclaw-staff") as STV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: STV) {
  document.body.removeChild(el);
}

function q(el: STV, selector: string) {
  return el.shadowRoot!.querySelector(selector);
}
function qa(el: STV, selector: string) {
  return el.shadowRoot!.querySelectorAll(selector);
}

describe("StaffView DOM", () => {
  beforeEach(() => {
    mockCall.mockReset();
    mockOnNotification.mockReset();
    mockOnNotification.mockReturnValue(() => {});
  });

  it("renders heading", async () => {
    const el = await createElement();
    expect(q(el, "h1")?.textContent?.trim()).toBe("Staff");
    cleanup(el);
  });

  it("renders staff cards for all built-in members", async () => {
    const el = await createElement();
    const cards = qa(el, ".staff-card");
    // 6 built-in staff members
    expect(cards.length).toBe(6);
    cleanup(el);
  });

  it("renders + New Staff button", async () => {
    const el = await createElement();
    const newBtn = q(el, ".btn-new-staff") as HTMLButtonElement;
    expect(newBtn).toBeTruthy();
    expect(newBtn.textContent?.trim()).toContain("New Staff");
    cleanup(el);
  });

  it("clicking + New Staff opens picker dropdown", async () => {
    const el = await createElement();
    const newBtn = q(el, ".btn-new-staff") as HTMLButtonElement;
    newBtn.click();
    await el.updateComplete;

    const picker = q(el, ".new-picker");
    expect(picker).toBeTruthy();
    cleanup(el);
  });

  it("picker shows template options", async () => {
    const el = await createElement();
    const newBtn = q(el, ".btn-new-staff") as HTMLButtonElement;
    newBtn.click();
    await el.updateComplete;

    const items = qa(el, ".new-picker-item");
    expect(items.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("selecting Custom Staff from picker adds a new card", async () => {
    const el = await createElement();
    const cardsBefore = qa(el, ".staff-card").length;

    const newBtn = q(el, ".btn-new-staff") as HTMLButtonElement;
    newBtn.click();
    await el.updateComplete;

    // Find custom staff option
    const items = qa(el, ".new-picker-item");
    const customItem = Array.from(items).find(
      (i) => i.textContent?.includes("Custom"),
    ) as HTMLElement;
    customItem.click();
    await el.updateComplete;

    const cardsAfter = qa(el, ".staff-card").length;
    expect(cardsAfter).toBe(cardsBefore + 1);
    cleanup(el);
  });

  it("shows Install button for uninstalled staff env", async () => {
    const el = await createElement();
    // Dr. Gene (biologist) has envInstalled: false
    const installBtns = qa(el, ".btn-install");
    expect(installBtns.length).toBeGreaterThan(0);
    const firstInstall = installBtns[0] as HTMLButtonElement;
    expect(firstInstall.textContent?.trim()).toContain("Install");
    cleanup(el);
  });

  it("clicking Install button calls gateway env.install", async () => {
    const el = await createElement();
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "acaclaw.env.list") return { environments: MOCK_ENVS };
      return undefined;
    });

    const installBtn = qa(el, ".btn-install")[0] as HTMLButtonElement;
    installBtn.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    const envInstall = calls.find((c) => c[0] === "acaclaw.env.install");
    expect(envInstall).toBeTruthy();
    cleanup(el);
  });

  it("shows Config button for installed staff", async () => {
    const el = await createElement();
    // The default "Aca" staff has envInstalled: true
    const configBtns = Array.from(qa(el, ".btn-action")).filter(
      (b) => b.textContent?.includes("Config"),
    );
    expect(configBtns.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("clicking Config opens slide-out panel", async () => {
    const el = await createElement();
    const configBtn = Array.from(qa(el, ".btn-action")).find(
      (b) => b.textContent?.includes("Config"),
    ) as HTMLButtonElement;
    configBtn.click();
    await el.updateComplete;

    const panel = q(el, ".panel");
    expect(panel).toBeTruthy();
    cleanup(el);
  });

  it("clicking Manage skills link opens skills panel", async () => {
    const el = await createElement();
    // Find "Manage" link next to skills count
    const manageLinks = qa(el, ".manage-link");
    // There should be manage links on cards
    const skillsManage = Array.from(manageLinks).find(
      (l) => {
        const parent = l.closest(".skills-count, .staff-card");
        return parent && l.textContent?.includes("Manage");
      },
    ) as HTMLButtonElement;
    expect(skillsManage).toBeTruthy();
    skillsManage.click();
    await el.updateComplete;

    const panel = q(el, ".panel");
    expect(panel).toBeTruthy();
    cleanup(el);
  });

  it("panel close button dismisses panel", async () => {
    const el = await createElement();
    // Open config panel via Manage link
    const manageLinks = qa(el, ".manage-link");
    (manageLinks[0] as HTMLButtonElement).click();
    await el.updateComplete;

    expect(q(el, ".panel")).toBeTruthy();

    const closeBtn = q(el, ".panel-close") as HTMLButtonElement;
    closeBtn.click();
    await el.updateComplete;

    expect(q(el, ".panel")).toBeFalsy();
    cleanup(el);
  });

  it("clicking staff name starts inline edit", async () => {
    const el = await createElement();
    // Click the span inside the first .staff-name
    const nameSpan = q(el, ".staff-name span") as HTMLElement;
    nameSpan.click();
    await el.updateComplete;

    const editInput = q(el, ".edit-name-input") as HTMLInputElement;
    expect(editInput).toBeTruthy();
    cleanup(el);
  });

  it("editing name persists to localStorage", async () => {
    const el = await createElement();
    // Click the span inside .staff-name to start editing
    const nameSpan = q(el, ".staff-name span") as HTMLElement;
    nameSpan.click();
    await el.updateComplete;

    const editInput = q(el, ".edit-name-input") as HTMLInputElement;
    editInput.value = "MyCustomName";
    editInput.dispatchEvent(new Event("input"));
    // Trigger blur to save
    editInput.dispatchEvent(new Event("blur"));
    await el.updateComplete;

    const stored = localStorage.getItem("acaclaw-staff-customizations");
    expect(stored).toBeTruthy();
    expect(stored).toContain("MyCustomName");
    cleanup(el);
  });

  it("shows Chat button for installed staff", async () => {
    const el = await createElement();
    const chatBtns = Array.from(qa(el, ".btn-action")).filter(
      (b) => b.textContent?.includes("Chat"),
    );
    expect(chatBtns.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("renders env badge with status", async () => {
    const el = await createElement();
    const badges = qa(el, ".env-badge");
    expect(badges.length).toBeGreaterThan(0);
    cleanup(el);
  });
});
