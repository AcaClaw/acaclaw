/**
 * Tests for model list filtering and default model configuration.
 * Verifies that:
 * 1. Model dropdown only shows models from configured providers
 * 2. Default model can be selected and saved to config
 * 3. Per-provider model table shows correct models via reverse mapping
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
  updateConfig: async (transform: (cfg: Record<string, unknown>) => Record<string, unknown>) => {
    const cfg = { models: { providers: {} }, auth: { profiles: {} } };
    const updated = transform(structuredClone(cfg));
    return mockCall("config.set:helper", updated);
  },
  setConfigValue: async (path: string[], value: unknown) => {
    return mockCall("config.setPath:helper", path, value);
  },
}));

const { ApiKeysView } = await import("../ui/src/views/api-keys.js");
type AKV = InstanceType<typeof ApiKeysView>;

/* ── Mock data ── */

const MOCK_MODELS = {
  models: [
    { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", provider: "kimi-coding" },
    { id: "k2p5", name: "Kimi K2.5", provider: "kimi-coding" },
    { id: "claude-opus-4.6", name: "Claude Opus 4.6", provider: "anthropic" },
    { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "anthropic" },
    { id: "gpt-5.4", name: "GPT 5.4", provider: "openai" },
    { id: "deepseek-r1", name: "DeepSeek R1", provider: "deepseek" },
    { id: "or-model-1", name: "OR Model 1", provider: "openrouter" },
    { id: "azure-gpt-4o", name: "Azure GPT-4o", provider: "azure-openai-responses" },
    { id: "gemini-2.5", name: "Gemini 2.5", provider: "google-vertex" },
  ],
};

function makeConfig(providers: Record<string, unknown>, defaultModel = "") {
  return {
    config: {
      models: { providers },
      agents: { defaults: { model: defaultModel } },
    },
    hash: "test-hash",
  };
}

async function createWithConfig(
  providers: Record<string, unknown>,
  defaultModel = "",
): Promise<AKV> {
  const cfg = makeConfig(providers, defaultModel);
  mockCall.mockImplementation(async (method: string) => {
    if (method === "config.get") return cfg;
    if (method === "models.list") return MOCK_MODELS;
    return undefined;
  });
  const el = document.createElement("acaclaw-api-keys") as AKV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 60));
  await el.updateComplete;
  return el;
}

