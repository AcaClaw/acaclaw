import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway, updateConfig, setConfigValue } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";
import {
  type ProviderDef,
  type ModelInfo,
  LLM_PROVIDERS,
  BROWSER_PROVIDERS,
  CATALOG_TO_CONFIG_PROVIDER,
  providerEnvVar,
} from "../models/provider-mapping.js";

@customElement("acaclaw-api-keys")
export class ApiKeysView extends LitElement {
  private _lc = new LocaleController(this);

  @state() private _tab: "llm" | "browser" = "llm";
  @state() private _loaded = false;

  // Provider state: which providers have keys configured
  @state() private _configuredLlm = new Set<string>();
  @state() private _configuredBrowser = new Set<string>();
  @state() private _selectedLlmProvider = "";
  @state() private _selectedBrowserProvider = "";

  // Key input for current provider
  @state() private _keyInput = "";
  @state() private _keyVisible = false;

  // Models grouped by provider (from models.list)
  @state() private _modelsByProvider = new Map<string, ModelInfo[]>();

  // Default model
  @state() private _defaultModel = "";
  @state() private _savedModel = "";
  @state() private _changingModel = false;
  @state() private _showAllModels = false;
  @state() private _showAllProviders = false;

  // Feedback
  @state() private _saving = false;
  @state() private _message = "";

  // Region selector for moonshot (.ai international vs .cn China)
  @state() private _moonshotRegion: "international" | "cn" = "international";

