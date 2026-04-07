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

// ─── Types (1:1 with OpenClaw's channel types) ────────────────────────────

interface ChannelAccountSnapshot {
  accountId: string;
  name?: string;
  configured?: boolean;
  running?: boolean;
  connected?: boolean;
  lastInboundAt?: number;
  lastStartAt?: number;
  lastError?: string | null;
  probe?: unknown;
  // Telegram-specific
  publicKey?: string;
  profile?: {
    name?: string;
    displayName?: string;
    about?: string;
    picture?: string;
    nip05?: string;
  };
}

interface ProbeResult {
  ok: boolean;
  status?: string;
  error?: string;
}

interface WhatsAppStatus {
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  lastConnectedAt?: number;
  lastMessageAt?: number;
  authAgeMs?: number;
  lastError?: string | null;
}

interface TelegramStatus {
  running?: boolean;
  mode?: string;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

interface DiscordStatus {
  running?: boolean;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

interface GoogleChatStatus {
  running?: boolean;
  credentialSource?: string;
  audienceType?: string;
  audience?: string;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

interface SlackStatus {
  running?: boolean;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

interface SignalStatus {
  running?: boolean;
  baseUrl?: string;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

interface IMessageStatus {
  running?: boolean;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

interface NostrStatus {
  configured?: boolean;
  running?: boolean;
  publicKey?: string;
  lastStartAt?: number;
  lastError?: string | null;
  profile?: {
    name?: string;
    displayName?: string;
    about?: string;
    picture?: string;
    nip05?: string;
  };
}

interface ChannelMeta {
  id: string;
  name?: string;
}

interface ChannelsStatusSnapshot {
  channels?: {
    whatsapp?: WhatsAppStatus;
    telegram?: TelegramStatus;
    discord?: DiscordStatus;
    googlechat?: GoogleChatStatus;
    slack?: SlackStatus;
    signal?: SignalStatus;
    imessage?: IMessageStatus;
    nostr?: NostrStatus;
  } & Record<string, Record<string, unknown> | undefined>;
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
  const ch = snapshot?.channels?.[id] as Record<string, unknown> | undefined;
  if (!ch) return false;
  return (
    ch["configured"] === true ||
    ch["running"] === true ||
    ch["connected"] === true ||
    (snapshot?.channelAccounts?.[id] ?? []).some(
      (a) => a.configured || a.running || a.connected,
    )
  );
}

function formatDurationHuman(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function resolveConfigured(
  id: string,
  snapshot: ChannelsStatusSnapshot | null,
  ch: Record<string, unknown>,
): boolean | null {
  if ("configured" in ch) return ch["configured"] as boolean;
  return (snapshot?.channelAccounts?.[id] ?? []).some((a) => a.configured) || null;
}

function truncatePubkey(key: string | null | undefined): string {
  if (!key) return "n/a";
  if (key.length <= 20) return key;
  return `${key.slice(0, 8)}...${key.slice(-8)}`;
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

  // Collapsible array sections: key = path.join(".")
  @state() private _collapsed: Set<string> = new Set();

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
    let cur: Record<string, unknown> | unknown[] = clone;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (Array.isArray(cur)) {
        const idx = Number(key);
        if (cur[idx] == null || typeof cur[idx] !== "object") cur[idx] = {};
        cur = cur[idx] as Record<string, unknown>;
      } else {
        const k = String(key);
        if ((cur as Record<string, unknown>)[k] == null || typeof (cur as Record<string, unknown>)[k] !== "object") {
          (cur as Record<string, unknown>)[k] = {};
        }
        cur = (cur as Record<string, unknown>)[k] as Record<string, unknown>;
      }
    }
    const last = path[path.length - 1];
    if (Array.isArray(cur)) {
      (cur as unknown[])[Number(last)] = value;
    } else {
      (cur as Record<string, unknown>)[String(last)] = value;
    }
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

    /* ── Array fields ── */
    .array-section {
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-md);
      overflow: hidden;
    }
    .array-header {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px;
      cursor: pointer;
      background: var(--ac-bg-muted);
      user-select: none;
    }
    .array-header:hover { background: var(--ac-bg-surface); }
    .array-count {
      margin-left: auto; font-size: 11px;
      color: var(--ac-text-muted);
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: 999px;
      padding: 1px 8px;
    }
    .array-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
    .array-item {
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-md);
      padding: 10px 12px;
      background: var(--ac-bg-base, var(--ac-bg-muted));
    }
    .array-item-head {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 8px;
    }
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
    const channels = this._snapshot?.channels ?? {};
    switch (id) {
      case "whatsapp": return this._renderWhatsApp(channels.whatsapp ?? {} as WhatsAppStatus);
      case "telegram": return this._renderTelegram(channels.telegram ?? {} as TelegramStatus);
      case "discord":  return this._renderDiscord(channels.discord ?? {} as DiscordStatus);
      case "googlechat": return this._renderGoogleChat(channels.googlechat ?? {} as GoogleChatStatus);
      case "slack":    return this._renderSlack(channels.slack ?? {} as SlackStatus);
      case "signal":   return this._renderSignal(channels.signal ?? {} as SignalStatus);
      case "imessage": return this._renderIMessage(channels.imessage ?? {} as IMessageStatus);
      case "nostr":    return this._renderNostr(channels.nostr ?? {} as NostrStatus);
      default:         return this._renderGeneric(id, channels[id] as Record<string, unknown> ?? {});
    }
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────

