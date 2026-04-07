// Ported from OpenClaw ui/src/ui/views/channels.config.ts + channel-config-extras.ts
// Uses the ported config-form.node.ts renderNode for schema-driven per-channel forms.
import { html } from "lit";
import { analyzeConfigSchema } from "./config-form.analyze.ts";
import { renderNode } from "./config-form.node.ts";
import { schemaType, type ConfigUiHints, type JsonSchema } from "./config-form.shared.ts";

// --- channel-config-extras helpers (inlined) ---

export function resolveChannelConfigValue(
  configForm: Record<string, unknown> | null | undefined,
  channelId: string,
): Record<string, unknown> | null {
  if (!configForm) return null;
  const channels = (configForm.channels ?? {}) as Record<string, unknown>;
  const fromChannels = channels[channelId];
  if (fromChannels && typeof fromChannels === "object") return fromChannels as Record<string, unknown>;
  const fallback = configForm[channelId];
  if (fallback && typeof fallback === "object") return fallback as Record<string, unknown>;
  return null;
}

function formatChannelExtraValue(raw: unknown): string {
  if (raw == null) return "n/a";
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return String(raw);
  try { return JSON.stringify(raw); } catch { return "n/a"; }
}

// --- schema helpers ---

function resolveSchemaNode(
  schema: JsonSchema | null,
  path: Array<string | number>,
): JsonSchema | null {
  let current = schema;
  for (const key of path) {
    if (!current) return null;
    const type = schemaType(current);
    if (type === "object") {
      const properties = current.properties ?? {};
      if (typeof key === "string" && properties[key]) { current = properties[key]; continue; }
      const additional = current.additionalProperties;
      if (typeof key === "string" && additional && typeof additional === "object") { current = additional as JsonSchema; continue; }
      return null;
    }
    if (type === "array") {
      if (typeof key !== "number") return null;
      const items = Array.isArray(current.items) ? current.items[0] : current.items;
      current = items ?? null;
      continue;
    }
    return null;
  }
  return current;
}

const EXTRA_CHANNEL_FIELDS = ["groupPolicy", "streamMode", "dmPolicy"] as const;

function renderExtraChannelFields(value: Record<string, unknown>) {
  const entries = EXTRA_CHANNEL_FIELDS.flatMap((field) => {
    if (!(field in value)) return [];
    return [[field, value[field]]] as Array<[string, unknown]>;
  });
  if (entries.length === 0) return null;
  return html`
    <div class="status-list" style="margin-top: 12px;">
      ${entries.map(([field, raw]) => html`
        <div><span class="label">${field}</span><span>${formatChannelExtraValue(raw)}</span></div>`)}
    </div>`;
}

// --- public API ---

export type ChannelConfigSectionParams = {
  channelId: string;
  configForm: Record<string, unknown> | null;
  configSchema: unknown;
  configSchemaLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
  onSave: () => void;
  onReload: () => void;
};

export function renderChannelConfigSection(params: ChannelConfigSectionParams) {
  const { channelId, configForm, configSchema, configSchemaLoading, configSaving, configDirty, onPatch, onSave, onReload } = params;
  const disabled = configSaving || configSchemaLoading;

  const content = configSchemaLoading
    ? html`<div class="muted">Loading config schema…</div>`
    : (() => {
        const analysis = analyzeConfigSchema(configSchema);
        const normalized = analysis.schema;
        if (!normalized) {
          return html`<div class="callout danger">Schema unavailable.</div>`;
        }
        const node = resolveSchemaNode(normalized, ["channels", channelId]);
        if (!node) {
          return html`<div class="callout danger">Channel config schema unavailable.</div>`;
        }
        const configValue = configForm ?? {};
        const value = resolveChannelConfigValue(configValue, channelId) ?? {};
        const hints: ConfigUiHints = {};
        return html`
          <div class="config-form">
            ${renderNode({
              schema: node,
              value,
              path: ["channels", channelId],
              hints,
              unsupported: new Set(analysis.unsupportedPaths),
              disabled,
              showLabel: false,
              onPatch,
            })}
          </div>
          ${renderExtraChannelFields(value)}`;
      })();

  return html`
    <div style="margin-top: 16px;">
      ${content}
      <div class="row" style="margin-top: 12px;">
        <button class="btn primary" ?disabled=${disabled || !configDirty} @click=${() => onSave()}>
          ${configSaving ? "Saving…" : "Save"}
        </button>
        <button class="btn" ?disabled=${disabled} @click=${() => onReload()}>Reload</button>
      </div>
    </div>`;
}
