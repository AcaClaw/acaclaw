import { LitElement, html, css, nothing, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { t, LocaleController } from "./i18n.js";

// Eager: default/primary views needed immediately
import "./views/monitor.js";
import "./views/chat.js";
import type { ChatView } from "./views/chat.js";

// Lazy-loaded on first navigation
const lazyViews: Record<string, () => Promise<unknown>> = {
  usage: () => import("./views/usage.js"),
  skills: () => import("./views/skills.js"),
  workspace: () => import("./views/workspace.js"),
  environment: () => import("./views/environment.js"),
  backup: () => import("./views/backup.js"),
  settings: () => import("./views/settings.js"),
  "api-keys": () => import("./views/api-keys.js"),
  onboarding: () => import("./views/onboarding.js"),
  staff: () => import("./views/staff.js"),
};
const loadedViews = new Set<string>();

// Import gateway controller
import { gateway, GatewayState } from "./controllers/gateway.js";

type Route =
  | "chat"
  | "staff"
  | "monitor"
  | "api-keys"
  | "usage"
  | "skills"
  | "workspace"
  | "environment"
  | "backup"
  | "settings"
  | "setup";

interface NavItem {
  id: Route;
  label: string;
  description: string;
}

/* Crisp 20×20 stroke-based SVG icons */
const NAV_ICONS: Record<Route, ReturnType<typeof svg>> = {
  chat: svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v9a1 1 0 01-1 1H7l-4 3V4z"/></svg>`,
  staff: svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="6" r="2.5"/><path d="M2 16v-1a4 4 0 014-4h2a4 4 0 014 4v1"/><circle cx="14" cy="5" r="2"/><path d="M14 11a3.5 3.5 0 013.5 3.5V16"/></svg>`,
  monitor: svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="16" height="11" rx="2"/><path d="M10 13v4"/><path d="M6 17h8"/></svg>`,
  "api-keys": svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="7.5" r="3.5"/><path d="M10 10l7 7"/><path d="M14 14l2-2"/><path d="M16 16l2-2"/></svg>`,
  usage: svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V10"/><path d="M7 17V6"/><path d="M11 17V9"/><path d="M15 17V3"/></svg>`,
  skills: svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v4M10 14v4M2 10h4m8 0h4"/><circle cx="10" cy="10" r="3"/></svg>`,
  workspace: svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h5l2 2h5a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>`,
  environment: svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M2 9h16"/><path d="M8 16V9"/></svg>`,
  backup: svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 14.5A4.5 4.5 0 0 0 14 6h-.5a7.5 7.5 0 0 0-11 5.5 4.5 4.5 0 0 0 4.5 6h8a4.5 4.5 0 0 0 1.5-.2z"/><path d="M10 9v6"/><path d="M7 12l3-3 3 3"/></svg>`,
  settings: svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M17.4 11.2a7.3 7.3 0 0 0 0-2.4l1.6-1.3a.5.5 0 0 0 .1-.6l-1.5-2.6a.5.5 0 0 0-.6-.2l-1.9.8a7.3 7.3 0 0 0-2-1.2V2.5a.5.5 0 0 0-.5-.5H7.4a.5.5 0 0 0-.5.5v1.2a7.3 7.3 0 0 0-2 1.2l-1.9-.8a.5.5 0 0 0-.6.2L.9 6.9a.5.5 0 0 0 .1.6l1.6 1.3a7.3 7.3 0 0 0 0 2.4l-1.6 1.3a.5.5 0 0 0-.1.6l1.5 2.6c.1.2.4.3.6.2l1.9-.8a7.3 7.3 0 0 0 2 1.2v1.2a.5.5 0 0 0 .5.5h3.6a.5.5 0 0 0 .5-.5v-1.2a7.3 7.3 0 0 0 2-1.2l1.9.8a.5.5 0 0 0 .6-.2l1.5-2.6a.5.5 0 0 0-.1-.6l-1.6-1.3z"/></svg>`,
  setup: svg``,
};

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "AI Work",
    items: [
      { id: "chat", label: "Chat", description: "Ask questions" },
      { id: "staff", label: "Staff", description: "Your digital team" },
    ]
  },
  {
    title: "Observability",
    items: [
      { id: "monitor", label: "Monitor", description: "System dashboard" },
      { id: "api-keys", label: "API Keys", description: "Providers & keys" },
      { id: "usage", label: "Usage", description: "Costs & tokens" },
      { id: "skills", label: "Skills", description: "Tools & abilities" },
    ]
  },
  {
    title: "Platform",
    items: [
      { id: "workspace", label: "Workspace", description: "Files & projects" },
      { id: "environment", label: "Environment", description: "Packages & envs" },
      { id: "backup", label: "Backup", description: "Snapshots & restore" },
      { id: "settings", label: "Settings", description: "Global preferences" },
    ]
  }
];

