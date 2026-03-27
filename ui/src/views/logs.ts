/** Logs view — real-time gateway log viewer with level filtering and search. */
import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";

interface LogEntry {
  timestamp: string;
  level: string;
  subsystem: string;
  message: string;
  raw?: string;
}

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
type LogLevel = typeof LOG_LEVELS[number];

const LEVEL_COLORS: Record<string, string> = {
  trace: "#94a3b8",
  debug: "#a78bfa",
  info: "#60a5fa",
  warn: "#fbbf24",
  error: "#f87171",
  fatal: "#ef4444",
};

@customElement("acaclaw-logs")
export class LogsView extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _entries: LogEntry[] = [];
  @state() private _loading = true;
  @state() private _search = "";
  @state() private _enabledLevels = new Set<LogLevel>(["info", "warn", "error", "fatal"]);
  @state() private _autoFollow = true;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  static override styles = css`
    :host { display: block; animation: fade-in 0.3s ease-out forwards; }
    @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.04em; color: var(--ac-text); margin-bottom: 4px; }
    .subtitle { font-size: 15px; color: var(--ac-text-muted); line-height: 1.5; margin-bottom: 24px; }

    .toolbar {
      display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;
    }
    .search-box {
      flex: 1; min-width: 200px; padding: 10px 14px; font-size: 13px;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg); color: var(--ac-text); outline: none;
      font-family: inherit;
    }
    .search-box:focus { border-color: var(--ac-primary); }
    .search-box::placeholder { color: var(--ac-text-tertiary); }

    .level-toggles { display: flex; gap: 4px; }
    .level-btn {
      padding: 5px 10px; font-size: 11px; font-weight: 700;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full);
      background: var(--ac-bg-surface); cursor: pointer;
      transition: all 0.15s; text-transform: uppercase; letter-spacing: 0.03em;
    }
    .level-btn.active { color: #fff; }
    .level-btn:not(.active) { color: var(--ac-text-muted); }

    .btn {
      padding: 8px 16px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full);
      background: var(--ac-bg-surface); color: var(--ac-text-muted);
      cursor: pointer; transition: all 0.15s;
    }
    .btn:hover { background: var(--ac-bg-hover); color: var(--ac-text); }
    .btn.active { background: var(--ac-primary); color: #fff; border-color: var(--ac-primary); }

    .log-container {
      background: #0d1117; border-radius: var(--ac-radius-lg);
      border: 1px solid var(--ac-border-subtle);
      max-height: calc(100vh - 280px); overflow-y: auto;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px; line-height: 1.7;
    }

    .log-line {
      display: flex; gap: 10px; padding: 3px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    .log-line:hover { background: rgba(255, 255, 255, 0.03); }
    .log-ts { color: #6e7681; flex-shrink: 0; min-width: 70px; }
    .log-level {
      font-weight: 700; flex-shrink: 0; min-width: 50px;
      text-transform: uppercase; font-size: 11px;
    }
    .log-subsystem { color: #8b949e; flex-shrink: 0; min-width: 100px; }
    .log-msg { color: #c9d1d9; word-break: break-word; flex: 1; }

    .status-bar {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 12px; font-size: 12px; color: var(--ac-text-muted);
    }

    .empty-state {
      text-align: center; padding: 48px; color: #6e7681; font-size: 13px;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._fetchLogs();
    this._pollTimer = setInterval(() => this._fetchLogs(), 5000);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) clearInterval(this._pollTimer);
  }

  private async _fetchLogs() {
    try {
      const result = await gateway.call<{ entries: LogEntry[] }>("logs.tail", { lines: 200 });
      if (result?.entries) {
        this._entries = result.entries;
        this._loading = false;
        if (this._autoFollow) {
          this.updateComplete.then(() => {
            const container = this.shadowRoot?.querySelector(".log-container");
            if (container) container.scrollTop = container.scrollHeight;
          });
        }
      }
    } catch {
      if (this._loading) this._loading = false;
    }
  }

  private _filtered(): LogEntry[] {
    return this._entries.filter((e) => {
      const level = (e.level || "info").toLowerCase() as LogLevel;
      if (!this._enabledLevels.has(level)) return false;
      if (this._search) {
        const q = this._search.toLowerCase();
        return (
          e.message.toLowerCase().includes(q) ||
          (e.subsystem || "").toLowerCase().includes(q) ||
          (e.raw || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }

  private _toggleLevel(level: LogLevel) {
    const s = new Set(this._enabledLevels);
    if (s.has(level)) s.delete(level);
    else s.add(level);
    this._enabledLevels = s;
  }

  private _exportLogs() {
    const lines = this._filtered().map(
      (e) => `${e.timestamp} [${e.level}] ${e.subsystem}: ${e.message}`
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acaclaw-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  override render() {
    const filtered = this._filtered();

    return html`
      <h1>${t("logs.title")}</h1>
      <div class="subtitle">${t("logs.subtitle")}</div>

      <div class="toolbar">
        <input class="search-box" placeholder="${t("logs.search")}"
          .value=${this._search}
          @input=${(e: InputEvent) => { this._search = (e.target as HTMLInputElement).value; }} />
        <div class="level-toggles">
          ${LOG_LEVELS.map(
            (level) => html`
              <button class="level-btn ${this._enabledLevels.has(level) ? "active" : ""}"
                style="${this._enabledLevels.has(level) ? `background:${LEVEL_COLORS[level]};border-color:${LEVEL_COLORS[level]}` : ""}"
                @click=${() => this._toggleLevel(level)}>
                ${level}
              </button>
            `
          )}
        </div>
        <button class="btn ${this._autoFollow ? "active" : ""}" @click=${() => { this._autoFollow = !this._autoFollow; }}>
          ${t("logs.autoFollow")}
        </button>
        <button class="btn" @click=${this._exportLogs}>${t("logs.export")}</button>
      </div>

      <div class="log-container">
        ${this._loading
          ? html`<div class="empty-state">${t("logs.loading")}</div>`
          : filtered.length === 0
            ? html`<div class="empty-state">${t("logs.empty")}</div>`
            : filtered.map(
                (e) => html`
                  <div class="log-line">
                    <span class="log-ts">${this._formatTime(e.timestamp)}</span>
                    <span class="log-level" style="color:${LEVEL_COLORS[e.level?.toLowerCase()] || LEVEL_COLORS.info}">${e.level || "INFO"}</span>
                    <span class="log-subsystem">${e.subsystem || ""}</span>
                    <span class="log-msg">${e.message || e.raw || ""}</span>
                  </div>
                `
              )
        }
      </div>

      <div class="status-bar">
        <span>${filtered.length} entries (${this._entries.length} total)</span>
        <span>${this._autoFollow ? "Auto-scrolling" : "Scroll paused"}</span>
      </div>
    `;
  }

  private _formatTime(ts: string): string {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return ts?.slice(11, 19) || "";
    }
  }
}
