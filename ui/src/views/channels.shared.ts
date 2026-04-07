import { html, nothing } from "lit";
import type {
  ChannelAccountSnapshot,
  ChannelKey,
  ChannelsProps,
  ChannelsStatusSnapshot,
  ChannelUiMetaEntry,
} from "./channels.types.js";

// ─── Display state ────────────────────────────────────────────────────

type ChannelDisplayState = {
  configured: boolean | null;
  running: boolean | null;
  connected: boolean | null;
  defaultAccount: ChannelAccountSnapshot | null;
  hasAnyActiveAccount: boolean;
  status: Record<string, unknown> | undefined;
};

type ChannelStatusRow = {
  label: string;
  value: unknown;
};

function resolveChannelStatus(
  key: ChannelKey,
  props: ChannelsProps,
): Record<string, unknown> | undefined {
  const channels = props.snapshot?.channels as Record<string, unknown> | null;
  return channels?.[key] as Record<string, unknown> | undefined;
}

export function resolveDefaultChannelAccount(
  key: ChannelKey,
  props: ChannelsProps,
): ChannelAccountSnapshot | null {
  const accounts = props.snapshot?.channelAccounts?.[key] ?? [];
  const defaultAccountId = props.snapshot?.channelDefaultAccountId?.[key];
  return (
    (defaultAccountId
      ? accounts.find((account) => account.accountId === defaultAccountId)
      : undefined) ??
    accounts[0] ??
    null
  );
}

export function resolveChannelDisplayState(
  key: ChannelKey,
  props: ChannelsProps,
): ChannelDisplayState {
  const status = resolveChannelStatus(key, props);
  const accounts = props.snapshot?.channelAccounts?.[key] ?? [];
  const defaultAccount = resolveDefaultChannelAccount(key, props);
  const configured =
    typeof status?.configured === "boolean"
      ? status.configured
      : typeof defaultAccount?.configured === "boolean"
        ? defaultAccount.configured
        : null;
  const running = typeof status?.running === "boolean" ? status.running : null;
  const connected = typeof status?.connected === "boolean" ? status.connected : null;
  const hasAnyActiveAccount = accounts.some(
    (account) => account.configured || account.running || account.connected,
  );

  return {
    configured,
    running,
    connected,
    defaultAccount,
    hasAnyActiveAccount,
    status,
  };
}

export function channelEnabled(key: ChannelKey, props: ChannelsProps) {
  if (!props.snapshot) {
    return false;
  }
  const displayState = resolveChannelDisplayState(key, props);
  return (
    displayState.configured === true ||
    displayState.running === true ||
    displayState.connected === true ||
    displayState.hasAnyActiveAccount
  );
}

export function resolveChannelConfigured(key: ChannelKey, props: ChannelsProps): boolean | null {
  return resolveChannelDisplayState(key, props).configured;
}

export function formatNullableBoolean(value: boolean | null): string {
  if (value == null) {
    return "n/a";
  }
  return value ? "Yes" : "No";
}

// ─── Relative timestamp formatting ───────────────────────────────────

export function formatRelativeTimestamp(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatDurationHuman(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

// ─── Channel card shell ──────────────────────────────────────────────

export function renderSingleAccountChannelCard(params: {
  title: string;
  subtitle: string;
  accountCountLabel: unknown;
  statusRows: readonly ChannelStatusRow[];
  lastError?: string | null;
  secondaryCallout?: unknown;
  extraContent?: unknown;
  configSection: unknown;
  footer?: unknown;
}) {
  return html`
    <div class="card">
      <div class="card-title">${params.title}</div>
      <div class="card-sub">${params.subtitle}</div>
      ${params.accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        ${params.statusRows.map(
          (row) => html`
            <div>
              <span class="label">${row.label}</span>
              <span>${row.value}</span>
            </div>
          `,
        )}
      </div>

      ${params.lastError
        ? html`<div class="callout danger" style="margin-top: 12px;">${params.lastError}</div>`
        : nothing}
      ${params.secondaryCallout ?? nothing} ${params.extraContent ?? nothing}
      ${params.configSection} ${params.footer ?? nothing}
    </div>
  `;
}

// ─── Account count badge ─────────────────────────────────────────────

export function getChannelAccountCount(
  key: ChannelKey,
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null,
): number {
  return channelAccounts?.[key]?.length ?? 0;
}

export function renderChannelAccountCount(
  key: ChannelKey,
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null,
) {
  const count = getChannelAccountCount(key, channelAccounts);
  if (count < 2) {
    return nothing;
  }
  return html`<div class="account-count">Accounts (${count})</div>`;
}

// ─── Channel ordering ────────────────────────────────────────────────

const FALLBACK_CHANNEL_ORDER: ChannelKey[] = [
  "whatsapp", "telegram", "discord", "googlechat",
  "slack", "signal", "imessage", "nostr", "openclaw-weixin",
];

export function resolveChannelOrder(snapshot: ChannelsStatusSnapshot | null): ChannelKey[] {
  if (snapshot?.channelMeta?.length) {
    return snapshot.channelMeta.map((entry) => entry.id);
  }
  if (snapshot?.channelOrder?.length) {
    return snapshot.channelOrder;
  }
  return FALLBACK_CHANNEL_ORDER;
}

// ─── Channel labels ──────────────────────────────────────────────────

const CHANNEL_DISPLAY_LABELS: Record<string, string> = {
  "openclaw-weixin": "WeChat",
};

export function resolveChannelLabel(snapshot: ChannelsStatusSnapshot | null, key: string): string {
  const meta = resolveChannelMetaMap(snapshot)[key];
  return meta?.label ?? snapshot?.channelLabels?.[key] ?? CHANNEL_DISPLAY_LABELS[key] ?? key;
}

function resolveChannelMetaMap(
  snapshot: ChannelsStatusSnapshot | null,
): Record<string, ChannelUiMetaEntry> {
  if (!snapshot?.channelMeta?.length) {
    return {};
  }
  return Object.fromEntries(snapshot.channelMeta.map((entry) => [entry.id, entry]));
}

// ─── Pubkey truncation ───────────────────────────────────────────────

export function truncatePubkey(pubkey: string | null | undefined): string {
  if (!pubkey) {
    return "n/a";
  }
  if (pubkey.length <= 20) {
    return pubkey;
  }
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
}
