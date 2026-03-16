import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

interface KeyEntry {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  saved: boolean;
}

interface ProviderDef {
  id: string;
  name: string;
  placeholder: string;
  prefix: string;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  providerName: string;
}

const LLM_PROVIDERS: ProviderDef[] = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-api03-...", prefix: "sk-ant-" },
  { id: "openai", name: "OpenAI", placeholder: "sk-...", prefix: "sk-" },
  { id: "google", name: "Google AI", placeholder: "AIza...", prefix: "AIza" },
  { id: "moonshot", name: "Moonshot / Kimi", placeholder: "sk-...", prefix: "sk-" },
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-...", prefix: "sk-or-" },
  { id: "azure", name: "Azure OpenAI", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", prefix: "" },
  { id: "ollama", name: "Ollama (local)", placeholder: "http://localhost:11434", prefix: "" },
  { id: "mistral", name: "Mistral", placeholder: "...", prefix: "" },
  { id: "deepseek", name: "DeepSeek", placeholder: "sk-...", prefix: "sk-" },
];

const BROWSER_PROVIDERS: ProviderDef[] = [
  { id: "brave-search", name: "Brave Search", placeholder: "BSA...", prefix: "BSA" },
  { id: "perplexity", name: "Perplexity", placeholder: "pplx-...", prefix: "pplx-" },
  { id: "serper", name: "Serper", placeholder: "...", prefix: "" },
  { id: "serpapi", name: "SerpAPI", placeholder: "...", prefix: "" },
  { id: "tavily", name: "Tavily", placeholder: "tvly-...", prefix: "tvly-" },
  { id: "google-search", name: "Google Custom Search", placeholder: "AIza...", prefix: "AIza" },
];

let _nextId = 1;
function genId(): string {
  return `key-${_nextId++}`;
}

@customElement("acaclaw-api-keys")
export class ApiKeysView extends LitElement {
  @state() private _tab: "llm" | "browser" = "llm";

  // LLM state
  @state() private _llmProvider = "";
  @state() private _llmKeys: Map<string, KeyEntry[]> = new Map();

  // Browser state
  @state() private _browserProvider = "";
  @state() private _browserKeys: Map<string, KeyEntry[]> = new Map();

  // Default model (provider/model format, e.g. "moonshot/kimi-k2.5")
  @state() private _defaultModel = "";
  @state() private _savedModel = ""; // what's currently persisted
  @state() private _configuredModels: ModelOption[] = [];

  // Feedback
  @state() private _saveMessage = "";

