# Channel Tab — Analysis & AcaClaw Implementation Plan

<!-- DESIGN-DOC: channel -->
<!-- Scope: How OpenClaw's channel tab works, which parts AcaClaw reuses verbatim,
     and how AcaClaw wraps it in a dropdown-based UI instead of the card grid. -->

---

## 1. OpenClaw Channel Tab — How It Works

### 1.1 Data layer (`channels.status` RPC)

Everything flows from a single RPC call:

```
client.request("channels.status", { probe: boolean, timeoutMs: 8000 })
→ ChannelsStatusSnapshot
```

**`ChannelsStatusSnapshot`** shape (from `channels.types.ts` in the main UI):

| Field | Type | Purpose |
|---|---|---|
| `channels` | `Record<channelId, status>` | Per-channel runtime status objects |
| `channelMeta` | `ChannelUiMetaEntry[]` | Ordered list with display names / icons |
| `channelOrder` | `string[]` | Fallback ordering when `channelMeta` absent |
| `channelAccounts` | `Record<channelId, ChannelAccountSnapshot[]>` | Per-channel account list |
| `channelDefaultAccountId` | `Record<channelId, string>` | Default account per channel |

**`ChannelsProps`** (the full component props type from `channels.types.ts`) carries:
- The snapshot above
- `configSchema` / `configForm` / `configUiHints` — the live editable config for the selected channel
- All event callbacks: `onRefresh`, `onConfigPatch`, `onConfigSave`, `onConfigReload`, plus WhatsApp-specific `onWhatsAppStart / Wait / Logout` and Nostr profile callbacks

### 1.2 Config layer (`channels.config.ts`)

`renderChannelConfigSection({ channelId, props })` renders the editable config panel for any channel:

1. Reads `props.configSchema` (fetched once, shared across all channels)
2. Navigates the JSON schema to the `channels.<channelId>` sub-node via `resolveSchemaNode`
3. Renders a generic form via `renderNode` (same form renderer used for global config)
4. Adds extra non-schema fields (`groupPolicy`, `streamMode`, `dmPolicy`) if present
5. Shows Save / Reload buttons, wired to `onConfigSave` / `onConfigReload`

The config form renders **inside** each channel's card — not in a separate panel. This is the piece AcaClaw changes to a dropdown-triggered panel.

### 1.3 View layer (`channels.ts` → per-channel files)

**Card grid layout** (`channels.ts`):
```
renderChannels(props)
  → grid.grid-cols-2
    → renderChannel(key, props, data)   // dispatches by key
      → renderDiscordCard(...)
      → renderTelegramCard(...)
      → renderWhatsAppCard(...)
      → renderSignalCard(...)
      → renderSlackCard(...)
      → renderGoogleChatCard(...)
      → renderIMessageCard(...)
      → renderNostrCard(...)
```

Every `render<Name>Card` calls `renderSingleAccountChannelCard(...)` from `channels.shared.ts`, which produces:

```html
<div class="card">
  <div class="card-title">…</div>
  <div class="card-sub">…</div>
  <!-- account count badge if > 1 -->
  <div class="status-list">…status rows…</div>
  <!-- error callout if lastError -->
  <!-- channel-specific extras (QR code, probe callout…) -->
  <!-- renderChannelConfigSection → editable fields + Save/Reload -->
  <!-- footer (Probe button etc.) -->
</div>
```

**Channel ordering**: enabled channels sort to the top; disabled ones follow in `channelMeta` order.

**Channel health snapshot**: always shown at the bottom of the tab as a raw JSON `<pre>` block.

### 1.4 Controller layer (`app-channels.ts` + `controllers/channels.ts`)