@customElement("acaclaw-app")
export class AcaClawApp extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _route: Route = "chat";
  @state() private _gatewayState: GatewayState = "disconnected";
  @state() private _agentStatus = "idle";
  @state() private _tokenCount = 0;
  @state() private _sidebarCollapsed = false;
  @state() private _brandName = localStorage.getItem("acaclaw-brand-name") ?? "AcaClaw";
  @state() private _editingBrand = false;

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: var(--ac-app-bg);
    }

    .shell {
      display: flex;
      flex: 1;
      overflow: hidden;
      padding: 16px 16px 16px 0;
      gap: 12px;
    }

    /* ── Sidebar ── */
    .sidebar {
      width: var(--ac-sidebar-width);
      background: transparent;
      display: flex;
      flex-direction: column;
      transition: width var(--ac-transition);
      overflow: hidden;
      flex-shrink: 0;
    }
    .sidebar.collapsed {
      width: 72px;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 24px 24px;
    }
    .sidebar-header img {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
    }
    .sidebar-header .brand {
      font-size: 18px;
      font-weight: 800;
      color: var(--ac-text);
      white-space: nowrap;
      letter-spacing: -0.04em;
      cursor: default;
      user-select: none;
    }
    .sidebar-header .brand-input {
      font-size: 18px;
      font-weight: 800;
      color: var(--ac-text);
      letter-spacing: -0.04em;
      background: var(--ac-surface);
      border: 1px solid var(--ac-border);
      border-radius: 4px;
      padding: 0 4px;
      outline: none;
      width: 120px;
    }
    .sidebar.collapsed .brand,
    .sidebar.collapsed .brand-input {
      display: none;
    }

    .nav-section-label {
      padding: 16px 24px 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ac-text-tertiary);
    }
    .sidebar.collapsed .nav-section-label {
      display: none;
    }

    .nav-list {
      flex: 1;
      padding: 0 12px;
      overflow-y: auto;
    }

    
    .nav-group-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ac-text-muted);
      margin: 16px 0 8px 12px;
    }

    
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      cursor: pointer;
      color: var(--ac-text-secondary);
      transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
      border: 1px solid transparent;
      margin-bottom: 2px;
      background: transparent;
    }

    .nav-item:hover {
      background: var(--ac-bg-hover);
      color: var(--ac-text-primary);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      border-color: rgba(255, 255, 255, 0.05);
    }

    .nav-item.active {
      background: linear-gradient(135deg, var(--ac-bg-tertiary), rgba(255,255,255,0.02));
      color: var(--ac-text-primary);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05);
      border: 1px solid var(--ac-border);
      position: relative;
    }

    .nav-item.active::before {
      content: '';
      position: absolute;
      left: -8px;
      top: 50%;
      transform: translateY(-50%);
      width: 4px;
      height: 16px;
      background: var(--ac-accent);
      border-radius: 0 4px 4px 0;
    }
