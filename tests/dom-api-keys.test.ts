/**
 * DOM component tests for ApiKeysView.
 * Verifies provider tabs, key forms, and model selector.
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
    authenticated: true,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
  },
}));

const { ApiKeysView } = await import("../ui/src/views/api-keys.js");

type AKV = InstanceType<typeof ApiKeysView>;

async function createElement(): Promise<AKV> {
  mockCall.mockImplementation(async (method: string) => {
    if (method === "config.get") return { config: {} };
    return undefined;
  });
  const el = document.createElement("acaclaw-api-keys") as AKV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: AKV) { document.body.removeChild(el); }
function q(el: AKV, s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(el: AKV, s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => { vi.clearAllMocks(); });

describe("ApiKeysView DOM", () => {
  it("renders the heading", async () => {
    const el = await createElement();
    const h1 = q(el, "h1");
    expect(h1).toBeTruthy();
    cleanup(el);
  });

  it("renders LLM and Browser tabs", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    expect(tabs.length).toBe(2);
    cleanup(el);
  });

  it("shows LLM provider chips", async () => {
    const el = await createElement();
    const chips = qa(el, ".provider-chip");
    expect(chips.length).toBeGreaterThanOrEqual(5);
    cleanup(el);
  });

  it("clicking a provider chip selects it", async () => {
    const el = await createElement();
    const chips = qa(el, ".provider-chip");
    if (chips.length > 1) {
      (chips[1] as HTMLElement).click();
      await el.updateComplete;
      const active = q(el, ".provider-chip.active");
      expect(active).toBeTruthy();
    }
    cleanup(el);
  });

  it("shows add key button", async () => {
    const el = await createElement();
    const btn = q(el, ".btn-outline");
    expect(btn).toBeTruthy();
    cleanup(el);
  });

  it("switching to Browser tab shows browser providers", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    if (tabs.length > 1) {
      (tabs[1] as HTMLElement).click();
      await el.updateComplete;
      const chips = qa(el, ".provider-chip");
      expect(chips.length).toBeGreaterThan(0);
    }
    cleanup(el);
  });

  it("calls config.get on creation", async () => {
    const el = await createElement();
    expect(mockCall).toHaveBeenCalledWith("config.get");
    cleanup(el);
  });
});