  static override styles = css`
    :host { display: block; }

    /* ── Setup gate banner ── */
    .setup-gate-banner {
      display: flex; align-items: center; gap: 16px;
      padding: 16px 20px; margin-bottom: 24px;
      background: var(--ac-warning-bg, #fef3cd);
      border: 1px solid var(--ac-warning-border, #ffc107);
      border-radius: 12px; color: var(--ac-warning-text, #856404);
    }
    .setup-gate-icon { font-size: 28px; flex-shrink: 0; }
    .setup-gate-text { display: flex; flex-direction: column; gap: 4px; font-size: 14px; line-height: 1.5; }
    .setup-gate-text strong { font-size: 16px; }

    /* ── Page header ── */
    h1 { font-size: 32px; font-weight: 800; margin-bottom: 6px; letter-spacing: -0.03em; color: var(--ac-text); }
    .subtitle { font-size: 14px; color: var(--ac-text-muted); margin-bottom: 28px; line-height: 1.5; }

    /* ── Tabs ── */
    .tabs { display: flex; gap: 0; margin-bottom: 28px; border-bottom: 1px solid var(--ac-border); }
    .tab {
      padding: 12px 24px; font-size: 14px; font-weight: 500; color: var(--ac-text-muted);
      cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
      white-space: nowrap; transition: all var(--ac-transition-fast);
    }
    .tab:hover { color: var(--ac-text-secondary); }
    .tab.active { color: var(--ac-primary); border-bottom-color: var(--ac-primary); }
    .tab .count {
      background: var(--ac-primary-bg); color: var(--ac-primary);
      font-size: 11px; font-weight: 600; padding: 2px 8px;
      border-radius: var(--ac-radius-full, 9999px); margin-left: 8px;
    }

    /* ── Cards ── */
    .card {
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg); padding: 32px; margin-bottom: 24px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02), 0 0 0 1px rgba(0,0,0,0.02);
      transition: all var(--ac-transition);
    }
    .card h2 { font-size: 16px; font-weight: 600; color: var(--ac-text); margin-bottom: 20px; letter-spacing: -0.01em; }

    /* ── Provider chips ── */
    .provider-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .provider-chip {
      display: flex; align-items: center; gap: 6px; padding: 8px 16px;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full, 9999px);
      font-size: 13px; font-weight: 450; cursor: pointer;
      transition: all var(--ac-transition-fast); background: var(--ac-bg-surface);
      color: var(--ac-text-secondary); box-shadow: var(--ac-shadow-xs);
    }
    .provider-chip:hover { border-color: var(--ac-primary); color: var(--ac-primary); box-shadow: var(--ac-shadow-sm); transform: translateY(-0.5px); }
    .provider-chip.active { border-color: var(--ac-primary); background: var(--ac-primary-bg); color: var(--ac-primary); font-weight: 600; box-shadow: 0 0 0 1px var(--ac-primary), var(--ac-shadow-xs); }
    .provider-chip.configured { border-color: rgba(5, 150, 105, 0.3); }
    .provider-chip.configured.active { border-color: var(--ac-primary); background: var(--ac-primary-bg); box-shadow: 0 0 0 1px var(--ac-primary), var(--ac-shadow-xs); }
    .provider-chip .chip-check { color: var(--ac-success); font-size: 13px; font-weight: 700; }

    /* ── Configured banner ── */
    .configured-banner {
      display: flex; align-items: flex-start; gap: 12px; padding: 16px 20px;
      background: var(--ac-success-bg, #ecfdf5); border: 1px solid rgba(5, 150, 105, 0.15);
      border-radius: var(--ac-radius-sm); font-size: 14px; color: #065f46; margin-bottom: 16px;
    }
    .configured-banner .check { font-size: 18px; margin-top: 1px; }
    .configured-banner .detail { color: #047857; font-size: 12px; margin-top: 4px; font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace; letter-spacing: 0.02em; }

    /* ── Key input ── */
    .key-row { display: flex; gap: 8px; align-items: center; }
    .key-input {
      flex: 1; padding: 10px 14px; border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm); font-size: 13px;
      font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
      background: var(--ac-bg-surface); transition: all var(--ac-transition-fast);
    }
    .key-input:focus { outline: none; border-color: var(--ac-primary); box-shadow: var(--ac-shadow-focus); }
    .key-input::placeholder { color: var(--ac-text-tertiary, #cbd5e1); }
    .icon-btn {
      padding: 8px 12px; background: var(--ac-bg-surface); border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm); font-size: 14px; cursor: pointer; line-height: 1;
      transition: all var(--ac-transition-fast); box-shadow: var(--ac-shadow-xs);
    }
    .icon-btn:hover { background: var(--ac-bg-hover); box-shadow: var(--ac-shadow-sm); }

    /* ── Region selector ── */
    .region-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
    .region-label { font-size: 13px; font-weight: 500; color: var(--ac-text-secondary); }
    .region-select {
      padding: 6px 12px; border: 1px solid var(--ac-border); border-radius: var(--ac-radius-sm);
      background: var(--ac-bg-surface); color: var(--ac-text); font-size: 13px;
      cursor: pointer; transition: border-color var(--ac-transition-fast);
    }
    .region-select:hover { border-color: var(--ac-primary); }

    /* ── Buttons ── */
    .btn-row { display: flex; gap: 10px; margin-top: 20px; align-items: center; }
    .btn { padding: 9px 20px; border-radius: var(--ac-radius-sm); font-size: 13px; font-weight: 500; cursor: pointer; transition: all var(--ac-transition-fast); letter-spacing: 0.01em; }
    .btn-primary { background: var(--ac-primary); color: #fff; border: none; box-shadow: var(--ac-shadow-xs); }
    .btn-primary:hover { background: var(--ac-primary-dark); box-shadow: var(--ac-shadow-sm); transform: translateY(-0.5px); }
    .btn-primary:active { transform: translateY(0); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .btn-outline { background: var(--ac-bg-surface); border: 1px solid var(--ac-border); color: var(--ac-text-secondary); box-shadow: var(--ac-shadow-xs); }
    .btn-outline:hover { background: var(--ac-bg-hover); border-color: var(--ac-border-strong); color: var(--ac-text); }
    .btn-danger { background: transparent; border: 1px solid var(--ac-danger, #dc3545); color: var(--ac-danger, #dc3545); }
    .btn-danger:hover { background: var(--ac-danger, #dc3545); color: #fff; }
    .save-msg { font-size: 13px; color: var(--ac-success); margin-left: 8px; font-weight: 500; animation: fadeIn 0.3s ease; }

    /* ── Empty state ── */
    .empty-state { text-align: center; padding: 40px 20px; color: var(--ac-text-muted); font-size: 14px; }
    .empty-state .icon { font-size: 36px; margin-bottom: 12px; opacity: 0.6; }

    /* ── Model selector ── */
    .model-row { display: flex; align-items: center; gap: 14px; }
    .model-select {
      flex: 1; padding: 10px 14px; border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm); font-size: 13px; background: var(--ac-bg-surface);
      cursor: pointer; transition: all var(--ac-transition-fast); box-shadow: var(--ac-shadow-xs);
    }
    .model-select:focus { outline: none; border-color: var(--ac-primary); box-shadow: var(--ac-shadow-focus); }

    /* ── Saved model display ── */
    .saved-model {
      display: flex; align-items: center; gap: 12px; padding: 16px 20px;
      background: var(--ac-success-bg, #ecfdf5); border: 1px solid rgba(5, 150, 105, 0.15);
      border-radius: var(--ac-radius-sm); font-size: 14px; color: #065f46;
    }
    .saved-model code {
      font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
      background: rgba(5, 150, 105, 0.1); padding: 3px 10px;
      border-radius: var(--ac-radius-xs, 6px); font-size: 13px; font-weight: 500; letter-spacing: 0.01em;
    }
    .change-link { font-size: 13px; color: var(--ac-primary); cursor: pointer; margin-left: auto; font-weight: 500; transition: color var(--ac-transition-fast); }
    .change-link:hover { color: var(--ac-primary-dark); }

    /* ── Per-provider model list ── */
    .model-list { margin-top: 16px; }
    .model-list-header { font-size: 13px; font-weight: 600; color: var(--ac-text-secondary); margin-bottom: 8px; }
    .model-list-table {
      width: 100%; border-collapse: collapse; font-size: 13px;
    }
    .model-list-table th {
      text-align: left; padding: 8px 12px; font-weight: 500; color: var(--ac-text-muted);
      border-bottom: 1px solid var(--ac-border); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em;
    }
    .model-list-table td {
      padding: 8px 12px; border-bottom: 1px solid var(--ac-border-subtle); color: var(--ac-text-secondary);
    }
    .model-list-table tr:last-child td { border-bottom: none; }
    .model-list-table .model-name { font-weight: 500; color: var(--ac-text); }
    .expand-link { display: inline-block; margin-top: 8px; font-size: 13px; color: var(--ac-primary); cursor: pointer; font-weight: 500; }
    .expand-link:hover { text-decoration: underline; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-2px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  /* ── Lifecycle ── */

  override connectedCallback() {
    super.connectedCallback();
    gateway.addEventListener("state-change", () => {
      if (gateway.state === "connected" && gateway.authenticated) this._loadState();
    });
    if (gateway.state === "connected" && gateway.authenticated) this._loadState();
  }

  /** Load provider config + models from gateway. */
  private async _loadState() {
    if (this._loaded) return;
    try {
      const snapshot = await gateway.call<Record<string, unknown>>("config.get");
      if (!snapshot) return;
      this._loaded = true;

      const cfg = (snapshot.config as Record<string, unknown>) ?? snapshot;

      // ── Detect configured LLM providers ──
      // Primary: env vars in config.env (new approach — plugins discover keys via env)
      const envSection = (cfg.env ?? {}) as Record<string, unknown>;
      for (const p of LLM_PROVIDERS) {
        const envVar = providerEnvVar(p.id);
        if (typeof envSection[envVar] === "string" && (envSection[envVar] as string).trim()) {
          this._configuredLlm.add(p.id);
        }
      }
      // Legacy: models.providers entries with apiKey (backward compat)
      const models = cfg.models as Record<string, unknown> | undefined;
      const providers = (models?.providers ?? {}) as Record<string, Record<string, unknown>>;
      for (const [pid, pval] of Object.entries(providers)) {
        if (pval?.apiKey) this._configuredLlm.add(pid);
      }

      // Detect moonshot region from existing base URL
      const moonshotCfg = providers.moonshot;
      if (typeof moonshotCfg?.baseUrl === "string" && moonshotCfg.baseUrl.includes("moonshot.cn")) {
        this._moonshotRegion = "cn";
      }

      // ── Detect configured browser/search provider ──
      const tools = cfg.tools as Record<string, unknown> | undefined;
      const web = tools?.web as Record<string, unknown> | undefined;
      const search = web?.search as Record<string, unknown> | undefined;
      if (search?.provider) {
        const sp = String(search.provider);
        const browserId = sp === "brave" ? "brave-search" : sp;
        if (BROWSER_PROVIDERS.some((p) => p.id === browserId)) {
          this._configuredBrowser.add(browserId);
        }
      }

      // ── Fetch model catalog and group by provider ──
      await this._refreshModels();

      // ── Read default model ──
      const agents = cfg.agents as Record<string, unknown> | undefined;
      const defaults = agents?.defaults as Record<string, unknown> | undefined;
      const modelCfg = defaults?.model;
      if (typeof modelCfg === "string" && modelCfg) {
        this._defaultModel = modelCfg;
      }
      this._savedModel = this._defaultModel;

      // Auto-select first configured provider
      this._selectedLlmProvider = this._sortedProviders(LLM_PROVIDERS, this._configuredLlm)[0]?.id ?? "";
      this._selectedBrowserProvider = this._sortedProviders(BROWSER_PROVIDERS, this._configuredBrowser)[0]?.id ?? "";

      this.requestUpdate();
    } catch {
      // Gateway not available
    }
  }

  /** Fetch models from gateway and group by provider. */
  private async _refreshModels() {
    try {
      const result = await gateway.call<Record<string, unknown>>("models.list");
      const payload = result?.models ?? (result as Record<string, unknown>)?.payload;
      const allModels = Array.isArray(payload)
        ? payload
        : (payload as Record<string, unknown>)?.models;
      const grouped = new Map<string, ModelInfo[]>();
      if (Array.isArray(allModels)) {
        for (const m of allModels) {
          const mid = m.id as string;
          const mprovider = m.provider as string;
          if (!mid || !mprovider) continue;
          const list = grouped.get(mprovider) ?? [];
          list.push({ id: `${mprovider}/${mid}`, name: (m.name as string) ?? mid, provider: mprovider });
          grouped.set(mprovider, list);
        }
      }
      this._modelsByProvider = grouped;
    } catch {
      // models.list not available
    }
  }

  /* ── Render ── */

  override render() {
    const llmCount = this._configuredLlm.size;
    const browserCount = this._configuredBrowser.size;
    const needsSetup = this._loaded && llmCount === 0;

    return html`
      ${needsSetup ? html`
        <div class="setup-gate-banner">
          <div class="setup-gate-icon">🔑</div>
          <div class="setup-gate-text">
            <strong>${t("apikeys.gate.title")}</strong>
            <span>${t("apikeys.gate.desc")}</span>
          </div>
        </div>
      ` : nothing}
      <h1>${t("apikeys.title")}</h1>
      <p class="subtitle">${t("apikeys.subtitle")}</p>

