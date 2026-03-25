/** Settings view — appearance, security, and gateway preferences. */
import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { t, getLocale, setLocale, LocaleController, type Locale } from "../i18n.js";

type Theme = "light" | "dark" | "system";
type SecurityMode = "standard" | "maximum";
type Tab = "appearance" | "security" | "connection" | "openclaw" | "uninstall";

interface SecuritySettings {
  mode: SecurityMode;
  enableCredentialScrubbing: boolean;
  enableInjectionDetection: boolean;
  enableNetworkPolicy: boolean;
}

const THEME_KEY = "acaclaw-theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", theme);
  }
  localStorage.setItem(THEME_KEY, theme);
}

// Apply saved theme on load
applyTheme((localStorage.getItem(THEME_KEY) as Theme) ?? "system");

@customElement("acaclaw-settings")
export class SettingsView extends LitElement {
  static override styles = css`
    :host {
      display: block;
      animation: fade-in 0.3s ease-out forwards;
    }
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.04em; color: var(--ac-text); margin-bottom: 4px; }
    .subtitle { font-size: 15px; color: var(--ac-text-muted); line-height: 1.5; margin-bottom: 32px; }

    /* Tabs */
    .tabs { display: flex; gap: 0; margin-bottom: 28px; border-bottom: 1px solid var(--ac-border); }
    .tab {
      padding: 12px 20px; font-size: 13px; font-weight: 600;
      color: var(--ac-text-muted); cursor: pointer;
      border-bottom: 2px solid transparent; margin-bottom: -1px;
      transition: color var(--ac-transition-fast);
    }
    .tab:hover { color: var(--ac-text-secondary); }
    .tab.active { color: var(--ac-primary); border-bottom-color: var(--ac-primary); }

    /* Section */
    .section { margin-bottom: 32px; }
    .section-title {
      font-size: 16px; font-weight: 700; letter-spacing: -0.02em;
      color: var(--ac-text); margin-bottom: 4px;
    }
    .section-desc { font-size: 13px; color: var(--ac-text-muted); margin-bottom: 16px; }

    /* Setting row */
    .setting-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle); border-radius: var(--ac-radius-lg);
      margin-bottom: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .setting-label { font-size: 14px; font-weight: 600; color: var(--ac-text); }
    .setting-hint { font-size: 12px; color: var(--ac-text-muted); margin-top: 2px; }

    /* Theme selector */
    .theme-options { display: flex; gap: 8px; }
    .theme-btn {
      padding: 8px 18px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full);
      background: var(--ac-bg-surface); color: var(--ac-text-muted);
      cursor: pointer; transition: all var(--ac-transition-fast);
    }
    .theme-btn:hover { border-color: var(--ac-text-muted); color: var(--ac-text); }
    .theme-btn.active {
      background: var(--ac-primary); border-color: var(--ac-primary);
      color: #fff;
    }

    /* Toggle switch */
    .toggle { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
    .toggle input { display: none; }
    .toggle-track {
      position: absolute; inset: 0; background: var(--ac-border-strong);
      border-radius: 12px; cursor: pointer; transition: background var(--ac-transition-fast);
    }
    .toggle-track::after {
      content: ''; position: absolute; top: 2px; left: 2px;
      width: 20px; height: 20px; background: #fff;
      border-radius: 50%; transition: transform var(--ac-transition-fast);
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }
    .toggle input:checked + .toggle-track { background: var(--ac-primary); }
    .toggle input:checked + .toggle-track::after { transform: translateX(20px); }

    /* Mode selector */
    .mode-options { display: flex; gap: 8px; }
    .mode-btn {
      padding: 8px 18px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full);
      background: var(--ac-bg-surface); color: var(--ac-text-muted);
      cursor: pointer; transition: all var(--ac-transition-fast);
    }
    .mode-btn:hover { border-color: var(--ac-text-muted); color: var(--ac-text); }
    .mode-btn.active { background: var(--ac-primary); border-color: var(--ac-primary); color: #fff; }

    /* Status badge */
    .status-badge {
      font-size: 12px; font-weight: 600; padding: 4px 12px;
      border-radius: var(--ac-radius-full);
    }
    .status-badge.healthy { background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.2); }
    .status-badge.error { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }

    .conn-meta { font-size: 11px; color: var(--ac-text-tertiary); margin-top: 2px; }

    .btn-action {
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border);
      color: var(--ac-text); font-size: 13px; font-weight: 600;
      padding: 8px 16px; border-radius: var(--ac-radius-full);
      cursor: pointer; transition: all var(--ac-transition-fast);
    }
    .btn-action:hover { background: var(--ac-bg-hover); border-color: var(--ac-text-muted); }

    .save-banner {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: var(--ac-primary); color: #fff; padding: 12px 28px;
      border-radius: var(--ac-radius-full); font-size: 14px; font-weight: 600;
      box-shadow: var(--ac-shadow-lg); cursor: pointer; z-index: 100;
      animation: slide-up 0.2s ease-out;
    }
    @keyframes slide-up { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

    /* Uninstall tab */
    .uninstall-warning {
      background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2);
      border-radius: var(--ac-radius-lg); padding: 16px 20px; margin-bottom: 24px;
      display: flex; gap: 12px; align-items: flex-start;
    }
    .uninstall-warning-icon { font-size: 20px; flex-shrink: 0; line-height: 1.4; }
    .uninstall-warning-text { font-size: 13px; color: #ef4444; line-height: 1.6; }
    .removes-list, .keeps-list { margin: 0; padding-left: 18px; font-size: 13px; line-height: 2; }
    .removes-list li { color: var(--ac-text); }
    .keeps-list li { color: #10b981; }
    .cmd-box {
      display: flex; align-items: center; gap: 12px;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg); padding: 14px 16px; margin-bottom: 8px;
    }
    .cmd-code {
      flex: 1; font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 13px; color: var(--ac-text); word-break: break-all;
    }
    .cmd-label { font-size: 12px; color: var(--ac-text-muted); margin-bottom: 6px; font-weight: 600; }
    .btn-copy {
      background: var(--ac-bg-hover); border: 1px solid var(--ac-border);
      color: var(--ac-text-muted); font-size: 12px; font-weight: 600;
      padding: 6px 14px; border-radius: var(--ac-radius-full);
      cursor: pointer; transition: all var(--ac-transition-fast); flex-shrink: 0;
    }
    .btn-copy:hover { background: var(--ac-primary); color: #fff; border-color: var(--ac-primary); }
    .btn-copy.copied { background: #10b981; color: #fff; border-color: #10b981; }

    .btn-danger {
      background: #ef4444; border: 1px solid #ef4444; color: #fff;
      font-size: 13px; font-weight: 600; padding: 10px 24px;
      border-radius: var(--ac-radius-full); cursor: pointer;
      transition: all var(--ac-transition-fast);
    }
    .btn-danger:hover { background: #dc2626; border-color: #dc2626; }
    .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-danger-outline {
      background: transparent; border: 1px solid #ef4444; color: #ef4444;
      font-size: 13px; font-weight: 600; padding: 10px 24px;
      border-radius: var(--ac-radius-full); cursor: pointer;
      transition: all var(--ac-transition-fast);
    }
    .btn-danger-outline:hover { background: rgba(239,68,68,0.08); }
    .btn-danger-outline:disabled { opacity: 0.5; cursor: not-allowed; }
    .uninstall-actions { display: flex; gap: 12px; margin-top: 8px; }
    .uninstall-log {
      background: #0d1117; color: #c9d1d9; font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px; line-height: 1.6; padding: 16px; border-radius: var(--ac-radius-lg);
      max-height: 300px; overflow-y: auto; margin-top: 16px;
      border: 1px solid var(--ac-border-subtle);
    }
    .uninstall-log-line { white-space: pre-wrap; word-break: break-all; }
    .uninstall-confirm {
      background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.3);
      border-radius: var(--ac-radius-lg); padding: 16px 20px; margin-top: 16px;
    }
    .uninstall-confirm-text { font-size: 13px; color: var(--ac-text); margin-bottom: 12px; font-weight: 600; }
    .confirm-actions { display: flex; gap: 8px; }
  `;

