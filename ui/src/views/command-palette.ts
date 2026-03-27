/** Command palette — quick navigation and search (Ctrl+K / Cmd+K). */
import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { t, LocaleController } from "../i18n.js";

interface PaletteItem {
  id: string;
  label: string;
  description: string;
  category: "navigation" | "command" | "skill";
  action: () => void;
}

@customElement("acaclaw-command-palette")
export class CommandPalette extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _open = false;
  @state() private _query = "";
  @state() private _selectedIndex = 0;

  private _items: PaletteItem[] = [];

  static override styles = css`
    :host { display: contents; }

    .overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px);
      display: flex; justify-content: center; padding-top: 20vh;
      animation: fade-in 0.15s ease-out;
    }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

    .palette {
      width: 540px; max-height: 420px;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-xl); box-shadow: var(--ac-shadow-lg);
      display: flex; flex-direction: column; overflow: hidden;
      animation: slide-down 0.15s ease-out;
    }
    @keyframes slide-down {
      from { opacity: 0; transform: translateY(-12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .search-row {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px; border-bottom: 1px solid var(--ac-border-subtle);
    }
    .search-icon { color: var(--ac-text-muted); flex-shrink: 0; }
    .search-input {
      flex: 1; background: none; border: none; outline: none;
      font-size: 15px; color: var(--ac-text); font-family: inherit;
    }
    .search-input::placeholder { color: var(--ac-text-tertiary); }
    .kbd {
      font-size: 11px; font-weight: 600; padding: 2px 6px;
      border: 1px solid var(--ac-border); border-radius: 4px;
      color: var(--ac-text-muted); background: var(--ac-bg-hover);
    }

    .results {
      flex: 1; overflow-y: auto; padding: 6px;
    }
    .category-label {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--ac-text-tertiary);
      padding: 8px 12px 4px;
    }
    .result-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: var(--ac-radius-lg); cursor: pointer;
      transition: background 0.1s;
    }
    .result-item:hover, .result-item.selected {
      background: var(--ac-bg-hover);
    }
    .result-item.selected {
      background: var(--ac-primary-subtle, rgba(99, 102, 241, 0.08));
    }
    .result-label { font-size: 14px; font-weight: 500; color: var(--ac-text); }
    .result-desc { font-size: 12px; color: var(--ac-text-muted); margin-left: auto; }

    .empty {
      padding: 32px; text-align: center;
      font-size: 13px; color: var(--ac-text-muted);
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this._onGlobalKey);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this._onGlobalKey);
  }

  private _onGlobalKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      this._toggle();
    }
    if (e.key === "Escape" && this._open) {
      this._close();
    }
  };

  private _toggle() {
    this._open = !this._open;
    if (this._open) {
      this._query = "";
      this._selectedIndex = 0;
      this._buildItems();
      this.updateComplete.then(() => {
        this.shadowRoot?.querySelector<HTMLInputElement>(".search-input")?.focus();
      });
    }
  }

  private _close() {
    this._open = false;
    this._query = "";
  }

  private _buildItems() {
    this._items = [
      { id: "chat", label: t("nav.chat"), description: t("nav.chat.desc"), category: "navigation", action: () => this._nav("chat") },
      { id: "staff", label: t("nav.staff"), description: t("nav.staff.desc"), category: "navigation", action: () => this._nav("staff") },
      { id: "monitor", label: t("nav.monitor"), description: t("nav.monitor.desc"), category: "navigation", action: () => this._nav("monitor") },
      { id: "api-keys", label: t("nav.api-keys"), description: t("nav.api-keys.desc"), category: "navigation", action: () => this._nav("api-keys") },
      { id: "usage", label: t("nav.usage"), description: t("nav.usage.desc"), category: "navigation", action: () => this._nav("usage") },
      { id: "skills", label: t("nav.skills"), description: t("nav.skills.desc"), category: "navigation", action: () => this._nav("skills") },
      { id: "sessions", label: t("nav.sessions"), description: t("nav.sessions.desc"), category: "navigation", action: () => this._nav("sessions") },
      { id: "logs", label: t("nav.logs"), description: t("nav.logs.desc"), category: "navigation", action: () => this._nav("logs") },
      { id: "debug", label: t("nav.debug"), description: t("nav.debug.desc"), category: "navigation", action: () => this._nav("debug") },
      { id: "workspace", label: t("nav.workspace"), description: t("nav.workspace.desc"), category: "navigation", action: () => this._nav("workspace") },
      { id: "environment", label: t("nav.environment"), description: t("nav.environment.desc"), category: "navigation", action: () => this._nav("environment") },
      { id: "backup", label: t("nav.backup"), description: t("nav.backup.desc"), category: "navigation", action: () => this._nav("backup") },
      { id: "settings", label: t("nav.settings"), description: t("nav.settings.desc"), category: "navigation", action: () => this._nav("settings") },
    ];
  }

  private _nav(route: string) {
    location.hash = route;
    this._close();
  }

  private _filtered(): PaletteItem[] {
    if (!this._query) return this._items;
    const q = this._query.toLowerCase();
    return this._items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.includes(q)
    );
  }

  private _onInput(e: InputEvent) {
    this._query = (e.target as HTMLInputElement).value;
    this._selectedIndex = 0;
  }

  private _onKeydown(e: KeyboardEvent) {
    const items = this._filtered();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this._selectedIndex = Math.min(this._selectedIndex + 1, items.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
    } else if (e.key === "Enter" && items[this._selectedIndex]) {
      e.preventDefault();
      items[this._selectedIndex].action();
    }
  }

  override render() {
    if (!this._open) return nothing;

    const items = this._filtered();
    const grouped = new Map<string, PaletteItem[]>();
    for (const item of items) {
      const list = grouped.get(item.category) ?? [];
      list.push(item);
      grouped.set(item.category, list);
    }

    let idx = 0;
    return html`
      <div class="overlay" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains("overlay")) this._close(); }}>
        <div class="palette">
          <div class="search-row">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input class="search-input"
              placeholder="${t("palette.placeholder")}"
              .value=${this._query}
              @input=${this._onInput}
              @keydown=${this._onKeydown}
            />
            <span class="kbd">Esc</span>
          </div>
          <div class="results">
            ${items.length === 0
              ? html`<div class="empty">${t("palette.empty")}</div>`
              : [...grouped.entries()].map(([cat, catItems]) => html`
                  <div class="category-label">${cat}</div>
                  ${catItems.map((item) => {
                    const thisIdx = idx++;
                    return html`
                      <div class="result-item ${thisIdx === this._selectedIndex ? "selected" : ""}"
                        @click=${() => item.action()}
                        @mouseenter=${() => { this._selectedIndex = thisIdx; }}>
                        <span class="result-label">${item.label}</span>
                        <span class="result-desc">${item.description}</span>
                      </div>
                    `;
                  })}
                `)
            }
          </div>
        </div>
      </div>
    `;
  }
}