function cleanup(el: AKV) { document.body.removeChild(el); }
function q(el: AKV, s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(el: AKV, s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => { vi.clearAllMocks(); });

describe("Model list filtering", () => {
  it("shows only moonshot models when moonshot is configured", async () => {
    const el = await createWithConfig({ moonshot: { apiKey: "sk-test" } });

    // Select moonshot provider
    const view = el as unknown as { _selectedLlmProvider: string };
    view._selectedLlmProvider = "moonshot";
    await el.updateComplete;

    // Check model select options (default model dropdown)
    const options = qa(el, ".model-select option") as NodeListOf<HTMLOptionElement>;
    const values = Array.from(options).map((o) => o.value);

    // Should contain kimi-coding models (mapped to moonshot)
    expect(values).toContain("kimi-coding/kimi-k2-thinking");
    expect(values).toContain("kimi-coding/k2p5");

    // Should NOT contain other providers
    expect(values).not.toContain("anthropic/claude-opus-4.6");
    expect(values).not.toContain("openai/gpt-5.4");

    cleanup(el);
  });

  it("shows only openrouter models when openrouter is configured", async () => {
    const el = await createWithConfig({ openrouter: { apiKey: "sk-or-test" } });

    const view = el as unknown as { _selectedLlmProvider: string };
    view._selectedLlmProvider = "openrouter";
    await el.updateComplete;

    const options = qa(el, ".model-select option") as NodeListOf<HTMLOptionElement>;
    const values = Array.from(options).map((o) => o.value);

    expect(values).toContain("openrouter/or-model-1");
    expect(values).not.toContain("kimi-coding/kimi-k2-thinking");
    expect(values).not.toContain("anthropic/claude-opus-4.6");

    cleanup(el);
  });

  it("shows models from multiple configured providers", async () => {
    const el = await createWithConfig({
      moonshot: { apiKey: "sk-test" },
      anthropic: { apiKey: "sk-ant-test" },
    });

    const options = qa(el, ".model-select option") as NodeListOf<HTMLOptionElement>;
    const values = Array.from(options).map((o) => o.value);

    // Both moonshot (via kimi-coding) and anthropic models
    expect(values).toContain("kimi-coding/kimi-k2-thinking");
    expect(values).toContain("anthropic/claude-opus-4.6");

    // Not unconfigured providers
    expect(values).not.toContain("openai/gpt-5.4");
    expect(values).not.toContain("deepseek/deepseek-r1");

    cleanup(el);
  });

  it("shows empty state when no providers configured", async () => {
    const el = await createWithConfig({});
    const options = qa(el, ".model-select option");
    expect(options.length).toBe(0);
    cleanup(el);
  });

  it("maps azure-openai-responses to azure config provider", async () => {
    const el = await createWithConfig({ azure: { apiKey: "abc123abc123abc123abc123abc" } });

    const options = qa(el, ".model-select option") as NodeListOf<HTMLOptionElement>;
    const values = Array.from(options).map((o) => o.value);

    expect(values).toContain("azure-openai-responses/azure-gpt-4o");
    expect(values).not.toContain("anthropic/claude-opus-4.6");

    cleanup(el);
  });

  it("maps google-vertex to google config provider", async () => {
    const el = await createWithConfig({ google: { apiKey: "AIza-test" } });

    const options = qa(el, ".model-select option") as NodeListOf<HTMLOptionElement>;
    const values = Array.from(options).map((o) => o.value);

    expect(values).toContain("google-vertex/gemini-2.5");

    cleanup(el);
  });
});

describe("Per-provider model table", () => {
  it("shows kimi-coding models in moonshot provider model table", async () => {
    const el = await createWithConfig({ moonshot: { apiKey: "sk-test" } });

    // Select moonshot
    const view = el as unknown as { _selectedLlmProvider: string };
    view._selectedLlmProvider = "moonshot";
    await el.updateComplete;

    // Per-provider model table cells
    const cells = qa(el, ".model-list-table td");
    const text = Array.from(cells).map((c) => c.textContent);

    expect(text).toContain("Kimi K2 Thinking");
    expect(text).toContain("kimi-coding/kimi-k2-thinking");

    cleanup(el);
  });
});

describe("Default model save", () => {
  it("saves selected model to agents.defaults.model via setConfigValue", async () => {
    const el = await createWithConfig(
      { moonshot: { apiKey: "sk-test" } },
      "", // no saved default yet
    );

    const view = el as unknown as {
      _selectedLlmProvider: string;
      _defaultModel: string;
      _saveDefaultModel: () => Promise<void>;
    };
    view._selectedLlmProvider = "moonshot";
    view._defaultModel = "kimi-coding/kimi-k2-thinking";
    await el.updateComplete;

    // Track setConfigValue calls
    const savePathCalls: unknown[][] = [];
    mockCall.mockImplementation(async (method: string, ...args: unknown[]) => {
      if (method === "config.get") return makeConfig({ moonshot: { apiKey: "sk" } });
      if (method === "models.list") return MOCK_MODELS;
      if (method === "config.setPath:helper") {
        savePathCalls.push(args);
        return {};
      }
      return undefined;
    });

    await view._saveDefaultModel();

    expect(savePathCalls.length).toBe(1);
    expect(savePathCalls[0][0]).toEqual(["agents", "defaults", "model"]);
    expect(savePathCalls[0][1]).toBe("kimi-coding/kimi-k2-thinking");

    cleanup(el);
  });

  it("falls back to first model when _defaultModel is empty", async () => {
    const el = await createWithConfig(
      { moonshot: { apiKey: "sk-test" } },
      "",
    );

    const view = el as unknown as {
      _selectedLlmProvider: string;
      _defaultModel: string;
      _saveDefaultModel: () => Promise<void>;
    };
    view._selectedLlmProvider = "moonshot";
    view._defaultModel = ""; // Empty — should fallback
    await el.updateComplete;

    const savePathCalls: unknown[][] = [];
    mockCall.mockImplementation(async (method: string, ...args: unknown[]) => {
      if (method === "config.get") return makeConfig({ moonshot: { apiKey: "sk" } });
      if (method === "models.list") return MOCK_MODELS;
      if (method === "config.setPath:helper") {
        savePathCalls.push(args);
        return {};
      }
      return undefined;
    });

    await view._saveDefaultModel();

    expect(savePathCalls.length).toBe(1);
    // Should save the first available model (kimi-coding/kimi-k2-thinking)
    expect(savePathCalls[0][1]).toBe("kimi-coding/kimi-k2-thinking");

    cleanup(el);
  });

  it("displays saved model after save", async () => {
    const el = await createWithConfig(
      { moonshot: { apiKey: "sk-test" } },
      "kimi-coding/kimi-k2-thinking", // already saved
    );

    await el.updateComplete;

    // Should show the saved model state
    const savedDisplay = q(el, ".saved-model code");
    expect(savedDisplay?.textContent).toBe("kimi-coding/kimi-k2-thinking");

    cleanup(el);
  });
});

describe("Stale provider set after reconnect", () => {
  it("clears configured providers on reload instead of accumulating", async () => {
    // First load: moonshot + anthropic configured
    const el = await createWithConfig({
      moonshot: { apiKey: "sk-test" },
      anthropic: { apiKey: "sk-ant" },
    });

    const view = el as unknown as {
      _configuredLlm: Set<string>;
      _loaded: boolean;
      _loadState: () => Promise<void>;
    };
    expect(view._configuredLlm.has("moonshot")).toBe(true);
    expect(view._configuredLlm.has("anthropic")).toBe(true);

    // Simulate reconnect: reset _loaded, reconfigure with only moonshot
    view._loaded = false;
    const updatedCfg = makeConfig({ moonshot: { apiKey: "sk-test" } });
    mockCall.mockImplementation(async (method: string) => {
      if (method === "config.get") return updatedCfg;
      if (method === "models.list") return MOCK_MODELS;
      return undefined;
    });
    await view._loadState();

    // After reconnect, anthropic should be gone (key was removed)
    expect(view._configuredLlm.has("moonshot")).toBe(true);
    expect(view._configuredLlm.has("anthropic")).toBe(false);

    cleanup(el);
  });

  it("does not show models from removed providers after reconnect", async () => {
    // First load: moonshot + anthropic
    const el = await createWithConfig({
      moonshot: { apiKey: "sk-test" },
      anthropic: { apiKey: "sk-ant" },
    });

    const options1 = qa(el, ".model-select option") as NodeListOf<HTMLOptionElement>;
    const values1 = Array.from(options1).map((o) => o.value);
    expect(values1).toContain("anthropic/claude-opus-4.6");
    expect(values1).toContain("kimi-coding/kimi-k2-thinking");

    // Simulate reconnect: only moonshot remains
    const view = el as unknown as { _loaded: boolean; _loadState: () => Promise<void> };
    view._loaded = false;
    mockCall.mockImplementation(async (method: string) => {
      if (method === "config.get") return makeConfig({ moonshot: { apiKey: "sk-test" } });
      if (method === "models.list") return MOCK_MODELS;
      return undefined;
    });
    await view._loadState();
    await el.updateComplete;

    const options2 = qa(el, ".model-select option") as NodeListOf<HTMLOptionElement>;
    const values2 = Array.from(options2).map((o) => o.value);

    // Anthropic models should be gone
    expect(values2).toContain("kimi-coding/kimi-k2-thinking");
    expect(values2).not.toContain("anthropic/claude-opus-4.6");

    cleanup(el);
  });
});