  static override styles = css`
    :host {
      display: block;
    }

    /* ── Page header ── */
    h1 {
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 6px;
      letter-spacing: -0.03em;
      color: var(--ac-text);
    }
    .subtitle {
      font-size: 14px;
      color: var(--ac-text-muted);
      margin-bottom: 28px;
      line-height: 1.5;
    }

    /* ── Tabs ── */
    .tabs {
      display: flex;
      gap: 0;
      margin-bottom: 28px;
      border-bottom: 1px solid var(--ac-border);
    }
    .tab {
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 500;
      color: var(--ac-text-muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      white-space: nowrap;
      transition: all var(--ac-transition-fast);
    }
    .tab:hover {
      color: var(--ac-text-secondary);
    }
    .tab.active {
      color: var(--ac-primary);
      border-bottom-color: var(--ac-primary);
    }
    .tab .count {
      background: var(--ac-primary-bg);
      color: var(--ac-primary);
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: var(--ac-radius-full, 9999px);
      margin-left: 8px;
    }

    /* ── Cards ── */
    .card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 32px;
      margin-bottom: 24px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02), 0 0 0 1px rgba(0,0,0,0.02);
      transition: all var(--ac-transition);
    }
    .card h2 {
      font-size: 16px;
      font-weight: 600;
      color: var(--ac-text);
      margin-bottom: 20px;
      letter-spacing: -0.01em;
    }

    /* ── Provider chips ── */
    .provider-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .provider-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-full, 9999px);
      font-size: 13px;
      font-weight: 450;
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      background: var(--ac-bg-surface);
      color: var(--ac-text-secondary);
      box-shadow: var(--ac-shadow-xs);
    }
    .provider-chip:hover {
      border-color: var(--ac-primary);
      color: var(--ac-primary);
      box-shadow: var(--ac-shadow-sm);
      transform: translateY(-0.5px);
    }
    .provider-chip.active {
      border-color: var(--ac-primary);
      background: var(--ac-primary-bg);
      color: var(--ac-primary);
      font-weight: 600;
      box-shadow: 0 0 0 1px var(--ac-primary), var(--ac-shadow-xs);
    }
    .provider-chip.configured {
      border-color: rgba(5, 150, 105, 0.3);
    }
    .provider-chip.configured.active {
      border-color: var(--ac-primary);
      background: var(--ac-primary-bg);
      box-shadow: 0 0 0 1px var(--ac-primary), var(--ac-shadow-xs);
    }
    .provider-chip .chip-check {
      color: var(--ac-success);
      font-size: 13px;
      font-weight: 700;
    }

    /* ── Configured banner ── */
    .configured-banner {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 20px;
      background: var(--ac-success-bg, #ecfdf5);
      border: 1px solid rgba(5, 150, 105, 0.15);
      border-radius: var(--ac-radius-sm);
      font-size: 14px;
      color: #065f46;
      margin-bottom: 16px;
    }
    .configured-banner .check {
      font-size: 18px;
      margin-top: 1px;
    }
    .configured-banner .detail {
      color: #047857;
      font-size: 12px;
      margin-top: 4px;
      font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
      letter-spacing: 0.02em;
    }

    /* ── Saved model display ── */
    .saved-model {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: var(--ac-success-bg, #ecfdf5);
      border: 1px solid rgba(5, 150, 105, 0.15);
      border-radius: var(--ac-radius-sm);
      font-size: 14px;
      color: #065f46;
    }
    .saved-model code {
      font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
      background: rgba(5, 150, 105, 0.1);
      padding: 3px 10px;
      border-radius: var(--ac-radius-xs, 6px);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.01em;
    }
    .change-link {
      font-size: 13px;
      color: var(--ac-primary);
      cursor: pointer;
      margin-left: auto;
      font-weight: 500;
      transition: color var(--ac-transition-fast);
    }
    .change-link:hover {
      color: var(--ac-primary-dark);
    }

    /* ── Key list ── */
    .key-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .key-entry {
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      padding: 16px 20px;
      background: var(--ac-bg);
      transition: border-color var(--ac-transition-fast);
    }
    .key-entry:focus-within {
      border-color: var(--ac-primary);
      box-shadow: var(--ac-shadow-focus);
    }
    .key-entry.saved {
      border-color: rgba(5, 150, 105, 0.3);
      background: var(--ac-success-bg, #ecfdf5);
    }
    .key-entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .key-label-input {
      padding: 4px 8px;
      border: 1px solid transparent;
      border-radius: var(--ac-radius-xs, 6px);
      font-size: 12px;
      color: var(--ac-text-secondary);
      background: transparent;
      width: 160px;
      transition: all var(--ac-transition-fast);
    }
    .key-label-input:hover {
      border-color: var(--ac-border);
      background: var(--ac-bg-surface);
    }
    .key-label-input:focus {
      outline: none;
      border-color: var(--ac-primary);
      background: var(--ac-bg-surface);
      box-shadow: var(--ac-shadow-focus);
    }
    .key-status {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--ac-text-muted);
      font-weight: 500;
    }
    .key-status.connected {
      color: var(--ac-success);
    }
    .key-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .key-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
      background: var(--ac-bg-surface);
      transition: all var(--ac-transition-fast);
    }
    .key-input:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: var(--ac-shadow-focus);
    }
    .key-input::placeholder {
      color: var(--ac-text-tertiary, #cbd5e1);
    }
    .icon-btn {
      padding: 8px 12px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 14px;
      cursor: pointer;
      line-height: 1;
      transition: all var(--ac-transition-fast);
      box-shadow: var(--ac-shadow-xs);
    }
    .icon-btn:hover {
      background: var(--ac-bg-hover);
      box-shadow: var(--ac-shadow-sm);
    }
    .icon-btn.danger:hover {
      background: var(--ac-error-bg, #fef2f2);
      border-color: var(--ac-error);
      color: var(--ac-error);
    }

    /* ── Buttons ── */
    .btn-row {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      align-items: center;
    }
    .btn {
      padding: 9px 20px;
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      letter-spacing: 0.01em;
    }
    .btn-primary {
      background: var(--ac-primary);
      color: #fff;
      border: none;
      box-shadow: var(--ac-shadow-xs);
    }
    .btn-primary:hover {
      background: var(--ac-primary-dark);
      box-shadow: var(--ac-shadow-sm);
      transform: translateY(-0.5px);
    }
    .btn-primary:active {
      transform: translateY(0);
    }
    .btn-outline {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      color: var(--ac-text-secondary);
      box-shadow: var(--ac-shadow-xs);
    }
    .btn-outline:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-border-strong);
      color: var(--ac-text);
    }

    .save-msg {
      font-size: 13px;
      color: var(--ac-success);
      margin-left: 8px;
      font-weight: 500;
      animation: fadeIn 0.3s ease;
    }

    /* ── Empty state ── */
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--ac-text-muted);
      font-size: 14px;
    }
    .empty-state .icon {
      font-size: 36px;
      margin-bottom: 12px;
      opacity: 0.6;
    }

    /* ── Model selector ── */
    .model-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .model-select {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      background: var(--ac-bg-surface);
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      box-shadow: var(--ac-shadow-xs);
    }
    .model-select:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: var(--ac-shadow-focus);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-2px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    // Wait for gateway to connect before loading keys
    gateway.addEventListener("state-change", () => {
      if (gateway.state === "connected" && gateway.authenticated) {
        this._loadExistingKeys();
      }
    });
    // Try immediately if already connected
    if (gateway.state === "connected" && gateway.authenticated) {
      this._loadExistingKeys();
    }
  }

  private _keysLoaded = false;

  private async _loadExistingKeys() {
    if (this._keysLoaded) return;
    try {
      const snapshot = await gateway.call<Record<string, unknown>>("config.get");
      if (!snapshot) return;
      this._keysLoaded = true;

      // config.get returns ConfigFileSnapshot — the config is in .config
      const cfg =
        (snapshot.config as Record<string, unknown>) ??
        (snapshot as Record<string, unknown>);

      // ── LLM providers: detect from auth.profiles + models.providers ──
      const auth = cfg.auth as Record<string, unknown> | undefined;
      const models = cfg.models as Record<string, unknown> | undefined;

      // Auth profiles tell us which providers are configured
      if (auth?.profiles && typeof auth.profiles === "object") {
        for (const [profileId, profile] of Object.entries(
          auth.profiles as Record<string, Record<string, unknown>>,
        )) {
          if (!profile?.provider) continue;
          const providerName = String(profile.provider).toLowerCase();
          const mapped = this._mapProviderName(providerName);
          if (mapped && !this._llmKeys.has(mapped)) {
            // Profile exists — key is configured (value is in auth-profiles.json, redacted here)
            this._llmKeys.set(mapped, [
              {
                id: genId(),
                label: profileId,
                value: "••••••••••••••••",
                visible: false,
                saved: true,
              },
            ]);
          }
        }
      }

      // Also check models.providers for any with apiKey set
      if (models?.providers && typeof models.providers === "object") {
        for (const [pid, pval] of Object.entries(
          models.providers as Record<string, Record<string, unknown>>,
        )) {
          const providerName = pid.toLowerCase();
          const mapped = this._mapProviderName(providerName);
          if (mapped && !this._llmKeys.has(mapped)) {
            // Provider with model config — may not have key but is known
            const hasKey =
              pval?.apiKey && pval.apiKey !== "__OPENCLAW_REDACTED__";
            if (
              pval?.apiKey === "__OPENCLAW_REDACTED__" ||
              hasKey
            ) {
              this._llmKeys.set(mapped, [
                {
                  id: genId(),
                  label: "Default",
                  value: hasKey ? String(pval.apiKey) : "••••••••••••••••",
                  visible: false,
                  saved: true,
                },
              ]);
            }
          }
        }
      }

      // ── Browser/search keys: detect from tools.web.search ──
      const tools = cfg.tools as Record<string, unknown> | undefined;
      const web = tools?.web as Record<string, unknown> | undefined;
      const search = web?.search as Record<string, unknown> | undefined;

      if (search) {
        const searchProvider = search.provider as string | undefined;
        const searchApiKey = search.apiKey as string | undefined;

        if (searchProvider && searchApiKey) {
          const browserId = this._mapBrowserProvider(searchProvider);
          if (browserId) {
            const isRedacted = searchApiKey === "__OPENCLAW_REDACTED__";
            this._browserKeys.set(browserId, [
              {
                id: genId(),
                label: "Default",
                value: isRedacted ? "••••••••••••••••" : searchApiKey,
                visible: false,
                saved: true,
              },
            ]);
            this._browserProvider = browserId;
          }
        }
      }

      // ── Set default model from config ──
      // ── Build model list from configured providers ──
      const configuredModels: ModelOption[] = [];
      if (models?.providers && typeof models.providers === "object") {
        for (const [pid, pval] of Object.entries(
          models.providers as Record<string, Record<string, unknown>>,
        )) {
          const providerModels = pval?.models as Array<Record<string, unknown>> | undefined;
          const providerName = LLM_PROVIDERS.find((p) => p.id === this._mapProviderName(pid))?.name ?? pid;
          if (providerModels && Array.isArray(providerModels)) {
            for (const m of providerModels) {
              const mid = m.id as string;
              const mname = (m.name as string) ?? mid;
              if (mid) {
                configuredModels.push({
                  id: `${pid}/${mid}`,
                  name: mname,
                  provider: pid,
                  providerName,
                });
              }
            }
          }
        }
      }
      this._configuredModels = configuredModels;

      // ── Read default model from config ──
      const agents = cfg.agents as Record<string, unknown> | undefined;
      const defaults = agents?.defaults as Record<string, unknown> | undefined;
      const modelCfg = defaults?.model;
      if (typeof modelCfg === "string" && modelCfg) {
        this._defaultModel = modelCfg;
      } else if (modelCfg && typeof modelCfg === "object") {
        const primary = (modelCfg as Record<string, unknown>).primary as string | undefined;
        if (primary) this._defaultModel = primary;
      }

      // Auto-select first configured model if no default is set
      if (!this._defaultModel && configuredModels.length > 0) {
        this._defaultModel = configuredModels[0].id;
      }
      this._savedModel = this._defaultModel;

      // Auto-select the first configured provider (not alphabetical default)
      const firstLlm = this._sortedProviders(LLM_PROVIDERS, this._llmKeys)[0];
      if (firstLlm) this._llmProvider = firstLlm.id;
      const firstBrowser = this._sortedProviders(BROWSER_PROVIDERS, this._browserKeys)[0];
      if (firstBrowser) this._browserProvider = firstBrowser.id;

      this.requestUpdate();
    } catch {
      // Gateway not available — keys can still be entered manually
    }
  }

  private _mapProviderName(name: string): string | undefined {
    const map: Record<string, string> = {
      anthropic: "anthropic",
      openai: "openai",
      google: "google",
      "google-ai": "google",
      moonshot: "moonshot",
      kimi: "moonshot",
      openrouter: "openrouter",
      azure: "azure",
      "azure-openai": "azure",
      ollama: "ollama",
      mistral: "mistral",
      deepseek: "deepseek",
    };
    return map[name.toLowerCase()];
  }

  private _mapBrowserProvider(name: string): string | undefined {
    const map: Record<string, string> = {
      brave: "brave-search",
      "brave-search": "brave-search",
      perplexity: "perplexity",
      serper: "serper",
      serpapi: "serpapi",
      tavily: "tavily",
      google: "google-search",
      "google-search": "google-search",
    };
    return map[name.toLowerCase()];
  }

  override render() {
    const llmCount = this._countActiveKeys(this._llmKeys);
    const browserCount = this._countActiveKeys(this._browserKeys);

    return html`
      <h1>API Keys</h1>
      <p class="subtitle">Manage your LLM and search provider keys. Stored locally on your machine.</p>