  private _renderWhatsApp(wa: WhatsAppStatus) {
    const configured = resolveConfigured("whatsapp", this._snapshot, wa as Record<string, unknown>);
    return html`
      <div class="panel">
        <div class="panel-title">WhatsApp</div>
        <div class="card-sub" style="margin-bottom:12px;">Link WhatsApp Web and monitor connection health.</div>
        ${this._renderAccountCount("whatsapp")}
        <div class="status-list">
          ${this._row("Configured", this._fmt(configured))}
          ${this._row("Linked",     wa.linked     ? "Yes" : "No")}
          ${this._row("Running",    wa.running    ? "Yes" : "No")}
          ${this._row("Connected",  wa.connected  ? "Yes" : "No")}
          ${this._row("Last connect", relTime(wa.lastConnectedAt))}
          ${this._row("Last message", relTime(wa.lastMessageAt))}
          ${this._row("Auth age", wa.authAgeMs != null ? formatDurationHuman(wa.authAgeMs) : "n/a")}
        </div>
        ${wa.lastError ? html`<div class="callout danger" style="margin-top:12px;">${wa.lastError}</div>` : nothing}
        ${this._whatsappMessage ? html`<div class="callout" style="margin-top:12px;">${this._whatsappMessage}</div>` : nothing}
        ${this._whatsappQr ? html`<div class="qr-wrap"><img src=${this._whatsappQr} alt="WhatsApp QR"/></div>` : nothing}
        <div class="row" style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn primary" ?disabled=${this._whatsappBusy} @click=${() => void this._whatsappStart(false)}>
            ${this._whatsappBusy ? "Working…" : "Show QR"}
          </button>
          <button class="btn" ?disabled=${this._whatsappBusy} @click=${() => void this._whatsappStart(true)}>Relink</button>
          <button class="btn" ?disabled=${this._whatsappBusy} @click=${() => void this._whatsappWait()}>Wait for scan</button>
          <button class="btn danger" ?disabled=${this._whatsappBusy} @click=${() => void this._whatsappLogout()}>Logout</button>
          <button class="btn" @click=${() => void this._loadChannels(true)}>Refresh</button>
        </div>
      </div>
      ${this._renderConfigPanel("whatsapp")}
    `;
  }

  // ── Telegram ──────────────────────────────────────────────────────────────