      <div class="tabs">
        <div class="tab ${this._tab === "llm" ? "active" : ""}" @click=${() => (this._tab = "llm")}>
          ${t("apikeys.tab.llm")}
          ${llmCount > 0 ? html`<span class="count">${llmCount}</span>` : nothing}
        </div>
        <div class="tab ${this._tab === "browser" ? "active" : ""}" @click=${() => (this._tab = "browser")}>
          ${t("apikeys.tab.browser")}
          ${browserCount > 0 ? html`<span class="count">${browserCount}</span>` : nothing}
        </div>
      </div>

      ${this._tab === "llm" ? this._renderLlmTab() : this._renderBrowserTab()}
    `;
  }

  /** Sort providers: configured first. */
  private _sortedProviders(list: ProviderDef[], configured: Set<string>): ProviderDef[] {
    return [...list.filter((p) => configured.has(p.id)), ...list.filter((p) => !configured.has(p.id))];
  }

  /* ── LLM tab ── */

  private _renderLlmTab() {
    const sorted = this._sortedProviders(LLM_PROVIDERS, this._configuredLlm);
    const provider = sorted.find((p) => p.id === this._selectedLlmProvider) ?? sorted[0];
    if (!this._selectedLlmProvider && provider) this._selectedLlmProvider = provider.id;
    const isConfigured = this._configuredLlm.has(this._selectedLlmProvider);
    const providerModels = this._modelsForConfigProvider(this._selectedLlmProvider);

    return html`
      <!-- Provider selector -->
      <div class="card">
        <h2>${t("apikeys.provider")} (${sorted.length})</h2>
        <div class="provider-chips">
          ${(this._showAllProviders ? sorted : sorted.slice(0, 5)).map((p) => html`
            <div
              class="provider-chip ${p.id === this._selectedLlmProvider ? "active" : ""} ${this._configuredLlm.has(p.id) ? "configured" : ""}"
              @click=${() => { this._selectedLlmProvider = p.id; this._keyInput = ""; this._keyVisible = false; this._showAllModels = false; }}
            >
              ${this._configuredLlm.has(p.id) ? html`<span class="chip-check">✓</span>` : nothing}
              ${p.name}
            </div>
          `)}
        </div>
        ${sorted.length > 5 ? html`
          <span class="expand-link" @click=${() => { this._showAllProviders = !this._showAllProviders; }}>
            ${this._showAllProviders ? `▲ Show top 5` : `▼ Show all ${sorted.length} providers`}
          </span>
        ` : nothing}
      </div>