| Function | What it does |
|---|---|
| `loadChannels(host, probe)` | Calls `channels.status`, writes `channelsSnapshot` |
| `startWhatsAppLogin(host, force)` | Calls `web.login.start`, refreshes channels |
| `waitWhatsAppLogin(host)` | Calls `web.login.wait`, refreshes channels |
| `logoutWhatsApp(host)` | Calls `web.login.logout`, refreshes channels |
| `handleChannelConfigSave(host)` | Calls `saveConfig` then `loadConfig` then `loadChannels` |
| `handleChannelConfigReload(host)` | Calls `loadConfig` then `loadChannels` |
| `handleNostrProfileSave(host)` | Saves Nostr identity, refreshes channels |

All of these are thin orchestrators: they call the shared `loadConfig` / `saveConfig` helpers and the `loadChannels` refresh. **None of them contain channel-specific logic** — the channel details live entirely in the view and the RPC.

---

## 2. What AcaClaw Reuses Unchanged

AcaClaw wraps OpenClaw's gateway. All the following work **without any local copy** — AcaClaw just calls the gateway's existing RPC endpoints via its own `GatewayController`:

| Piece | Reuse strategy |
|---|---|
| `channels.status` RPC | Call directly from AcaClaw's `GatewayController` |
| `config.get` / `config.set` RPCs | Already used for other AcaClaw views |
| Config schema (JSON Schema) | Fetched once and shared — same as OpenClaw does |
| Per-channel status shape | Read from `ChannelsStatusSnapshot.channels[id]` |
| Config form rendering | Import OpenClaw's `config-form.ts` renderer via the built UI bundle |
| `channelMeta` ordering | Used as-is for dropdown option ordering |

**AcaClaw does not copy or re-implement** any of the per-channel card files (`channels.discord.ts`, `channels.telegram.ts`, etc.). It renders the config panel and status rows itself using the data that `channels.status` already provides.

---

## 3. AcaClaw Dropdown Design — Specification

### 3.1 Layout difference from OpenClaw

| | OpenClaw | AcaClaw |
|---|---|---|
| **Channel selector** | Card grid (2 columns, all channels visible at once) | Dropdown (`<select>` or custom) — one channel visible |
| **Status rows** | Inside the card, always shown | Below the dropdown, shown when a channel is selected |
| **Config form** | Inside the card, always expanded | Below status rows, shown when a channel is selected |
| **Channel health JSON** | Full raw snapshot at the bottom | Collapsible "Raw snapshot" block, collapsed by default |
| **Enabled indicator** | Card border/badge | Dropdown option badge (● configured / ○ not configured) |

### 3.2 Component structure

```
<acaclaw-channels>
  ┌─ dropdown ─────────────────────────────────────────────┐
  │  ● Discord  ▼                                          │
  └───────────────────────────────────────────────────────-┘
  ┌─ status panel (shown when channel selected) ───────────┐
  │  Configured  Yes                                       │
  │  Running     Yes                                       │
  │  Last probe  2 min ago                                 │
  │  [channel-specific rows]                               │
  │  [error callout if lastError]                          │
  └────────────────────────────────────────────────────────┘
  ┌─ config panel (same renderChannelConfigSection logic) ─┐
  │  [form fields from JSON schema]                        │
  │  [Save]  [Reload]                                      │
  └────────────────────────────────────────────────────────┘
  ┌─ WhatsApp extras (only when discord === "whatsapp") ───┐
  │  [QR code / login flow / logout button]                │
  └────────────────────────────────────────────────────────┘
  ▸ Raw snapshot (collapsed)
```

### 3.3 State held locally in the component

```typescript
@state() private _selectedChannel: string | null = null;
@state() private _snapshot: ChannelsStatusSnapshot | null = null;
@state() private _loading = false;
@state() private _error: string | null = null;
@state() private _configSchema: unknown = null;
@state() private _configForm: Record<string, unknown> | null = null;
@state() private _configDirty = false;
@state() private _configSaving = false;
@state() private _rawExpanded = false;
// WhatsApp-specific (only active when _selectedChannel === "whatsapp")
@state() private _whatsappQr: string | null = null;
@state() private _whatsappMessage: string | null = null;
@state() private _whatsappConnected: boolean | null = null;
@state() private _whatsappBusy = false;
```