  private _renderTelegram(tg: TelegramStatus) {
    const configured = resolveConfigured("telegram", this._snapshot, tg as Record<string, unknown>);
    const accounts = this._snapshot?.channelAccounts?.["telegram"] ?? [];
    if (accounts.length > 1) {
      return html`
        <div class="panel">
          <div class="panel-title">Telegram</div>
          <div class="card-sub" style="margin-bottom:12px;">Bot status and channel configuration.</div>
          ${this._renderAccountCount("telegram")}
          <div class="account-card-list">
            ${accounts.map((a) => {
              const probe = a.probe as { bot?: { username?: string } } | undefined;
              const botUsername = probe?.bot?.username;
              const label = a.name || a.accountId;
              return html`
                <div class="account-card">
                  <div class="account-header">
                    <span class="account-name">${botUsername ? `@${botUsername}` : label}</span>
                    <span class="account-id">${a.accountId}</span>
                  </div>
                  <div class="status-list">
                    ${this._row("Running",     a.running    ? "Yes" : "No")}
                    ${this._row("Configured",  a.configured ? "Yes" : "No")}
                    ${this._row("Last inbound", relTime(a.lastInboundAt))}
                  </div>
                  ${a.lastError ? html`<div class="callout danger" style="margin-top:8px;">${a.lastError}</div>` : nothing}
                </div>`;
            })}
          </div>
          ${tg.lastError ? html`<div class="callout danger" style="margin-top:12px;">${tg.lastError}</div>` : nothing}
          ${tg.probe ? this._probeCallout(tg.probe) : nothing}
          ${this._renderConfigPanel("telegram")}
          <div class="row" style="margin-top:12px;">
            <button class="btn" @click=${() => void this._loadChannels(true)}>Probe</button>
          </div>
        </div>
      `;
    }
    return html`
      <div class="panel">
        <div class="panel-title">Telegram</div>
        <div class="card-sub" style="margin-bottom:12px;">Bot status and channel configuration.</div>
        ${this._renderAccountCount("telegram")}
        <div class="status-list">
          ${this._row("Configured", this._fmt(configured))}
          ${this._row("Running",    tg.running ? "Yes" : "No")}
          ${this._row("Mode",       tg.mode ?? "n/a")}
          ${this._row("Last start", relTime(tg.lastStartAt))}
          ${this._row("Last probe", relTime(tg.lastProbeAt))}
        </div>
        ${tg.lastError ? html`<div class="callout danger" style="margin-top:12px;">${tg.lastError}</div>` : nothing}
        ${tg.probe ? this._probeCallout(tg.probe) : nothing}
        ${this._renderConfigPanel("telegram")}
        <div class="row" style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn" @click=${() => void this._loadChannels(true)}>Probe</button>
        </div>
      </div>
    `;
  }

  // ── Discord ───────────────────────────────────────────────────────────────

  private _renderDiscord(dc: DiscordStatus) {
    const configured = resolveConfigured("discord", this._snapshot, dc as Record<string, unknown>);
    return html`
      <div class="panel">
        <div class="panel-title">Discord</div>
        <div class="card-sub" style="margin-bottom:12px;">Bot status and channel configuration.</div>
        ${this._renderAccountCount("discord")}
        <div class="status-list">
          ${this._row("Configured", this._fmt(configured))}
          ${this._row("Running",    dc.running ? "Yes" : "No")}
          ${this._row("Last start", relTime(dc.lastStartAt))}
          ${this._row("Last probe", relTime(dc.lastProbeAt))}
        </div>
        ${dc.lastError ? html`<div class="callout danger" style="margin-top:12px;">${dc.lastError}</div>` : nothing}
        ${dc.probe ? this._probeCallout(dc.probe) : nothing}
        ${this._renderConfigPanel("discord")}
        <div class="row" style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn" @click=${() => void this._loadChannels(true)}>Probe</button>
        </div>
      </div>
    `;
  }

  // ── Google Chat ───────────────────────────────────────────────────────────

  private _renderGoogleChat(gc: GoogleChatStatus) {
    const configured = resolveConfigured("googlechat", this._snapshot, gc as Record<string, unknown>);
    const audience = gc.audienceType
      ? `${gc.audienceType}${gc.audience ? ` · ${gc.audience}` : ""}`
      : "n/a";
    return html`
      <div class="panel">
        <div class="panel-title">Google Chat</div>
        <div class="card-sub" style="margin-bottom:12px;">Chat API webhook status and channel configuration.</div>
        ${this._renderAccountCount("googlechat")}
        <div class="status-list">
          ${this._row("Configured",  this._fmt(configured))}
          ${this._row("Running",     gc.running ? "Yes" : "No")}
          ${this._row("Credential",  gc.credentialSource ?? "n/a")}
          ${this._row("Audience",    audience)}
          ${this._row("Last start",  relTime(gc.lastStartAt))}
          ${this._row("Last probe",  relTime(gc.lastProbeAt))}
        </div>
        ${gc.lastError ? html`<div class="callout danger" style="margin-top:12px;">${gc.lastError}</div>` : nothing}
        ${gc.probe ? this._probeCallout(gc.probe) : nothing}
        ${this._renderConfigPanel("googlechat")}
        <div class="row" style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn" @click=${() => void this._loadChannels(true)}>Probe</button>
        </div>
      </div>
    `;
  }

