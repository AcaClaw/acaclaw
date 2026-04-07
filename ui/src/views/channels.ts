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
 * Per-channel rendering is delegated to the same per-channel card modules
 * that OpenClaw uses (channels.whatsapp.ts, channels.telegram.ts, etc.).
 */
import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { configFormStyles } from "../styles/config-form.css.js";
import { gateway, updateConfig } from "../controllers/gateway.js";
import { LocaleController } from "../i18n.js";
import type {
  ChannelsStatusSnapshot,
  ChannelsProps,
  ChannelKey,
  ChannelsChannelData,
  NostrProfile,
  WhatsAppStatus,
  TelegramStatus,
  DiscordStatus,
  GoogleChatStatus,
  SlackStatus,
  SignalStatus,
  IMessageStatus,
  NostrStatus,
  WeChatStatus,
  ChannelAccountSnapshot,
} from "./channels.types.js";
import type { NostrProfileFormState } from "./channels.nostr-profile-form.js";
import { createNostrProfileFormState } from "./channels.nostr-profile-form.js";
import {
  channelEnabled,
  formatRelativeTimestamp,
  formatNullableBoolean,
  resolveChannelDisplayState,
  resolveChannelOrder,
  resolveChannelLabel,
  renderChannelAccountCount,
} from "./channels.shared.js";
import { renderChannelConfigSection } from "./channels.config.js";
import { renderWhatsAppCard } from "./channels.whatsapp.js";
import { renderTelegramCard } from "./channels.telegram.js";
import { renderDiscordCard } from "./channels.discord.js";
import { renderGoogleChatCard } from "./channels.googlechat.js";
import { renderSlackCard } from "./channels.slack.js";
import { renderSignalCard } from "./channels.signal.js";
import { renderIMessageCard } from "./channels.imessage.js";
import { renderNostrCard } from "./channels.nostr.js";
import { renderWeChatCard } from "./channels.wechat.js";
import type { ConfigUiHints } from "./config-form.shared.js";

