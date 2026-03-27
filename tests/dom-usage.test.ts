/**
 * DOM component tests for UsageView.
 * Verifies period toggles, summary cards, charts, and tool usage.
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

const { UsageView } = await import("../ui/src/views/usage.js");

type UV = InstanceType<typeof UsageView>;

const MOCK_COST = {
  updatedAt: Date.now(),
  days: 7,
  daily: [
    { date: "2026-03-25", input: 5000, output: 3000, cacheRead: 0, cacheWrite: 0, totalTokens: 8000, totalCost: 0.012 },
    { date: "2026-03-24", input: 3000, output: 2000, cacheRead: 0, cacheWrite: 0, totalTokens: 5000, totalCost: 0.008 },
  ],
  totals: { totalCost: 0.02, totalTokens: 13000, input: 8000, output: 5000 },
};

const MOCK_SESSIONS = {
  aggregates: {
    tools: { totalCalls: 15, uniqueTools: 3, tools: [
      { name: "read_file", count: 8 },
      { name: "grep_search", count: 5 },
      { name: "run_in_terminal", count: 2 },
    ] },
    messages: { total: 20, user: 10, assistant: 10, toolCalls: 15, toolResults: 15, errors: 0 },
    daily: [
      { date: "2026-03-25", tokens: 8000, cost: 0.012, messages: 12, toolCalls: 10, errors: 0 },
    ],
  },
};

async function createElement(): Promise<UV> {
  mockCall.mockImplementation(async (method: string) => {
    if (method === "usage.cost") return MOCK_COST;
    if (method === "sessions.usage") return MOCK_SESSIONS;
    return undefined;
  });
  const el = document.createElement("acaclaw-usage") as UV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 100));
  await el.updateComplete;
  return el;
}

function cleanup(el: UV) { document.body.removeChild(el); }
function q(el: UV, s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(el: UV, s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => { vi.clearAllMocks(); });

describe("UsageView DOM", () => {
  it("renders the heading", async () => {
    const el = await createElement();
    const h1 = q(el, "h1");
    expect(h1).toBeTruthy();
    cleanup(el);
  });

  it("renders period toggle buttons (today/week/month)", async () => {
    const el = await createElement();
    const periodBtns = qa(el, ".period-btn");
    expect(periodBtns.length).toBe(3);
    cleanup(el);
  });

  it("shows summary cards", async () => {
    const el = await createElement();
    const cards = qa(el, ".summary-card, .stat-card, .metric-card");
    expect(cards.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("renders chart area", async () => {
    const el = await createElement();
    const chart = q(el, ".chart");
    expect(chart).toBeTruthy();
    cleanup(el);
  });

  it("displays tool usage entries", async () => {
    const el = await createElement();
    const toolRows = qa(el, "tbody tr");
    expect(toolRows.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("has export CSV button", async () => {
    const el = await createElement();
    const exportBtn = q(el, ".export-btn");
    expect(exportBtn).toBeTruthy();
    cleanup(el);
  });

  it("clicking month button switches period", async () => {
    const el = await createElement();
    const periodBtns = qa(el, ".period-btn");
    // Month is the 3rd button (today, week, month)
    if (periodBtns.length >= 3) {
      (periodBtns[2] as HTMLElement).click();
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 100));
      // Should have re-called usage.cost after switching period
      const costCalls = mockCall.mock.calls.filter(
        (c: unknown[]) => c[0] === "usage.cost",
      );
      expect(costCalls.length).toBeGreaterThan(1);
    }
    cleanup(el);
  });

  it("calls usage.cost on creation", async () => {
    const el = await createElement();
    const costCall = mockCall.mock.calls.find((c: unknown[]) => c[0] === "usage.cost");
    expect(costCall).toBeTruthy();
    cleanup(el);
  });

  it("calls sessions.usage on creation", async () => {
    const el = await createElement();
    const sessionCall = mockCall.mock.calls.find((c: unknown[]) => c[0] === "sessions.usage");
    expect(sessionCall).toBeTruthy();
    cleanup(el);
  });
});
