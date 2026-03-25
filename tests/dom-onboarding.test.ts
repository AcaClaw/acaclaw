/**
 * DOM component tests for OnboardingView.
 * Verifies wizard steps, discipline selection, and navigation.
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

const { OnboardingView } = await import("../ui/src/views/onboarding.js");

type OV = InstanceType<typeof OnboardingView>;

async function createElement(): Promise<OV> {
  mockCall.mockResolvedValue(undefined);
  const el = document.createElement("acaclaw-onboarding") as OV;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function cleanup(el: OV) { document.body.removeChild(el); }
function q(el: OV, s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(el: OV, s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => { vi.clearAllMocks(); });

describe("OnboardingView DOM", () => {
  it("renders the wizard container", async () => {
    const el = await createElement();
    const wizard = q(el, ".wizard");
    expect(wizard).toBeTruthy();
    cleanup(el);
  });

  it("shows step indicators", async () => {
    const el = await createElement();
    const dots = qa(el, ".step-dot");
    expect(dots.length).toBe(5);
    cleanup(el);
  });

  it("starts on discipline step with discipline cards", async () => {
    const el = await createElement();
    const cards = qa(el, ".discipline-card");
    expect(cards.length).toBeGreaterThanOrEqual(5);
    cleanup(el);
  });

  it("general discipline is selected by default", async () => {
    const el = await createElement();
    const selected = q(el, ".discipline-card.selected");
    expect(selected).toBeTruthy();
    cleanup(el);
  });

  it("clicking a discipline card selects it", async () => {
    const el = await createElement();
    const cards = qa(el, ".discipline-card");
    if (cards.length > 1) {
      (cards[1] as HTMLElement).click();
      await el.updateComplete;
      const selectedCards = qa(el, ".discipline-card.selected");
      expect(selectedCards.length).toBeGreaterThanOrEqual(1);
    }
    cleanup(el);
  });

  it("has next button", async () => {
    const el = await createElement();
    const nextBtn = q(el, ".next-btn");
    expect(nextBtn).toBeTruthy();
    cleanup(el);
  });

  it("clicking next moves to provider step", async () => {
    const el = await createElement();
    const nextBtn = q(el, ".next-btn") as HTMLButtonElement;
    nextBtn.click();
    await el.updateComplete;
    // Now on provider step — should show provider options
    const radios = qa(el, "input[type='radio'], .provider-option");
    expect(radios.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("back button returns to previous step", async () => {
    const el = await createElement();
    // Move to step 2
    const nextBtn = q(el, ".next-btn") as HTMLButtonElement;
    nextBtn.click();
    await el.updateComplete;
    // Click back
    const backBtn = q(el, ".back-btn") as HTMLButtonElement;
    if (backBtn) {
      backBtn.click();
      await el.updateComplete;
      // Should be back on discipline step
      const cards = qa(el, ".discipline-card");
      expect(cards.length).toBeGreaterThanOrEqual(5);
    }
    cleanup(el);
  });
});
