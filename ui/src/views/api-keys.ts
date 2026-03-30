import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway, patchConfig } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";

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
  baseUrl?: string;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  providerName: string;
}

const LLM_PROVIDERS: ProviderDef[] = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-api03-...", prefix: "sk-ant-", baseUrl: "https://api.anthropic.com" },
  { id: "openai", name: "OpenAI", placeholder: "sk-...", prefix: "sk-", baseUrl: "https://api.openai.com/v1" },
  { id: "google", name: "Google AI", placeholder: "AIza...", prefix: "AIza", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "moonshot", name: "Moonshot / Kimi", placeholder: "sk-...", prefix: "sk-", baseUrl: "https://api.moonshot.ai/v1" },
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-...", prefix: "sk-or-", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "azure", name: "Azure OpenAI", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", prefix: "" },
  { id: "ollama", name: "Ollama (local)", placeholder: "http://localhost:11434", prefix: "", baseUrl: "http://localhost:11434" },
  { id: "mistral", name: "Mistral", placeholder: "...", prefix: "", baseUrl: "https://api.mistral.ai/v1" },
  { id: "deepseek", name: "DeepSeek", placeholder: "sk-...", prefix: "sk-", baseUrl: "https://api.deepseek.com" },
];

const BROWSER_PROVIDERS: ProviderDef[] = [
  { id: "brave-search", name: "Brave Search", placeholder: "BSA...", prefix: "BSA" },
  { id: "gemini", name: "Gemini (Google)", placeholder: "AIza...", prefix: "AIza" },
  { id: "grok", name: "Grok (xAI)", placeholder: "xai-...", prefix: "xai-" },
  { id: "kimi", name: "Kimi (Moonshot)", placeholder: "sk-...", prefix: "" },
  { id: "perplexity", name: "Perplexity", placeholder: "pplx-...", prefix: "pplx-" },
];

let _nextId = 1;
function genId(): string {
  return `key-${_nextId++}`;
}

@customElement("acaclaw-api-keys")
export class ApiKeysView extends LitElement {
  private _lc = new LocaleController(this);
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

