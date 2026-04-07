import { html, nothing } from "lit";
import { formatChannelExtraValue, resolveChannelConfigValue } from "./channel-config-extras.js";
import { analyzeConfigSchema } from "./config-form.analyze.js";
import { renderNode } from "./config-form.node.js";
import { schemaType, type ConfigUiHints, type JsonSchema } from "./config-form.shared.js";
import type { ChannelsProps } from "./channels.types.js";

type ChannelConfigFormProps = {
  channelId: string;
  configValue: Record<string, unknown> | null;
  schema: unknown;
  uiHints: ConfigUiHints;
  disabled: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
};

function resolveSchemaNode(
  schema: JsonSchema | null,
  path: Array<string | number>,
): JsonSchema | null {
  let current = schema;
  for (const key of path) {
    if (!current) {
      return null;
    }
    const type = schemaType(current);
    if (type === "object") {
      const properties = current.properties ?? {};
      if (typeof key === "string" && properties[key]) {
        current = properties[key];
        continue;
      }
      const additional = current.additionalProperties;
      if (typeof key === "string" && additional && typeof additional === "object") {
        current = additional;
        continue;
      }
      return null;
    }
    if (type === "array") {
      if (typeof key !== "number") {
        return null;
      }
      const items = Array.isArray(current.items) ? current.items[0] : current.items;
      current = items ?? null;
      continue;
    }
    return null;
  }
  return current;
}

function resolveChannelValue(
  config: Record<string, unknown>,
  channelId: string,
): Record<string, unknown> {
  return resolveChannelConfigValue(config, channelId) ?? {};
}

const EXTRA_CHANNEL_FIELDS = ["groupPolicy", "streamMode", "dmPolicy"] as const;

function renderExtraChannelFields(value: Record<string, unknown>) {
  const entries = EXTRA_CHANNEL_FIELDS.flatMap((field) => {
    if (!(field in value)) {
      return [];
    }
    return [[field, value[field]]] as Array<[string, unknown]>;
  });
  if (entries.length === 0) {
    return null;
  }
  return html`
    <div class="status-list" style="margin-top: 12px;">
      ${entries.map(
        ([field, raw]) => html`
          <div>
            <span class="label">${field}</span>
            <span>${formatChannelExtraValue(raw)}</span>
          </div>
        `,
      )}
    </div>
  `;
}

export function renderChannelConfigForm(props: ChannelConfigFormProps) {
  const analysis = analyzeConfigSchema(props.schema);
  const normalized = analysis.schema;
  if (!normalized) {
    return html` <div class="callout danger">Schema unavailable. Use Raw.</div> `;
  }
  const node = resolveSchemaNode(normalized, ["channels", props.channelId]);
  if (!node) {
    return html` <div class="callout danger">Channel config schema unavailable.</div> `;
  }
  // Plugin channels with empty configSchema produce a node with no type or
  // empty properties — skip rendering instead of showing "Unsupported type".
  const nodeType =
    typeof (node as Record<string, unknown>).type === "string"
      ? ((node as Record<string, unknown>).type as string)
      : "";
  const nodeProps = (node as Record<string, unknown>).properties;
  if (
    !nodeType ||
    (nodeType === "object" &&
      nodeProps &&
      typeof nodeProps === "object" &&
      Object.keys(nodeProps).length === 0)
  ) {
    return nothing;
  }
  const configValue = props.configValue ?? {};
  const value = resolveChannelValue(configValue, props.channelId);
  return html`
    <div class="config-form">
      ${renderNode({
        schema: node,
        value,
        path: ["channels", props.channelId],
        hints: props.uiHints,
        unsupported: new Set(analysis.unsupportedPaths),
        disabled: props.disabled,
        showLabel: false,
        onPatch: props.onPatch,
      })}
    </div>
    ${renderExtraChannelFields(value)}
  `;
}

export type ChannelConfigSectionParams = {
  channelId: string;
  configForm: Record<string, unknown> | null;
  configSchema: unknown;
  configUiHints: ConfigUiHints;
  configSchemaLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
  onSave: () => void;
  onReload: () => void;
};

/** OpenClaw-compatible overload: { channelId, props } */
type ChannelConfigSectionPropsParams = {
  channelId: string;
  props: ChannelsProps;
};

export function renderChannelConfigSection(
  params: ChannelConfigSectionParams | ChannelConfigSectionPropsParams,
) {
  // Normalize to flat params
  const flat: ChannelConfigSectionParams =
    "props" in params
      ? {
          channelId: params.channelId,
          configForm: params.props.configForm,
          configSchema: params.props.configSchema,
          configUiHints: params.props.configUiHints,
          configSchemaLoading: params.props.configSchemaLoading,
          configSaving: params.props.configSaving,
          configDirty: params.props.configFormDirty,
          onPatch: params.props.onConfigPatch,
          onSave: params.props.onConfigSave,
          onReload: params.props.onConfigReload,
        }
      : params;

  const {
    channelId,
    configForm,
    configSchema,
    configUiHints,
    configSchemaLoading,
    configSaving,
    configDirty,
    onPatch,
    onSave,
    onReload,
  } = flat;
  const disabled = configSaving || configSchemaLoading;

  return html`
    <div style="margin-top: 16px;">
      ${configSchemaLoading
        ? html`<div class="muted">Loading config schema…</div>`
        : renderChannelConfigForm({
            channelId,
            configValue: configForm,
            schema: configSchema,
            uiHints: configUiHints,
            disabled,
            onPatch,
          })}
      <div class="row" style="margin-top: 12px;">
        <button
          class="btn primary"
          ?disabled=${disabled || !configDirty}
          @click=${() => onSave()}
        >
          ${configSaving ? "Saving…" : "Save"}
        </button>
        <button class="btn" ?disabled=${disabled} @click=${() => onReload()}>Reload</button>
      </div>
    </div>
  `;
}