  // ── Slack ─────────────────────────────────────────────────────────────────

  private _renderSlack(sl: SlackStatus) {
    const configured = resolveConfigured("slack", this._snapshot, sl as Record<string, unknown>);
    return html`
      <div class="panel">
        <div class="panel-title">Slack</div>
        <div class="card-sub" style="margin-bottom:12px;">Socket mode status and channel configuration.</div>
        ${this._renderAccountCount("slack")}
        <div class="status-list">
          ${this._row("Configured", this._fmt(configured))}
          ${this._row("Running",    sl.running ? "Yes" : "No")}
          ${this._row("Last start", relTime(sl.lastStartAt))}
          ${this._row("Last probe", relTime(sl.lastProbeAt))}
        </div>
        ${sl.lastError ? html`<div class="callout danger" style="margin-top:12px;">${sl.lastError}</div>` : nothing}
        ${sl.probe ? this._probeCallout(sl.probe) : nothing}
        ${this._renderConfigPanel("slack")}
        <div class="row" style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn" @click=${() => void this._loadChannels(true)}>Probe</button>
        </div>
      </div>
    `;
  }

  // ── Signal ────────────────────────────────────────────────────────────────

  private _renderSignal(sg: SignalStatus) {
    const configured = resolveConfigured("signal", this._snapshot, sg as Record<string, unknown>);
    return html`
      <div class="panel">
        <div class="panel-title">Signal</div>
        <div class="card-sub" style="margin-bottom:12px;">signal-cli status and channel configuration.</div>
        ${this._renderAccountCount("signal")}
        <div class="status-list">
          ${this._row("Configured", this._fmt(configured))}
          ${this._row("Running",    sg.running ? "Yes" : "No")}
          ${this._row("Base URL",   sg.baseUrl ?? "n/a")}
          ${this._row("Last start", relTime(sg.lastStartAt))}
          ${this._row("Last probe", relTime(sg.lastProbeAt))}
        </div>
        ${sg.lastError ? html`<div class="callout danger" style="margin-top:12px;">${sg.lastError}</div>` : nothing}
        ${sg.probe ? this._probeCallout(sg.probe) : nothing}
        ${this._renderConfigPanel("signal")}
        <div class="row" style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn" @click=${() => void this._loadChannels(true)}>Probe</button>
        </div>
      </div>
    `;
  }

  // ── iMessage ──────────────────────────────────────────────────────────────

  private _renderIMessage(im: IMessageStatus) {
    const configured = resolveConfigured("imessage", this._snapshot, im as Record<string, unknown>);
    return html`
      <div class="panel">
        <div class="panel-title">iMessage</div>
        <div class="card-sub" style="margin-bottom:12px;">macOS bridge status and channel configuration.</div>
        ${this._renderAccountCount("imessage")}
        <div class="status-list">
          ${this._row("Configured", this._fmt(configured))}
          ${this._row("Running",    im.running ? "Yes" : "No")}
          ${this._row("Last start", relTime(im.lastStartAt))}
          ${this._row("Last probe", relTime(im.lastProbeAt))}
        </div>
        ${im.lastError ? html`<div class="callout danger" style="margin-top:12px;">${im.lastError}</div>` : nothing}
        ${im.probe ? this._probeCallout(im.probe as ProbeResult) : nothing}
        ${this._renderConfigPanel("imessage")}
        <div class="row" style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn" @click=${() => void this._loadChannels(true)}>Probe</button>
        </div>
      </div>
    `;
  }

  // ── Nostr ─────────────────────────────────────────────────────────────────