    /* ── Setup gate banner ── */
    .setup-gate-banner {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      margin-bottom: 24px;
      background: var(--ac-warning-bg, #fef3cd);
      border: 1px solid var(--ac-warning-border, #ffc107);
      border-radius: 12px;
      color: var(--ac-warning-text, #856404);
    }
    .setup-gate-icon {
      font-size: 28px;
      flex-shrink: 0;
    }
    .setup-gate-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 14px;
      line-height: 1.5;
    }
    .setup-gate-text strong {
      font-size: 16px;
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
            // Verify an actual API key exists in models.providers
            const provObj = (models?.providers as Record<string, Record<string, unknown>> | undefined)?.[providerName];
            const realKey = provObj?.apiKey;
            if (realKey && realKey !== "__OPENCLAW_REDACTED__") {
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
        const searchProvider = (search.provider as string | undefined)?.toLowerCase();
        if (searchProvider) {
          // Brave uses top-level apiKey; other providers use a nested sub-object
          let searchApiKey: string | undefined;
          if (searchProvider === "brave") {
            searchApiKey = search.apiKey as string | undefined;
          } else {
            const sub = search[searchProvider] as Record<string, unknown> | undefined;
            searchApiKey = sub?.apiKey as string | undefined;
          }

          if (searchApiKey) {
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
      }

      // ── Build model list from gateway (OpenClaw handles model discovery) ──
      // Build model list from OpenClaw — no local filtering
      const configuredModels: ModelOption[] = [];
      try {
        const modelsResult = await gateway.call<Record<string, unknown>>("models.list");
        const payload = (modelsResult as Record<string, unknown>)?.models
          ?? (modelsResult as Record<string, unknown>)?.payload;
        const allModels = Array.isArray(payload)
          ? payload
          : (payload as Record<string, unknown>)?.models;
        if (Array.isArray(allModels)) {
          for (const m of allModels) {
            const mid = m.id as string;
            const mprovider = m.provider as string;
            const mname = (m.name as string) ?? mid;
            if (!mid || !mprovider) continue;
            configuredModels.push({
              id: `${mprovider}/${mid}`,
              name: mname,
              provider: mprovider,
              providerName: mprovider,
            });
          }
        }
      } catch {
        // models.list not available — keep empty
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
      gemini: "gemini",
      grok: "grok",
      kimi: "kimi",
      perplexity: "perplexity",
    };
    return map[name.toLowerCase()];
  }

  override render() {
    const llmCount = this._countActiveKeys(this._llmKeys);
    const browserCount = this._countActiveKeys(this._browserKeys);
    const needsSetup = this._keysLoaded && llmCount === 0;

    return html`
      ${needsSetup ? html`
        <div class="setup-gate-banner">
          <div class="setup-gate-icon">🔑</div>
          <div class="setup-gate-text">
            <strong>${t("apikeys.gate.title")}</strong>
            <span>${t("apikeys.gate.desc")}</span>
          </div>
        </div>
      ` : ""}
      <h1>${t("apikeys.title")}</h1>
      <p class="subtitle">${t("apikeys.subtitle")}</p>

      <div class="tabs">
        <div
          class="tab ${this._tab === "llm" ? "active" : ""}"
          @click=${() => (this._tab = "llm")}
        >
          ${t("apikeys.tab.llm")}
          ${llmCount > 0 ? html`<span class="count">${llmCount}</span>` : ""}
        </div>
        <div
          class="tab ${this._tab === "browser" ? "active" : ""}"
          @click=${() => (this._tab = "browser")}
        >
          ${t("apikeys.tab.browser")}
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
        <h2>${t("apikeys.provider")}</h2>
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
                <div>${t("apikeys.noKeys", provider.name)}</div>
                <div style="margin-top: 4px">${t("apikeys.noKeys.hint")}</div>
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
                  ${t("apikeys.addKey")}
                </button>
              `
            : ""}
          ${hasUnsaved
            ? html`<button class="btn btn-primary" @click=${() => this._saveKeys("llm")}>${t("apikeys.save")}</button>`
            : ""}
          ${allSaved
            ? html`<button class="btn btn-outline" @click=${() => this._addKey(this._llmProvider, "llm", provider.placeholder)}>${t("apikeys.addAnother")}</button>`
            : ""}
          ${this._saveMessage ? html`<span class="save-msg">${this._saveMessage}</span>` : ""}
        </div>
      </div>

      <!-- Default model -->
      <div class="card">
        <h2>${t("apikeys.defaultModel")}</h2>
        ${this._configuredModels.length > 0
          ? this._savedModel && !this._changingModel
            ? html`
                <div class="saved-model">
                  <span>✅</span>
                  <div>${t("apikeys.using")} <code>${this._savedModel}</code></div>
                  <span class="change-link" @click=${() => (this._changingModel = true)}>${t("apikeys.change")}</span>
                </div>
              `
            : html`
                <div class="model-row">
                  <label style="font-size: 13px; color: var(--ac-text-secondary)">${t("apikeys.model")}</label>
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
                    ? html`<button class="btn btn-primary" @click=${() => this._saveDefaultModel()}>${t("apikeys.saveModel")}</button>`
                    : html`<button class="btn btn-outline" @click=${() => (this._changingModel = false)}>${t("apikeys.cancel")}</button>`}
                  ${this._saveMessage ? html`<span class="save-msg">${this._saveMessage}</span>` : ""}
                </div>
              `
          : html`
              <div class="empty-state">
                <div class="icon">🤖</div>
                <div>${t("apikeys.configureProvider")}</div>
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
        <h2>${t("apikeys.searchProvider")}</h2>
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
        <h2>${t("apikeys.apiKeys", provider.name)}</h2>

        ${allSaved
          ? html`
              <div class="configured-banner">
                <span class="check">✅</span>
                <div>
                  <div>${t("apikeys.configured", provider.name)}</div>
                  <div class="detail">${t("apikeys.keyPrefix")}${keys[0]?.value?.startsWith("••") ? keys[0].value : "••••••••" + (keys[0]?.value?.slice(-4) ?? "")}</div>
                </div>
              </div>
            `
          : ""}

        ${keys.length === 0
          ? html`
              <div class="empty-state">
                <div class="icon">🌐</div>
                <div>${t("apikeys.noKeys", provider.name)}</div>
                <div style="margin-top: 4px">${t("apikeys.noKeys.hint")}</div>
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
                  ${t("apikeys.addKey")}
                </button>
              `
            : ""}
          ${hasUnsaved
            ? html`<button class="btn btn-primary" @click=${() => this._saveKeys("browser")}>${t("apikeys.save")}</button>`
            : ""}
          ${allSaved
            ? html`<button class="btn btn-outline" @click=${() => this._addKey(this._browserProvider, "browser", provider.placeholder)}>${t("apikeys.addAnother")}</button>`
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
            placeholder=${t("apikeys.label")}
            .value=${entry.label}
            @input=${(e: Event) => {
              entry.label = (e.target as HTMLInputElement).value;
              this.requestUpdate();
            }}
          />
          <span class="key-status ${entry.saved ? "connected" : ""}">
            ${entry.saved ? t("apikeys.saved") : t("apikeys.unsaved")}
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
            title="${entry.visible ? t("apikeys.hide") : t("apikeys.show")}"
            @click=${() => {
              entry.visible = !entry.visible;
              this.requestUpdate();
            }}
          >
            ${entry.visible ? "🙈" : "👁"}
          </button>
          <button
            class="icon-btn danger"
            title=${t("apikeys.remove")}
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
      label: existing.length === 0 ? t("apikeys.defaultLabel") : t("apikeys.keyLabel", existing.length + 1),
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
      await patchConfig({ agents: { defaults: { model: this._defaultModel } } });
      this._savedModel = this._defaultModel;
      this._changingModel = false;
      this._saveMessage = t("apikeys.savedModel");
      setTimeout(() => (this._saveMessage = ""), 3000);
    } catch (err) {
      this._saveMessage = `✗ ${err instanceof Error ? err.message : err}`;
    }
  }

  private async _saveKeys(category: "llm" | "browser") {
    const map = category === "llm" ? this._llmKeys : this._browserKeys;

    try {
      // Build a partial config and deep-merge via config.patch.
      if (category === "llm") {
        const providers: Record<string, unknown> = {};
        for (const [providerId, keys] of map.entries()) {
          const primaryKey = keys[0]?.value;
          if (!primaryKey || primaryKey === "••••••••••••••••") continue;
          const def = LLM_PROVIDERS.find((p) => p.id === providerId);
          const providerObj: Record<string, unknown> = { apiKey: primaryKey, models: [] };
          if (def?.baseUrl) providerObj.baseUrl = def.baseUrl;
          providers[providerId] = providerObj;
        }
        if (Object.keys(providers).length > 0) {
          await patchConfig({ models: { providers } });
        }
      } else {
        for (const [providerId, keys] of map.entries()) {
          const primaryKey = keys[0]?.value;
          if (!primaryKey || primaryKey === "••••••••••••••••") continue;
          const providerName = providerId === "brave-search" ? "brave" : providerId;
          const searchPatch: Record<string, unknown> = {
            provider: providerName,
            enabled: true,
          };
          if (providerName === "brave") {
            searchPatch.apiKey = primaryKey;
          } else {
            searchPatch[providerName] = { apiKey: primaryKey };
          }
          await patchConfig({ tools: { web: { search: searchPatch } } });
          break;
        }
      }

      // Mark saved
      for (const keys of map.values()) {
        for (const k of keys) {
          if (k.value.length > 0) k.saved = true;
        }
      }

      this._saveMessage = t("apikeys.savedKeys");
      this.requestUpdate();
      setTimeout(() => {
        this._saveMessage = "";
        this.requestUpdate();
      }, 3000);

      // Notify the app shell that keys have been saved (lifts the API-key gate)
      if (category === "llm") {
        window.dispatchEvent(new CustomEvent("keys-saved"));
      }
    } catch {
      this._saveMessage = t("apikeys.saveFailed");
      this.requestUpdate();
      setTimeout(() => {
        this._saveMessage = "";
        this.requestUpdate();
      }, 4000);
    }
  }
}
