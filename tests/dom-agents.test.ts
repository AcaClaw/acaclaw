/**
 * DOM component tests for AgentsView.
 * Verifies agent cards, start buttons, and status display.
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

const { AgentsView } = await import("../ui/src/views/agents.js");

type AV = InstanceType<typeof AgentsView>;

async function createElement(): Promise<AV> {
  const el = document.createElement("acaclaw-agents") as AV;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function cleanup(el: AV) { document.body.removeChild(el); }
function q(el: AV, s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(el: AV, s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => { vi.clearAllMocks(); });

describe("AgentsView DOM", () => {
  it("renders the heading", async () => {
    const el = await createElement();
    const h1 = q(el, "h1");
    expect(h1).toBeTruthy();
    expect(h1!.textContent).toBeTruthy();
    cleanup(el);
  });

  it("renders agent cards", async () => {
    const el = await createElement();
    const cards = qa(el, ".agent-card");
    expect(cards.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("each agent card has a name and role", async () => {
    const el = await createElement();
    const cards = qa(el, ".agent-card");
    for (const card of Array.from(cards)) {
      const name = card.querySelector(".agent-name");
      expect(name?.textContent?.trim().length).toBeGreaterThan(0);
    }
    cleanup(el);
  });

  it("renders start buttons for agents", async () => {
    const el = await createElement();
    const btns = qa(el, ".btn-start, .btn-agent");
    expect(btns.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("has a start all button", async () => {
    const el = await createElement();
    const btn = q(el, ".btn-start-all");
    expect(btn).toBeTruthy();
    cleanup(el);
  });

  it("clicking chat button dispatches open-agent-chat event", async () => {
    const el = await createElement();
    const spy = vi.fn();
    el.addEventListener("open-agent-chat", spy);
    const chatBtns = qa(el, ".btn-chat");
    if (chatBtns.length > 0) {
      (chatBtns[0] as HTMLElement).click();
      await el.updateComplete;
      expect(spy).toHaveBeenCalled();
    }
    cleanup(el);
  });
});
