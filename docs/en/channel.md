# Chat Channels

<!-- DESIGN-DOC: channel -->
<!-- Scope: Messaging channels AcaClaw connects through, supported platforms,
     setup instructions, and how the Channels panel works in the GUI. -->

---

## Overview

AcaClaw connects to messaging platforms through the same channels as OpenClaw. Each channel connects via the Gateway — AcaClaw does not re-implement any channel logic. Text is supported everywhere; media and reactions vary by channel.

Users manage channels entirely from the AcaClaw GUI (Channels panel) or via CLI. No code changes are needed to add, remove, or reconfigure a channel.

---

## Supported Channels

| Channel | Protocol | Setup | Notes |
|---|---|---|---|
| **WhatsApp** | Baileys (WhatsApp Web) | QR pairing from GUI | Most popular; requires QR scan on first link |
| **Telegram** | Bot API (grammY) | BotFather token | Simplest setup; supports groups and DMs |
| **Discord** | Bot API + Gateway | Bot token + server invite | Supports servers, channels, DMs, slash commands |
| **Google Chat** | HTTP webhook | Service account or user cred | Enterprise chat integration |
| **Slack** | Bolt SDK (Socket Mode) | Slack app + bot token | Workspace apps; channels + DMs |
| **Signal** | signal-cli | signal-cli daemon | Privacy-focused; requires signal-cli installed |
| **iMessage** | BlueBubbles REST API | BlueBubbles server on macOS | Recommended for iMessage; full feature support |
| **Nostr** | NIP-04 relays | Key pair (auto-generated) | Decentralized DMs; profile editing from GUI |
| **WeChat** | iLink Bot API (plugin) | QR login | Tencent official plugin; private chats only |
| **IRC** | IRC protocol | Server + channel config | Classic IRC servers; channels + DMs |
| **Matrix** | Matrix protocol (plugin) | Homeserver + access token | Plugin, installed separately |
| **Mattermost** | Bot API + WebSocket (plugin) | Bot token | Plugin, installed separately |
| **Microsoft Teams** | Bot Framework (plugin) | Enterprise setup | Plugin, installed separately |
| **LINE** | Messaging API (plugin) | LINE developer account | Plugin, installed separately |
| **QQ Bot** | QQ Bot API | QQ developer account | Private chat, group chat, rich media |
| **Zalo** | Zalo Bot API (plugin) | Zalo developer account | Vietnam's popular messenger |
| **Zalo Personal** | QR login (plugin) | QR pairing | Personal account via QR |
| **Feishu / Lark** | WebSocket (plugin) | Feishu app setup | Plugin, installed separately |
| **Twitch** | IRC connection (plugin) | OAuth token | Twitch chat integration |
| **Synology Chat** | Webhooks (plugin) | Synology NAS | Outgoing + incoming webhooks |
| **Nextcloud Talk** | Plugin | Nextcloud instance | Self-hosted chat |
| **Tlon** | Urbit-based (plugin) | Urbit identity | Decentralized messenger |
| **Voice Call** | Plivo / Twilio (plugin) | Telephony account | Voice call channel |
| **WebChat** | Gateway WebSocket | Built-in | Gateway Control UI chat |

Channels marked **(plugin)** are installed separately via `openclaw plugins install <package>`.

---

## Quick Start

### Telegram (simplest)

1. Chat with **@BotFather** on Telegram → `/newbot` → copy the token
2. In the AcaClaw GUI → **Channels** → select **Telegram** → paste the token into `botToken`
3. Set `dmPolicy` to `pairing` and click **Save**
4. Send a message to your bot → approve the pairing from **Channels** or CLI

### WhatsApp (QR pairing)

1. In the AcaClaw GUI → **Channels** → select **WhatsApp**
2. Click **Show QR** → scan with WhatsApp on your phone
3. Click **Wait for scan** until the status shows "Connected"
4. Configure `allowFrom` with your phone number for DM access control

### Discord

