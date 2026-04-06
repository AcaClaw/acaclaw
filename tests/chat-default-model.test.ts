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

function mockConfig(providers: Record<string, unknown>, defaultModel = "", env?: Record<string, string>) {
  return {
    config: {
      models: { providers },
      agents: { defaults: { model: defaultModel } },
      ...(env ? { env } : {}),
    },
    hash: "h",
  };
}

function setupMocks(providers: Record<string, unknown>, defaultModel = "", env?: Record<string, string>) {
  const cfg = mockConfig(providers, defaultModel, env);
  mockCall.mockImplementation(async (method: string) => {
    if (method === "config.get") return cfg;
    if (method === "models.list") return { models: MOCK_MODELS };
    if (method === "chat.history") return { messages: [] };
    if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
    if (method === "acaclaw.env.list") return { environments: [] };
    return undefined;
  });
}

async function createChat(providers: Record<string, unknown>, defaultModel = "", env?: Record<string, string>): Promise<CV> {
  localStorage.removeItem("acaclaw-staff-customizations");
  localStorage.removeItem("acaclaw-staff-added");
  setupMocks(providers, defaultModel, env);
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

  it("detects providers from env vars (env-only approach)", async () => {
    // No models.providers entry — only config.env.MOONSHOT_API_KEY
    const el = await createChat(
      {},
      "",
      { MOONSHOT_API_KEY: "sk-env-test" },
    );

    const view = el as unknown as {
      _availableModels: Array<{ value: string; label: string }>;
    };
    const values = view._availableModels.map((m) => m.value);

    // kimi-coding maps to moonshot → detected via env var
    expect(values).toContain("kimi-coding/kimi-k2-thinking");
    expect(values).toContain("kimi-coding/k2p5");

    // Other providers still excluded
    expect(values).not.toContain("anthropic/claude-opus-4.6");

    cleanup(el);
  });

  it("combines models.providers and env var detection", async () => {
    const el = await createChat(
      { anthropic: { apiKey: "sk-ant" } },
      "",
      { MOONSHOT_API_KEY: "sk-env-test" },
    );

    const view = el as unknown as {
      _availableModels: Array<{ value: string; label: string }>;
    };
    const values = view._availableModels.map((m) => m.value);

    // Both providers should be available
    expect(values).toContain("kimi-coding/kimi-k2-thinking");
    expect(values).toContain("anthropic/claude-opus-4.6");

    // Unconfigured providers excluded
    expect(values).not.toContain("openai/gpt-5.4");

    cleanup(el);
  });

  it("env-var provider sets correct default model", async () => {
    const el = await createChat(
      {},
      "kimi-coding/kimi-k2-thinking",
      { MOONSHOT_API_KEY: "sk-env-test" },
    );

    const view = el as unknown as { _defaultModelDisplay: string };
    expect(view._defaultModelDisplay).toBe("Kimi K2 Thinking · kimi-coding");

    cleanup(el);
  });
});

describe("Chat default model sync", () => {
  it("updates default model when default-model-changed event fires", async () => {
    // Start with kimi-coding as default
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" }, anthropic: { apiKey: "sk-ant" } },
      "kimi-coding/kimi-k2-thinking",
    );

    const view = el as unknown as { _defaultModelDisplay: string };
    expect(view._defaultModelDisplay).toBe("Kimi K2 Thinking · kimi-coding");

    // Simulate API Keys view saving a new default model
    // Update the mock to return new default before dispatching event
    const newCfg = mockConfig(
      { moonshot: { apiKey: "sk-test" }, anthropic: { apiKey: "sk-ant" } },
      "anthropic/claude-opus-4.6",
    );
    mockCall.mockImplementation(async (method: string) => {
      if (method === "config.get") return newCfg;
      if (method === "models.list") return { models: MOCK_MODELS };
      if (method === "chat.history") return { messages: [] };
      if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
      if (method === "acaclaw.env.list") return { environments: [] };
      return undefined;
    });

    // Dispatch the event that api-keys.ts now fires
    window.dispatchEvent(new CustomEvent("default-model-changed", {
      detail: { model: "anthropic/claude-opus-4.6" },
    }));

    // Wait for the chat to re-load models
    await new Promise((r) => setTimeout(r, 80));
    await el.updateComplete;

    expect(view._defaultModelDisplay).toBe("Claude Opus 4.6 · anthropic");

    cleanup(el);
  });

  it("cleans up default-model-changed listener on disconnect", async () => {
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" } },
      "kimi-coding/kimi-k2-thinking",
    );

    const view = el as unknown as { _handleDefaultModelChanged: EventListener | null };
    expect(view._handleDefaultModelChanged).not.toBeNull();

    cleanup(el);

    expect(view._handleDefaultModelChanged).toBeNull();
  });
});

