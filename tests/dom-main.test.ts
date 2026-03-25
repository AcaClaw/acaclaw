/**
 * DOM tests for AcaClawApp (main.ts) — app shell, routing, nav, sidebar.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCall = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockReconnectNow = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
const mockOnNotification = vi.fn().mockReturnValue(() => {});

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: (...args: unknown[]) => mockCall(...args),
    connect: mockConnect,
    disconnect: mockDisconnect,
    reconnectNow: mockReconnectNow,
    state: "connected" as const,
    authenticated: true,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
    onNotification: mockOnNotification,
    dispatchEvent: vi.fn(),
  },
  GatewayState: {} as unknown,
}));

// Stub lazy view imports so they don't fail
vi.mock("../ui/src/views/usage.js", () => ({}));
vi.mock("../ui/src/views/skills.js", () => ({}));
vi.mock("../ui/src/views/workspace.js", () => ({}));
vi.mock("../ui/src/views/environment.js", () => ({}));
vi.mock("../ui/src/views/backup.js", () => ({}));
vi.mock("../ui/src/views/settings.js", () => ({}));
vi.mock("../ui/src/views/api-keys.js", () => ({}));
vi.mock("../ui/src/views/onboarding.js", () => ({}));
vi.mock("../ui/src/views/staff.js", () => ({
  getCustomizedStaff: () => [
    { id: "default", name: "Main", role: "General Assistant", icon: "🤖", systemPrompt: "" },
  ],
}));

const { AcaClawApp } = await import("../ui/src/main.js");

type App = InstanceType<typeof AcaClawApp>;

async function createElement(): Promise<App> {
  mockCall.mockResolvedValue(undefined);
  const el = document.createElement("acaclaw-app") as App;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: App) { document.body.removeChild(el); }
function q(el: App, s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(el: App, s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => {
  vi.clearAllMocks();
  location.hash = "";
});

describe("AcaClawApp DOM", () => {
  // ── Shell structure ──

  it("renders the app shell", async () => {
    const el = await createElement();
    const shell = q(el, ".shell");
    expect(shell).toBeTruthy();
    cleanup(el);
  });

  it("renders sidebar", async () => {
    const el = await createElement();
    const sidebar = q(el, ".sidebar");
    expect(sidebar).toBeTruthy();
    cleanup(el);
  });

  it("renders main content area", async () => {
    const el = await createElement();
    const main = q(el, ".main");
    expect(main).toBeTruthy();
    cleanup(el);
  });

  // ── Navigation items ──

  it("renders nav items for all routes", async () => {
    const el = await createElement();
    const navItems = qa(el, ".nav-item");
    // Should have: chat, staff, monitor, api-keys, usage, skills, workspace, environment, backup, settings = 10
    expect(navItems.length).toBe(10);
    cleanup(el);
  });

  it("renders nav list container", async () => {
    const el = await createElement();
    const navList = q(el, ".nav-list");
    expect(navList).toBeTruthy();
    cleanup(el);
  });

  // ── Navigation clicks ──

  it("clicking a nav item navigates to that route", async () => {
    const el = await createElement();
    const navItems = qa(el, ".nav-item");
    // Click the monitor nav item (3rd item in order: chat, staff, monitor)
    (navItems[2] as HTMLElement).click();
    await el.updateComplete;
    expect(location.hash).toContain("monitor");
    cleanup(el);
  });

  it("active nav item has active class", async () => {
    location.hash = "monitor";
    const el = await createElement();
    const activeItems = qa(el, ".nav-item.active");
    expect(activeItems.length).toBe(1);
    cleanup(el);
  });

  // ── Sidebar collapse ──

  it("sidebar collapse button exists", async () => {
    const el = await createElement();
    const collapseBtn = q(el, ".collapse-btn");
    expect(collapseBtn).toBeTruthy();
    cleanup(el);
  });

  it("clicking collapse button toggles sidebar", async () => {
    const el = await createElement();
    const collapseBtn = q(el, ".collapse-btn") as HTMLElement;
    const sidebar = q(el, ".sidebar");
    expect(sidebar?.classList.contains("collapsed")).toBe(false);
    collapseBtn.click();
    await el.updateComplete;
    expect(sidebar?.classList.contains("collapsed")).toBe(true);
    cleanup(el);
  });

  // ── Brand ──

  it("shows brand name in sidebar", async () => {
    const el = await createElement();
    const brand = q(el, ".brand");
    expect(brand).toBeTruthy();
    expect(brand?.textContent).toContain("AcaClaw");
    cleanup(el);
  });

  // ── Gateway status ──

  it("shows gateway status indicator", async () => {
    const el = await createElement();
    const statusDot = q(el, ".status-dot");
    expect(statusDot).toBeTruthy();
    cleanup(el);
  });

  // ── View rendering ──

  it("chat view is always in DOM", async () => {
    const el = await createElement();
    const chat = q(el, "acaclaw-chat");
    expect(chat).toBeTruthy();
    cleanup(el);
  });

  it("navigating to setup renders onboarding", async () => {
    location.hash = "setup";
    const el = await createElement();
    const onboarding = q(el, "acaclaw-onboarding");
    expect(onboarding).toBeTruthy();
    // In setup mode, the main shell should not render
    const shell = q(el, ".shell");
    expect(shell).toBeFalsy();
    cleanup(el);
  });

  // ── Logo ──

  it("renders logo image", async () => {
    const el = await createElement();
    const logo = q(el, "img[alt='AcaClaw']");
    expect(logo).toBeTruthy();
    cleanup(el);
  });

  // ── Connects gateway on mount ──

  it("calls gateway.connect on connectedCallback", async () => {
    const el = await createElement();
    expect(mockConnect).toHaveBeenCalled();
    cleanup(el);
  });
});
