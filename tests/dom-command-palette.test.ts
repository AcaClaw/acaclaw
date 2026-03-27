/**
 * DOM tests for CommandPalette (command-palette.ts).
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: vi.fn(),
    state: "connected" as const,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
}));

const { CommandPalette } = await import("../ui/src/views/command-palette.js");

type CP = InstanceType<typeof CommandPalette>;

let el: CP;

async function createElement(): Promise<CP> {
  el = document.createElement("acaclaw-command-palette") as CP;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function cleanup() {
  if (el?.parentNode) document.body.removeChild(el);
}
function q(s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe("CommandPalette DOM", () => {
  it("is hidden by default", async () => {
    await createElement();
    const overlay = q(".overlay");
    // Should not render the overlay when closed
    expect(overlay).toBeNull();
  });

  it("opens when Ctrl+K is dispatched", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;
    const overlay = q(".overlay");
    expect(overlay).toBeTruthy();
  });

  it("opens when Meta+K is dispatched", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    await el.updateComplete;
    const overlay = q(".overlay");
    expect(overlay).toBeTruthy();
  });

  it("renders search input when open", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;
    const input = q(".search-input");
    expect(input).toBeTruthy();
  });

  it("renders results list when open", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;
    const results = q(".results");
    expect(results).toBeTruthy();
  });

  it("renders result items (navigation targets)", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;
    const items = qa(".result-item");
    // At minimum there should be several nav items
    expect(items.length).toBeGreaterThan(5);
  });

  it("each result item has a label and description", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;
    const items = qa(".result-item");
    for (const item of Array.from(items)) {
      const label = item.querySelector(".result-label");
      expect(label?.textContent?.trim().length).toBeGreaterThan(0);
      const desc = item.querySelector(".result-desc");
      expect(desc?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("renders Esc keyboard hint", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;
    const kbd = q(".kbd");
    expect(kbd).toBeTruthy();
    expect(kbd!.textContent).toBe("Esc");
  });

  it("renders category labels", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;
    const cats = qa(".category-label");
    expect(cats.length).toBeGreaterThan(0);
  });

  it("closes on Escape key", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;
    expect(q(".overlay")).toBeTruthy();

    // Dispatch Escape on document (where the listener is)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await el.updateComplete;
    expect(q(".overlay")).toBeNull();
  });

  it("filters results when typing in search", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;

    const allItems = qa(".result-item").length;

    const input = q(".search-input") as HTMLInputElement;
    input.value = "chat";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await el.updateComplete;

    const filteredItems = qa(".result-item").length;
    expect(filteredItems).toBeLessThan(allItems);
    expect(filteredItems).toBeGreaterThan(0);
  });

  it("shows empty message when no match", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;

    const input = q(".search-input") as HTMLInputElement;
    input.value = "zzzzzznotacommand";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await el.updateComplete;

    const empty = q(".empty");
    expect(empty).toBeTruthy();
  });

  it("first result is selected by default", async () => {
    await createElement();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await el.updateComplete;

    const selected = q(".result-item.selected");
    expect(selected).toBeTruthy();
  });
});