      <div class="tabs">
        <div
          class="tab ${this._tab === "llm" ? "active" : ""}"
          @click=${() => (this._tab = "llm")}
        >
          LLM Providers
          ${llmCount > 0 ? html`<span class="count">${llmCount}</span>` : ""}
        </div>
        <div
          class="tab ${this._tab === "browser" ? "active" : ""}"
          @click=${() => (this._tab = "browser")}
        >
          Browser / Search
          ${browserCount > 0 ? html`<span class="count">${browserCount}</span>` : ""}
        </div>
      </div>

      ${this._tab === "llm" ? this._renderLlmTab() : this._renderBrowserTab()}
    `;
  }

  /** Return providers sorted: configured first, then unconfigured. */
  private _sortedProviders(list: ProviderDef[], keys: Map<string, KeyEntry[]>): ProviderDef[] {
    const configured = list.filter((p) => keys.has(p.id));
    const unconfigured = list.filter((p) => !keys.has(p.id));
    return [...configured, ...unconfigured];
  }

  @state() private _changingModel = false;

  /* ── LLM tab ── */
  private _renderLlmTab() {
    const sorted = this._sortedProviders(LLM_PROVIDERS, this._llmKeys);
    const provider = sorted.find((p) => p.id === this._llmProvider) ?? sorted[0];
    if (!this._llmProvider && provider) this._llmProvider = provider.id;
    const keys = this._llmKeys.get(this._llmProvider) ?? [];
    const allSaved = keys.length > 0 && keys.every((k) => k.saved);
    const hasUnsaved = keys.some((k) => !k.saved);
    const modelChanged = this._defaultModel !== this._savedModel;

    return html`
      <div class="card">
        <h2>Provider</h2>
        <div class="provider-chips">
          ${sorted.map(
            (p) => html`
              <div
                class="provider-chip ${p.id === this._llmProvider ? "active" : ""} ${this._llmKeys.has(p.id) ? "configured" : ""}"
                @click=${() => (this._llmProvider = p.id)}
              >
                ${this._llmKeys.has(p.id) ? html`<span class="chip-check">✓</span>` : ""}
                ${p.name}
              </div>
            `,
          )}
        </div>
      </div>

