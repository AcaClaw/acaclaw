/**
 * Tests for chat view respecting the default model configuration.
 * Verifies that:
 * 1. Chat reads default model from config (agents.defaults.model)
 * 2. Chat filters available models to configured providers only
 * 3. Chat displays the correct default model name
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCall = vi.fn();
const mockOnNotification = vi.fn().mockReturnValue(() => {});

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: (...args: unknown[]) => mockCall(...args),
    state: "connected" as const,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onNotification: (...args: unknown[]) => mockOnNotification(...args),
  },
}));

const { ChatView } = await import("../ui/src/views/chat.js");
type CV = InstanceType<typeof ChatView>;

/* ── Mock data ── */

const MOCK_MODELS = [
  { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", provider: "kimi-coding" },
  { id: "k2p5", name: "Kimi K2.5", provider: "kimi-coding" },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", provider: "anthropic" },
  { id: "gpt-5.4", name: "GPT 5.4", provider: "openai" },
  { id: "or-claude", name: "OR Claude", provider: "openrouter" },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "deepseek" },
];

function mockConfig(providers: Record<string, unknown>, defaultModel = "") {
  return {
    config: {
      models: { providers },
      agents: { defaults: { model: defaultModel } },
    },
    hash: "h",
  };
}

function setupMocks(providers: Record<string, unknown>, defaultModel = "") {
  const cfg = mockConfig(providers, defaultModel);
  mockCall.mockImplementation(async (method: string) => {
    if (method === "config.get") return cfg;
    if (method === "models.list") return { models: MOCK_MODELS };
    if (method === "chat.history") return { messages: [] };
    if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
    if (method === "acaclaw.env.list") return { environments: [] };
    return undefined;
  });
}

async function createChat(providers: Record<string, unknown>, defaultModel = ""): Promise<CV> {
  localStorage.removeItem("acaclaw-staff-customizations");
  localStorage.removeItem("acaclaw-staff-added");
  setupMocks(providers, defaultModel);
  const el = document.createElement("acaclaw-chat") as CV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 80));
  await el.updateComplete;
  return el;
}

function cleanup(el: CV) { document.body.removeChild(el); }

beforeEach(() => {
  mockCall.mockReset();
  mockOnNotification.mockReset();
  mockOnNotification.mockReturnValue(() => {});
});

describe("Chat default model", () => {
  it("reads default model from config (agents.defaults.model)", async () => {
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" } },
      "kimi-coding/kimi-k2-thinking",
    );

    const view = el as unknown as { _defaultModelDisplay: string };
    expect(view._defaultModelDisplay).toContain("Kimi K2 Thinking");

    cleanup(el);
  });

  it("shows fallback when default model is empty", async () => {
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" } },
      "", // no default set
    );

    const view = el as unknown as { _defaultModelDisplay: string };
    // Should fall back to first available model
    expect(view._defaultModelDisplay).toContain("Kimi K2 Thinking");

    cleanup(el);
  });

  it("shows saved default model with provider label", async () => {
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" } },
      "kimi-coding/kimi-k2-thinking",
    );

    const view = el as unknown as { _defaultModelDisplay: string };
    expect(view._defaultModelDisplay).toBe("Kimi K2 Thinking · kimi-coding");

    cleanup(el);
  });
});

describe("Chat model filtering", () => {
  it("filters models to only configured providers", async () => {
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" } },
      "",
    );

    const view = el as unknown as {
      _availableModels: Array<{ value: string; label: string }>;
    };

    const values = view._availableModels.map((m) => m.value);

    // kimi-coding maps to moonshot (configured)
    expect(values).toContain("kimi-coding/kimi-k2-thinking");
    expect(values).toContain("kimi-coding/k2p5");

    // Other providers not configured
    expect(values).not.toContain("anthropic/claude-opus-4.6");
    expect(values).not.toContain("openai/gpt-5.4");
    expect(values).not.toContain("openrouter/or-claude");

    cleanup(el);
  });

  it("shows models from multiple configured providers", async () => {
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" }, anthropic: { apiKey: "sk-ant" } },
      "",
    );

    const view = el as unknown as {
      _availableModels: Array<{ value: string; label: string }>;
    };
    const values = view._availableModels.map((m) => m.value);

    expect(values).toContain("kimi-coding/kimi-k2-thinking");
    expect(values).toContain("anthropic/claude-opus-4.6");
    expect(values).not.toContain("openai/gpt-5.4");

    cleanup(el);
  });

  it("returns empty when no providers configured", async () => {
    const el = await createChat({}, "");

    const view = el as unknown as {
      _availableModels: Array<{ value: string; label: string }>;
    };
    expect(view._availableModels.length).toBe(0);

    cleanup(el);
  });
});