  private _lc = new LocaleController(this);
  @state() private _tab: Tab = "appearance";
  @state() private _theme: Theme = (localStorage.getItem(THEME_KEY) as Theme) ?? "system";
  @state() private _security: SecuritySettings = {
    mode: "standard",
    enableCredentialScrubbing: true,
    enableInjectionDetection: true,
    enableNetworkPolicy: false,
  };
  @state() private _gwState: "healthy" | "error" = "error";
  @state() private _gwLatency = 0;
  @state() private _dirty = false;
  @state() private _uninstallState: "idle" | "confirm-acaclaw" | "confirm-all" | "running" | "done" | "failed" = "idle";
  @state() private _uninstallLog: string[] = [];
  private _uninstallCleanup: (() => void) | null = null;


  override connectedCallback() {
    super.connectedCallback();
    this._loadSettings();
    this._checkGateway();
  }

  private async _loadSettings() {
    try {
      const snapshot = await gateway.call<Record<string, unknown>>("config.get");
      if (!snapshot) return;
      const cfg = (snapshot.config as Record<string, unknown>) ?? snapshot;
      const sec = cfg.security as Record<string, unknown> | undefined;
      if (sec) {
        this._security = {
          mode: (sec.mode as SecurityMode) ?? "standard",
          enableCredentialScrubbing: sec.enableCredentialScrubbing !== false,
          enableInjectionDetection: sec.enableInjectionDetection !== false,
          enableNetworkPolicy: sec.enableNetworkPolicy === true,
        };
      }
    } catch { /* gateway not connected yet */ }
  }

