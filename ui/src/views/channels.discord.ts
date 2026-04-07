import { html, nothing } from "lit";
import type { DiscordStatus, ChannelsProps } from "./channels.types.js";
import { renderChannelConfigSection } from "./channels.config.js";
import {
  formatNullableBoolean,
  formatRelativeTimestamp,
  renderSingleAccountChannelCard,
  resolveChannelConfigured,
} from "./channels.shared.js";

export function renderDiscordCard(params: {
  props: ChannelsProps;
  discord?: DiscordStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, discord, accountCountLabel } = params;
  const configured = resolveChannelConfigured("discord", props);

  return renderSingleAccountChannelCard({
    title: "Discord",
    subtitle: "Bot status and channel configuration.",
    accountCountLabel,
    statusRows: [
      { label: "Configured", value: formatNullableBoolean(configured) },
      { label: "Running", value: discord?.running ? "Yes" : "No" },
      {
        label: "Last start",
        value: discord?.lastStartAt ? formatRelativeTimestamp(discord.lastStartAt) : "n/a",
      },
      {
        label: "Last probe",
        value: discord?.lastProbeAt ? formatRelativeTimestamp(discord.lastProbeAt) : "n/a",
      },
    ],
    lastError: discord?.lastError,
    secondaryCallout: discord?.probe
      ? html`<div class="callout" style="margin-top: 12px;">
          Probe ${discord.probe.ok ? "ok" : "failed"} · ${discord.probe.status ?? ""}
          ${discord.probe.error ?? ""}
        </div>`
      : nothing,
    configSection: renderChannelConfigSection({ channelId: "discord", props }),
    footer: html`<div class="row" style="margin-top: 12px;">
      <button class="btn" @click=${() => props.onRefresh(true)}>Probe</button>
    </div>`,
  });
}
