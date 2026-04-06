/**
 * Channels view — dropdown-based channel selector with status panel and
 * config form.  Calls the same OpenClaw gateway RPCs as OpenClaw's own
 * channel tab but renders a dropdown instead of a card grid.
 *
 * Data flow:
 *   channels.status  →  snapshot (per-channel runtime status)
 *   config.get       →  configForm + configSchema
 *   config.set       →  save patched config
 *
 * Per-channel config fields are rendered via the JSON schema form:
 * schema.channels.<channelId>.  WhatsApp is the only channel that needs
 * bespoke UI (QR/login flow).
 */
import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway, updateConfig } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";

// ─── Types (subset of OpenClaw's ChannelsStatusSnapshot) ──────────────────

interface ChannelAccountSnapshot {
  accountId: string;
  name?: string;
  configured?: boolean;
  running?: boolean;
  connected?: boolean;
  lastInboundAt?: number;
  lastError?: string | null;
  probe?: unknown;
}

interface ChannelMeta {
  id: string;
  name?: string;
}

interface ChannelsStatusSnapshot {
  channels?: Record<string, Record<string, unknown>>;
  channelMeta?: ChannelMeta[];
  channelOrder?: string[];
  channelAccounts?: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId?: Record<string, string>;
}

type WhatsAppLoginMessage = {
  message?: string | null;
  qrDataUrl?: string | null;
  connected?: boolean | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

const FALLBACK_CHANNEL_ORDER = [
  "whatsapp", "telegram", "discord", "googlechat",
  "slack", "signal", "imessage", "nostr",
];

function channelDisplayName(id: string, meta: ChannelMeta[] | undefined): string {
  const entry = meta?.find((m) => m.id === id);
  return entry?.name ?? (id.charAt(0).toUpperCase() + id.slice(1));
}

function channelOrder(snapshot: ChannelsStatusSnapshot | null): string[] {
  if (snapshot?.channelMeta?.length) return snapshot.channelMeta.map((m) => m.id);
  if (snapshot?.channelOrder?.length) return snapshot.channelOrder;
  return FALLBACK_CHANNEL_ORDER;
}

function isChannelEnabled(id: string, snapshot: ChannelsStatusSnapshot | null): boolean {
  const ch = snapshot?.channels?.[id];
  if (!ch) return false;
  return (
    ch.configured === true ||
    ch.running === true ||
    ch.connected === true ||
    (snapshot?.channelAccounts?.[id] ?? []).some(
      (a) => a.configured || a.running || a.connected,
    )
  );
}

function relTime(ts: number | undefined): string {
  if (!ts) return "n/a";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Navigate a JSON schema to a nested path */
function resolveSchemaNode(
  schema: Record<string, unknown> | null,
  path: string[],
): Record<string, unknown> | null {
  let cur: Record<string, unknown> | null = schema;
  for (const key of path) {
    if (!cur) return null;
    const props = cur.properties as Record<string, unknown> | undefined;
    cur = (props?.[key] as Record<string, unknown>) ?? null;
  }
  return cur;
}

/** Get the channels.<id> value from the live config object */
function resolveChannelConfigValue(
  config: Record<string, unknown>,
  channelId: string,
): Record<string, unknown> {
  const channels = config.channels as Record<string, unknown> | undefined;
  return (channels?.[channelId] as Record<string, unknown>) ?? {};
}

// ─── Component ────────────────────────────────────────────────────────────

@customElement("acaclaw-channels")
export class ChannelsView extends LitElement {
  private _lc = new LocaleController(this);

  @state() private _snapshot: ChannelsStatusSnapshot | null = null;
  @state() private _loading = false;
  @state() private _error: string | null = null;
  @state() private _lastRefreshedAt: number | null = null;

  @state() private _selectedChannel: string | null = null;

  // Config form state
  @state() private _configSchema: Record<string, unknown> | null = null;
  @state() private _configForm: Record<string, unknown> | null = null;
  @state() private _configDirty = false;
  @state() private _configSaving = false;
  @state() private _configSchemaLoading = false;

  // WhatsApp-specific
  @state() private _whatsappQr: string | null = null;
  @state() private _whatsappMessage: string | null = null;
  @state() private _whatsappConnected: boolean | null = null;
  @state() private _whatsappBusy = false;

  // Raw snapshot toggle
  @state() private _rawExpanded = false;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  override connectedCallback() {
    super.connectedCallback();
    void this._loadChannels(false);
    void this._loadConfigAndSchema();
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  private async _loadChannels(probe: boolean) {
    if (this._loading) return;
    this._loading = true;
    this._error = null;
    try {
      const res = await gateway.call<ChannelsStatusSnapshot | null>(
        "channels.status",
        { probe, timeoutMs: 8000 },
      );
      this._snapshot = res ?? null;
      this._lastRefreshedAt = Date.now();
      // Auto-select first enabled channel if nothing is selected yet
      if (!this._selectedChannel && this._snapshot) {
        const order = channelOrder(this._snapshot);
        const first = order.find((id) => isChannelEnabled(id, this._snapshot));
        this._selectedChannel = first ?? order[0] ?? null;
      }
    } catch (err) {
      this._error = String(err);
    } finally {
      this._loading = false;
    }
  }

  private async _loadConfigAndSchema() {
    this._configSchemaLoading = true;
    try {
      const [snap, schemaRes] = await Promise.all([
        gateway.call<{ config?: Record<string, unknown> }>("config.get"),
        gateway.call<{ schema?: Record<string, unknown> }>("config.schema").catch(() => null),
      ]);
      this._configForm = (snap?.config as Record<string, unknown>) ?? null;
      this._configSchema = (schemaRes?.schema as Record<string, unknown>) ?? null;
    } catch {
      // schema unavailable — config form will show fallback
    } finally {
      this._configSchemaLoading = false;
      this._configDirty = false;
    }
  }

  private _patchConfig(path: (string | number)[], value: unknown) {
    if (!this._configForm) return;
    const clone = structuredClone(this._configForm);
    let cur: Record<string, unknown> = clone;
    for (let i = 0; i < path.length - 1; i++) {
      const key = String(path[i]);
      if (cur[key] == null || typeof cur[key] !== "object") cur[key] = {};
      cur = cur[key] as Record<string, unknown>;
    }
    cur[String(path[path.length - 1])] = value;
    this._configForm = clone;
    this._configDirty = true;
  }

  private async _saveConfig() {
    if (!this._configForm || this._configSaving) return;
    this._configSaving = true;
    try {
      await updateConfig(() => this._configForm!);
      this._configDirty = false;
      await this._loadChannels(false);
    } catch (err) {
      this._error = String(err);
    } finally {
      this._configSaving = false;
    }
  }

  private async _reloadConfig() {
    await this._loadConfigAndSchema();
    await this._loadChannels(false);
  }

  // ── WhatsApp helpers ──────────────────────────────────────────────────────

  private async _whatsappStart(force: boolean) {
    if (this._whatsappBusy) return;
    this._whatsappBusy = true;
    this._whatsappMessage = null;
    this._whatsappQr = null;
    try {
      const res = await gateway.call<WhatsAppLoginMessage>(
        "web.login.start",
        { force, timeoutMs: 30000 },
      );
      this._whatsappMessage = res?.message ?? null;
      this._whatsappQr = res?.qrDataUrl ?? null;
      this._whatsappConnected = null;
    } catch (err) {
      this._whatsappMessage = String(err);
    } finally {
      this._whatsappBusy = false;
      void this._loadChannels(true);
    }
  }

  private async _whatsappWait() {
    if (this._whatsappBusy) return;
    this._whatsappBusy = true;
    try {
      const res = await gateway.call<WhatsAppLoginMessage>(
        "web.login.wait",
        { timeoutMs: 120000 },
      );
      this._whatsappMessage = res?.message ?? null;
      this._whatsappConnected = res?.connected ?? null;
      if (res?.connected) this._whatsappQr = null;
    } catch (err) {
      this._whatsappMessage = String(err);
    } finally {
      this._whatsappBusy = false;
      void this._loadChannels(true);
    }
  }

  private async _whatsappLogout() {
    if (this._whatsappBusy) return;
    this._whatsappBusy = true;
    try {
      await gateway.call("web.login.logout", { timeoutMs: 15000 });
      this._whatsappQr = null;
      this._whatsappMessage = null;
      this._whatsappConnected = null;
    } catch (err) {
      this._whatsappMessage = String(err);
    } finally {
      this._whatsappBusy = false;
      void this._loadChannels(true);
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  static override styles = css`
    :host { display: block; }

    h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.04em; color: var(--ac-text); margin-bottom: 4px; }
    .subtitle { font-size: 15px; color: var(--ac-text-muted); margin-bottom: 32px; }

    /* ── Dropdown row ── */
    .channel-row {
      display: flex; align-items: center; gap: 12px; margin-bottom: 24px;
    }
    .channel-select-wrap { position: relative; flex: 1; max-width: 320px; }
    .channel-select {
      width: 100%; appearance: none;
      padding: 10px 36px 10px 14px;
      font-size: 14px; font-weight: 600;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-lg);
      color: var(--ac-text);
      cursor: pointer;
      box-shadow: var(--ac-shadow-xs);
      transition: border-color var(--ac-transition-fast);
    }
    .channel-select:focus {
      outline: none; border-color: var(--ac-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--ac-primary) 15%, transparent);
    }
    .channel-select-arrow {
      position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
      pointer-events: none; color: var(--ac-text-muted);
    }
    .btn {
      padding: 10px 16px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-lg);
      background: var(--ac-bg-surface); color: var(--ac-text);
      cursor: pointer; transition: all var(--ac-transition-fast);
    }
    .btn:hover { border-color: var(--ac-text-muted); }
    .btn.primary {
      background: var(--ac-primary); border-color: var(--ac-primary); color: #fff;
    }
    .btn.primary:hover { opacity: 0.9; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }

    /* ── Panels ── */
    .panel {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 24px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .panel-title { font-size: 15px; font-weight: 700; color: var(--ac-text); margin-bottom: 16px; letter-spacing: -0.02em; }

    /* ── Status list ── */
    .status-list { display: flex; flex-direction: column; gap: 8px; }
    .status-row { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
    .status-label { color: var(--ac-text-muted); min-width: 110px; }
    .status-value { color: var(--ac-text); font-weight: 500; }

    /* ── Badge ── */
    .badge {
      display: inline-block; font-size: 11px; font-weight: 700;
      padding: 2px 8px; border-radius: 999px;
    }
    .badge.ok { background: color-mix(in srgb, var(--ac-primary) 15%, transparent); color: var(--ac-primary); }
    .badge.warn { background: #fef3cd; color: #856404; }
    .badge.off { background: var(--ac-bg-muted); color: var(--ac-text-muted); }

    /* ── Callout ── */
    .callout {
      font-size: 13px; padding: 10px 14px;
      border-radius: var(--ac-radius-md);
      border: 1px solid var(--ac-border-subtle);
      background: var(--ac-bg-muted);
      color: var(--ac-text-secondary);
    }
    .callout.danger { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }

    /* ── Config form ── */
    .config-form { display: flex; flex-direction: column; gap: 12px; }
    .form-field { display: flex; flex-direction: column; gap: 4px; }
    .form-label { font-size: 12px; font-weight: 600; color: var(--ac-text-muted); }
    .form-input {
      padding: 8px 12px; font-size: 13px;
      background: var(--ac-bg-base, var(--ac-bg-muted));
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-md);
      color: var(--ac-text);
    }
    .form-input:focus { outline: none; border-color: var(--ac-primary); }
    .form-actions { display: flex; gap: 8px; margin-top: 4px; }

    /* ── WhatsApp QR ── */
    .qr-wrap { text-align: center; padding: 16px 0; }
    .qr-wrap img { max-width: 200px; border-radius: 8px; border: 1px solid var(--ac-border); }

    /* ── Raw snapshot ── */
    .raw-toggle {
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; color: var(--ac-text-muted);
      cursor: pointer; background: none; border: none; padding: 0;
      margin-bottom: 8px;
    }
    .raw-toggle:hover { color: var(--ac-text); }
    .code-block {
      font-family: monospace; font-size: 12px; line-height: 1.6;
      background: var(--ac-bg-muted); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-md);
      padding: 16px; overflow-x: auto; white-space: pre;
      color: var(--ac-text-secondary);
    }

    /* ── Accounts ── */
    .account-card {
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-md);
      padding: 12px 16px; margin-bottom: 8px;
      background: var(--ac-bg-base, var(--ac-bg-muted));
    }
    .account-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .account-name { font-size: 13px; font-weight: 600; color: var(--ac-text); }
    .account-id { font-size: 11px; color: var(--ac-text-muted); }

    .empty { color: var(--ac-text-muted); font-size: 14px; padding: 32px 0; text-align: center; }
    .muted { color: var(--ac-text-muted); font-size: 13px; }
  `;

  override render() {
    const order = channelOrder(this._snapshot);
    const sorted = [...order].sort((a, b) => {
      const ae = isChannelEnabled(a, this._snapshot);
      const be = isChannelEnabled(b, this._snapshot);
      if (ae !== be) return ae ? -1 : 1;
      return 0;
    });

    return html`
      <h1>${t("channels.title", "Channels")}</h1>
      <p class="subtitle">${t("channels.subtitle", "Connect messaging services to the OpenClaw gateway.")}</p>

      ${this._error ? html`<div class="callout danger" style="margin-bottom:16px;">${this._error}</div>` : nothing}

      <!-- ── Channel selector row ── -->
      <div class="channel-row">
        <div class="channel-select-wrap">
          <select
            class="channel-select"
            .value=${this._selectedChannel ?? ""}
            @change=${(e: Event) => {
              this._selectedChannel = (e.target as HTMLSelectElement).value || null;
            }}
            aria-label="Select a channel"
          >
            <option value="" ?disabled=${true} ?selected=${!this._selectedChannel}>
              ${this._loading ? "Loading…" : "Select a channel…"}
            </option>
            ${sorted.map((id) => {
              const enabled = isChannelEnabled(id, this._snapshot);
              const label = `${enabled ? "●" : "○"}  ${channelDisplayName(id, this._snapshot?.channelMeta)}`;
              return html`<option value=${id} ?selected=${this._selectedChannel === id}>${label}</option>`;
            })}
          </select>
          <svg class="channel-select-arrow" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5 8l5 5 5-5z"/>
          </svg>
        </div>

        <button
          class="btn"
          ?disabled=${this._loading}
          @click=${() => void this._loadChannels(true)}
        >
          ${this._loading ? "Probing…" : "Probe"}
        </button>

        ${this._lastRefreshedAt
          ? html`<span class="muted">${relTime(this._lastRefreshedAt)}</span>`
          : nothing}
      </div>

      <!-- ── Selected channel panels ── -->
      ${this._selectedChannel ? this._renderChannelDetail(this._selectedChannel) : nothing}

      <!-- ── Raw snapshot ── -->
      ${this._snapshot ? html`
        <button class="raw-toggle" @click=${() => { this._rawExpanded = !this._rawExpanded; }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path d="${this._rawExpanded ? "M5 8l5 5 5-5z" : "M8 5l5 5-5 5z"}"/>
          </svg>
          Raw snapshot
        </button>
        ${this._rawExpanded
          ? html`<pre class="code-block">${JSON.stringify(this._snapshot, null, 2)}</pre>`
          : nothing}
      ` : nothing}
    `;
  }

  private _renderChannelDetail(id: string) {
    const ch = this._snapshot?.channels?.[id] ?? {};
    const accounts = this._snapshot?.channelAccounts?.[id] ?? [];

    return html`
      <!-- Status panel -->
      <div class="panel">
        <div class="panel-title">${channelDisplayName(id, this._snapshot?.channelMeta)}</div>
        <div class="status-list">
          ${this._renderStatusRow("Configured", ch.configured)}
          ${this._renderStatusRow("Running", ch.running)}
          ${this._renderStatusRow("Connected", ch.connected)}
          ${"lastStartAt" in ch ? html`
            <div class="status-row">
              <span class="status-label">Last start</span>
              <span class="status-value">${relTime(ch.lastStartAt as number | undefined)}</span>
            </div>` : nothing}
          ${"lastProbeAt" in ch ? html`
            <div class="status-row">
              <span class="status-label">Last probe</span>
              <span class="status-value">${relTime(ch.lastProbeAt as number | undefined)}</span>
            </div>` : nothing}
        </div>

        ${ch.lastError
          ? html`<div class="callout danger" style="margin-top:12px;">${ch.lastError}</div>`
          : nothing}

        <!-- Multi-account list (Telegram style) -->
        ${accounts.length > 1 ? this._renderAccountList(accounts) : nothing}

        <!-- WhatsApp bespoke flow -->
        ${id === "whatsapp" ? this._renderWhatsAppExtras(ch) : nothing}
      </div>

      <!-- Config form panel -->
      ${this._renderConfigPanel(id)}
    `;
  }

  private _renderStatusRow(label: string, value: unknown) {
    if (value === undefined) return nothing;
    const text = value === null ? "n/a" : value === true ? "Yes" : value === false ? "No" : String(value);
    const cls = value === true ? "ok" : value === false ? "off" : "warn";
    return html`
      <div class="status-row">
        <span class="status-label">${label}</span>
        <span class="badge ${cls}">${text}</span>
      </div>
    `;
  }

  private _renderAccountList(accounts: ChannelAccountSnapshot[]) {
    return html`
      <div style="margin-top:16px;">
        ${accounts.map((account) => html`
          <div class="account-card">
            <div class="account-header">
              <span class="account-name">${account.name ?? account.accountId}</span>
              <span class="account-id">${account.accountId}</span>
            </div>
            <div class="status-list">
              ${this._renderStatusRow("Running", account.running ?? null)}
              ${this._renderStatusRow("Configured", account.configured ?? null)}
              ${"lastInboundAt" in account ? html`
                <div class="status-row">
                  <span class="status-label">Last inbound</span>
                  <span class="status-value">${relTime(account.lastInboundAt)}</span>
                </div>` : nothing}
            </div>
            ${account.lastError
              ? html`<div class="callout danger" style="margin-top:8px;">${account.lastError}</div>`
              : nothing}
          </div>
        `)}
      </div>
    `;
  }

  private _renderWhatsAppExtras(ch: Record<string, unknown>) {
    const connected = ch.connected === true || this._whatsappConnected === true;
    return html`
      <div style="margin-top:16px; display:flex; flex-direction:column; gap:8px;">
        ${this._whatsappMessage
          ? html`<div class="callout">${this._whatsappMessage}</div>`
          : nothing}
        ${this._whatsappQr
          ? html`<div class="qr-wrap"><img src=${this._whatsappQr} alt="WhatsApp QR code"/></div>`
          : nothing}
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn primary" ?disabled=${this._whatsappBusy} @click=${() => void this._whatsappStart(false)}>
            ${connected ? "Re-login" : "Login"}
          </button>
          ${this._whatsappQr
            ? html`<button class="btn" ?disabled=${this._whatsappBusy} @click=${() => void this._whatsappWait()}>Wait for scan</button>`
            : nothing}
          ${connected
            ? html`<button class="btn" ?disabled=${this._whatsappBusy} @click=${() => void this._whatsappLogout()}>Logout</button>`
            : nothing}
        </div>
      </div>
    `;
  }

  private _renderConfigPanel(channelId: string) {
    const schemaNode = resolveSchemaNode(this._configSchema, ["properties", "channels", "properties", channelId]);
    const configValue = this._configForm ? resolveChannelConfigValue(this._configForm, channelId) : {};

    return html`
      <div class="panel">
        <div class="panel-title">Configuration</div>

        ${this._configSchemaLoading
          ? html`<span class="muted">Loading schema…</span>`
          : schemaNode
            ? this._renderSchemaForm(schemaNode, configValue, ["channels", channelId])
            : this._renderRawConfigForm(configValue, channelId)}

        <div class="form-actions" style="margin-top:16px;">
          <button
            class="btn primary"
            ?disabled=${this._configSaving || !this._configDirty}
            @click=${() => void this._saveConfig()}
          >${this._configSaving ? "Saving…" : "Save"}</button>
          <button
            class="btn"
            ?disabled=${this._configSaving}
            @click=${() => void this._reloadConfig()}
          >Reload</button>
        </div>
      </div>
    `;
  }

  /** Schema-driven form: renders one <input> per string/number leaf in the schema. */
  private _renderSchemaForm(
    node: Record<string, unknown>,
    value: Record<string, unknown>,
    path: string[],
  ): unknown {
    const props = node.properties as Record<string, Record<string, unknown>> | undefined;
    if (!props) return html`<span class="muted">No configurable fields.</span>`;

    return html`
      <div class="config-form">
        ${Object.entries(props).map(([key, fieldSchema]) => {
          if (!fieldSchema) return nothing;
          const ftype = fieldSchema.type as string | undefined;
          const label = (fieldSchema.title as string) ?? key;
          const hint = fieldSchema.description as string | undefined;
          const fieldPath = [...path, key];
          const current = value[key] ?? "";

          if (ftype === "string" || ftype === "number" || !ftype) {
            const isSecret = (fieldSchema.format === "password") ||
              key.toLowerCase().includes("token") ||
              key.toLowerCase().includes("secret") ||
              key.toLowerCase().includes("key");
            return html`
              <div class="form-field">
                <label class="form-label">${label}</label>
                ${hint ? html`<span class="muted" style="font-size:11px;">${hint}</span>` : nothing}
                <input
                  class="form-input"
                  type=${isSecret ? "password" : "text"}
                  .value=${String(current)}
                  @input=${(e: Event) =>
                    this._patchConfig(fieldPath, (e.target as HTMLInputElement).value)}
                />
              </div>
            `;
          }
          if (ftype === "boolean") {
            return html`
              <div class="form-field" style="flex-direction:row; align-items:center; gap:10px;">
                <input
                  type="checkbox"
                  id="field-${key}"
                  .checked=${Boolean(current)}
                  @change=${(e: Event) =>
                    this._patchConfig(fieldPath, (e.target as HTMLInputElement).checked)}
                />
                <label class="form-label" for="field-${key}" style="margin:0;">${label}</label>
              </div>
            `;
          }
          // Nested objects: recurse one level
          if (ftype === "object") {
            return html`
              <div class="form-field">
                <span class="form-label">${label}</span>
                ${this._renderSchemaForm(
                  fieldSchema,
                  (current as Record<string, unknown>) ?? {},
                  fieldPath,
                )}
              </div>
            `;
          }
          return nothing;
        })}
      </div>
    `;
  }

  /** Fallback: render raw key=value fields when schema is unavailable. */
  private _renderRawConfigForm(value: Record<string, unknown>, channelId: string): unknown {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return html`<span class="muted">No config for this channel yet. Save to initialise.</span>`;
    }
    return html`
      <div class="config-form">
        ${entries.map(([key, val]) => html`
          <div class="form-field">
            <label class="form-label">${key}</label>
            <input
              class="form-input"
              .value=${String(val ?? "")}
              @input=${(e: Event) =>
                this._patchConfig(["channels", channelId, key], (e.target as HTMLInputElement).value)}
            />
          </div>
        `)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "acaclaw-channels": ChannelsView;
  }
}
