/** Debug view — diagnostic tools, snapshots, RPC calls, and event inspection. */
import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";

type DebugTab = "snapshots" | "rpc" | "events";

interface GatewayEvent {
  type: string;
  timestamp: string;
  payload: string;
}

@customElement("acaclaw-debug")
export class DebugView extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _tab: DebugTab = "snapshots";
  @state() private _statusSnapshot = "";
  @state() private _healthSnapshot = "";
  @state() private _heartbeat = "";
  @state() private _rpcMethod = "";
  @state() private _rpcParams = "{}";
  @state() private _rpcResult = "";
  @state() private _rpcError = "";
  @state() private _rpcLoading = false;
  @state() private _events: GatewayEvent[] = [];
  @state() private _loading = false;

  static override styles = css`
    :host { display: block; animation: fade-in 0.3s ease-out forwards; }
    @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.04em; color: var(--ac-text); margin-bottom: 4px; }
    .subtitle { font-size: 15px; color: var(--ac-text-muted); line-height: 1.5; margin-bottom: 24px; }

    .tabs { display: flex; gap: 0; margin-bottom: 28px; border-bottom: 1px solid var(--ac-border); }
    .tab {
      padding: 12px 20px; font-size: 13px; font-weight: 600;
      color: var(--ac-text-muted); cursor: pointer;
      border-bottom: 2px solid transparent; margin-bottom: -1px;
      transition: color 0.15s;
    }
    .tab:hover { color: var(--ac-text-secondary); }
    .tab.active { color: var(--ac-primary); border-bottom-color: var(--ac-primary); }

    .section { margin-bottom: 24px; }
    .section-title {
      font-size: 16px; font-weight: 700; letter-spacing: -0.02em;
      color: var(--ac-text); margin-bottom: 4px;
    }
    .section-desc { font-size: 13px; color: var(--ac-text-muted); margin-bottom: 12px; }

    .btn {
      padding: 8px 16px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full);
      background: var(--ac-bg-surface); color: var(--ac-text-muted);
      cursor: pointer; transition: all 0.15s;
    }
    .btn:hover { background: var(--ac-bg-hover); color: var(--ac-text); }
    .btn.primary { background: var(--ac-primary); color: #fff; border-color: var(--ac-primary); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .json-box {
      background: #0d1117; color: #c9d1d9;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px; line-height: 1.6; padding: 16px;
      border-radius: var(--ac-radius-lg); border: 1px solid var(--ac-border-subtle);
      max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-all;
    }

    .rpc-form { display: flex; flex-direction: column; gap: 12px; }
    .rpc-row { display: flex; gap: 10px; align-items: flex-start; }
    .rpc-input {
      flex: 1; padding: 10px 14px; font-size: 13px;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg); color: var(--ac-text); outline: none;
      font-family: inherit;
    }
    .rpc-input:focus { border-color: var(--ac-primary); }
    .rpc-textarea {
      padding: 10px 14px; font-size: 12px;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg); color: var(--ac-text); outline: none;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      resize: vertical; min-height: 80px;
    }
    .rpc-textarea:focus { border-color: var(--ac-primary); }

    .error-box {
      background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: var(--ac-radius-lg); padding: 12px 16px;
      color: #ef4444; font-size: 13px; font-family: monospace;
    }

    .event-list { display: flex; flex-direction: column; gap: 4px; }
    .event-item {
      display: flex; gap: 10px; padding: 8px 12px;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg); font-size: 13px; align-items: flex-start;
    }
    .event-ts { color: var(--ac-text-muted); font-size: 12px; flex-shrink: 0; width: 80px; }
    .event-type {
      font-weight: 700; font-size: 11px; padding: 2px 8px;
      border-radius: var(--ac-radius-full); background: var(--ac-bg-hover);
      color: var(--ac-primary); flex-shrink: 0;
    }
    .event-payload {
      font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 11px;
      color: var(--ac-text-muted); overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; flex: 1;
    }

    .badge {
      font-size: 11px; font-weight: 600; padding: 2px 8px;
      border-radius: var(--ac-radius-full); background: var(--ac-bg-hover);
      color: var(--ac-text-muted); margin-left: 6px;
    }

    .empty-state {
      text-align: center; padding: 48px; color: var(--ac-text-muted); font-size: 14px;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._loadSnapshots();
  }

  private async _loadSnapshots() {
    this._loading = true;
    try {
      const [status, health, heartbeat] = await Promise.all([
        gateway.call<Record<string, unknown>>("status.snapshot").catch(() => null),
        gateway.call<Record<string, unknown>>("health.snapshot").catch(() => null),
        gateway.call<Record<string, unknown>>("heartbeat.last").catch(() => null),
      ]);
      this._statusSnapshot = JSON.stringify(status, null, 2) || "null";
      this._healthSnapshot = JSON.stringify(health, null, 2) || "null";
      this._heartbeat = JSON.stringify(heartbeat, null, 2) || "null";
    } catch { /* ignore */ }
    this._loading = false;
  }

  private async _loadEvents() {
    try {
      const result = await gateway.call<{ events: GatewayEvent[] }>("events.recent", { limit: 50 });
      this._events = result?.events ?? [];
    } catch {
      this._events = [];
    }
  }

  private async _callRpc() {
    if (!this._rpcMethod.trim()) return;
    this._rpcLoading = true;
    this._rpcResult = "";
    this._rpcError = "";
    try {
      let params: unknown;
      try {
        params = JSON.parse(this._rpcParams);
      } catch {
        this._rpcError = "Invalid JSON params";
        this._rpcLoading = false;
        return;
      }
      const result = await gateway.call<unknown>(this._rpcMethod.trim(), params as Record<string, unknown>);
      this._rpcResult = JSON.stringify(result, null, 2) || "null";
    } catch (e) {
      this._rpcError = String(e);
    }
    this._rpcLoading = false;
  }

  override render() {
    return html`
      <h1>${t("debug.title")}</h1>
      <div class="subtitle">${t("debug.subtitle")}</div>

      <div class="tabs">
        ${(["snapshots", "rpc", "events"] as DebugTab[]).map(
          (tab) => html`
            <div class="tab ${this._tab === tab ? "active" : ""}"
              @click=${() => { this._tab = tab; if (tab === "events") this._loadEvents(); }}>
              ${t("debug.tab." + tab)}${tab === "events" && this._events.length > 0 ? html`<span class="badge">${this._events.length}</span>` : nothing}
            </div>
          `
        )}
      </div>

      ${this._tab === "snapshots" ? this._renderSnapshots() : nothing}
      ${this._tab === "rpc" ? this._renderRpc() : nothing}
      ${this._tab === "events" ? this._renderEvents() : nothing}
    `;
  }

  private _renderSnapshots() {
    return html`
      <div class="section">
        <div class="section-title">${t("debug.statusSnapshot")}</div>
        <div class="section-desc">${t("debug.statusSnapshotDesc")}</div>
        <div class="json-box">${this._statusSnapshot || "Loading…"}</div>
        <button class="btn" style="margin-top:8px" @click=${this._loadSnapshots}>${t("debug.refresh")}</button>
      </div>

      <div class="section">
        <div class="section-title">${t("debug.healthSnapshot")}</div>
        <div class="section-desc">${t("debug.healthSnapshotDesc")}</div>
        <div class="json-box">${this._healthSnapshot || "Loading…"}</div>
      </div>

      <div class="section">
        <div class="section-title">${t("debug.heartbeat")}</div>
        <div class="section-desc">${t("debug.heartbeatDesc")}</div>
        <div class="json-box">${this._heartbeat || "Loading…"}</div>
      </div>
    `;
  }

  private _renderRpc() {
    return html`
      <div class="section">
        <div class="section-title">${t("debug.manualRpc")}</div>
        <div class="section-desc">${t("debug.manualRpcDesc")}</div>
        <div class="rpc-form">
          <div class="rpc-row">
            <input class="rpc-input" placeholder="${t("debug.rpcMethodPlaceholder")}"
              .value=${this._rpcMethod}
              @input=${(e: InputEvent) => { this._rpcMethod = (e.target as HTMLInputElement).value; }} />
            <button class="btn primary" ?disabled=${this._rpcLoading} @click=${this._callRpc}>
              ${this._rpcLoading ? t("debug.calling") : t("debug.call")}
            </button>
          </div>
          <textarea class="rpc-textarea" placeholder='${t("debug.rpcParamsPlaceholder")}'
            .value=${this._rpcParams}
            @input=${(e: InputEvent) => { this._rpcParams = (e.target as HTMLTextAreaElement).value; }}></textarea>
          ${this._rpcError ? html`<div class="error-box">${this._rpcError}</div>` : nothing}
          ${this._rpcResult ? html`<div class="json-box">${this._rpcResult}</div>` : nothing}
        </div>
      </div>
    `;
  }

  private _renderEvents() {
    return html`
      <div class="section">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div class="section-title" style="margin-bottom:0">${t("debug.eventLog")}</div>
          <button class="btn" @click=${this._loadEvents}>${t("debug.refresh")}</button>
        </div>
        ${this._events.length === 0
          ? html`<div class="empty-state">${t("debug.noEvents")}</div>`
          : html`
              <div class="event-list">
                ${this._events.map(
                  (ev) => html`
                    <div class="event-item">
                      <span class="event-ts">${this._formatTime(ev.timestamp)}</span>
                      <span class="event-type">${ev.type}</span>
                      <span class="event-payload">${ev.payload?.slice(0, 120) || "—"}</span>
                    </div>
                  `
                )}
              </div>
            `
        }
      </div>
    `;
  }

  private _formatTime(ts: string): string {
    try {
      return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return ts?.slice(11, 19) || "";
    }
  }
}