### 3.4 Dropdown option rendering

Each option in the dropdown shows:
- A status bullet: `●` (teal, configured/running) or `○` (muted, not configured)
- The channel display name from `channelMeta[].name` (or a capitalised key as fallback)

Enabled channels (configured=true OR running=true OR connected=true) sort to the top of the dropdown list, matching OpenClaw's card sort order.

### 3.5 Status rows per channel

Rather than duplicating OpenClaw's per-channel files, AcaClaw reads the generic status shape from `snapshot.channels[id]` and renders common fields automatically:

| Field | Shown as |
|---|---|
| `configured` | Configured: Yes / No / n/a |
| `running` | Running: Yes / No / n/a |
| `connected` | Connected: Yes / No / n/a |
| `lastStartAt` | Last start: relative timestamp |
| `lastProbeAt` | Last probe: relative timestamp |
| `lastError` | Error callout (danger) |

Channel-specific extras (Telegram account list, WhatsApp QR, iMessage pairing) are handled by a small `switch` on `_selectedChannel` below the generic rows — the same pattern OpenClaw uses, just inlined instead of being in separate files.

---

## 4. Implementation Plan

### Phase 1 — New `acaclaw-channels` component (`ui/src/views/channels.ts`)

1. Create `ui/src/views/channels.ts` as a `LitElement` with the dropdown layout above
2. On `connectedCallback`, call `gateway.request("channels.status", { probe: false })` and `gateway.request("config.get")` + schema fetch
3. Render channel dropdown from `channelMeta` (or fallback order)
4. On channel select: show generic status rows + `renderChannelConfigSection`-equivalent form
5. WhatsApp extras rendered inline when `_selectedChannel === "whatsapp"`
6. "Probe" button calls `channels.status` with `probe: true`
7. Save/Reload wired to `config.set` / `config.get` RPCs (same as other AcaClaw views)

### Phase 2 — Wire into navigation (`ui/src/main.ts`)

1. Add `channels` to `Route` type and `lazyViews` map
2. Add nav item in appropriate group (between Monitor and API Keys)
3. Add SVG icon (network/plug icon)

### Phase 3 — Tests (`tests/dom-channels.test.ts`)

1. Dropdown renders channels from snapshot in correct order (enabled first)
2. Selecting a channel shows its status rows and config form
3. Save button calls `config.set` with patched value
4. Reload button resets form to server state
5. WhatsApp QR section only renders when `whatsapp` is selected
6. Raw snapshot block is collapsed by default; expands on click

---

## 5. Key Constraint

> AcaClaw's channel tab calls the **same `channels.status` and `config.*` RPCs** that OpenClaw's UI uses. The per-channel status shape is already included in the snapshot — AcaClaw reads it directly and renders everything in-app with its own dropdown design. There is no redirect to the OpenClaw web UI.

- **Generic status fields** (`configured`, `running`, `connected`, `lastStartAt`, `lastProbeAt`, `lastError`) are rendered from the raw snapshot for every channel automatically.
- **WhatsApp** gets an extra inline QR/login block (the only channel with a multi-step login flow in the default AcaClaw install).
- **All other channel-specific config** is rendered via the JSON schema config form (`renderChannelConfigSection`-equivalent logic), which is schema-driven and requires no per-channel code.

This means AcaClaw does **not** need to copy `channels.discord.ts`, `channels.telegram.ts`, etc. The schema-driven form covers all config fields. The snapshot covers all status fields. The only channel that needs bespoke UI is WhatsApp.

---

## 6. Nav Position

- **Channels** is the **3rd item** in the Observability group: Monitor → **API Config** → **Channels** → Usage → Skills
- "API Keys" nav label is renamed to **"API Config"** (the underlying route id `api-keys` stays unchanged)
