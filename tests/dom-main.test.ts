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
vi.mock("../ui/src/views/sessions.js", () => ({}));
vi.mock("../ui/src/views/logs.js", () => ({}));
vi.mock("../ui/src/views/debug.js", () => ({}));
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
    // Should have: chat, staff, monitor, api-keys, channels, usage, skills, workspace, environment, backup, settings = 11
    expect(navItems.length).toBe(11);
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

  it("sidebar toggle button exists", async () => {
    const el = await createElement();
    const toggleBtn = q(el, ".sidebar-toggle");
    expect(toggleBtn).toBeTruthy();
    cleanup(el);
  });

  it("clicking sidebar toggle button toggles sidebar", async () => {
    const el = await createElement();
    const toggleBtn = q(el, ".sidebar-toggle") as HTMLElement;
    const sidebar = q(el, ".sidebar");
    expect(sidebar?.classList.contains("collapsed")).toBe(false);
    toggleBtn.click();
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

// ─────────────────────────────────────────────────
// API Key Gate tests
// ─────────────────────────────────────────────────

/** Helper: create element then simulate gateway "connected" with a config response. */
async function createWithConfig(config: Record<string, unknown> | null): Promise<App> {
  // config.get returns { config: {...}, hash: "..." }
  mockCall.mockImplementation((method: string) => {
    if (method === "config.get") {
      return config ? Promise.resolve({ config, hash: "abc" }) : Promise.resolve(null);
    }
    return Promise.resolve(undefined);
  });

  const el = document.createElement("acaclaw-app") as App;
  document.body.appendChild(el);
  await el.updateComplete;

  // Find the "state-change" listener registered on gateway and fire it
  const stateChangeCalls = mockAddEventListener.mock.calls.filter(
    (c: unknown[]) => c[0] === "state-change"
  );
  for (const [, handler] of stateChangeCalls) {
    (handler as (e: CustomEvent) => void)(new CustomEvent("state-change", { detail: { state: "connected" } }));
  }

  // Let async _checkKeysConfigured settle
  await new Promise((r) => setTimeout(r, 100));
  await el.updateComplete;
  return el;
}

describe("API Key Gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    location.hash = "";
  });

  it("defaults to api-keys route when no keys are configured", async () => {
    const el = await createWithConfig({ auth: { profiles: {} }, models: {} });
    // Internal route should be api-keys (hash may be empty since that's the default)
    expect((el as unknown as Record<string, string>)._route).toBe("api-keys");
    cleanup(el);
  });

  it("nav items except api-keys are locked when no keys configured", async () => {
    const el = await createWithConfig({ auth: { profiles: {} }, models: {} });
    const locked = qa(el, ".nav-item.locked");
    // 11 nav items total, only api-keys is unlocked → 10 locked
    expect(locked.length).toBe(10);
    cleanup(el);
  });

  it("allows navigation when keys are configured", async () => {
    const el = await createWithConfig({
      auth: { profiles: { "anthropic:default": { provider: "anthropic" } } },
    });
    // Should NOT be locked
    const locked = qa(el, ".nav-item.locked");
    expect(locked.length).toBe(0);
    // _keysConfigured should be true
    expect((el as unknown as Record<string, boolean>)._keysConfigured).toBe(true);
    cleanup(el);
  });

  it("blocks hash navigation to other routes when no keys", async () => {
    const el = await createWithConfig({ auth: { profiles: {} } });
    location.hash = "monitor";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await el.updateComplete;
    // Should be redirected back to api-keys
    expect(location.hash).toBe("#api-keys");
    cleanup(el);
  });

  it("redirects to api-keys if started on another route without keys", async () => {
    location.hash = "chat";
    const el = await createWithConfig({ auth: { profiles: {} } });
    // Gate should redirect to api-keys
    expect(location.hash).toBe("#api-keys");
    expect((el as unknown as Record<string, string>)._route).toBe("api-keys");
    cleanup(el);
  });

  it("lifts the gate when keys-saved event fires", async () => {
    const el = await createWithConfig({ auth: { profiles: {} } });
    // Gate is active — route should be api-keys
    expect((el as unknown as Record<string, string>)._route).toBe("api-keys");

    // Simulate keys-saved event from api-keys view
    window.dispatchEvent(new CustomEvent("keys-saved"));
    await el.updateComplete;

    // Now navigation should work
    location.hash = "chat";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await el.updateComplete;
    expect(location.hash).toBe("#chat");
    cleanup(el);
  });

  it("detects keys from models.providers with apiKey", async () => {
    const el = await createWithConfig({
      models: { providers: { openai: { apiKey: "sk-test123" } } },
    });
    const locked = qa(el, ".nav-item.locked");
    expect(locked.length).toBe(0);
    cleanup(el);
  });

  it("treats null config.get response as no keys", async () => {
    const el = await createWithConfig(null);
    expect((el as unknown as Record<string, string>)._route).toBe("api-keys");
    const locked = qa(el, ".nav-item.locked");
    expect(locked.length).toBe(10);
    cleanup(el);
  });
});