  private async _checkGateway() {
    const t0 = performance.now();
    try {
      await gateway.call("ping");
      this._gwLatency = Math.round(performance.now() - t0);
      this._gwState = "healthy";
    } catch {
      this._gwState = "error";
    }
  }

  private _setTheme(theme: Theme) {
    this._theme = theme;
    applyTheme(theme);
  }

  private _toggleSecurity(key: keyof SecuritySettings) {
    const val = this._security[key];
    if (typeof val === "boolean") {
      this._security = { ...this._security, [key]: !val };
      this._dirty = true;
    }
  }

  private _setSecurityMode(mode: SecurityMode) {
    this._security = { ...this._security, mode };
    this._dirty = true;
  }

  private async _saveSecuritySettings() {
    try {
      const snapshot = await gateway.call<Record<string, unknown>>("config.get");
      if (!snapshot) return;
      const cfg = (snapshot.config as Record<string, unknown>) ?? {};
      const baseHash = snapshot.baseHash as string;
      const updated = { ...cfg, security: { ...this._security } };
      await gateway.call("config.set", { raw: JSON.stringify(updated, null, 2), baseHash });
      this._dirty = false;
    } catch (e) {
      console.error("[settings] save failed", e);
    }
  }

  override render() {
    const tabLabels: Record<Tab, string> = {
      appearance: t("settings.tab.appearance"),
      security: t("settings.tab.security"),
      connection: t("settings.tab.connection"),
      openclaw: t("settings.tab.openclaw"),
      uninstall: t("settings.tab.uninstall"),
    };
    return html`
      <h1>${t("settings.title")}</h1>
      <div class="subtitle">${t("settings.subtitle")}</div>

      <div class="tabs">
        ${(["appearance", "security", "connection", "openclaw", "uninstall"] as Tab[]).map(
          (tab) => html`<div class="tab ${this._tab === tab ? "active" : ""}" @click=${() => { if (tab === "openclaw") { this._openOpenClawUI(); } else { this._tab = tab; } }}>${tabLabels[tab]}</div>`
        )}
      </div>

      ${this._tab === "appearance" ? this._renderAppearance() : nothing}
      ${this._tab === "security" ? this._renderSecurity() : nothing}
      ${this._tab === "connection" ? this._renderConnection() : nothing}
      ${this._tab === "uninstall" ? this._renderUninstall() : nothing}
      ${this._dirty ? html`<div class="save-banner" @click=${this._saveSecuritySettings}>${t("settings.save")}</div>` : nothing}
    `;
  }