      <!-- API Key card -->
      <div class="card">
        <h2>${t("apikeys.apiKeys", provider.name)}</h2>

        ${isConfigured ? html`
          <div class="configured-banner">
            <span class="check">✅</span>
            <div>
              <div>${t("apikeys.configured", provider.name)}</div>
              <div class="detail">${t("apikeys.keyPrefix")}••••••••••••</div>
            </div>
          </div>
        ` : html`
          <div class="key-row">
            <input
              class="key-input"
              type="${this._keyVisible ? "text" : "password"}"
              placeholder=${provider.placeholder}
              .value=${this._keyInput}
              @input=${(e: Event) => { this._keyInput = (e.target as HTMLInputElement).value; }}
            />
            <button class="icon-btn" title="${this._keyVisible ? t("apikeys.hide") : t("apikeys.show")}"
              @click=${() => { this._keyVisible = !this._keyVisible; }}>
              ${this._keyVisible ? "🙈" : "👁"}
            </button>
          </div>
        `}

        ${this._selectedLlmProvider === "moonshot" && !isConfigured ? html`
          <div class="region-row">
            <label class="region-label">${t("apikeys.region")}</label>
            <select class="region-select" .value=${this._moonshotRegion}
              @change=${(e: Event) => { this._moonshotRegion = (e.target as HTMLSelectElement).value as "international" | "cn"; }}>
              <option value="international">${t("apikeys.region.international")}</option>
              <option value="cn">${t("apikeys.region.cn")}</option>
            </select>
          </div>
        ` : nothing}