      <div class="card">
        <h2>${provider.name} — API Keys</h2>

        ${allSaved
          ? html`
              <div class="configured-banner">
                <span class="check">✅</span>
                <div>
                  <div>${provider.name} is configured and ready to use.</div>
                  <div class="detail">Key: ${keys[0]?.value?.startsWith("••") ? keys[0].value : "••••••••" + (keys[0]?.value?.slice(-4) ?? "")}</div>
                </div>
              </div>
            `
          : ""}

        ${keys.length === 0
          ? html`
              <div class="empty-state">
                <div class="icon">🔐</div>
                <div>No API keys configured for ${provider.name}.</div>
                <div style="margin-top: 4px">Click "Add Key" below to get started.</div>
              </div>
            `
          : !allSaved
            ? html`
                <div class="key-list">
                  ${keys.map((k) => this._renderKeyEntry(k, this._llmProvider, "llm"))}
                </div>
              `
            : ""}

        <div class="btn-row">
          ${!allSaved
            ? html`
                <button
                  class="btn btn-outline"
                  @click=${() => this._addKey(this._llmProvider, "llm", provider.placeholder)}
                >
                  + Add Key
                </button>
              `
            : ""}
          ${hasUnsaved
            ? html`<button class="btn btn-primary" @click=${() => this._saveKeys("llm")}>Save</button>`
            : ""}
          ${allSaved
            ? html`<button class="btn btn-outline" @click=${() => this._addKey(this._llmProvider, "llm", provider.placeholder)}>+ Add Another Key</button>`
            : ""}
          ${this._saveMessage ? html`<span class="save-msg">${this._saveMessage}</span>` : ""}
        </div>
      </div>