  private _renderAppearance() {
    const locale = getLocale();
    const themeLabels: Record<Theme, string> = {
      light: t("settings.theme.light"),
      dark: t("settings.theme.dark"),
      system: t("settings.theme.system"),
    };
    return html`
      <div class="section">
        <div class="section-title">${t("settings.lang.title")}</div>
        <div class="section-desc">${t("settings.lang.desc")}</div>
        <div class="setting-row">
          <div>
            <div class="setting-label">${t("settings.lang.label")}</div>
            <div class="setting-hint">${t("settings.lang.hint")}</div>
          </div>
          <div class="theme-options">
            <button class="theme-btn ${locale === "en" ? "active" : ""}" @click=${() => setLocale("en")}>English</button>
            <button class="theme-btn ${locale === "zh-CN" ? "active" : ""}" @click=${() => setLocale("zh-CN")}>中文</button>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">${t("settings.theme.title")}</div>
        <div class="section-desc">${t("settings.theme.desc")}</div>
        <div class="setting-row">
          <div>
            <div class="setting-label">${t("settings.theme.label")}</div>
            <div class="setting-hint">${t("settings.theme.hint")}</div>
          </div>
          <div class="theme-options">
            ${(["light", "dark", "system"] as Theme[]).map(
              (th) => html`<button class="theme-btn ${this._theme === th ? "active" : ""}" @click=${() => this._setTheme(th)}>${themeLabels[th]}</button>`
            )}
          </div>
        </div>
      </div>
    `;
  }

  private _renderSecurity() {
    const sec = this._security;
    return html`
      <div class="section">
        <div class="section-title">${t("settings.security.mode.title")}</div>
        <div class="section-desc">${t("settings.security.mode.desc")}</div>
        <div class="setting-row">
          <div>
            <div class="setting-label">${t("settings.security.mode.label")}</div>
            <div class="setting-hint">${t("settings.security.mode.hint")}</div>
          </div>
          <div class="mode-options">
            <button class="mode-btn ${sec.mode === "standard" ? "active" : ""}" @click=${() => this._setSecurityMode("standard")}>${t("settings.security.mode.standard")}</button>
            <button class="mode-btn ${sec.mode === "maximum" ? "active" : ""}" @click=${() => this._setSecurityMode("maximum")}>${t("settings.security.mode.maximum")}</button>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">${t("settings.security.protections.title")}</div>
        <div class="section-desc">${t("settings.security.protections.desc")}</div>

        <div class="setting-row">
          <div>
            <div class="setting-label">${t("settings.security.credential.label")}</div>
            <div class="setting-hint">${t("settings.security.credential.hint")}</div>
          </div>
          <label class="toggle">
            <input type="checkbox" .checked=${sec.enableCredentialScrubbing} @change=${() => this._toggleSecurity("enableCredentialScrubbing")} />
            <span class="toggle-track"></span>
          </label>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-label">${t("settings.security.injection.label")}</div>
            <div class="setting-hint">${t("settings.security.injection.hint")}</div>
          </div>
          <label class="toggle">
            <input type="checkbox" .checked=${sec.enableInjectionDetection} @change=${() => this._toggleSecurity("enableInjectionDetection")} />
            <span class="toggle-track"></span>
          </label>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-label">${t("settings.security.network.label")}</div>
            <div class="setting-hint">${t("settings.security.network.hint")}</div>
          </div>
          <label class="toggle">
            <input type="checkbox" .checked=${sec.enableNetworkPolicy} @change=${() => this._toggleSecurity("enableNetworkPolicy")} />
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>
    `;
  }