        <div class="btn-row">
          ${!isConfigured && this._keyInput ? html`
            <button class="btn btn-primary" ?disabled=${this._saving} @click=${() => this._saveLlmKey()}>
              ${t("apikeys.save")}
            </button>
          ` : nothing}
          ${isConfigured ? html`
            <button class="btn btn-danger" @click=${() => this._removeLlmProvider()}>
              ${t("apikeys.removeProvider")}
            </button>
          ` : nothing}
          ${this._message ? html`<span class="save-msg">${this._message}</span>` : nothing}
        </div>
      </div>

      <!-- Per-provider model list -->
      ${isConfigured && providerModels.length > 0 ? html`
        <div class="card">
          <h2>${provider.name} — ${t("apikeys.models")} (${providerModels.length})</h2>
          <table class="model-list-table">
            <thead>
              <tr>
                <th>${t("apikeys.model")}</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              ${(this._showAllModels ? providerModels : providerModels.slice(0, 5)).map((m) => html`
                <tr>
                  <td class="model-name">${m.name}</td>
                  <td>${m.id}</td>
                </tr>
              `)}
            </tbody>
          </table>
          ${providerModels.length > 5 ? html`
            <span class="expand-link" @click=${() => { this._showAllModels = !this._showAllModels; }}>
              ${this._showAllModels ? `▲ Show top 5` : `▼ Show all ${providerModels.length} models`}
            </span>
          ` : nothing}
        </div>
      ` : nothing}

