/**
 * DOM tests for LogsView (logs.ts).
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

const { LogsView } = await import("../ui/src/views/logs.js");

type LV = InstanceType<typeof LogsView>;

async function createElement(): Promise<LV> {
  mockCall.mockResolvedValue({ entries: [] });
  const el = document.createElement("acaclaw-logs") as LV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: LV) { document.body.removeChild(el); }
function q(el: LV, s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(el: LV, s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => { vi.clearAllMocks(); });

describe("LogsView DOM", () => {
  it("renders the heading", async () => {
    const el = await createElement();
    const h1 = q(el, "h1");
    expect(h1).toBeTruthy();
    expect(h1!.textContent).toContain("Logs");
    cleanup(el);
  });

  it("renders subtitle", async () => {
    const el = await createElement();
    const sub = q(el, ".subtitle");
    expect(sub).toBeTruthy();
    expect(sub!.textContent!.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("renders toolbar with search box", async () => {
    const el = await createElement();
    const toolbar = q(el, ".toolbar");
    expect(toolbar).toBeTruthy();
    const searchBox = q(el, ".search-box");
    expect(searchBox).toBeTruthy();
    cleanup(el);
  });

  it("renders level toggle buttons for all levels", async () => {
    const el = await createElement();
    const levels = qa(el, ".level-btn");
    // trace, debug, info, warn, error, fatal = 6
    expect(levels.length).toBe(6);
    cleanup(el);
  });

  it("info, warn, error, fatal level toggles start active", async () => {
    const el = await createElement();
    const activeLevels = qa(el, ".level-btn.active");
    // trace and debug are off by default; info, warn, error, fatal are on = 4
    expect(activeLevels.length).toBe(4);
    cleanup(el);
  });

  it("renders auto-follow button", async () => {
    const el = await createElement();
    const btns = qa(el, ".btn");
    const followBtn = Array.from(btns).find((b) => b.textContent?.includes("Auto-follow"));
    expect(followBtn).toBeTruthy();
    cleanup(el);
  });

  it("renders export button", async () => {
    const el = await createElement();
    const btns = qa(el, ".btn");
    const exportBtn = Array.from(btns).find((b) => b.textContent?.includes("Export"));
    expect(exportBtn).toBeTruthy();
    cleanup(el);
  });

  it("renders log container", async () => {
    const el = await createElement();
    const container = q(el, ".log-container");
    expect(container).toBeTruthy();
    cleanup(el);
  });

  it("shows empty state when no logs", async () => {
    const el = await createElement();
    const empty = q(el, ".empty-state");
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toContain("No log");
    cleanup(el);
  });

  it("renders log entries when data is returned", async () => {
    mockCall.mockResolvedValue({ entries: [
      { timestamp: new Date().toISOString(), level: "info", subsystem: "gateway", message: "Server started" },
      { timestamp: new Date().toISOString(), level: "warn", subsystem: "auth", message: "Token expiring" },
    ] });
    const el = document.createElement("acaclaw-logs") as LV;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    const lines = qa(el, ".log-line");
    expect(lines.length).toBe(2);

    const levels = qa(el, ".log-level");
    expect(levels[0]!.textContent).toBe("info");
    expect(levels[1]!.textContent).toBe("warn");
    cleanup(el);
  });

  it("renders status bar", async () => {
    const el = await createElement();
    const statusBar = q(el, ".status-bar");
    expect(statusBar).toBeTruthy();
    cleanup(el);
  });

  it("calls gateway.call with logs.tail on mount", async () => {
    const el = await createElement();
    expect(mockCall).toHaveBeenCalledWith("logs.tail", expect.any(Object));
    cleanup(el);
  });

  it("renders log message text", async () => {
    mockCall.mockResolvedValue({ entries: [
      { timestamp: new Date().toISOString(), level: "info", subsystem: "test", message: "Hello World" },
    ] });
    const el = document.createElement("acaclaw-logs") as LV;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    const msg = q(el, ".log-msg");
    expect(msg?.textContent).toBe("Hello World");
    cleanup(el);
  });

  it("renders log timestamp", async () => {
    mockCall.mockResolvedValue({ entries: [
      { timestamp: "2025-01-15T12:00:00Z", level: "info", message: "test" },
    ] });
    const el = document.createElement("acaclaw-logs") as LV;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    const ts = q(el, ".log-ts");
    expect(ts?.textContent?.length).toBeGreaterThan(0);
    cleanup(el);
  });
});
