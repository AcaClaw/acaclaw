/**
 * DOM tests for DebugView (debug.ts).
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

const { DebugView } = await import("../ui/src/views/debug.js");

type DV = InstanceType<typeof DebugView>;

async function createElement(): Promise<DV> {
  mockCall.mockResolvedValue(null);
  const el = document.createElement("acaclaw-debug") as DV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: DV) { document.body.removeChild(el); }
function q(el: DV, s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(el: DV, s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => { vi.clearAllMocks(); });

describe("DebugView DOM", () => {
  it("renders the heading", async () => {
    const el = await createElement();
    const h1 = q(el, "h1");
    expect(h1).toBeTruthy();
    expect(h1!.textContent).toContain("Debug");
    cleanup(el);
  });

  it("renders subtitle", async () => {
    const el = await createElement();
    const sub = q(el, ".subtitle");
    expect(sub).toBeTruthy();
    expect(sub!.textContent!.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("renders 3 tabs (Snapshots, RPC, Events)", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    expect(tabs.length).toBe(3);
    const tabTexts = Array.from(tabs).map((t) => t.textContent?.trim());
    expect(tabTexts).toContain("Snapshots");
    expect(tabTexts).toContain("RPC");
    cleanup(el);
  });

  it("Snapshots tab is active by default", async () => {
    const el = await createElement();
    const activeTab = q(el, ".tab.active");
    expect(activeTab).toBeTruthy();
    expect(activeTab!.textContent).toContain("Snapshots");
    cleanup(el);
  });

  it("renders status snapshot section", async () => {
    const el = await createElement();
    const titles = qa(el, ".section-title");
    const statusTitle = Array.from(titles).find((t) => t.textContent?.includes("Status"));
    expect(statusTitle).toBeTruthy();
    cleanup(el);
  });

  it("renders health snapshot section", async () => {
    const el = await createElement();
    const titles = qa(el, ".section-title");
    const healthTitle = Array.from(titles).find((t) => t.textContent?.includes("Health"));
    expect(healthTitle).toBeTruthy();
    cleanup(el);
  });

  it("renders heartbeat section", async () => {
    const el = await createElement();
    const titles = qa(el, ".section-title");
    const heartbeatTitle = Array.from(titles).find((t) => t.textContent?.includes("Heartbeat"));
    expect(heartbeatTitle).toBeTruthy();
    cleanup(el);
  });

  it("renders json-box elements for snapshot data", async () => {
    const el = await createElement();
    const boxes = qa(el, ".json-box");
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    cleanup(el);
  });

  it("renders refresh button", async () => {
    const el = await createElement();
    const btns = qa(el, ".btn");
    const refreshBtn = Array.from(btns).find((b) => b.textContent?.includes("Refresh"));
    expect(refreshBtn).toBeTruthy();
    cleanup(el);
  });

  it("calls gateway.call for snapshots on mount", async () => {
    const el = await createElement();
    const calls = mockCall.mock.calls.map((c) => c[0]);
    expect(calls).toContain("status.snapshot");
    expect(calls).toContain("health.snapshot");
    expect(calls).toContain("heartbeat.last");
    cleanup(el);
  });

  it("switching to RPC tab shows manual RPC form", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const rpcTab = Array.from(tabs).find((t) => t.textContent?.trim() === "RPC") as HTMLElement;
    expect(rpcTab).toBeTruthy();
    rpcTab.click();
    await el.updateComplete;

    const rpcInput = q(el, ".rpc-input");
    expect(rpcInput).toBeTruthy();
    const textarea = q(el, ".rpc-textarea");
    expect(textarea).toBeTruthy();
    cleanup(el);
  });

  it("switching to Events tab shows event log section", async () => {
    mockCall.mockResolvedValue([]);
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const eventsTab = Array.from(tabs).find((t) => t.textContent?.includes("Events")) as HTMLElement;
    expect(eventsTab).toBeTruthy();
    eventsTab.click();
    await el.updateComplete;

    const titles = qa(el, ".section-title");
    const eventTitle = Array.from(titles).find((t) => t.textContent?.includes("Event"));
    expect(eventTitle).toBeTruthy();
    cleanup(el);
  });

  it("renders section descriptions", async () => {
    const el = await createElement();
    const descs = qa(el, ".section-desc");
    expect(descs.length).toBeGreaterThan(0);
    cleanup(el);
  });
});