.icon {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ac-text-muted);
      background: transparent;
      border-radius: 8px;
      transition: all var(--ac-transition-fast);
    }
    .nav-item:hover .icon {
      color: var(--ac-text-secondary);
    }
    .nav-item.active .icon {
      color: var(--ac-primary);
    }
    .nav-item .label-group {
      display: flex;
      flex-direction: column;
      white-space: nowrap;
      overflow: hidden;
    }
    .nav-item .label {
      font-size: 14.5px;
      font-weight: 500;
      color: var(--ac-text-secondary);
      transition: color var(--ac-transition-fast);
    }
    .nav-item.active .label {
      color: var(--ac-text);
      font-weight: 600;
    }
    .nav-item .desc {
      font-size: 12px;
      color: var(--ac-text-muted);
      margin-top: 1px;
    }
    .sidebar.collapsed .label-group {
      display: none;
    }
    .sidebar.collapsed .nav-section-label {
      display: none;
    }

    .collapse-btn {
      padding: 16px 24px;
      cursor: pointer;
      color: var(--ac-text-muted);
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all var(--ac-transition-fast);
      border-top: 1px solid var(--ac-border-subtle);
    }
    .sidebar.collapsed .collapse-btn {
      justify-content: center;
      padding: 16px 0;
    }
    .collapse-btn:hover {
      color: var(--ac-text);
      background: var(--ac-bg-hover);
    }

    /* ── Main content (Floating/Card Style) ── */
    .main {
      flex: 1;
      overflow-y: auto;
      background: var(--ac-bg-surface);
      border-radius: var(--ac-radius-xl);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 10px 24px rgba(0, 0, 0, 0.04);
      margin-bottom: 0px;
      padding: 48px 64px;
    }

    /* ── Sidebar Footer & Status ── */
    .sidebar-footer {
      margin-top: auto;
      display: flex;
      flex-direction: column;
    }
    .statusbar-mini {
      padding: 16px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 13px;
      font-weight: 500;
      color: var(--ac-text-secondary);
    }
    .statusbar-mini .item {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .statusbar-mini .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      box-shadow: 0 0 0 2px var(--ac-app-bg);
    }
    .statusbar-mini .status-dot.online { background: var(--ac-success); }
    .statusbar-mini .status-dot.offline { background: var(--ac-error); }
    .statusbar-mini .gateway-status {
      cursor: pointer;
      border-radius: 6px;
      padding: 2px 6px 2px 0;
      margin: -2px -6px -2px 0;
      transition: background 0.15s;
    }
    .statusbar-mini .gateway-status:hover {
      background: var(--ac-hover, rgba(255,255,255,0.06));
    }
    .statusbar-mini .gateway-status.reconnecting .status-dot {
      animation: pulse-dot 1s ease-in-out infinite;
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    
    .statusbar-mini .status-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 8px;
      color: var(--ac-text-tertiary);
    }
    
    .sidebar.collapsed .status-text {
      display: none;
    }
    .sidebar.collapsed .statusbar-mini {
      padding: 16px 0;
      align-items: center;
    }

    @media (max-width: 768px) {
      .shell {
        padding: 0;
      }
      .main {
        border-radius: 0;
      }
      .sidebar {
        width: 60px;
      }
      .sidebar .label-group,
      .sidebar .brand,
      .sidebar .nav-section-label {
        display: none;
      }
      .main {
        padding: 20px;
      }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._routeFromHash();
    window.addEventListener("hashchange", () => this._routeFromHash());
    gateway.addEventListener("state-change", ((e: CustomEvent) => {
      this._gatewayState = e.detail.state;
    }) as EventListener);
    gateway.addEventListener("status-update", ((e: CustomEvent) => {
      this._agentStatus = e.detail.agentStatus ?? this._agentStatus;
      this._tokenCount = e.detail.tokenCount ?? this._tokenCount;
    }) as EventListener);

    // Navigate to Chat when an agent "💬 Chat" button is clicked
    window.addEventListener("open-agent-chat", ((e: CustomEvent) => {
      if (this._route === "chat") return; // Already on chat; let chat component handle it
      const agentId = e.detail?.agentId;
      this._navigate("chat");
      // Re-dispatch after render so the newly-mounted chat component receives it
      this.updateComplete.then(() => {
        window.dispatchEvent(
          new CustomEvent("open-agent-chat", { detail: { agentId } })
        );
      });
    }) as EventListener);

    // Navigate to Chat and load a specific session (from Monitor)
    window.addEventListener("load-session", ((e: CustomEvent) => {
      const sessionKey = e.detail?.sessionKey as string | undefined;
      if (!sessionKey) return;
      this._navigate("chat");
      this.updateComplete.then(() => {
        const chat = this.shadowRoot?.querySelector("acaclaw-chat") as ChatView | null;
        chat?.loadSession(sessionKey);
      });
    }) as EventListener);

    gateway.connect();
  }

  private _routeFromHash() {
    const hash = location.hash.slice(1) || "api-keys";
    if (NAV_GROUPS.some(g => g.items.some(n => n.id === hash)) || hash === "setup") {
      this._route = hash as Route;
      this._ensureViewLoaded(hash);
    }
  }

  private _navigate(route: Route) {
    location.hash = route;
    this._route = route;
    this._ensureViewLoaded(route);
  }

  private _ensureViewLoaded(route: string) {
    if (loadedViews.has(route) || !lazyViews[route]) return;
    loadedViews.add(route);
    lazyViews[route]();
  }

  /**
   * Chat is always in the DOM (hidden when inactive) so session state
   * survives tab switches.  Other views are created/destroyed normally.
   */
  private _renderView() {
    let otherView = nothing;
    switch (this._route) {
      case "staff":
        otherView = html`<acaclaw-staff></acaclaw-staff>`;
        break;
      case "monitor":
        otherView = html`<acaclaw-monitor></acaclaw-monitor>`;
        break;
      case "api-keys":
        otherView = html`<acaclaw-api-keys></acaclaw-api-keys>`;
        break;
      case "usage":
        otherView = html`<acaclaw-usage></acaclaw-usage>`;
        break;
      case "skills":
        otherView = html`<acaclaw-skills></acaclaw-skills>`;
        break;
      case "workspace":
        otherView = html`<acaclaw-workspace></acaclaw-workspace>`;
        break;
      case "environment":
        otherView = html`<acaclaw-environment></acaclaw-environment>`;
        break;
      case "backup":
        otherView = html`<acaclaw-backup></acaclaw-backup>`;
        break;
      case "settings":
        otherView = html`<acaclaw-settings></acaclaw-settings>`;
        break;
    }
    return html`
      <acaclaw-chat style="display:${this._route === "chat" ? "flex" : "none"}"></acaclaw-chat>
      ${otherView}
    `;
  }

  private _gatewayLabel() {
    switch (this._gatewayState) {
      case "connected":
        return t("nav.status.running");
      case "connecting":
        return t("nav.status.connecting");
      case "disconnected":
        return t("nav.status.disconnected");
    }
  }

  private _gatewayDotClass() {
    return this._gatewayState === "connected" ? "online" : "offline";
  }

  private _onStatusClick() {
    if (this._gatewayState === "disconnected") {
      gateway.reconnectNow();
    }
  }

  override render() {
    if (this._route === "setup") {
      return html`<acaclaw-onboarding></acaclaw-onboarding>`;
    }

    return html`
      <div class="shell">
        <nav class="sidebar ${this._sidebarCollapsed ? "collapsed" : ""}">
          <div class="sidebar-header">
            <img src="/logo/AcaClaw.svg" alt="AcaClaw" />
            ${this._editingBrand
              ? html`<input class="brand-input"
                .value=${this._brandName}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") { this._editingBrand = false; }
                }}
                @blur=${(e: Event) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) { this._brandName = v; localStorage.setItem("acaclaw-brand-name", v); }
                  this._editingBrand = false;
                }}
                @focus=${(e: Event) => (e.target as HTMLInputElement).select()}
              />`
              : html`<span class="brand" @dblclick=${() => { this._editingBrand = true; this.updateComplete.then(() => this.shadowRoot?.querySelector<HTMLInputElement>(".brand-input")?.focus()); }}>${this._brandName}</span>`
            }
          </div>
          <div class="nav-list">
            ${NAV_GROUPS.map(
              (group) => html`
                
                ${group.items.map(
                  (item) => html`
                    <div
                      class="nav-item ${this._route === item.id ? "active" : ""}"
                      @click=${() => this._navigate(item.id)}
                    >
                      <span class="icon">${NAV_ICONS[item.id]}</span>
                      <div class="label-group">
                        <span class="label">${t("nav." + item.id)}</span>
                        <span class="desc">${t("nav." + item.id + ".desc")}</span>
                      </div>
                    </div>
                  `
                )}
              `
            )}
          </div>
          <div class="sidebar-footer">
            <div class="statusbar-mini">
              <div class="item gateway-status ${this._gatewayState === "connecting" ? "reconnecting" : ""}"
                   title=${this._gatewayState === "disconnected" ? "Click to reconnect" : this._gatewayState === "connecting" ? "Reconnecting…" : "Connected to gateway"}
                   @click=${this._onStatusClick}>
                <span class="status-dot ${this._gatewayDotClass()}"></span>
                <span class="status-text">${this._gatewayLabel()}</span>
              </div>
              <div class="item">
                <span class="status-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </span>
                <span class="status-text">${this._agentStatus}</span>
              </div>
              <div class="item">
                <span class="status-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </span>
                <span class="status-text">${this._formatTokens(this._tokenCount)}</span>
              </div>
            </div>
            <div
              class="collapse-btn"
              @click=${() =>
                (this._sidebarCollapsed = !this._sidebarCollapsed)}
            >
              ${this._sidebarCollapsed ? "›" : "‹"}
              ${this._sidebarCollapsed ? nothing : html`<span>${t("nav.collapse")}</span>`}
            </div>
          </div>
        </nav>
        <main class="main">${this._renderView()}</main>
      </div>
    `;
  }

  private _formatTokens(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }
}