describe("Chat thinking toggle", () => {
  it("defaults to empty (server default) thinking level", async () => {
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" } },
      "kimi-coding/kimi-k2-thinking",
    );

    const view = el as unknown as { _thinkingLevel: string };
    expect(view._thinkingLevel).toBe("");

    cleanup(el);
  });

  it("sends thinking parameter in chat.send when set", async () => {
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" } },
      "kimi-coding/kimi-k2-thinking",
    );

    const view = el as unknown as {
      _thinkingLevel: string;
      _tabs: Array<{
        agentId: string;
        input: string;
        sending: boolean;
        messages: unknown[];
        activeRunId: string;
        agent: { name: string };
        sessionId?: string;
      }>;
      _send: () => Promise<void>;
    };

    // Set thinking to "off"
    view._thinkingLevel = "off";

    // Set input text and prepare mock for chat.send
    const tab = view._tabs[0];
    if (tab) {
      tab.input = "test message";
      mockCall.mockImplementation(async (method: string, params?: unknown) => {
        if (method === "chat.send") {
          const p = params as Record<string, unknown>;
          // Verify thinking parameter is included
          expect(p.thinking).toBe("off");
          return { runId: "test-run-1" };
        }
        if (method === "config.get") return mockConfig({ moonshot: { apiKey: "sk-test" } }, "kimi-coding/kimi-k2-thinking");
        if (method === "models.list") return { models: MOCK_MODELS };
        if (method === "chat.history") return { messages: [] };
        if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
        if (method === "acaclaw.env.list") return { environments: [] };
        return undefined;
      });

      await view._send();
    }

    // Verify chat.send was called with thinking parameter
    const chatCalls = mockCall.mock.calls.filter((c: unknown[]) => c[0] === "chat.send");
    expect(chatCalls.length).toBe(1);
    expect((chatCalls[0][1] as Record<string, unknown>).thinking).toBe("off");

    cleanup(el);
  });

  it("omits thinking parameter when set to empty (default)", async () => {
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" } },
      "kimi-coding/kimi-k2-thinking",
    );

    const view = el as unknown as {
      _thinkingLevel: string;
      _tabs: Array<{
        agentId: string;
        input: string;
        sending: boolean;
        messages: unknown[];
        activeRunId: string;
        agent: { name: string };
        sessionId?: string;
      }>;
      _send: () => Promise<void>;
    };

    // Leave thinking as default (empty)
    view._thinkingLevel = "";

    const tab = view._tabs[0];
    if (tab) {
      tab.input = "test message";
      mockCall.mockImplementation(async (method: string) => {
        if (method === "chat.send") return { runId: "test-run-2" };
        if (method === "config.get") return mockConfig({ moonshot: { apiKey: "sk-test" } }, "kimi-coding/kimi-k2-thinking");
        if (method === "models.list") return { models: MOCK_MODELS };
        if (method === "chat.history") return { messages: [] };
        if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
        if (method === "acaclaw.env.list") return { environments: [] };
        return undefined;
      });

      await view._send();
    }

    const chatCalls = mockCall.mock.calls.filter((c: unknown[]) => c[0] === "chat.send");
    expect(chatCalls.length).toBe(1);
    // Thinking param should NOT be in the call
    expect((chatCalls[0][1] as Record<string, unknown>)).not.toHaveProperty("thinking");

    cleanup(el);
  });

  it("resets thinking level when switching tabs", async () => {
    const el = await createChat(
      { moonshot: { apiKey: "sk-test" } },
      "kimi-coding/kimi-k2-thinking",
    );

    const view = el as unknown as {
      _thinkingLevel: string;
      _switchTab: (id: string) => void;
    };

    // Set thinking level
    view._thinkingLevel = "high";
    expect(view._thinkingLevel).toBe("high");

    // Switch tab — should reset
    view._switchTab("general");
    expect(view._thinkingLevel).toBe("");

    cleanup(el);
  });
});
