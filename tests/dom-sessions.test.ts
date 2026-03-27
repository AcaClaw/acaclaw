/**
 * DOM tests for SessionsView (sessions.ts).
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

const { SessionsView } = await import("../ui/src/views/sessions.js");

type SV = InstanceType<typeof SessionsView>;

async function createElement(): Promise<SV> {
  mockCall.mockResolvedValue({ sessions: [] });
  const el = document.createElement("acaclaw-sessions") as SV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: SV) { document.body.removeChild(el); }
function q(el: SV, s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(el: SV, s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => { vi.clearAllMocks(); });

describe("SessionsView DOM", () => {
  it("renders the heading", async () => {
    const el = await createElement();
    const h1 = q(el, "h1");
    expect(h1).toBeTruthy();
    expect(h1!.textContent).toContain("Sessions");
    cleanup(el);
  });

  it("renders subtitle", async () => {
    const el = await createElement();
    const sub = q(el, ".subtitle");
    expect(sub).toBeTruthy();
    expect(sub!.textContent!.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("renders toolbar with search and page-size selector", async () => {
    const el = await createElement();
    const toolbar = q(el, ".toolbar");
    expect(toolbar).toBeTruthy();
    const searchBox = q(el, ".search-box");
    expect(searchBox).toBeTruthy();
    const pageSize = q(el, ".page-size");
    expect(pageSize).toBeTruthy();
    cleanup(el);
  });

  it("renders refresh button", async () => {
    const el = await createElement();
    const btns = qa(el, ".btn");
    const refreshBtn = Array.from(btns).find((b) => b.textContent?.includes("Refresh"));
    expect(refreshBtn).toBeTruthy();
    cleanup(el);
  });

  it("shows empty state when no sessions", async () => {
    const el = await createElement();
    const empty = q(el, ".empty-state");
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toContain("No sessions");
    cleanup(el);
  });

  it("renders table when sessions are loaded", async () => {
    mockCall.mockResolvedValue({ sessions: [
      { key: "s1", kind: "chat", label: "Test", tokens: 100, updatedAt: new Date().toISOString() },
      { key: "s2", kind: "agent", label: "Agent run", tokens: 500, updatedAt: new Date().toISOString() },
    ] });
    const el = document.createElement("acaclaw-sessions") as SV;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    const rows = qa(el, "tbody tr");
    expect(rows.length).toBe(2);

    const keyCells = qa(el, ".key-cell");
    const keys = Array.from(keyCells).map((c) => c.textContent);
    expect(keys).toContain("s1");
    expect(keys).toContain("s2");
    cleanup(el);
  });

  it("renders pagination when sessions exceed page size", async () => {
    const sessions = Array.from({ length: 30 }, (_, i) => ({
      key: `s${i}`, kind: "chat", label: `Session ${i}`, tokens: i * 10, updatedAt: new Date().toISOString(),
    }));
    mockCall.mockResolvedValue({ sessions });
    const el = document.createElement("acaclaw-sessions") as SV;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    const pagination = q(el, ".pagination");
    expect(pagination).toBeTruthy();
    cleanup(el);
  });

  it("has page-size options (10, 25, 50, 100)", async () => {
    const el = await createElement();
    const options = qa(el, ".page-size option");
    expect(options.length).toBe(4);
    cleanup(el);
  });

  it("calls gateway.call with sessions.list on mount", async () => {
    const el = await createElement();
    expect(mockCall).toHaveBeenCalledWith("sessions.list");
    cleanup(el);
  });

  it("renders checkbox for each session row", async () => {
    mockCall.mockResolvedValue({ sessions: [
      { key: "s1", kind: "chat", label: "Test", tokens: 100, updatedAt: new Date().toISOString() },
    ] });
    const el = document.createElement("acaclaw-sessions") as SV;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    const checkboxes = qa(el, "input[type=checkbox]");
    expect(checkboxes.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("renders Open in Chat button for each row", async () => {
    mockCall.mockResolvedValue({ sessions: [
      { key: "s1", kind: "chat", label: "Test", tokens: 100, updatedAt: new Date().toISOString() },
    ] });
    const el = document.createElement("acaclaw-sessions") as SV;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    const btns = qa(el, ".btn");
    const openBtn = Array.from(btns).find((b) => b.textContent?.includes("Chat"));
    expect(openBtn).toBeTruthy();
    cleanup(el);
  });

  it("renders sortable table headers", async () => {
    mockCall.mockResolvedValue({ sessions: [
      { key: "s1", kind: "chat", label: "T", tokens: 10, updatedAt: new Date().toISOString() },
    ] });
    const el = document.createElement("acaclaw-sessions") as SV;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    const headers = qa(el, "th");
    // checkbox col + key + kind + label + tokens + updated + actions = 7
    expect(headers.length).toBe(7);
    const arrows = qa(el, ".sort-arrow");
    expect(arrows.length).toBeGreaterThan(0);
    cleanup(el);
  });
});