type WhatsAppLoginMessage = {
  message?: string | null;
  qrDataUrl?: string | null;
  connected?: boolean | null;
};

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
  @state() private _configUiHints: ConfigUiHints = {};
  @state() private _configForm: Record<string, unknown> | null = null;
  @state() private _configDirty = false;
  @state() private _configSaving = false;
  @state() private _configSchemaLoading = false;

  // WhatsApp-specific
  @state() private _whatsappQr: string | null = null;
  @state() private _whatsappMessage: string | null = null;
  @state() private _whatsappConnected: boolean | null = null;
  @state() private _whatsappBusy = false;

  // WeChat-specific
  @state() private _wechatQr: string | null = null;
  @state() private _wechatMessage: string | null = null;
  @state() private _wechatBusy = false;

  // Nostr profile editing
  @state() private _nostrProfileFormState: NostrProfileFormState | null = null;
  @state() private _nostrProfileAccountId: string | null = null;

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
        const props = this._buildProps();
        const order = resolveChannelOrder(this._snapshot);
        const first = order.find((id) => channelEnabled(id, props));
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
        gateway
          .call<{ schema?: Record<string, unknown>; uiHints?: ConfigUiHints }>("config.schema")
          .catch(() => null),
      ]);
      this._configForm = (snap?.config as Record<string, unknown>) ?? null;
      this._configSchema = (schemaRes?.schema as Record<string, unknown>) ?? null;
      this._configUiHints = schemaRes?.uiHints ?? {};
    } catch {
      // schema unavailable — config form will show fallback
      this._configUiHints = {};
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

  // ── WeChat helpers ────────────────────────────────────────────────────────

  private async _wechatLogin() {
    if (this._wechatBusy) return;
    this._wechatBusy = true;
    this._wechatMessage = "Starting WeChat QR login…";
    this._wechatQr = null;
    try {
      // Step 1: request a QR code via the standard web.login.start method.
      // The gateway dispatches to the first channel plugin with
      //   gatewayMethods: ["web.login.start", "web.login.wait"]
      // and calls its gateway.loginWithQrStart hook.
      const startRes = await gateway.call<{
        qrDataUrl?: string;
        message?: string;
        sessionKey?: string;
      }>("web.login.start", { force: true, timeoutMs: 30_000 });

      this._wechatMessage = startRes?.message ?? "Scan the QR code with WeChat…";
      this._wechatQr = startRes?.qrDataUrl ?? null;

      if (!startRes?.qrDataUrl) {
        // No QR code — can't proceed with login.
        this._wechatMessage = startRes?.message ?? "Failed to get QR code.";
        return;
      }

      // Step 2: poll for scan result.
      // Do NOT send sessionKey — the gateway rejects unknown properties.
      // The plugin resolves the session via its internal accountToSession map.
      this._wechatMessage = "Waiting for scan…";
      const waitRes = await gateway.call<{
        connected?: boolean;
        message?: string;
        accountId?: string;
      }>("web.login.wait", {
        timeoutMs: 120_000,
      });

      this._wechatMessage = waitRes?.message ?? (waitRes?.connected ? "Connected!" : "Timed out.");
      if (waitRes?.connected) {
        this._wechatQr = null;
      }
    } catch (err) {
      this._wechatMessage = String(err);
    } finally {
      this._wechatBusy = false;
      void this._loadChannels(true);
    }
  }

  private async _wechatLogout() {
    if (this._wechatBusy) return;
    this._wechatBusy = true;
    try {
      // Try channels.logout — may fail if the plugin lacks logoutAccount.
      await gateway.call("channels.logout", {
        channel: "openclaw-weixin",
      });
      this._wechatQr = null;
      this._wechatMessage = "Logged out.";
    } catch (err) {
      // If logout is unsupported, disable the channel via config instead.
      try {
        await gateway.call("config.patch", {
          patches: [
            { op: "replace", path: ["channels", "openclaw-weixin", "enabled"], value: false },
          ],
        });
        this._wechatQr = null;
        this._wechatMessage = "Channel disabled. Re-enable via config to reconnect.";
      } catch {
        this._wechatMessage = String(err);
      }
    } finally {
      this._wechatBusy = false;
      void this._loadChannels(true);
    }
  }

  // ── Nostr profile helpers ───────────────────────────────────────────────

  private _nostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    this._nostrProfileAccountId = accountId;
    this._nostrProfileFormState = createNostrProfileFormState(profile ?? undefined);
  }

  private _nostrProfileCancel() {
    this._nostrProfileFormState = null;
    this._nostrProfileAccountId = null;
  }

  private _nostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    if (!this._nostrProfileFormState) return;
    this._nostrProfileFormState = {
      ...this._nostrProfileFormState,
      values: { ...this._nostrProfileFormState.values, [field]: value },
    };
  }

  private async _nostrProfileSave() {
    if (!this._nostrProfileFormState || !this._nostrProfileAccountId) return;
    this._nostrProfileFormState = { ...this._nostrProfileFormState, saving: true, error: null };
    try {
      await gateway.call("nostr.profile.publish", {
        accountId: this._nostrProfileAccountId,
        profile: this._nostrProfileFormState.values,
      });
      this._nostrProfileFormState = {
        ...this._nostrProfileFormState,
        saving: false,
        original: { ...this._nostrProfileFormState.values },
        success: "Profile saved",
      };
      void this._loadChannels(false);
    } catch (err) {
      this._nostrProfileFormState = {
        ...this._nostrProfileFormState,
        saving: false,
        error: String(err),
      };
    }
  }

  private async _nostrProfileImport() {
    if (!this._nostrProfileFormState || !this._nostrProfileAccountId) return;
    this._nostrProfileFormState = { ...this._nostrProfileFormState, importing: true, error: null };
    try {
      const res = await gateway.call<{ profile?: NostrProfile }>("nostr.profile.fetch", {
        accountId: this._nostrProfileAccountId,
      });
      if (res?.profile) {
        this._nostrProfileFormState = {
          ...this._nostrProfileFormState,
          importing: false,
          values: { ...this._nostrProfileFormState.values, ...res.profile },
        };
      } else {
        this._nostrProfileFormState = {
          ...this._nostrProfileFormState,
          importing: false,
          error: "No profile found on relays",
        };
      }
    } catch (err) {
      this._nostrProfileFormState = {
        ...this._nostrProfileFormState,
        importing: false,
        error: String(err),
      };
    }
  }

  private _nostrProfileToggleAdvanced() {
    if (!this._nostrProfileFormState) return;
    this._nostrProfileFormState = {
      ...this._nostrProfileFormState,
      showAdvanced: !this._nostrProfileFormState.showAdvanced,
    };
  }

  // ── Build ChannelsProps (bridges LitElement state → functional renderers) ──

  private _buildProps(): ChannelsProps {
    return {
      connected: true,
      loading: this._loading,
      snapshot: this._snapshot,
      lastError: this._error,
      lastSuccessAt: this._lastRefreshedAt,
      whatsappMessage: this._whatsappMessage,
      whatsappQrDataUrl: this._whatsappQr,
      whatsappConnected: this._whatsappConnected,
      whatsappBusy: this._whatsappBusy,
      configSchema: this._configSchema,
      configSchemaLoading: this._configSchemaLoading,
      configForm: this._configForm,
      configUiHints: this._configUiHints,
      configSaving: this._configSaving,
      configFormDirty: this._configDirty,
      nostrProfileFormState: this._nostrProfileFormState,
      nostrProfileAccountId: this._nostrProfileAccountId,
      onRefresh: (probe: boolean) => void this._loadChannels(probe),
      onWhatsAppStart: (force: boolean) => void this._whatsappStart(force),
      onWhatsAppWait: () => void this._whatsappWait(),
      onWhatsAppLogout: () => void this._whatsappLogout(),
      onConfigPatch: (path, value) => this._patchConfig(path, value),
      onConfigSave: () => void this._saveConfig(),
      onConfigReload: () => void this._reloadConfig(),
      onNostrProfileEdit: (accountId, profile) => this._nostrProfileEdit(accountId, profile),
      onNostrProfileCancel: () => this._nostrProfileCancel(),
      onNostrProfileFieldChange: (field, value) => this._nostrProfileFieldChange(field, value),
      onNostrProfileSave: () => void this._nostrProfileSave(),
      onNostrProfileImport: () => void this._nostrProfileImport(),
      onNostrProfileToggleAdvanced: () => this._nostrProfileToggleAdvanced(),
    };
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  static override styles = [configFormStyles, css`
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

    /* ── Panels & Cards ── */
    .panel {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 24px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    /* OpenClaw card classes mapped to AcaClaw panel styling */
    .card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 24px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .card-title, .panel-title { font-size: 15px; font-weight: 700; color: var(--ac-text); margin-bottom: 4px; letter-spacing: -0.02em; }
    .card-sub { font-size: 13px; color: var(--ac-text-muted); margin-bottom: 12px; }

    /* ── Status list ── */
    .status-list { display: flex; flex-direction: column; gap: 8px; }
    .status-list > div { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
    .status-list .label, .status-label { color: var(--ac-text-muted); min-width: 110px; }
    .status-value { color: var(--ac-text); font-weight: 500; }
    .row { display: flex; gap: 8px; }

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
    .account-card-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .account-card-header, .account-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .account-card-title, .account-name { font-size: 13px; font-weight: 600; color: var(--ac-text); }
    .account-card-id, .account-id { font-size: 11px; color: var(--ac-text-muted); }
    .account-card-error { color: #b91c1c; font-size: 12px; margin-top: 6px; }
    .account-count { font-size: 12px; color: var(--ac-text-muted); margin-bottom: 8px; }

    .empty { color: var(--ac-text-muted); font-size: 14px; padding: 32px 0; text-align: center; }
    .muted { color: var(--ac-text-muted); font-size: 13px; }

    /* ── Nostr profile ── */
    .nostr-profile { margin-top: 16px; padding: 12px; background: var(--ac-bg-muted); border-radius: var(--ac-radius-md); }
    .nostr-profile img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--ac-border); }
    .nostr-profile-form { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
    .nostr-profile-form label { font-size: 12px; font-weight: 600; color: var(--ac-text-muted); }
    .nostr-profile-form input,
    .nostr-profile-form textarea {
      padding: 8px 12px; font-size: 13px;
      background: var(--ac-bg-base, var(--ac-bg-muted));
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-md);
      color: var(--ac-text);
    }

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
  `];

  /**
   * Merge channel IDs from channels.status (configured) with all channels
   * available in the config schema, so unconfigured channels also appear
   * in the dropdown for initial setup.
   */
  private _mergedChannelOrder(): string[] {
    const statusOrder = resolveChannelOrder(this._snapshot);
    const seen = new Set(statusOrder);
    // Extract channel IDs from config schema
    const schemaChannels =
      (this._configSchema as Record<string, unknown>)?.properties &&
      ((this._configSchema as Record<string, Record<string, unknown>>).properties
        .channels as Record<string, unknown>)?.properties;
    const schemaIds = schemaChannels ? Object.keys(schemaChannels as Record<string, unknown>) : [];
    // Append schema channels not already in status
    for (const id of schemaIds) {
      if (!seen.has(id)) {
        statusOrder.push(id);
        seen.add(id);
      }
    }
    return statusOrder;
  }

  override render() {
    const props = this._buildProps();
    const order = this._mergedChannelOrder();
    const sorted = [...order].sort((a, b) => {
      const ae = channelEnabled(a, props);
      const be = channelEnabled(b, props);
      if (ae !== be) return ae ? -1 : 1;
      return 0;
    });

    return html`
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
              const enabled = channelEnabled(id, props);
              const label = `${enabled ? "●" : "○"}  ${resolveChannelLabel(this._snapshot, id)}`;
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
          ? html`<span class="muted">${formatRelativeTimestamp(this._lastRefreshedAt)}</span>`
          : nothing}
      </div>

      <!-- ── Selected channel panel ── -->
      ${this._selectedChannel
        ? html`<div class="panel">${this._renderChannel(this._selectedChannel, props)}</div>`
        : nothing}

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

  // ── Channel dispatch ──────────────────────────────────────────────────────

  private _renderChannel(key: ChannelKey, props: ChannelsProps) {
    const channels = this._snapshot?.channels as Record<string, unknown> | null;
    const channelAccounts = this._snapshot?.channelAccounts ?? null;
    const accountCountLabel = renderChannelAccountCount(key, channelAccounts);

    const data: ChannelsChannelData = {
      whatsapp: (channels?.whatsapp ?? undefined) as WhatsAppStatus | undefined,
      telegram: (channels?.telegram ?? undefined) as TelegramStatus | undefined,
      discord: (channels?.discord ?? null) as DiscordStatus | null,
      googlechat: (channels?.googlechat ?? null) as GoogleChatStatus | null,
      slack: (channels?.slack ?? null) as SlackStatus | null,
      signal: (channels?.signal ?? null) as SignalStatus | null,
      imessage: (channels?.imessage ?? null) as IMessageStatus | null,
      nostr: (channels?.nostr ?? null) as NostrStatus | null,
      "openclaw-weixin": (channels?.["openclaw-weixin"] ?? null) as WeChatStatus | null,
      channelAccounts,
    };

    switch (key) {
      case "whatsapp":
        return renderWhatsAppCard({ props, whatsapp: data.whatsapp, accountCountLabel });
      case "telegram":
        return renderTelegramCard({
          props,
          telegram: data.telegram,
          telegramAccounts: channelAccounts?.telegram ?? [],
          accountCountLabel,
        });
      case "discord":
        return renderDiscordCard({ props, discord: data.discord, accountCountLabel });
      case "googlechat":
        return renderGoogleChatCard({ props, googleChat: data.googlechat, accountCountLabel });
      case "slack":
        return renderSlackCard({ props, slack: data.slack, accountCountLabel });
      case "signal":
        return renderSignalCard({ props, signal: data.signal, accountCountLabel });
      case "imessage":
        return renderIMessageCard({ props, imessage: data.imessage, accountCountLabel });
      case "openclaw-weixin":
        return renderWeChatCard({
          props,
          wechat: data["openclaw-weixin"],
          accountCountLabel,
          qrDataUrl: this._wechatQr,
          loginMessage: this._wechatMessage,
          loginBusy: this._wechatBusy,
          onLogin: () => void this._wechatLogin(),
          onLogout: () => void this._wechatLogout(),
        });
      case "nostr": {
        const nostrAccounts = channelAccounts?.nostr ?? [];
        const primaryAccount = nostrAccounts[0];
        const accountId = primaryAccount?.accountId ?? "default";
        const profile =
          (primaryAccount as { profile?: NostrProfile | null } | undefined)?.profile ?? null;
        const showForm =
          this._nostrProfileAccountId === accountId ? this._nostrProfileFormState : null;
        const profileFormCallbacks = showForm
          ? {
              onFieldChange: props.onNostrProfileFieldChange,
              onSave: props.onNostrProfileSave,
              onImport: props.onNostrProfileImport,
              onCancel: props.onNostrProfileCancel,
              onToggleAdvanced: props.onNostrProfileToggleAdvanced,
            }
          : null;
        return renderNostrCard({
          props,
          nostr: data.nostr,
          nostrAccounts,
          accountCountLabel,
          profileFormState: showForm,
          profileFormCallbacks,
          onEditProfile: () => props.onNostrProfileEdit(accountId, profile),
        });
      }
      default:
        return this._renderGenericChannel(key, props);
    }
  }

  // ── Generic channel fallback ──────────────────────────────────────────────

  private _renderGenericChannel(key: ChannelKey, props: ChannelsProps) {
    const label = resolveChannelLabel(this._snapshot, key);
    const displayState = resolveChannelDisplayState(key, props);
    const lastError =
      typeof displayState.status?.lastError === "string" ? displayState.status.lastError : undefined;
    const accounts = this._snapshot?.channelAccounts?.[key] ?? [];
    const accountCountLabel = renderChannelAccountCount(key, this._snapshot?.channelAccounts ?? null);

    return html`
      <div class="card-title">${label}</div>
      <div class="card-sub">Channel status and configuration.</div>
      ${accountCountLabel}
      ${accounts.length > 0
        ? html`
            <div class="account-card-list">
              ${accounts.map((account) => this._renderGenericAccount(account))}
            </div>
          `
        : html`
            <div class="status-list" style="margin-top: 16px;">
              <div>
                <span class="label">Configured</span>
                <span>${formatNullableBoolean(displayState.configured)}</span>
              </div>
              <div>
                <span class="label">Running</span>
                <span>${formatNullableBoolean(displayState.running)}</span>
              </div>
              <div>
                <span class="label">Connected</span>
                <span>${formatNullableBoolean(displayState.connected)}</span>
              </div>
            </div>
          `}
      ${lastError
        ? html`<div class="callout danger" style="margin-top: 12px;">${lastError}</div>`
        : nothing}
      ${renderChannelConfigSection({ channelId: key, props })}
    `;
  }

  private _renderGenericAccount(account: ChannelAccountSnapshot) {
    return html`
      <div class="account-card">
        <div class="account-header">
          <span class="account-name">${account.name || account.accountId}</span>
          <span class="account-id">${account.accountId}</span>
        </div>
        <div class="status-list account-card-status">
          <div>
            <span class="label">Running</span>
            <span>${account.running ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Configured</span>
            <span>${account.configured ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Connected</span>
            <span>${account.connected === true ? "Yes" : account.connected === false ? "No" : "n/a"}</span>
          </div>
          <div>
            <span class="label">Last inbound</span>
            <span>${account.lastInboundAt ? formatRelativeTimestamp(account.lastInboundAt) : "n/a"}</span>
          </div>
          ${account.lastError
            ? html`<div class="account-card-error">${account.lastError}</div>`
            : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "acaclaw-channels": ChannelsView;
  }
}

