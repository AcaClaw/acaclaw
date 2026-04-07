import { html, nothing } from "lit";
import type { WeChatStatus, ChannelsProps } from "./channels.types.js";
import { renderChannelConfigSection } from "./channels.config.js";
import {
  formatNullableBoolean,
  formatRelativeTimestamp,
  renderSingleAccountChannelCard,
  resolveChannelConfigured,
} from "./channels.shared.js";
import { t } from "../i18n.js";

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
    title: t("ch.wechat.title"),
    subtitle: t("ch.wechat.subtitle"),
    accountCountLabel,
    statusRows: [
      { label: t("ch.configured"), value: formatNullableBoolean(configured) },
      { label: t("ch.running"), value: wechat?.running ? t("ch.yes") : t("ch.no") },
      { label: t("ch.connected"), value: wechat?.connected ? t("ch.yes") : t("ch.no") },
      {
        label: t("ch.lastStart"),
        value: wechat?.lastStartAt ? formatRelativeTimestamp(wechat.lastStartAt) : t("ch.na"),
      },
      {
        label: t("ch.lastProbe"),
        value: wechat?.lastProbeAt ? formatRelativeTimestamp(wechat.lastProbeAt) : t("ch.na"),
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
        ${loginBusy ? t("ch.working") : t("ch.wechat.loginQr")}
      </button>
      <button
        class="btn danger"
        ?disabled=${loginBusy ?? false}
        @click=${() => onLogout?.()}
      >
        ${t("ch.logout")}
      </button>
      <button class="btn" @click=${() => props.onRefresh(true)}>${t("ch.refresh")}</button>
    </div>`,
  });
}