      <!-- Default model -->
      <div class="card">
        <h2>${t("apikeys.defaultModel")}</h2>
        ${this._allModels.length > 0
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
                  <select class="model-select" .value=${this._defaultModel || this._allModels[0]?.id || ""}
                    @change=${(e: Event) => (this._defaultModel = (e.target as HTMLSelectElement).value)}>
                    ${this._renderModelOptions()}
                  </select>
                </div>
                <div class="btn-row" style="margin-top: 12px">
                  ${(this._defaultModel || this._allModels[0]?.id) !== this._savedModel || !this._savedModel
                    ? html`<button class="btn btn-primary" @click=${() => this._saveDefaultModel()}>${t("apikeys.saveModel")}</button>`
                    : html`<button class="btn btn-outline" @click=${() => (this._changingModel = false)}>${t("apikeys.cancel")}</button>`}
                  ${this._message ? html`<span class="save-msg">${this._message}</span>` : nothing}
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
    const sorted = this._sortedProviders(BROWSER_PROVIDERS, this._configuredBrowser);
    const provider = sorted.find((p) => p.id === this._selectedBrowserProvider) ?? sorted[0];
    if (!this._selectedBrowserProvider && provider) this._selectedBrowserProvider = provider.id;
    const isConfigured = this._configuredBrowser.has(this._selectedBrowserProvider);
    const isKeyless = provider?.noKey === true;

    return html`
      <div class="card">
        <h2>${t("apikeys.searchProvider")} (${sorted.length})</h2>
        <div class="provider-chips">
          ${(this._showAllProviders ? sorted : sorted.slice(0, 5)).map((p) => html`
            <div
              class="provider-chip ${p.id === this._selectedBrowserProvider ? "active" : ""} ${this._configuredBrowser.has(p.id) ? "configured" : ""}"
              @click=${() => { this._selectedBrowserProvider = p.id; this._keyInput = ""; this._keyVisible = false; }}
            >
              ${this._configuredBrowser.has(p.id) ? html`<span class="chip-check">✓</span>` : nothing}
              ${p.name}
            </div>
          `)}
        </div>
        ${sorted.length > 5 ? html`
          <span class="expand-link" @click=${() => { this._showAllProviders = !this._showAllProviders; }}>
            ${this._showAllProviders ? `▲ Show top 5` : `▼ Show all ${sorted.length} providers`}
          </span>
        ` : nothing}
      </div>

      <div class="card">
        <h2>${isKeyless ? provider.name : t("apikeys.apiKeys", provider.name)}</h2>

        ${isConfigured ? html`
          <div class="configured-banner">
            <span class="check">✅</span>
            <div>
              <div>${t("apikeys.configured", provider.name)}</div>
              ${isKeyless ? nothing : html`<div class="detail">${t("apikeys.keyPrefix")}••••••••••••</div>`}
            </div>
          </div>
        ` : isKeyless ? html`
          <p class="detail">${t("apikeys.noKeyNeeded", provider.name)}</p>
        ` : html`
          <div class="key-row">
            <input
              class="key-input"
              type="${this._keyVisible ? "text" : "password"}"
              placeholder=${provider.placeholder}
              .value=${this._keyInput}
              @input=${(e: Event) => { this._keyInput = (e.target as HTMLInputElement).value; }}
            />
            <button class="icon-btn" title="${this._keyVisible ? t("apikeys.hide") : t("apikeys.show")}"
              @click=${() => { this._keyVisible = !this._keyVisible; }}>
              ${this._keyVisible ? "🙈" : "👁"}
            </button>
          </div>
        `}

        <div class="btn-row">
          ${!isConfigured && (this._keyInput || isKeyless) ? html`
            <button class="btn btn-primary" ?disabled=${this._saving} @click=${() => this._saveBrowserKey()}>
              ${isKeyless ? t("apikeys.enable") : t("apikeys.save")}
            </button>
          ` : nothing}
          ${isConfigured ? html`
            <button class="btn btn-danger" @click=${() => this._removeBrowserProvider()}>
              ${t("apikeys.removeProvider")}
            </button>
          ` : nothing}
          ${this._message ? html`<span class="save-msg">${this._message}</span>` : nothing}
        </div>
      </div>
    `;
  }

  /* ── Model helpers ── */

  /** Get all models for a config provider ID by checking all matching catalog providers.
   *  When the "native" catalog provider (catalogId === configId) contributes models,
   *  skip alias catalog providers to avoid duplicates (e.g. kimi-coding when moonshot is active). */
  private _modelsForConfigProvider(configId: string): ModelInfo[] {
    const native: ModelInfo[] = [];
    const aliases: ModelInfo[] = [];
    for (const [catalogProvider, models] of this._modelsByProvider) {
      const mapped = CATALOG_TO_CONFIG_PROVIDER[catalogProvider] ?? catalogProvider;
      if (mapped !== configId) continue;
      if (catalogProvider === configId) native.push(...models);
      else aliases.push(...models);
    }
    return native.length > 0 ? native : aliases;
  }

