import { html, nothing } from "lit";
import type { WeChatStatus, ChannelsProps } from "./channels.types.js";
import { renderChannelConfigSection } from "./channels.config.js";
import {
  formatNullableBoolean,
  formatRelativeTimestamp,
  renderSingleAccountChannelCard,
  resolveChannelConfigured,
} from "./channels.shared.js";

export function renderWeChatCard(params: {
  props: ChannelsProps;
  wechat?: WeChatStatus | null;
  accountCountLabel: unknown;
  qrDataUrl?: string | null;
  loginMessage?: string | null;
  loginBusy?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
}) {
  const {
    props,
    wechat,
    accountCountLabel,
    qrDataUrl,
    loginMessage,
    loginBusy,
    onLogin,
    onLogout,
  } = params;
  const configured = resolveChannelConfigured("openclaw-weixin", props);

  return renderSingleAccountChannelCard({
    title: "WeChat",
    subtitle: "Tencent iLink Bot plugin — private chats via QR login.",
    accountCountLabel,
    statusRows: [
      { label: "Configured", value: formatNullableBoolean(configured) },
      { label: "Running", value: wechat?.running ? "Yes" : "No" },
      { label: "Connected", value: wechat?.connected ? "Yes" : "No" },
      {
        label: "Last start",
        value: wechat?.lastStartAt ? formatRelativeTimestamp(wechat.lastStartAt) : "n/a",
      },
      {
        label: "Last probe",
        value: wechat?.lastProbeAt ? formatRelativeTimestamp(wechat.lastProbeAt) : "n/a",
      },
    ],
    lastError: wechat?.lastError,
    extraContent: html`
      ${loginMessage
        ? html`<div class="callout" style="margin-top: 12px;">${loginMessage}</div>`
        : nothing}
      ${qrDataUrl
        ? html`<div class="qr-wrap">
            <img src=${qrDataUrl} alt="WeChat QR" />
          </div>`
        : nothing}
    `,
    configSection: renderChannelConfigSection({ channelId: "openclaw-weixin", props }),
    footer: html`<div class="row" style="margin-top: 14px; flex-wrap: wrap;">
      <button
        class="btn primary"
        ?disabled=${loginBusy ?? false}
        @click=${() => onLogin?.()}
      >
        ${loginBusy ? "Working…" : "Login QR"}
      </button>
      <button
        class="btn danger"
        ?disabled=${loginBusy ?? false}
        @click=${() => onLogout?.()}
      >
        Logout
      </button>
      <button class="btn" @click=${() => props.onRefresh(true)}>Refresh</button>
    </div>`,
  });
}
