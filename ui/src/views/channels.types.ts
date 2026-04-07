import type { ConfigUiHints } from "./config-form.shared.js";

// ─── Channel status types (1:1 with OpenClaw's channel types) ─────────

export interface ChannelAccountSnapshot {
  accountId: string;
  name?: string;
  configured?: boolean;
  running?: boolean;
  connected?: boolean;
  lastInboundAt?: number;
  lastStartAt?: number;
  lastError?: string | null;
  probe?: unknown;
  publicKey?: string;
  profile?: NostrProfile;
}

export interface NostrProfile {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  nip05?: string;
  lud16?: string;
}

export interface ProbeResult {
  ok: boolean;
  status?: string;
  error?: string;
}

export interface WhatsAppStatus {
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  lastConnectedAt?: number;
  lastMessageAt?: number;
  authAgeMs?: number;
  lastError?: string | null;
}

export interface TelegramStatus {
  running?: boolean;
  mode?: string;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

export interface DiscordStatus {
  running?: boolean;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

export interface GoogleChatStatus {
  running?: boolean;
  credentialSource?: string;
  audienceType?: string;
  audience?: string;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

export interface SlackStatus {
  running?: boolean;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

export interface SignalStatus {
  running?: boolean;
  baseUrl?: string;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

export interface IMessageStatus {
  running?: boolean;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

export interface NostrStatus {
  configured?: boolean;
  running?: boolean;
  publicKey?: string;
  lastStartAt?: number;
  lastError?: string | null;
  profile?: NostrProfile;
}

export interface WeChatStatus {
  running?: boolean;
  connected?: boolean;
  lastStartAt?: number;
  lastProbeAt?: number;
  lastError?: string | null;
  probe?: ProbeResult;
}

export interface ChannelUiMetaEntry {
  id: string;
  name?: string;
  label?: string;
}

export interface ChannelsStatusSnapshot {
  ts?: number;
  channels?: Record<string, Record<string, unknown> | undefined>;
  channelMeta?: ChannelUiMetaEntry[];
  channelOrder?: string[];
  channelLabels?: Record<string, string>;
  channelAccounts?: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId?: Record<string, string>;
}

export type ChannelKey = string;

export type ChannelsProps = {
  connected: boolean;
  loading: boolean;
  snapshot: ChannelsStatusSnapshot | null;
  lastError: string | null;
  lastSuccessAt: number | null;
  whatsappMessage: string | null;
  whatsappQrDataUrl: string | null;
  whatsappConnected: boolean | null;
  whatsappBusy: boolean;
  configSchema: unknown;
  configSchemaLoading: boolean;
  configForm: Record<string, unknown> | null;
  configUiHints: ConfigUiHints;
  configSaving: boolean;
  configFormDirty: boolean;
  nostrProfileFormState: import("./channels.nostr-profile-form.js").NostrProfileFormState | null;
  nostrProfileAccountId: string | null;
  onRefresh: (probe: boolean) => void;
  onWhatsAppStart: (force: boolean) => void;
  onWhatsAppWait: () => void;
  onWhatsAppLogout: () => void;
  onConfigPatch: (path: Array<string | number>, value: unknown) => void;
  onConfigSave: () => void;
  onConfigReload: () => void;
  onNostrProfileEdit: (accountId: string, profile: NostrProfile | null) => void;
  onNostrProfileCancel: () => void;
  onNostrProfileFieldChange: (field: keyof NostrProfile, value: string) => void;
  onNostrProfileSave: () => void;
  onNostrProfileImport: () => void;
  onNostrProfileToggleAdvanced: () => void;
};

export type ChannelsChannelData = {
  whatsapp?: WhatsAppStatus;
  telegram?: TelegramStatus;
  discord?: DiscordStatus | null;
  googlechat?: GoogleChatStatus | null;
  slack?: SlackStatus | null;
  signal?: SignalStatus | null;
  imessage?: IMessageStatus | null;
  nostr?: NostrStatus | null;
  "openclaw-weixin"?: WeChatStatus | null;
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null;
};