  private _openOpenClawUI() {
    const token = document.querySelector<HTMLMetaElement>('meta[name="oc-token"]')?.content ?? "";
    const url = token
      ? `http://localhost:18789/#token=${encodeURIComponent(token)}`
      : "http://localhost:18789/";
    window.open(url, "_blank", "noopener");
  }

  private _renderConnection() {
    return html`
      <div class="section">
        <div class="section-title">${t("settings.conn.title")}</div>
        <div class="section-desc">${t("settings.conn.desc")}</div>
        <div class="setting-row">
          <div>
            <div class="setting-label">${t("settings.conn.label")}</div>
            <div class="setting-hint">localhost:2090</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div>
              <span class="status-badge ${this._gwState}">${this._gwState === "healthy" ? t("settings.conn.healthy") : t("settings.conn.unreachable")}</span>
              ${this._gwState === "healthy" ? html`<div class="conn-meta">${t("settings.conn.latency", this._gwLatency)}</div>` : nothing}
            </div>
            <button class="btn-action" @click=${this._checkGateway}>${t("settings.conn.check")}</button>
          </div>
        </div>
      </div>
    `;
  }

  @state() private _copyState: Record<string, boolean> = {};

  private async _copyCmd(key: string, cmd: string) {
    await navigator.clipboard.writeText(cmd);
    this._copyState = { ...this._copyState, [key]: true };
    setTimeout(() => { this._copyState = { ...this._copyState, [key]: false }; }, 2000);
  }

  private _startUninstall(mode: "acaclaw" | "all") {
    this._uninstallState = mode === "all" ? "confirm-all" : "confirm-acaclaw";
  }

  private _cancelUninstall() {
    this._uninstallState = "idle";
  }

  private async _confirmUninstall() {
    const mode = this._uninstallState === "confirm-all" ? "all" : "acaclaw";
    this._uninstallState = "running";
    this._uninstallLog = [];

    this._uninstallCleanup = gateway.onNotification("acaclaw.uninstall.progress", (data: unknown) => {
      const d = data as { line?: string };
      if (d.line) {
        this._uninstallLog = [...this._uninstallLog, d.line];
        const logEl = this.shadowRoot?.querySelector(".uninstall-log");
        if (logEl) requestAnimationFrame(() => { logEl.scrollTop = logEl.scrollHeight; });
      }
    });

    try {
      await gateway.call("acaclaw.uninstall", { mode });
      this._uninstallState = "done";
    } catch {
      // The uninstall script stops the gateway service as its final step,
      // which disconnects the WebSocket. If we received progress logs
      // showing file removal, the uninstall likely succeeded.
      const logText = this._uninstallLog.join(" ");
      const sawRemoval = logText.includes("Removed") || logText.includes("Removing Gateway Service");
      this._uninstallState = sawRemoval ? "done" : "failed";
    } finally {
      this._uninstallCleanup?.();
      this._uninstallCleanup = null;
    }
  }