  private _renderNostr(nostr: NostrStatus) {
    const accounts = this._snapshot?.channelAccounts?.["nostr"] ?? [];
    const primaryAccount = accounts[0];
    const configured = nostr.configured ?? primaryAccount?.configured ?? false;
    const running    = nostr.running    ?? primaryAccount?.running    ?? false;
    const publicKey  = nostr.publicKey  ?? (primaryAccount as { publicKey?: string } | undefined)?.publicKey;
    const lastStartAt = nostr.lastStartAt ?? primaryAccount?.lastStartAt ?? undefined;
    const lastError   = nostr.lastError   ?? primaryAccount?.lastError   ?? null;
    const hasMultiple = accounts.length > 1;
    const profile = nostr.profile ?? (primaryAccount as { profile?: NostrStatus["profile"] } | undefined)?.profile;

    return html`
      <div class="panel">
        <div class="panel-title">Nostr</div>
        <div class="card-sub" style="margin-bottom:12px;">Decentralized DMs via Nostr relays (NIP-04).</div>
        ${this._renderAccountCount("nostr")}

        ${hasMultiple
          ? html`
            <div class="account-card-list" style="margin-top:12px;">
              ${accounts.map((a) => {
                const pk = (a as { publicKey?: string }).publicKey;
                const prof = (a as { profile?: { name?: string; displayName?: string } }).profile;
                const displayName = prof?.displayName ?? prof?.name ?? a.name ?? a.accountId;
                return html`
                  <div class="account-card">
                    <div class="account-header">
                      <span class="account-name">${displayName}</span>
                      <span class="account-id">${a.accountId}</span>
                    </div>
                    <div class="status-list">
                      ${this._row("Running",     a.running    ? "Yes" : "No")}
                      ${this._row("Configured",  a.configured ? "Yes" : "No")}
                      ${this._row("Public Key",  truncatePubkey(pk))}
                      ${this._row("Last inbound", relTime(a.lastInboundAt))}
                    </div>
                    ${a.lastError ? html`<div class="callout danger" style="margin-top:8px;">${a.lastError}</div>` : nothing}
                  </div>`;
              })}
            </div>`
          : html`
            <div class="status-list" style="margin-top:12px;">
              ${this._row("Configured", configured ? "Yes" : "No")}
              ${this._row("Running",    running    ? "Yes" : "No")}
              ${this._row("Public Key", truncatePubkey(publicKey))}
              ${this._row("Last start", relTime(lastStartAt))}
            </div>`}

        ${lastError ? html`<div class="callout danger" style="margin-top:12px;">${lastError}</div>` : nothing}

        ${profile ? html`
          <div style="margin-top:16px; padding:12px; background:var(--ac-bg-muted); border-radius:var(--ac-radius-md);">
            <div style="font-weight:600; font-size:13px; margin-bottom:8px;">Profile</div>
            ${profile.picture ? html`
              <img src=${profile.picture} alt="Profile picture"
                style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--ac-border);margin-bottom:8px;"
                @error=${(e: Event) => { (e.target as HTMLImageElement).style.display = "none"; }}/>` : nothing}
            <div class="status-list">
              ${profile.name        ? this._row("Name",         profile.name)         : nothing}
              ${profile.displayName ? this._row("Display Name", profile.displayName)  : nothing}
              ${profile.about       ? this._row("About",        profile.about)        : nothing}
              ${profile.nip05       ? this._row("NIP-05",       profile.nip05)        : nothing}
            </div>
          </div>` : nothing}

        ${this._renderConfigPanel("nostr")}
        <div class="row" style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn" @click=${() => void this._loadChannels(false)}>Refresh</button>
        </div>
      </div>
    `;
  }

  // ── Generic (plugin channels) ─────────────────────────────────────────────