      <!-- Default model -->
      <div class="card">
        <h2>Default Model</h2>
        ${this._configuredModels.length > 0
          ? this._savedModel && !this._changingModel
            ? html`
                <div class="saved-model">
                  <span>✅</span>
                  <div>Using <code>${this._savedModel}</code></div>
                  <span class="change-link" @click=${() => (this._changingModel = true)}>Change</span>
                </div>
              `
            : html`
                <div class="model-row">
                  <label style="font-size: 13px; color: var(--ac-text-secondary)">Model</label>
                  <select
                    class="model-select"
                    .value=${this._defaultModel}
                    @change=${(e: Event) => (this._defaultModel = (e.target as HTMLSelectElement).value)}
                  >
                    ${this._renderModelOptions()}
                  </select>
                </div>
                <div class="btn-row" style="margin-top: 12px">
                  ${modelChanged || !this._savedModel
                    ? html`<button class="btn btn-primary" @click=${() => this._saveDefaultModel()}>Save Model</button>`
                    : html`<button class="btn btn-outline" @click=${() => (this._changingModel = false)}>Cancel</button>`}
                  ${this._saveMessage ? html`<span class="save-msg">${this._saveMessage}</span>` : ""}
                </div>
              `
          : html`
              <div class="empty-state">
                <div class="icon">🤖</div>
                <div>Configure an LLM provider above to select a default model.</div>
              </div>
            `}
      </div>
    `;
  }

  /* ── Browser tab ── */
  private _renderBrowserTab() {
    const sorted = this._sortedProviders(BROWSER_PROVIDERS, this._browserKeys);
    const provider = sorted.find((p) => p.id === this._browserProvider) ?? sorted[0];
    if (!this._browserProvider && provider) this._browserProvider = provider.id;
    const keys = this._browserKeys.get(this._browserProvider) ?? [];
    const allSaved = keys.length > 0 && keys.every((k) => k.saved);
    const hasUnsaved = keys.some((k) => !k.saved);

    return html`
      <div class="card">
        <h2>Search Provider</h2>
        <div class="provider-chips">
          ${sorted.map(
            (p) => html`
              <div
                class="provider-chip ${p.id === this._browserProvider ? "active" : ""} ${this._browserKeys.has(p.id) ? "configured" : ""}"
                @click=${() => (this._browserProvider = p.id)}
              >
                ${this._browserKeys.has(p.id) ? html`<span class="chip-check">✓</span>` : ""}
                ${p.name}
              </div>
            `,
          )}
        </div>
      </div>

