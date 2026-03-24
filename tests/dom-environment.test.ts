/**
 * DOM component tests for EnvironmentView.
 * Uses happy-dom to render Lit components and verify button click → gateway call.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

/* ── Mock gateway before importing components ── */

const mockCall = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: (...args: unknown[]) => mockCall(...args),
    state: "connected" as const,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
  },
}));

const { EnvironmentView } = await import("../ui/src/views/environment.js");

type EV = InstanceType<typeof EnvironmentView>;

const MOCK_ENVS = [
  { name: "aca", python: "3.12.8", rVersion: "not installed", condaVersion: "Miniforge 24.11", path: "~/.acaclaw/miniforge3/envs/aca", sizeGB: 1.4, active: true, installed: true },
  { name: "aca-bio", python: "3.12.8", rVersion: "4.4.2", condaVersion: "Miniforge 24.11", path: "~/.acaclaw/miniforge3/envs/aca-bio", sizeGB: 3.2, active: false, installed: false },
];
const MOCK_PKGS = [
  { name: "numpy", version: "2.2.1", source: "conda-forge" },
  { name: "pandas", version: "2.2.3", source: "conda-forge" },
  { name: "scipy", version: "1.15.0", source: "conda-forge" },
];

/** Create, attach, and wait for element first render */
async function createElement(): Promise<EV> {
  // Mock gateway to return env list and packages
  mockCall.mockImplementation(async (method: string) => {
    if (method === "acaclaw.env.list") return { environments: MOCK_ENVS };
    if (method === "acaclaw.env.pip.list") return { packages: MOCK_PKGS };
    return undefined;
  });
  const el = document.createElement("acaclaw-environment") as EV;
  document.body.appendChild(el);
  await el.updateComplete;
  // Wait for async _loadEnvironments / _loadPackages to finish
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: EV) {
  document.body.removeChild(el);
}

/** Helper to query in shadow root */
function q(el: EV, selector: string) {
  return el.shadowRoot!.querySelector(selector);
}
function qa(el: EV, selector: string) {
  return el.shadowRoot!.querySelectorAll(selector);
}

describe("EnvironmentView DOM", () => {
  beforeEach(() => {
    mockCall.mockReset();
    mockAddEventListener.mockReset();
    mockRemoveEventListener.mockReset();
  });

  it("renders heading", async () => {
    const el = await createElement();
    expect(q(el, "h1")?.textContent).toBe("Environment");
    cleanup(el);
  });

  it("renders 5 ecosystem tabs", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    expect(tabs.length).toBe(5);
    const labels = Array.from(tabs).map((t) => t.textContent?.trim());
    expect(labels).toContain("🐍 Python");
    expect(labels).toContain("🔧 Tools");
    expect(labels).toContain("📊 R");
    expect(labels).toContain("⚡ CUDA");
    expect(labels).toContain("📦 Node.js");
    cleanup(el);
  });

  it("switches active tab on click", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const systemTab = Array.from(tabs).find((t) => t.textContent?.includes("Tools"));
    (systemTab as HTMLButtonElement).click();
    await el.updateComplete;
    expect(systemTab?.classList.contains("active")).toBe(true);
    cleanup(el);
  });

  it("renders env selector dropdown", async () => {
    const el = await createElement();
    const select = q(el, ".env-dropdown") as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    expect(select!.options.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("renders + New Env button", async () => {
    const el = await createElement();
    const newBtn = Array.from(qa(el, ".env-action-btn")).find((b) =>
      b.textContent?.includes("New Env"),
    ) as HTMLButtonElement | undefined;
    expect(newBtn).toBeTruthy();
    cleanup(el);
  });

  it("shows create form when + New Env is clicked", async () => {
    const el = await createElement();
    const newBtn = Array.from(qa(el, ".env-action-btn")).find((b) =>
      b.textContent?.includes("New Env"),
    ) as HTMLButtonElement;
    newBtn.click();
    await el.updateComplete;
    const createForm = q(el, ".create-inline");
    expect(createForm).toBeTruthy();
    cleanup(el);
  });

  it("install package input and button render for installed env", async () => {
    const el = await createElement();
    // The default env 'aca' is installed=true, so install bar should render
    const installInput = q(el, ".install-input") as HTMLInputElement | null;
    const installBtn = q(el, ".install-btn") as HTMLButtonElement | null;
    expect(installInput).toBeTruthy();
    expect(installBtn).toBeTruthy();
    expect(installBtn!.textContent?.trim()).toBe("Install");
    cleanup(el);
  });

  it("install button is disabled when input is empty", async () => {
    const el = await createElement();
    const installBtn = q(el, ".install-btn") as HTMLButtonElement | null;
    expect(installBtn!.disabled).toBe(true);
    cleanup(el);
  });

  it("clicking Install calls gateway.call with pip.install", async () => {
    const el = await createElement();
    // Reset but keep returning packages for re-renders
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      return undefined;
    });

    // Type into install input
    const installInput = q(el, ".install-input") as HTMLInputElement;
    installInput.value = "numpy";
    installInput.dispatchEvent(new Event("input"));
    await el.updateComplete;

    // Click install button
    const installBtn = q(el, ".install-btn") as HTMLButtonElement;
    installBtn.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    const pipInstall = calls.find((c) => c[0] === "acaclaw.env.pip.install");
    expect(pipInstall).toBeTruthy();
    expect(pipInstall![1]).toEqual({ packages: ["numpy"], env: "aca" });
    cleanup(el);
  });

  it("uninstall button renders for each package row", async () => {
    const el = await createElement();
    const uninstallBtns = qa(el, ".uninstall-btn");
    // Demo data has packages for the default env
    expect(uninstallBtns.length).toBeGreaterThan(0);
    const firstBtn = uninstallBtns[0] as HTMLButtonElement;
    expect(firstBtn.textContent?.trim()).toBe("Uninstall");
    cleanup(el);
  });

  it("clicking uninstall button calls gateway with pip.uninstall", async () => {
    const el = await createElement();
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      return undefined;
    });

    const uninstallBtns = qa(el, ".uninstall-btn");
    expect(uninstallBtns.length).toBeGreaterThan(0);
    // Click the first uninstall button
    (uninstallBtns[0] as HTMLButtonElement).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    const pipUninstall = calls.find((c) => c[0] === "acaclaw.env.pip.uninstall");
    expect(pipUninstall).toBeTruthy();
    expect(pipUninstall![1]).toEqual(
      expect.objectContaining({ packages: expect.any(Array), env: "aca" }),
    );
    cleanup(el);
  });

  it("renders package table with demo data", async () => {
    const el = await createElement();
    const rows = qa(el, "tbody tr");
    expect(rows.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("search input filters packages", async () => {
    const el = await createElement();
    const countBefore = qa(el, "tbody tr").length;
    expect(countBefore).toBe(3); // We mocked 3 packages

    const searchInput = q(el, ".search-input") as HTMLInputElement;
    searchInput.value = "numpy";
    searchInput.dispatchEvent(new Event("input"));
    await el.updateComplete;

    const countAfter = qa(el, "tbody tr").length;
    expect(countAfter).toBe(1); // Only numpy matches
    cleanup(el);
  });
});
