/**
 * DOM component tests for ChannelsView.
 * Verifies dropdown ordering, status panel, config form, WhatsApp
 * extras, and raw snapshot toggle.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCall = vi.fn();
const mockUpdateConfig = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
const mockOnNotification = vi.fn(() => vi.fn());

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: mockCall,
    state: "connected" as const,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
    onNotification: mockOnNotification,
  },
  updateConfig: mockUpdateConfig,
}));

// Snapshot with Discord (enabled) + Telegram (disabled) + WhatsApp (enabled)
const MOCK_SNAPSHOT = {
  channels: {
    discord: { configured: true, running: true, lastStartAt: Date.now() - 5000, lastProbeAt: Date.now() - 2000 },
    telegram: { configured: false, running: false },
    whatsapp: { configured: true, running: true, connected: true },
  },
  channelMeta: [
    { id: "discord", name: "Discord" },
    { id: "telegram", name: "Telegram" },
    { id: "whatsapp", name: "WhatsApp" },
  ],
  channelOrder: ["discord", "telegram", "whatsapp"],
  channelAccounts: {
    discord: [],
    telegram: [],
    whatsapp: [],
  },
};

const MOCK_CONFIG = {
  channels: {
    discord: { botToken: "tok-123" },
    telegram: {},
    whatsapp: {},
  },
};

const MOCK_SCHEMA = {
  properties: {
    channels: {
      properties: {
        discord: {
          properties: {
            botToken: { type: "string", title: "Bot Token" },
          },
        },
        telegram: {
          properties: {
            token: { type: "string", title: "Token" },
          },
        },
        whatsapp: { properties: {} },
      },
    },
  },
};

const { ChannelsView } = await import("../ui/src/views/channels.js");

type CV = InstanceType<typeof ChannelsView>;

async function createElement(snapshotOverride?: object): Promise<CV> {
  mockCall.mockImplementation(async (method: string) => {
    if (method === "channels.status") return snapshotOverride ?? MOCK_SNAPSHOT;
    if (method === "config.get") return { config: MOCK_CONFIG, baseHash: "abc123" };
    if (method === "config.schema") return { schema: MOCK_SCHEMA };
    return undefined;
  });
  const el = document.createElement("acaclaw-channels") as CV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 80));
  await el.updateComplete;
  return el;
}

function cleanup(el: CV) {
  if (el.parentNode) el.parentNode.removeChild(el);
}

function shadowQ(el: CV, sel: string) {
  return el.shadowRoot!.querySelector(sel);
}
function shadowQA(el: CV, sel: string) {
  return el.shadowRoot!.querySelectorAll(sel);
}

describe("ChannelsView DOM", () => {
  beforeEach(() => {
    mockCall.mockReset();
    mockUpdateConfig.mockReset();
  });

  // ── Heading ────────────────────────────────────────────────────────────

  it("renders page heading", async () => {
    const el = await createElement();
    expect(shadowQ(el, "h1")?.textContent).toMatch(/channel/i);
    cleanup(el);
  });

  // ── Dropdown ───────────────────────────────────────────────────────────

  it("renders a select element", async () => {
    const el = await createElement();
    const select = shadowQ(el, "select.channel-select");
    expect(select).not.toBeNull();
    cleanup(el);
  });

  it("dropdown contains all channels from snapshot", async () => {
    const el = await createElement();
    const options = Array.from(shadowQA(el, "select.channel-select option"));
    const values = options.map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    expect(values).toContain("discord");
    expect(values).toContain("telegram");
    expect(values).toContain("whatsapp");
    cleanup(el);
  });

  it("enabled channels have ● indicator, disabled have ○", async () => {
    const el = await createElement();
    const options = Array.from(shadowQA(el, "select.channel-select option")) as HTMLOptionElement[];
    const discord = options.find((o) => o.value === "discord");
    const telegram = options.find((o) => o.value === "telegram");
    expect(discord?.textContent).toMatch(/●/);
    expect(telegram?.textContent).toMatch(/○/);
    cleanup(el);
  });

  it("enabled channels sort before disabled ones", async () => {
    const el = await createElement();
    const options = Array.from(shadowQA(el, "select.channel-select option")) as HTMLOptionElement[];
    const values = options.map((o) => o.value).filter(Boolean);
    const discordIdx = values.indexOf("discord");
    const telegramIdx = values.indexOf("telegram");
    const whatsappIdx = values.indexOf("whatsapp");
    // enabled: discord, whatsapp before disabled: telegram
    expect(discordIdx).toBeLessThan(telegramIdx);
    expect(whatsappIdx).toBeLessThan(telegramIdx);
    cleanup(el);
  });

  it("auto-selects first enabled channel", async () => {
    const el = await createElement();
    const select = shadowQ(el, "select.channel-select") as HTMLSelectElement;
    // Discord or WhatsApp should be selected (both enabled)
    expect(["discord", "whatsapp"]).toContain(select.value);
    cleanup(el);
  });

  // ── Status panel ───────────────────────────────────────────────────────

  it("renders status panel when a channel is selected", async () => {
    const el = await createElement();
    const panel = shadowQ(el, ".panel");
    expect(panel).not.toBeNull();
    cleanup(el);
  });

  it("status panel shows channel display name", async () => {
    const el = await createElement();
    const panelTitle = shadowQ(el, ".panel-title");
    expect(["Discord", "WhatsApp"]).toContain(panelTitle?.textContent?.trim());
    cleanup(el);
  });

  it("status panel shows Configured status value", async () => {
    const el = await createElement();
    const values = Array.from(shadowQA(el, ".status-value"));
    const texts = values.map((v) => v.textContent?.trim());
    expect(texts.some((t) => t === "Yes" || t === "No" || t === "n/a")).toBe(true);
    cleanup(el);
  });

  it("status panel shows error callout when lastError present", async () => {
    const snapshot = {
      ...MOCK_SNAPSHOT,
      channels: {
        ...MOCK_SNAPSHOT.channels,
        discord: { ...MOCK_SNAPSHOT.channels.discord, lastError: "Bot token invalid" },
      },
    };
    const el = await createElement(snapshot);
    // Manually select discord (it may already be selected)
    const select = shadowQ(el, "select.channel-select") as HTMLSelectElement;
    select.value = "discord";
    select.dispatchEvent(new Event("change"));
    await el.updateComplete;
    const danger = shadowQ(el, ".callout.danger");
    expect(danger?.textContent).toMatch(/Bot token invalid/);
    cleanup(el);
  });

  // ── Config form ────────────────────────────────────────────────────────

  it("renders config form panel", async () => {
    const el = await createElement();
    const panels = Array.from(shadowQA(el, ".panel"));
    expect(panels.length).toBeGreaterThanOrEqual(2); // status + config
    cleanup(el);
  });

  it("config panel shows Save and Reload buttons", async () => {
    const el = await createElement();
    const btns = Array.from(shadowQA(el, ".form-actions button")) as HTMLButtonElement[];
    const labels = btns.map((b) => b.textContent?.trim());
    expect(labels).toContain("Save");
    expect(labels).toContain("Reload");
    cleanup(el);
  });

  it("Save button is disabled when config is not dirty", async () => {
    const el = await createElement();
    const saveBtn = Array.from(shadowQA(el, ".form-actions button"))
      .find((b) => b.textContent?.trim() === "Save") as HTMLButtonElement;
    expect(saveBtn?.disabled).toBe(true);
    cleanup(el);
  });

  it("schema-driven form renders a config field for discord.botToken", async () => {
    const el = await createElement();
    const select = shadowQ(el, "select.channel-select") as HTMLSelectElement;
    select.value = "discord";
    select.dispatchEvent(new Event("change"));
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 30));
    await el.updateComplete;
    const inputs = Array.from(shadowQA(el, ".form-input")) as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    cleanup(el);
  });

  // ── Channel switching ──────────────────────────────────────────────────

  it("changing dropdown selection updates status panel title", async () => {
    const el = await createElement();
    const select = shadowQ(el, "select.channel-select") as HTMLSelectElement;
    select.value = "telegram";
    select.dispatchEvent(new Event("change"));
    await el.updateComplete;
    const panelTitle = shadowQ(el, ".panel-title");
    expect(panelTitle?.textContent?.trim()).toBe("Telegram");
    cleanup(el);
  });

  // ── WhatsApp extras ────────────────────────────────────────────────────

  it("WhatsApp extras not shown when telegram is selected", async () => {
    const el = await createElement();
    const select = shadowQ(el, "select.channel-select") as HTMLSelectElement;
    select.value = "telegram";
    select.dispatchEvent(new Event("change"));
    await el.updateComplete;
    // WhatsApp-specific buttons should not appear
    const btns = Array.from(shadowQA(el, ".btn"))
      .map((b) => b.textContent?.trim());
    expect(btns).not.toContain("Show QR");
    expect(btns).not.toContain("Relink");
    cleanup(el);
  });

  it("WhatsApp extras shown when whatsapp is selected", async () => {
    const el = await createElement();
    const select = shadowQ(el, "select.channel-select") as HTMLSelectElement;
    select.value = "whatsapp";
    select.dispatchEvent(new Event("change"));
    await el.updateComplete;
    const btns = Array.from(shadowQA(el, ".btn"))
      .map((b) => b.textContent?.trim());
    // WhatsApp always shows Show QR / Relink / Wait for scan / Logout / Refresh
    expect(btns).toContain("Show QR");
    expect(btns).toContain("Relink");
    cleanup(el);
  });

  // ── Probe button ───────────────────────────────────────────────────────

  it("renders a Probe button", async () => {
    const el = await createElement();
    const btns = Array.from(shadowQA(el, ".channel-row .btn")) as HTMLButtonElement[];
    expect(btns.some((b) => b.textContent?.trim() === "Probe")).toBe(true);
    cleanup(el);
  });

  it("Probe button calls channels.status with probe:true", async () => {
    const el = await createElement();
    const probeBtn = Array.from(shadowQA(el, ".channel-row .btn"))
      .find((b) => b.textContent?.trim() === "Probe") as HTMLButtonElement;
    probeBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    const probeCalls = mockCall.mock.calls.filter(
      ([method, args]) => method === "channels.status" && args?.probe === true,
    );
    expect(probeCalls.length).toBeGreaterThan(0);
    cleanup(el);
  });

  // ── Raw snapshot ───────────────────────────────────────────────────────

  it("raw snapshot block is collapsed by default", async () => {
    const el = await createElement();
    expect(shadowQ(el, ".code-block")).toBeNull();
    cleanup(el);
  });

  it("clicking raw toggle expands the snapshot block", async () => {
    const el = await createElement();
    const toggle = shadowQ(el, ".raw-toggle") as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    toggle.click();
    await el.updateComplete;
    expect(shadowQ(el, ".code-block")).not.toBeNull();
    cleanup(el);
  });

  it("clicking raw toggle again collapses the snapshot block", async () => {
    const el = await createElement();
    const toggle = shadowQ(el, ".raw-toggle") as HTMLButtonElement;
    toggle.click();
    await el.updateComplete;
    toggle.click();
    await el.updateComplete;
    expect(shadowQ(el, ".code-block")).toBeNull();
    cleanup(el);
  });

  // ── Nav wiring ─────────────────────────────────────────────────────────

  it("acaclaw-channels custom element is registered", () => {
    expect(customElements.get("acaclaw-channels")).toBeDefined();
  });
});

// ── main.ts nav wiring ──────────────────────────────────────────────────────

describe("main.ts channels nav wiring", () => {
  it("acaclaw-channels custom element is defined", () => {
    const el = document.createElement("acaclaw-channels");
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it("API Keys nav label is renamed to API Config in source", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile("ui/src/main.ts", "utf8");
    expect(src).toMatch(/"API Config"/);
    expect(src).not.toMatch(/"API Keys"/);
  });

  it("Channels is embedded as a tab in api-keys view, not a top-level nav item", async () => {
    const { readFile } = await import("fs/promises");
    const [mainSrc, apiKeysSrc] = await Promise.all([
      readFile("ui/src/main.ts", "utf8"),
      readFile("ui/src/views/api-keys.ts", "utf8"),
    ]);
    // Channels must NOT be a top-level nav route
    expect(mainSrc).not.toMatch(/id: "channels"/);
    // But must exist as a tab inside api-keys
    expect(apiKeysSrc).toMatch(/"channels"/);
    expect(apiKeysSrc).toMatch(/<acaclaw-channels>/);
  });

  it("channels tab triggers lazy import of channels.js", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile("ui/src/views/api-keys.ts", "utf8");
    expect(src).toMatch(/import.*channels\.js/);
  });
});