  private _renderGeneric(id: string, ch: Record<string, unknown>) {
    const label = channelDisplayName(id, this._snapshot?.channelMeta);
    return html`
      <div class="panel">
        <div class="panel-title">${label}</div>
        <div class="card-sub" style="margin-bottom:12px;">Channel status and configuration.</div>
        ${this._renderAccountCount(id)}
        <div class="status-list">
          ${"configured" in ch ? this._row("Configured", ch["configured"] ? "Yes" : "No") : nothing}
          ${"running"    in ch ? this._row("Running",    ch["running"]    ? "Yes" : "No") : nothing}
          ${"connected"  in ch ? this._row("Connected",  ch["connected"]  ? "Yes" : "No") : nothing}
          ${"lastStartAt" in ch ? this._row("Last start", relTime(ch["lastStartAt"] as number | undefined)) : nothing}
          ${"lastProbeAt" in ch ? this._row("Last probe", relTime(ch["lastProbeAt"] as number | undefined)) : nothing}
        </div>
        ${"lastError" in ch && ch["lastError"]
          ? html`<div class="callout danger" style="margin-top:12px;">${ch["lastError"]}</div>`
          : nothing}
        ${this._renderConfigPanel(id)}
        <div class="row" style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn" @click=${() => void this._loadChannels(true)}>Probe</button>
        </div>
      </div>
    `;
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  private _row(label: string, value: string | null | undefined) {
    return html`
      <div class="status-row">
        <span class="status-label">${label}</span>
        <span class="status-value">${value ?? "n/a"}</span>
      </div>`;
  }

  private _fmt(v: boolean | null | undefined): string {
    if (v === true) return "Yes";
    if (v === false) return "No";
    return "n/a";
  }

  private _probeCallout(probe: ProbeResult) {
    return html`<div class="callout" style="margin-top:12px;">
      Probe ${probe.ok ? "ok" : "failed"} · ${probe.status ?? ""} ${probe.error ?? ""}
    </div>`;
  }

  private _renderAccountCount(id: string) {
    const accounts = this._snapshot?.channelAccounts?.[id] ?? [];
    if (accounts.length === 0) return nothing;
    return html`<div class="muted" style="margin-bottom:8px;">${accounts.length} account${accounts.length > 1 ? "s" : ""}</div>`;
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
    const connected = ch["connected"] === true || this._whatsappConnected === true;
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
    const schemaNode = resolveSchemaNode(this._configSchema, ["channels", channelId]);
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

  /** Schema-driven form: renders string/number/boolean/object/array fields. */
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
          const current = value[key];

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
                  .value=${String(current ?? "")}
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
          if (ftype === "array") {
            return this._renderArrayField(label, hint, fieldSchema, current, fieldPath);
          }
          return nothing;
        })}
      </div>
    `;
  }

  /**
   * Render an array field with collapsible header, per-item forms, add/remove.
   * String arrays: one text input per item.
   * Object arrays: nested form per item.
   */
  private _renderArrayField(
    label: string,
    hint: string | undefined,
    fieldSchema: Record<string, unknown>,
    current: unknown,
    fieldPath: string[],
  ): unknown {
    const items = (Array.isArray(current) ? current : []) as unknown[];
    const pathKey = fieldPath.join(".");
    const collapsed = this._collapsed.has(pathKey);
    const itemSchema = fieldSchema.items as Record<string, unknown> | undefined;
    const itemType = itemSchema?.type as string | undefined;

    const toggle = () => {
      const next = new Set(this._collapsed);
      if (collapsed) next.delete(pathKey); else next.add(pathKey);
      this._collapsed = next;
    };

    const addItem = () => {
      const def = itemType === "object" ? {} : "";
      this._patchConfig(fieldPath, [...items, def]);
    };

    const removeItem = (i: number) => {
      const next = [...items];
      next.splice(i, 1);
      this._patchConfig(fieldPath, next);
    };

    return html`
      <div class="array-section">
        <div class="array-header" @click=${toggle}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path d="${collapsed ? "M8 5l5 5-5 5z" : "M5 8l5 5 5-5z"}"/>
          </svg>
          <span class="form-label" style="margin:0;">${label}</span>
          <span class="array-count">${items.length} item${items.length !== 1 ? "s" : ""}</span>
        </div>

        ${collapsed ? nothing : html`
          <div class="array-body">
            ${hint ? html`<span class="muted" style="font-size:11px; display:block; margin-bottom:8px;">${hint}</span>` : nothing}

            ${items.length === 0
              ? html`<span class="muted">No items yet. Click "Add" to create one.</span>`
              : items.map((item, i) => {
                  const itemPath = [...fieldPath, i] as (string | number)[];
                  if (itemType === "object" && itemSchema) {
                    return html`
                      <div class="array-item">
                        <div class="array-item-head">
                          <span class="muted" style="font-size:11px;">Item ${i + 1}</span>
                          <button class="btn" style="padding:2px 8px; font-size:11px;"
                            @click=${() => removeItem(i)}>Remove</button>
                        </div>
                        ${this._renderSchemaForm(
                          itemSchema,
                          (item as Record<string, unknown>) ?? {},
                          itemPath as string[],
                        )}
                      </div>
                    `;
                  }
                  return html`
                    <div class="array-item" style="display:flex; gap:8px; align-items:center;">
                      <input
                        class="form-input"
                        style="flex:1;"
                        .value=${String(item ?? "")}
                        @input=${(e: Event) =>
                          this._patchConfig(itemPath, (e.target as HTMLInputElement).value)}
                      />
                      <button class="btn" style="padding:2px 8px; font-size:11px;"
                        @click=${() => removeItem(i)}>✕</button>
                    </div>
                  `;
                })
            }

            <button class="btn" style="margin-top:8px;" @click=${addItem}>+ Add</button>
          </div>
        `}
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
