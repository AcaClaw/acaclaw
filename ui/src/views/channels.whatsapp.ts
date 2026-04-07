import { html, nothing } from "lit";
import type { WhatsAppStatus, ChannelsProps } from "./channels.types.js";
import { renderChannelConfigSection } from "./channels.config.js";
import {
  formatNullableBoolean,
  formatRelativeTimestamp,
  formatDurationHuman,
  renderSingleAccountChannelCard,
  resolveChannelConfigured,
} from "./channels.shared.js";

export function renderWhatsAppCard(params: {
  props: ChannelsProps;
  whatsapp?: WhatsAppStatus;
  accountCountLabel: unknown;
}) {
  const { props, whatsapp, accountCountLabel } = params;
  const configured = resolveChannelConfigured("whatsapp", props);

  return renderSingleAccountChannelCard({
    title: "WhatsApp",
    subtitle: "Link WhatsApp Web and monitor connection health.",
    accountCountLabel,
    statusRows: [
      { label: "Configured", value: formatNullableBoolean(configured) },
      { label: "Linked", value: whatsapp?.linked ? "Yes" : "No" },
      { label: "Running", value: whatsapp?.running ? "Yes" : "No" },
      { label: "Connected", value: whatsapp?.connected ? "Yes" : "No" },
      {
        label: "Last connect",
        value: whatsapp?.lastConnectedAt
          ? formatRelativeTimestamp(whatsapp.lastConnectedAt)
          : "n/a",
      },
      {
        label: "Last message",
        value: whatsapp?.lastMessageAt ? formatRelativeTimestamp(whatsapp.lastMessageAt) : "n/a",
      },
      {
        label: "Auth age",
        value: whatsapp?.authAgeMs != null ? formatDurationHuman(whatsapp.authAgeMs) : "n/a",
      },
    ],
    lastError: whatsapp?.lastError,
    extraContent: html`
      ${props.whatsappMessage
        ? html`<div class="callout" style="margin-top: 12px;">${props.whatsappMessage}</div>`
        : nothing}
      ${props.whatsappQrDataUrl
        ? html`<div class="qr-wrap">
            <img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" />
          </div>`
        : nothing}
    `,
    configSection: renderChannelConfigSection({ channelId: "whatsapp", props }),
    footer: html`<div class="row" style="margin-top: 14px; flex-wrap: wrap;">
      <button
        class="btn primary"
        ?disabled=${props.whatsappBusy}
        @click=${() => props.onWhatsAppStart(false)}
      >
        ${props.whatsappBusy ? "Working…" : "Show QR"}
      </button>
      <button
        class="btn"
        ?disabled=${props.whatsappBusy}
        @click=${() => props.onWhatsAppStart(true)}
      >
        Relink
      </button>
      <button class="btn" ?disabled=${props.whatsappBusy} @click=${() => props.onWhatsAppWait()}>
        Wait for scan
      </button>
      <button
        class="btn danger"
        ?disabled=${props.whatsappBusy}
        @click=${() => props.onWhatsAppLogout()}
      >
        Logout
      </button>
      <button class="btn" @click=${() => props.onRefresh(true)}>Refresh</button>
    </div>`,
  });
}