  /** Flat list of models from configured providers only (deduped). */
  private get _allModels(): ModelInfo[] {
    const result: ModelInfo[] = [];
    for (const configId of this._configuredLlm) {
      result.push(...this._modelsForConfigProvider(configId));
    }
    return result;
  }

  /** Render <optgroup>-grouped model options for default model selector. */
  private _renderModelOptions() {
    if (this._configuredLlm.size === 0) return nothing;
    const groups: Array<{ label: string; models: ModelInfo[] }> = [];
    for (const configId of this._configuredLlm) {
      const models = this._modelsForConfigProvider(configId);
      if (models.length === 0) continue;
      const def = LLM_PROVIDERS.find((p) => p.id === configId);
      groups.push({ label: def?.name ?? configId, models });
    }
    if (groups.length === 0) return nothing;
    return groups.map(({ label, models }) => html`
      <optgroup label=${label}>
        ${models.map((m) => html`
          <option value=${m.id} ?selected=${m.id === this._defaultModel}>${m.name}</option>
        `)}
      </optgroup>
    `);
  }

  /* ── Save / Remove actions ── */

  private _flash(msg: string, duration = 3000) {
    this._message = msg;
    this.requestUpdate();
    setTimeout(() => { this._message = ""; this.requestUpdate(); }, duration);
  }

  /** Save an LLM provider's API key. */
  private async _saveLlmKey() {
    const providerId = this._selectedLlmProvider;
    const key = this._keyInput.trim();
    if (!key) return;

    this._saving = true;
    try {
      // Write ONLY the env var — OpenClaw's plugin catalog discovers keys via
      // env vars, and the extension handles base URLs, API type, and model lists.
      // On gateway restart, applyConfigEnvVars copies config.env into process.env,
      // so the plugin finds the key and creates the implicit provider config.
      const envVar = providerEnvVar(providerId);
      await updateConfig((cfg) => {
        const env = (cfg.env ?? {}) as Record<string, string>;
        env[envVar] = key;
        cfg.env = env;

        // For moonshot China region, set an explicit base URL override
        // (the extension default is .ai international)
        if (providerId === "moonshot" && this._moonshotRegion === "cn") {
          const models = (cfg.models ?? {}) as Record<string, unknown>;
          const providers = (models.providers ?? {}) as Record<string, Record<string, unknown>>;
          const existing = providers.moonshot ?? {};
          existing.baseUrl = "https://api.moonshot.cn/v1";
          if (!existing.models) existing.models = [];
          providers.moonshot = existing;
          models.providers = providers;
          cfg.models = models;
        }

        return cfg;
      });

      this._configuredLlm = new Set([...this._configuredLlm, providerId]);
      this._keyInput = "";
      this._keyVisible = false;

      // Changing config.env triggers a gateway restart (OpenClaw has no
      // hot-reload rule for 'env' paths).  Don't refresh models now — the
      // env var isn't applied until after restart.  Instead, reset _loaded
      // so the existing state-change handler re-runs _loadState (including
      // model refresh) once the gateway reconnects.
      this._loaded = false;
      this._flash(t("apikeys.savedReconnecting"), 5000);
      window.dispatchEvent(new CustomEvent("keys-saved"));
    } catch {
      this._flash(t("apikeys.saveFailed"), 4000);
    } finally {
      this._saving = false;
    }
  }