      <div class="card">
        <h2>${provider.name} — API Keys</h2>

        ${allSaved
          ? html`
              <div class="configured-banner">
                <span class="check">✅</span>
                <div>
                  <div>${provider.name} is configured and ready to use.</div>
                  <div class="detail">Key: ${keys[0]?.value?.startsWith("••") ? keys[0].value : "••••••••" + (keys[0]?.value?.slice(-4) ?? "")}</div>
                </div>
              </div>
            `
          : ""}

        ${keys.length === 0
          ? html`
              <div class="empty-state">
                <div class="icon">🌐</div>
                <div>No API keys configured for ${provider.name}.</div>
                <div style="margin-top: 4px">Click "Add Key" below to get started.</div>
              </div>
            `
          : !allSaved
            ? html`
                <div class="key-list">
                  ${keys.map((k) => this._renderKeyEntry(k, this._browserProvider, "browser"))}
                </div>
              `
            : ""}

        <div class="btn-row">
          ${!allSaved
            ? html`
                <button
                  class="btn btn-outline"
                  @click=${() => this._addKey(this._browserProvider, "browser", provider.placeholder)}
                >
                  + Add Key
                </button>
              `
            : ""}
          ${hasUnsaved
            ? html`<button class="btn btn-primary" @click=${() => this._saveKeys("browser")}>Save</button>`
            : ""}
          ${allSaved
            ? html`<button class="btn btn-outline" @click=${() => this._addKey(this._browserProvider, "browser", provider.placeholder)}>+ Add Another Key</button>`
            : ""}
          ${this._saveMessage ? html`<span class="save-msg">${this._saveMessage}</span>` : ""}
        </div>
      </div>
    `;
  }

  /* ── Shared key entry card ── */
  private _renderKeyEntry(
    entry: KeyEntry,
    providerId: string,
    category: "llm" | "browser",
  ) {
    return html`
      <div class="key-entry ${entry.saved ? "saved" : ""}">
        <div class="key-entry-header">
          <input
            class="key-label-input"
            type="text"
            placeholder="Label (optional)"
            .value=${entry.label}
            @input=${(e: Event) => {
              entry.label = (e.target as HTMLInputElement).value;
              this.requestUpdate();
            }}
          />
          <span class="key-status ${entry.saved ? "connected" : ""}">
            ${entry.saved ? "● Saved" : "○ Unsaved"}
          </span>
        </div>
        <div class="key-row">
          <input
            class="key-input"
            type="${entry.visible ? "text" : "password"}"
            placeholder=${this._getPlaceholder(providerId, category)}
            .value=${entry.value}
            @input=${(e: Event) => {
              entry.value = (e.target as HTMLInputElement).value;
              entry.saved = false;
              this.requestUpdate();
            }}
          />
          <button
            class="icon-btn"
            title="${entry.visible ? "Hide" : "Show"}"
            @click=${() => {
              entry.visible = !entry.visible;
              this.requestUpdate();
            }}
          >
            ${entry.visible ? "🙈" : "👁"}
          </button>
          <button
            class="icon-btn danger"
            title="Remove"
            @click=${() => this._removeKey(providerId, category, entry.id)}
          >
            ✕
          </button>
        </div>
      </div>
    `;
  }

  /* ── Helpers ── */
  private _getPlaceholder(providerId: string, category: "llm" | "browser"): string {
    const list = category === "llm" ? LLM_PROVIDERS : BROWSER_PROVIDERS;
    return list.find((p) => p.id === providerId)?.placeholder ?? "...";
  }

  private _addKey(providerId: string, category: "llm" | "browser", _placeholder: string) {
    const map = category === "llm" ? this._llmKeys : this._browserKeys;
    const existing = map.get(providerId) ?? [];
    existing.push({
      id: genId(),
      label: existing.length === 0 ? "Default" : `Key ${existing.length + 1}`,
      value: "",
      visible: true,
      saved: false,
    });
    map.set(providerId, existing);
    this.requestUpdate();
  }

  private _removeKey(providerId: string, category: "llm" | "browser", keyId: string) {
    const map = category === "llm" ? this._llmKeys : this._browserKeys;
    const existing = map.get(providerId);
    if (!existing) return;
    const filtered = existing.filter((k) => k.id !== keyId);
    if (filtered.length === 0) {
      map.delete(providerId);
    } else {
      map.set(providerId, filtered);
    }
    this.requestUpdate();
  }

  private _countActiveKeys(map: Map<string, KeyEntry[]>): number {
    let count = 0;
    for (const entries of map.values()) {
      count += entries.filter((k) => k.value.length > 0).length;
    }
    return count;
  }

  private _renderModelOptions() {
    // Group models by provider
    const groups = new Map<string, ModelOption[]>();
    for (const m of this._configuredModels) {
      const list = groups.get(m.providerName) ?? [];
      list.push(m);
      groups.set(m.providerName, list);
    }
    return Array.from(groups.entries()).map(
      ([providerName, models]) => html`
        <optgroup label=${providerName}>
          ${models.map(
            (m) => html`<option value=${m.id} ?selected=${m.id === this._defaultModel}>${m.name}</option>`,
          )}
        </optgroup>
      `,
    );
  }

  private async _saveDefaultModel() {
    try {
      const snapshot = await gateway.call<Record<string, unknown>>("config.get");
      if (!snapshot) throw new Error("Could not load config");

      const baseHash = snapshot.hash as string | undefined;
      const cfg = snapshot.config as Record<string, unknown> | undefined;
      if (!cfg) throw new Error("Config not available");

      // Deep clone to avoid mutating the original
      const config = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;

      // Ensure agents.defaults path exists
      if (!config.agents) config.agents = {};
      const agents = config.agents as Record<string, unknown>;
      if (!agents.defaults) agents.defaults = {};
      const defaults = agents.defaults as Record<string, unknown>;

      defaults.model = this._defaultModel;

      await gateway.call("config.set", { raw: JSON.stringify(config, null, 2), baseHash });
      this._savedModel = this._defaultModel;
      this._changingModel = false;
      this._saveMessage = "✓ Default model saved";
      setTimeout(() => (this._saveMessage = ""), 3000);
    } catch (err) {
      this._saveMessage = `✗ ${err instanceof Error ? err.message : err}`;
    }
  }

  private async _saveKeys(category: "llm" | "browser") {
    const map = category === "llm" ? this._llmKeys : this._browserKeys;

    try {
      // Get current config
      const snapshot = await gateway.call<Record<string, unknown>>("config.get");
      if (!snapshot) throw new Error("Could not load config");

      const baseHash = snapshot.hash as string | undefined;
      const cfgObj = snapshot.config as Record<string, unknown> | undefined;
      if (!cfgObj) throw new Error("Config not available");

      const config = JSON.parse(JSON.stringify(cfgObj)) as Record<string, unknown>;

      if (category === "llm") {
        // Update auth profiles with new keys
        const auth = (config.auth ?? {}) as Record<string, unknown>;
        const profiles = (auth.profiles ?? {}) as Record<string, unknown>;

        for (const [providerId, keys] of map.entries()) {
          const primaryKey = keys[0]?.value;
          if (!primaryKey || primaryKey === "••••••••••••••••") continue;

          const profileId = `${providerId}:default`;
          profiles[profileId] = {
            provider: providerId,
            mode: "api_key",
          };
        }

        auth.profiles = profiles;
        config.auth = auth;
      } else {
        // Update browser search config
        const tools = (config.tools ?? {}) as Record<string, unknown>;
        const web = (tools.web ?? {}) as Record<string, unknown>;
        const search = (web.search ?? {}) as Record<string, unknown>;

        // Use the first browser provider that has a key
        for (const [providerId, keys] of map.entries()) {
          const primaryKey = keys[0]?.value;
          if (!primaryKey || primaryKey === "••••••••••••••••") continue;

          const providerName = providerId === "brave-search" ? "brave" : providerId;
          search.provider = providerName;
          search.apiKey = primaryKey;
          search.enabled = true;
          break;
        }

        web.search = search;
        tools.web = web;
        config.tools = tools;
      }

      // Save via config.set (takes {raw: string, baseHash: string})
      await gateway.call("config.set", { raw: JSON.stringify(config, null, 2), baseHash });

      // Mark saved
      for (const keys of map.values()) {
        for (const k of keys) {
          if (k.value.length > 0) k.saved = true;
        }
      }

      this._saveMessage = "✓ Keys saved";
      this.requestUpdate();
      setTimeout(() => {
        this._saveMessage = "";
        this.requestUpdate();
      }, 3000);
    } catch {
      this._saveMessage = "⚠ Save failed — is the gateway running?";
      this.requestUpdate();
      setTimeout(() => {
        this._saveMessage = "";
        this.requestUpdate();
      }, 4000);
    }
  }
}