1. Create a bot at the [Discord Developer Portal](https://discord.com/developers/applications)
2. Enable **Message Content Intent** under Privileged Gateway Intents
3. Copy the bot token → paste into the **Discord** channel config in the GUI
4. Generate an invite URL → add the bot to your server
5. Set `dmPolicy` and click **Save**

### WeChat (QR login)

1. Install the WeChat plugin: `openclaw plugins install "@tencent-weixin/openclaw-weixin"`
2. Enable the WeChat ClawBot plugin on your phone: WeChat → Me → Settings → Plugins
3. In the AcaClaw GUI → **Channels** → select **WeChat**
4. Click **Login QR** → scan the QR code with WeChat on your phone
5. Private chats only — group messages are not supported

---

## How Channels Work

### Architecture

```
User's phone / desktop app
  │
  ▼
Messaging platform (WhatsApp, Telegram, Discord, …)
  │
  ▼
OpenClaw Gateway  ←── channel adapter (one per platform)
  │
  ▼
Agent (model interaction, tools, session)
  │
  ▼
Reply routed back to the originating channel
```

All channel logic lives in OpenClaw's Gateway. AcaClaw does **not** re-implement any channel adapter — it calls the same Gateway RPCs and renders the same status and config data.

### Routing

Replies are routed **back to the channel where a message came from**. The model does not choose a channel; routing is deterministic. Key concepts:

- **Channel**: the platform identifier (`telegram`, `whatsapp`, `discord`, etc.)
- **AccountId**: per-channel account instance (for multi-account setups)
- **SessionKey**: the bucket key for context and concurrency (DMs collapse to a main session; groups are isolated)

### Multi-Channel

Multiple channels can run simultaneously. Configure as many as needed and the Gateway routes messages per chat. This is useful for research teams where some members prefer WhatsApp and others use Telegram or Discord.

### DM Policy & Pairing

For safety, each channel enforces a DM policy for unknown senders:

| Policy | Behavior |
|---|---|
| `pairing` | Unknown senders must be approved before the agent responds |
| `allowlist` | Only senders in `allowFrom` can interact |
| `open` | Any sender can interact (not recommended for public bots) |

Pairing approval can be done from the GUI or CLI:

```bash
openclaw pairing list <channel>
openclaw pairing approve <channel> <CODE>
```

### Groups

Group behavior varies by channel. Common settings:

- `groupPolicy`: `allowlist`, `open`, or `disabled`
- `groupAllowFrom`: list of allowed group IDs or sender IDs
- `requireMention`: whether the bot must be @mentioned in groups (default for most channels)

---

## Channels Panel in the GUI

### Layout

AcaClaw presents channels in a **dropdown selector** (one channel visible at a time) instead of OpenClaw's card grid. This matches AcaClaw's single-panel design principle.

```
┌─ Channel selector ──────────────────────────────────────┐
│  ● Telegram  ▼                                          │
└─────────────────────────────────────────────────────────┘
┌─ Status panel ──────────────────────────────────────────┐
│  Configured  Yes                                        │
│  Running     Yes                                        │
│  Mode        polling                                    │
│  Last start  2m ago                                     │
│  Last probe  30s ago                                    │
└─────────────────────────────────────────────────────────┘
┌─ Config form (JSON schema–driven) ──────────────────────┐
│  botToken       [••••••••••]                             │
│  dmPolicy       [pairing ▼]                             │
│  groupPolicy    [allowlist ▼]                           │
│  [Save]  [Reload]                                       │
└─────────────────────────────────────────────────────────┘
▸ Raw snapshot (collapsed)
```

### Features

- **Channel dropdown**: shows all channels from Gateway; enabled channels (●) sort to the top
- **Status panel**: per-channel runtime status (`configured`, `running`, `connected`, timestamps, errors)
- **Config form**: JSON schema–driven fields for `channels.<channelId>` — same form renderer as the global config panel
- **Save / Reload**: writes config via `config.set` RPC; reload refreshes from the Gateway
- **Probe button**: triggers a live probe (`channels.status` with `probe: true`) to check connectivity
- **WhatsApp extras**: QR code display, scan wait, relink, and logout buttons (only when WhatsApp is selected)
- **Nostr extras**: profile display and inline editing (only when Nostr is selected)
- **Multi-account display**: channels with multiple accounts (e.g. Telegram) show per-account cards with individual status
- **Raw snapshot**: collapsible JSON dump of the full `channels.status` response for debugging

### Data Flow

```
channels.status  RPC  →  snapshot (per-channel runtime status)
config.get       RPC  →  live config form values
config.schema    RPC  →  JSON schema for form rendering
config.set       RPC  →  save patched config
web.login.start  RPC  →  WhatsApp QR login
web.login.wait   RPC  →  WhatsApp scan wait
web.login.logout RPC  →  WhatsApp logout
```

All RPCs are the same endpoints that OpenClaw's own Control UI uses. AcaClaw's `GatewayController` calls them directly.

---

## Channel Configuration

Channel config lives under `channels.<channelId>` in `openclaw.json`. The GUI config form renders these fields from the JSON schema automatically.

### Example: WhatsApp

```json5
{
  channels: {
    whatsapp: {
      dmPolicy: "pairing",
      allowFrom: ["+15551234567"],
      groupPolicy: "allowlist",
      groupAllowFrom: ["+15551234567"],
    },
  },
}
```

### Example: Telegram

```json5
{
  channels: {
    telegram: {
      enabled: true,
      botToken: "123:abc",
      dmPolicy: "pairing",
      groups: { "*": { requireMention: true } },
    },
  },
}
```

### Example: Discord

```json5
{
  channels: {
    discord: {
      enabled: true,
      botToken: "MTIzNDU2Nzg5MDEyMzQ1Njc4OQ...",
      dmPolicy: "pairing",
    },
  },
}
```

---

## What AcaClaw Reuses from OpenClaw

| Component | Reuse strategy |
|---|---|
| Channel adapters (WhatsApp, Telegram, etc.) | Run inside OpenClaw Gateway — not copied |
| `channels.status` RPC | Called directly from AcaClaw's `GatewayController` |
| `config.get` / `config.set` / `config.schema` RPCs | Already used for other AcaClaw views |
| JSON schema for channel config | Fetched once and shared |
| Per-channel status shape | Read from `ChannelsStatusSnapshot.channels[id]` |
| Config form rendering | AcaClaw's `renderChannelConfigSection` uses the same `resolveSchemaNode` + `renderNode` logic |
| WhatsApp login RPCs | `web.login.start`, `web.login.wait`, `web.login.logout` called directly |

AcaClaw does **not** copy OpenClaw's per-channel card files (`channels.discord.ts`, `channels.telegram.ts`, etc.). The per-channel status rows and config forms are driven by the snapshot data and JSON schema. The only channels with bespoke UI in AcaClaw are WhatsApp (QR login flow) and Nostr (profile editing).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Channel shows "Not configured" | Add the required config fields (token, credentials) in the config form and click Save |
| WhatsApp QR does not appear | Click **Show QR** again; check that the Gateway is running |
| "Pairing required" for DMs | Approve the sender via GUI or `openclaw pairing approve <channel> <CODE>` |
| Probe fails | Check credentials, network connectivity, and that the channel service is reachable |
| Config form shows "Schema unavailable" | Gateway may not be connected; check connection status on the Dashboard |

For detailed channel-specific troubleshooting, see the OpenClaw docs for each channel.

---

## Nav Position

**Channels** is the 3rd item in the Observability group: Monitor → API Config → **Channels** → Usage → Skills