  /** Remove an LLM provider's key from config. */
  private async _removeLlmProvider() {
    const providerId = this._selectedLlmProvider;
    const def = LLM_PROVIDERS.find((p) => p.id === providerId);
    const name = def?.name ?? providerId;
    if (!confirm(t("apikeys.removeProvider.confirm", name))) return;

    try {
      await updateConfig((cfg) => {
        // Remove env var (primary key storage)
        const envVar = providerEnvVar(providerId);
        const env = cfg.env as Record<string, unknown> | undefined;
        if (env) delete env[envVar];

        // Also clean legacy models.providers entry if present
        const providers = (cfg.models as Record<string, unknown>)?.providers as Record<string, unknown> | undefined;
        if (providers) delete providers[providerId];

        // Clean auth profiles referencing this provider
        const profiles = (cfg.auth as Record<string, unknown>)?.profiles as Record<string, Record<string, unknown>> | undefined;
        if (profiles) {
          for (const [key, val] of Object.entries(profiles)) {
            if (val?.provider === providerId) delete profiles[key];
          }
        }

        // Clear default model if it used this provider
        const defaultModel = (cfg.agents as Record<string, unknown>)?.defaults as Record<string, unknown> | undefined;
        if (typeof defaultModel?.model === "string" && (defaultModel.model as string).startsWith(`${providerId}/`)) {
          delete defaultModel.model;
          this._defaultModel = "";
          this._savedModel = "";
        }

        return cfg;
      });

      const next = new Set(this._configuredLlm);
      next.delete(providerId);
      this._configuredLlm = next;

      // Same env-restart behavior as save — defer model refresh to reconnect.
      this._loaded = false;
      this._flash(t("apikeys.removedReconnecting", name), 5000);
      window.dispatchEvent(new CustomEvent("keys-saved"));
    } catch {
      this._flash(t("apikeys.saveFailed"), 4000);
    }
  }

  /** Save a browser/search provider's API key (or enable a keyless provider). */
  private async _saveBrowserKey() {
    const providerId = this._selectedBrowserProvider;
    const def = BROWSER_PROVIDERS.find((p) => p.id === providerId);
    const isKeyless = def?.noKey === true;
    const key = this._keyInput.trim();
    if (!isKeyless && !key) return;

    this._saving = true;
    try {
      await updateConfig((cfg) => {
        const tools = (cfg.tools ?? {}) as Record<string, unknown>;
        const web = (tools.web ?? {}) as Record<string, unknown>;
        const search = (web.search ?? {}) as Record<string, unknown>;
        const providerName = providerId === "brave-search" ? "brave" : providerId;
        search.provider = providerName;
        search.enabled = true;
        if (!isKeyless) {
          if (providerName === "brave") {
            search.apiKey = key;
          } else {
            search[providerName] = { apiKey: key };
          }
        }
        web.search = search;
        tools.web = web;
        cfg.tools = tools;
        return cfg;
      });

      this._configuredBrowser = new Set([...this._configuredBrowser, providerId]);
      this._keyInput = "";
      this._keyVisible = false;
      this._flash(t("apikeys.savedKeys"));
    } catch {
      this._flash(t("apikeys.saveFailed"), 4000);
    } finally {
      this._saving = false;
    }
  }

  /** Remove a browser/search provider from config. */
  private async _removeBrowserProvider() {
    const providerId = this._selectedBrowserProvider;
    const def = BROWSER_PROVIDERS.find((p) => p.id === providerId);
    const name = def?.name ?? providerId;
    if (!confirm(t("apikeys.removeProvider.confirm", name))) return;

    try {
      await updateConfig((cfg) => {
        const search = ((cfg.tools as Record<string, unknown>)?.web as Record<string, unknown>)
          ?.search as Record<string, unknown> | undefined;
        if (search) {
          const providerName = providerId === "brave-search" ? "brave" : providerId;
          if (search.provider === providerName) {
            delete search.provider;
            delete search.enabled;
            delete search.apiKey;
            delete search[providerName];
          }
        }
        return cfg;
      });

      const next = new Set(this._configuredBrowser);
      next.delete(providerId);
      this._configuredBrowser = next;
      this._flash(t("apikeys.removedProvider", name));
    } catch {
      this._flash(t("apikeys.saveFailed"), 4000);
    }
  }

  /** Save the default model selection. */
  private async _saveDefaultModel() {
    try {
      const model = this._defaultModel || this._allModels[0]?.id || "";
      await setConfigValue(["agents", "defaults", "model"], model);
      this._defaultModel = model;
      this._savedModel = model;
      this._changingModel = false;
      this._flash(t("apikeys.savedModel"));
    } catch (err) {
      this._flash(`✗ ${err instanceof Error ? err.message : err}`, 4000);
    }
  }
}