  private _renderUninstall() {
    const acaclawCmd = "bash ~/github/acaclaw/scripts/uninstall.sh";
    const fullCmd = "bash ~/github/acaclaw/scripts/uninstall-all.sh";
    const running = this._uninstallState === "running";
    const confirming = this._uninstallState === "confirm-acaclaw" || this._uninstallState === "confirm-all";
    return html`
      <div class="uninstall-warning">
        <span class="uninstall-warning-icon">⚠️</span>
        <div class="uninstall-warning-text">${t("settings.uninstall.warning")}</div>
      </div>

      <div class="section">
        <div class="section-title">${t("settings.uninstall.removes.title")}</div>
        <div class="section-desc">${t("settings.uninstall.removes.desc")}</div>
        <ul class="removes-list">
          <li>${t("settings.uninstall.removes.profile")}</li>
          <li>${t("settings.uninstall.removes.conda")}</li>
          <li>${t("settings.uninstall.removes.config")}</li>
          <li>${t("settings.uninstall.removes.miniforge")}</li>
        </ul>
      </div>

      <div class="section">
        <div class="section-title">${t("settings.uninstall.keeps.title")}</div>
        <div class="section-desc">${t("settings.uninstall.keeps.desc")}</div>
        <ul class="keeps-list">
          <li>${t("settings.uninstall.keeps.openclaw")}</li>
          <li>${t("settings.uninstall.keeps.research")}</li>
          <li>${t("settings.uninstall.keeps.conda")}</li>
        </ul>
      </div>

      <div class="section">
        <div class="section-title">${t("settings.uninstall.section.title")}</div>
        <div class="section-desc">${t("settings.uninstall.section.desc")}</div>

        <div class="uninstall-actions">
          <button class="btn-danger-outline" ?disabled=${running || confirming}
            @click=${() => this._startUninstall("acaclaw")}>
            ${t("settings.uninstall.removeAcaclaw")}
          </button>
          <button class="btn-danger" ?disabled=${running || confirming}
            @click=${() => this._startUninstall("all")}>
            ${t("settings.uninstall.removeAll")}
          </button>
        </div>

        ${confirming ? html`
          <div class="uninstall-confirm">
            <div class="uninstall-confirm-text">
              ${this._uninstallState === "confirm-all"
                ? t("settings.uninstall.confirmAll")
                : t("settings.uninstall.confirmAcaclaw")}
            </div>
            <div class="confirm-actions">
              <button class="btn-danger" @click=${this._confirmUninstall}>${t("settings.uninstall.yes")}</button>
              <button class="btn-action" @click=${this._cancelUninstall}>${t("settings.uninstall.cancel")}</button>
            </div>
          </div>
        ` : nothing}

        ${this._uninstallState === "done" ? html`
          <div class="uninstall-confirm" style="border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.06);">
            <div class="uninstall-confirm-text" style="color: #10b981;">${t("settings.uninstall.done")}</div>
          </div>
        ` : nothing}

        ${this._uninstallState === "failed" ? html`
          <div class="uninstall-confirm">
            <div class="uninstall-confirm-text" style="color: #ef4444;">${t("settings.uninstall.failed")}</div>
          </div>
        ` : nothing}
      </div>

      ${this._uninstallLog.length > 0 ? html`
        <div class="section">
          <div class="section-title">${running ? t("settings.uninstall.inProgress") : t("settings.uninstall.log")}</div>
          <div class="uninstall-log">
            ${this._uninstallLog.map((line) => html`<div class="uninstall-log-line">${line}</div>`)}
          </div>
        </div>
      ` : nothing}

      <div class="section">
        <div class="section-title">${t("settings.uninstall.manual.title")}</div>
        <div class="section-desc">${t("settings.uninstall.manual.desc")}</div>

        <div class="cmd-label">${t("settings.uninstall.manual.acaclawOnly")}</div>
        <div class="cmd-box">
          <code class="cmd-code">${acaclawCmd}</code>
          <button class="btn-copy ${this._copyState["acaclaw"] ? "copied" : ""}"
            @click=${() => this._copyCmd("acaclaw", acaclawCmd)}>
            ${this._copyState["acaclaw"] ? t("settings.uninstall.copied") : t("settings.uninstall.copy")}
          </button>
        </div>

        <div class="cmd-label" style="margin-top:16px">${t("settings.uninstall.manual.everything")}</div>
        <div class="cmd-box">
          <code class="cmd-code">${fullCmd}</code>
          <button class="btn-copy ${this._copyState["full"] ? "copied" : ""}"
            @click=${() => this._copyCmd("full", fullCmd)}>
            ${this._copyState["full"] ? t("settings.uninstall.copied") : t("settings.uninstall.copy")}
          </button>
        </div>
      </div>
    `;
  }

}
