---
layout: page
title: App Launch and Gateway Connection
lang: en
permalink: /en/auth-and-app-launch/
---

> How AcaClaw connects to its local OpenClaw gateway, how authentication works, and how both the AcaClaw and OpenClaw UIs are served.

---

## Table of Contents

- [Overview](#overview)
- [OpenClaw Authentication System](#openclaw-authentication-system)
- [AcaClaw Auth Configuration](#acaclaw-auth-configuration)
- [WebSocket Handshake](#websocket-handshake)
- [Dual UI Architecture](#dual-ui-architecture)
- [Launching the OpenClaw GUI from AcaClaw](#launching-the-openclaw-gui-from-acaclaw)
- [App Launch Flow](#app-launch-flow)
- [Gateway Lifecycle](#gateway-lifecycle)
- [OpenClaw Gateway Architecture](#openclaw-gateway-architecture)
- [Config Reload & Hot Reload](#config-reload--hot-reload)
- [Gateway Restart Infrastructure](#gateway-restart-infrastructure)
- [Always-On Gateway Management](#always-on-gateway-management)
- [Connection Keep-Alive](#connection-keep-alive)
- [Comparison: AcaClaw vs OpenClaw Defaults](#comparison-acaclaw-vs-openclaw-defaults)
- [Troubleshooting](#troubleshooting)

---

## Overview

AcaClaw is a local web app. The gateway (an OpenClaw process) runs on `localhost`, serves both the AcaClaw research UI and the OpenClaw Control UI, and accepts WebSocket connections. AcaClaw uses `auth.mode = "none"` because the gateway only listens on loopback — external access is physically impossible.

```
┌──────────────────────────── Runtime ──────────────────────────────────┐
│                                                                       │
│  start.sh  ──starts──▶  gateway (port 2090, loopback only)          │
│            ──opens──▶   browser at http://localhost:2090/            │
│                                                                       │
│  Browser   ──loads──▶   AcaClaw UI (plugin-served at /)             │
│            ──opens──▶   WebSocket ws://localhost:2090/                │
│            ──waits──▶   connect.challenge event from gateway         │
│            ──sends──▶   connect request (no auth required)           │
│            ──receives──▶ connect response (ok: true)                  │
│            ──ready──▶   UI fully operational                          │
│                                                                       │
│  Also accessible:                                                     │
│    http://localhost:2090/openclaw/  → OpenClaw Control UI             │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## OpenClaw Authentication System

OpenClaw's gateway supports four authentication modes. Understanding these helps explain why AcaClaw disables auth and what security measures exist in the underlying platform.

### Auth Modes

| Mode | How it Works | Use Case |
|---|---|---|
| **`none`** | No credentials required. All connections are accepted. | Local-only gateway (AcaClaw default) |
| **`token`** | Client sends a shared token in the connect handshake | Remote access, API integrations |
| **`password`** | Client sends a shared password | Simple remote access |
| **`trusted-proxy`** | Reverse proxy (Pomerium, Caddy + OAuth) provides identity headers | Multi-user deployments |

### Auth Config Schema

```json
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "shared-secret-xyz",
      "allowTailscale": false,
      "rateLimit": {
        "maxAttempts": 10,
        "windowMs": 60000,
        "lockoutMs": 300000,
        "exemptLoopback": true
      }
    }
  }
}
```

Tokens and passwords can reference secrets from environment variables:

```json
{
  "token": {
    "source": "env",
    "provider": "default",
    "id": "OPENCLAW_GATEWAY_TOKEN"
  }
}
```

### Device Auth (Control UI)

Separate from `gateway.auth`, the Control UI has its own **device authentication** layer:

- Signs device identity via **HMAC-SHA256** using v2 or v3 payload formats
- Payload includes: device ID, client ID, mode, role, scopes, timestamp, nonce, platform
- Controlled by `gateway.controlUi.dangerouslyDisableDeviceAuth`
- AcaClaw disables this (`dangerouslyDisableDeviceAuth: true`) because loopback binding provides the security boundary

### Auth Precedence Order

When the gateway evaluates a connection, it checks in this order:

1. **Trusted-Proxy headers** — if `auth.mode = "trusted-proxy"`
2. **None mode** — auto-allow if `auth.mode = "none"`
3. **Tailscale headers** — optional, for the Control UI surface only
4. **Token** — constant-time comparison against configured token
5. **Password** — constant-time comparison against configured password
6. **Rate Limiting** — per-IP failure tracking; loopback is exempt by default

Missing credentials do not burn rate-limit slots — only *wrong* credentials do.

### Credential Resolution Order

| Priority | Source | Example |
|---|---|---|
| 1 | CLI flags | `--token <value>` |
| 2 | Secret references | `{ "source": "env", "id": "OPENCLAW_GATEWAY_TOKEN" }` |
| 3 | Environment variables | `OPENCLAW_GATEWAY_TOKEN` |
| 4 | Config file plaintext | `"token": "my-secret"` |

---

## AcaClaw Auth Configuration

AcaClaw uses the simplest and safest configuration for a local research assistant:

```json
{
  "gateway": {
    "port": 2090,
    "mode": "local",
    "auth": { "mode": "none" },
    "controlUi": {
      "enabled": true,
      "basePath": "/openclaw",
      "dangerouslyDisableDeviceAuth": true
    }
  }
}
```

| Setting | Value | Why |
|---|---|---|
| `auth.mode` | `"none"` | Gateway is loopback-only — no external access possible |
| `controlUi.enabled` | `true` | Access OpenClaw settings at `/openclaw/` |
| `controlUi.basePath` | `"/openclaw"` | Avoids conflict with AcaClaw UI at `/` |
| `dangerouslyDisableDeviceAuth` | `true` | Safe because loopback-only; device auth adds no value |

### Security Model Summary

| Property | Value |
|---|---|
| Gateway bind | `127.0.0.1` / `::1` (loopback only) |
| Auth mode | `none` |
| Device auth | Disabled (loopback provides equivalent protection) |
| Remote access | Not possible unless user changes `gateway.bind` |
| HTTPS | Not needed (localhost traffic cannot be intercepted) |

---

## WebSocket Handshake

The gateway uses the OpenClaw protocol handshake. Every WebSocket connection follows this sequence:

```
  Browser (AcaClaw UI)             Gateway
  ────────────────────             ───────
     │                                │
     │── WebSocket upgrade ──────────►│  (assigns connId = UUID)
     │                                │  (extracts host, origin, UA, x-forwarded-*)
     │                                │
     │◄── event: connect.challenge ───│  { nonce: UUID, ts: epoch_ms }
     │                                │
     │── req: connect ───────────────►│  { client: "acaclaw-ui", version: "0.1.0",
     │                                │    scopes: ["chat", "config", "sessions"] }
     │                                │
     │                 [authorize]     │  (auth.mode = "none" → auto-accept)
     │                                │
     │◄── res: { ok: true } ─────────│
     │                                │
     │   Connection established       │
     │                                │
     │── health (every 30s) ─────────►│  (heartbeat keeps connection alive)
     │◄── pong ───────────────────────│
```

### Connection Lifecycle

| Event | What Happens |
|---|---|
| **WebSocket open** | Gateway assigns a `connId` (UUID), extracts request headers |
| **Challenge sent** | Gateway sends `connect.challenge` with nonce + timestamp |
| **Connect request** | Client sends metadata: client name, version, requested scopes |
| **Authorization** | Auth mode checked; `none` → immediate accept |
| **Connection active** | Client added to broadcast set, receives real-time events |
| **Heartbeat** | `health` RPC every 30s keeps the connection alive |
| **Disconnect** | Client removed from broadcast set, presence update emitted |

### Connection Failure Handling

If the handshake fails (wrong token, rate-limited, timeout):

- Gateway closes the WebSocket with a reason code
- In `token`/`password` modes: failed attempt counts toward rate limiting
- Rate limit: 10 attempts per minute, 5-minute lockout (loopback is exempt)

---

## Dual UI Architecture

AcaClaw serves two web UIs from the same gateway on port 2090:

```
http://localhost:2090/
├── /                    → AcaClaw UI (research assistant)
│   ├── /#chat           → Chat with agent
│   ├── /#api-keys       → Provider & model config
│   ├── /#monitor        → System dashboard
│   ├── /#skills         → Academic skills
│   ├── /#workspace      → Files & projects
│   ├── /#settings       → Preferences
│   └── ...
│
└── /openclaw/           → OpenClaw Control UI (gateway admin)
    ├── /openclaw/chat          → Direct chat
    ├── /openclaw/config        → Full config editor
    ├── /openclaw/channels      → Channel management
    ├── /openclaw/agents        → Agent definitions
    ├── /openclaw/sessions      → Session browser
    ├── /openclaw/skills        → Skill management
    ├── /openclaw/logs          → Gateway logs
    └── ...
```

### How Each UI is Served

| UI | Served By | Mechanism | Routing |
|---|---|---|---|
| **AcaClaw UI** | `acaclaw-ui` plugin | Plugin HTTP routes (`registerHttpRoute`) | Hash-based (`/#chat`, `/#settings`) |
| **OpenClaw Control UI** | Gateway built-in | `control-ui.ts` with SPA fallback | Path-based (`/openclaw/chat`, `/openclaw/config`) |

### AcaClaw UI Plugin Route Registration

The `acaclaw-ui` plugin registers explicit HTTP routes:

```typescript
// Root route (exact match)
api.registerHttpRoute({ path: "/", match: "exact", auth: "plugin", handler });

// Static asset directories (prefix match)
for (const prefix of ["/assets", "/fonts", "/logo"]) {
  api.registerHttpRoute({ path: prefix, match: "prefix", auth: "plugin", handler });
}

// SPA fallback routes (prefix match)
for (const route of ["/chat", "/api-keys", "/settings", "/monitor", ...]) {
  api.registerHttpRoute({ path: route, match: "prefix", auth: "plugin", handler });
}
```

### OpenClaw Control UI Config Injection

The Control UI receives bootstrap config from the gateway at `/__openclaw/control-ui-config.json`:

```json
{
  "basePath": "/openclaw",
  "assistantName": "Aca",
  "assistantAvatar": "🎓",
  "assistantAgentId": "main",
  "serverVersion": "2026.4.2"
}
```

The `basePath` ensures all Control UI routes are prefixed with `/openclaw/`, preventing conflicts with the AcaClaw UI at root.

### Security Headers (Control UI)

The OpenClaw Control UI injects security headers on all responses:

| Header | Value |
|---|---|
| X-Frame-Options | `DENY` |
| Content-Security-Policy | Computed from inline script hashes |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `no-referrer` |
| Cache-Control | `no-cache` (HTML), `immutable` (hashed assets) |

---

## Launching the OpenClaw GUI from AcaClaw

The AcaClaw UI provides a direct way to open the underlying OpenClaw Control UI — the full gateway admin panel — from within the research interface.

### Access Path

**Settings → "OpenClaw" tab** in the AcaClaw sidebar:

```
  AcaClaw UI (http://localhost:2090/)
       │
       └── Settings page (/#settings)
            │
            ├── Appearance
            ├── Security
            ├── Connection
            ├── Advanced
            ├── OpenClaw  ◄── clicking this opens the Control UI
            ├── Debug
            ├── Logs
            └── Uninstall
```

Unlike the other settings tabs that render content inline, the **OpenClaw** tab does not display a panel — it immediately opens the OpenClaw Control UI in a new browser tab.

### Mechanism

The settings view in `ui/src/views/settings.ts` defines `"openclaw"` as a tab type and intercepts its click:

```typescript
// Tab click handler
if (tab === "openclaw") {
  this._openOpenClawUI();   // opens new window instead of rendering a panel
} else {
  this._tab = tab;          // renders the tab panel inline
}
```

The launch method uses `window.open` with the `noopener` flag for security:

```typescript
private _openOpenClawUI() {
  window.open(`${location.origin}/openclaw/`, "_blank", "noopener");
}
```

| Detail | Value |
|---|---|
| Target URL | `http://localhost:2090/openclaw/` |
| Window target | `_blank` (new tab/window) |
| Security | `noopener` — prevents the new window from accessing `window.opener` |
| Authentication | None required (both UIs share the same loopback gateway) |

### Command Palette

The command palette (`Ctrl+K` / `Cmd+K`) provides navigation to all AcaClaw views but does **not** include a shortcut for the OpenClaw Control UI. The only entry point is **Settings → OpenClaw**.

### What the OpenClaw Control UI Provides

Once opened, the Control UI at `/openclaw/` gives access to the full OpenClaw gateway admin surface:

| Page | Path | Purpose |
|---|---|---|
| Chat | `/openclaw/chat` | Direct chat (bypasses AcaClaw agent routing) |
| Config | `/openclaw/config` | Full JSON config editor |
| Channels | `/openclaw/channels` | Channel status and management |
| Agents | `/openclaw/agents` | Agent definitions and sessions |
| Sessions | `/openclaw/sessions` | Session browser and history |
| Skills | `/openclaw/skills` | Skill registry (all sources) |
| Logs | `/openclaw/logs` | Gateway log viewer |

The Control UI is a separate SPA served by the gateway's built-in `control-ui.ts` — it does not share code or state with the AcaClaw UI, though both connect to the same gateway WebSocket.

---

## App Launch Flow

### Desktop Launch

The user clicks the desktop icon or runs `start.sh`:

```
  User clicks icon / runs start.sh
       │
       ├── PATH bootstrap (fnm → nvm → Homebrew → common paths)
       ├── Proxy bootstrap (~/.proxy_env, systemd env)
       │
       ├── Is gateway already running?
       │   ├── PID file check (~/.acaclaw/gateway.pid + kill -0)
       │   ├── pgrep fallback (search "openclaw.*gateway.*--port 2090")
       │   └── systemd fallback (acaclaw-gateway.service)
       │
       ├── Not running → Start gateway
       │   ├── Try systemd service first (if unit file exists)
       │   └── Fallback: nohup openclaw gateway run --bind loopback --port 2090
       │
       ├── Wait for health (up to 45s, checks http://127.0.0.1:2090/)
       │
       └── Open browser (unless --no-browser)
           ├── Linux:   xdg-open http://localhost:2090/
           ├── macOS:   open http://localhost:2090/
           └── WSL2:    powershell.exe Start-Process (browser on Windows)
```

### Command Line Options

| Flag | Effect |
|---|---|
| (none) | Start gateway + open browser |
| `--no-browser` | Start/verify gateway only (headless, SSH) |
| `--status` | Check gateway status and exit |

### Platform Detection

| Platform | Detection | Browser Command |
|---|---|---|
| Linux | `uname -s == Linux` | `xdg-open` |
| macOS | `uname -s == Darwin` | `open` |
| WSL2 | `$WSL_DISTRO_NAME` or `/proc/version` contains "microsoft" | `powershell.exe Start-Process` |
| Headless | No display detected | Print URL only |

### PATH Bootstrap

Desktop launchers (`.desktop` files, dock icons) don't inherit the user's shell profile. `start.sh` probes for `openclaw` in this order:

1. **fnm** — `~/.local/share/fnm` (preferred, respects `.node-version`)
2. **nvm** — `~/.nvm/nvm.sh` (only if fnm didn't provide `openclaw`)
3. **Homebrew** — `/opt/homebrew/bin/brew` or `/usr/local/bin/brew` (macOS)
4. **fnm via Homebrew** — `fnm env` after brew shellenv
5. **Common paths** — `~/.npm-global/bin`, `~/.cargo/bin`, `~/.acaclaw/miniforge3/bin`

The search stops as soon as `command -v openclaw` succeeds.

### Proxy Bootstrap

Desktop launchers also miss proxy configuration. `start.sh` loads proxy variables from:

1. `~/.proxy_env` or `~/.config/proxy.env` (sourced)
2. systemd service environment (`systemctl show ... -p Environment`)

---

## Gateway Lifecycle

### Process Management

| Concern | How it is Handled |
|---|---|
| **Already running?** | PID file check → pgrep fallback → systemd fallback |
| **Stale PID file?** | `kill -0` fails → remove PID file, start fresh |
| **Start method** | systemd service (preferred) → nohup fallback |
| **Health check** | Wait for HTTP 200 at `http://127.0.0.1:2090/` (up to 45s) |
| **Port conflict** | Gateway retries up to 4 times with 500ms delay (TIME_WAIT) |
| **PID tracking** | `~/.acaclaw/gateway.pid` |
| **Logs** | `~/.acaclaw/gateway.log` |
| **Clean shutdown** | `stop.sh` sends SIGTERM, waits 5s, then SIGKILL |
| **Port** | Default 2090, configurable via `ACACLAW_PORT` env var |
| **Startup timing** | Logged to `~/.acaclaw/startup-timing.log` |

### Gateway Command

```bash
openclaw gateway run --bind loopback --port 2090 --force
```

| Flag | Purpose |
|---|---|
| `--bind loopback` | Listen on 127.0.0.1 only (security boundary) |
| `--port 2090` | Port number (avoids conflict with default OpenClaw 18789) |
| `--force` | Bypass lock check (safe for single-instance local use) |

---

## OpenClaw Gateway Architecture

The OpenClaw gateway is a long-running Node.js process that provides HTTP, WebSocket, and plugin infrastructure in a single binary. AcaClaw runs it as a local daemon. Understanding the internals helps diagnose issues and make informed config decisions.

### Internal Components

```
  openclaw gateway run
       │
       ├── Config loader ─────────── ~/.openclaw/openclaw.json
       ├── Secrets runtime ────────── env vars, credential files
       ├── Auth resolver ──────────── mode: none/token/password/trusted-proxy
       │
       ├── HTTP server ────────────── Node http.createServer()
       │   ├── Control UI ─────────── built-in SPA at /openclaw/
       │   ├── Plugin HTTP routes ─── AcaClaw UI at /, asset dirs
       │   ├── OpenAI-compatible API ─ /v1/chat/completions, etc.
       │   └── REST endpoints ─────── config, sessions, tools, hooks
       │
       ├── WebSocket server ───────── ws library, noServer mode
       │   ├── Upgrade handler ────── HTTP → WS upgrade, auth check
       │   ├── Message handler ────── JSON-RPC: req/res/event frames
       │   └── Broadcaster ────────── fan-out events to all clients
       │
       ├── Agent runtime ──────────── chat, tools, skills, models
       ├── Channel plugins ────────── loaded from extensions/*
       ├── Health monitor ─────────── channel health checks
       ├── Cron service ───────────── scheduled tasks
       ├── Config reloader ────────── file watcher (chokidar)
       └── Browser control ────────── sandbox bridge server
```

### Startup Sequence

When `openclaw gateway run` executes:

| Step | What Happens |
|---|---|
| 1 | Load config snapshot from `~/.openclaw/openclaw.json` |
| 2 | Migrate legacy config entries if needed |
| 3 | Auto-enable required plugins |
| 4 | Initialize secrets runtime and activate auth |
| 5 | Load Control UI static assets |
| 6 | Resolve bind address and TLS settings |
| 7 | Initialize agent registry and default workspace |
| 8 | Load gateway + channel plugins |
| 9 | Create HTTP server, bind to `host:port` |
| 10 | Create WebSocket server (`noServer: true`, 64 KB max preauth payload) |
| 11 | Attach WebSocket upgrade + message handlers |
| 12 | Start heartbeat runner, health monitor, cron |
| 13 | Start sidecars (browser control, Gmail watcher) |
| 14 | Pin plugin registries |
| 15 | Start config file watcher |
| 16 | Recover pending outbound deliveries from crash/restart |
| 17 | Log startup info (bind host, port, TLS status) |

### Port Binding & Retry

The gateway retries port binding up to 4 times with 500 ms intervals to handle TCP `TIME_WAIT` sockets from a recent crash. Bind modes:

| Mode | Address | Use Case |
|---|---|---|
| `loopback` | `127.0.0.1` | Local only (AcaClaw default) |
| `lan` | `0.0.0.0` | All interfaces |
| `tailnet` | `100.64.0.0/10` | Tailscale VPN only |
| `auto` | Prefer loopback, fallback LAN | Auto-detect |

---

## Config Reload & Hot Reload

The gateway watches `~/.openclaw/openclaw.json` for changes and decides whether to hot-reload specific components or perform a full process restart. This is why some config changes take effect instantly while others briefly disconnect all clients.

### Reload Modes

| Mode | Behavior |
|---|---|
| `off` | No action on config change |
| `restart` | Always full process restart |
| `hot` | Hot-reload compatible changes; log warning and ignore incompatible ones |
| `hybrid` (default) | Hot-reload what can be hot-reloaded; restart for the rest |

### Config Watcher

- Uses **chokidar** with `ignoreInitial: true`
- **Debounce**: 300 ms (prevents reload storms from multi-write saves)
- **Stabilization**: waits 200 ms for write finalization
- Compares old vs new config using `diffConfigPaths()` to identify changed keys
- Builds a reload plan mapping each changed prefix to an action

### Reload Rules

Each config prefix maps to one of three actions: **none** (ignore), **hot** (in-process reload), or **restart** (full process restart).

#### Hot-Reloadable (no disconnect)

| Config Prefix | Action | What Restarts |
|---|---|---|
| `agents.defaults.model` | hot | Heartbeat runner |
| `agents.defaults.models` | hot | Heartbeat runner |
| `agents.defaults.heartbeat` | hot | Heartbeat runner |
| `models` | hot | Heartbeat runner |
| `hooks` | hot | Hook handlers |
| `hooks.gmail.*` | hot | Hook handlers + Gmail watcher |
| `cron` | hot | Cron scheduler |
| `browser` | hot | Browser control server |
| `gateway.channelHealthCheckMinutes` | hot | Health monitor |
| `gateway.channelStaleEventThresholdMinutes` | hot | Health monitor |
| `gateway.channelMaxRestartsPerHour` | hot | Health monitor |

#### Full Restart Required (brief disconnect)

| Config Prefix | Why Restart |
|---|---|
| `plugins` | Plugin lifecycle cannot be hot-swapped |
| `gateway.*` (core settings) | Port, bind, auth require server recreation |
| `discovery` | Discovery service bindings change |
| `canvasHost` | Canvas rendering server lifecycle |
| `env.*` | Environment changes (API keys, secrets) — no hot-reload rule |

#### Ignored (no-op)

Changes to these prefixes are consumed on next request without restart:

`gateway.remote`, `gateway.reload`, logging, agents, tools, bindings, audio, routing, messages, sessions, talk, skills, secrets, UI meta, wizard, identity

### Why API Key Changes Cause Restart

The `env` prefix has **no explicit reload rule** in OpenClaw's config reload plan. When no rule matches, the default behavior is `restartGateway = true`. This means any environment variable write (including API key saves) triggers a full gateway restart via SIGUSR1.

AcaClaw mitigates this by performing env writes as the **last** step in any multi-write operation, after all hot-reloadable config changes have settled.

---

## Gateway Restart Infrastructure

### SIGUSR1 Signal Restart

The gateway restarts itself by sending SIGUSR1 to its own process. This triggers a clean shutdown → relaunch cycle managed by the service supervisor (systemd or launchd).

| Parameter | Value |
|---|---|
| Signal | `SIGUSR1` |
| Authorization grace period | 5 seconds |
| Restart cycle token | Monotonic counter (prevents duplicate restarts) |
| Spawn timeout | 2,000 ms |

**Authorization flow:**

1. Code calls `autorizeGatewaySigusr1Restart()` — sets a 5-second auth window
2. Code calls `emitGatewayRestart()` — sends `process.kill(process.pid, 'SIGUSR1')`
3. Signal handler checks: was restart authorized within the last 5 seconds?
4. If yes: clean shutdown, exit, supervisor relaunches
5. If no: log warning, ignore (prevents external processes from triggering restarts)

### Deferred Restart (Wait for Idle)

When a restart is triggered during active work (chat replies, tool calls), the gateway defers the restart until all pending operations complete:

```
  Config change triggers restart
       │
       ├── deferGatewayRestartUntilIdle()
       │   ├── Poll getPendingCount() every 500 ms
       │   │   └── Returns: queue size + pending replies + embedded runs
       │   │
       │   ├── pendingCount == 0 → proceed with restart
       │   └── Timeout (5 min) → force restart anyway
       │
       └── emitGatewayRestart()
```

| Parameter | Value |
|---|---|
| Poll interval | 500 ms |
| Default timeout | 5 minutes (300,000 ms) |
| Configurable via | `gateway.reload.deferralTimeoutMs` |

### Platform-Specific Restart Dispatch

After the gateway process exits, the service supervisor relaunches it. The gateway also knows how to trigger platform-native restarts:

| Platform | Method | Command |
|---|---|---|
| Linux | systemd | `systemctl --user restart <unit>` |
| macOS | launchd | `launchctl kickstart -k gui/<uid>/<label>` |
| Windows | schtasks | Scheduled task re-execution |

---

## Always-On Gateway Management

AcaClaw delegates gateway lifecycle management to OpenClaw's native `openclaw daemon` CLI, which handles systemd (Linux) and launchd (macOS) natively. This ensures AcaClaw stays in sync with OpenClaw's upstream service configuration without reimplementing platform-specific daemon management.

### Architecture

```
  ┌─────────────────────────────────────────────────────┐
  │  AcaClaw scripts (thin wrappers)                    │
  │  acaclaw-service.sh install → openclaw daemon install│
  │  start.sh → openclaw daemon start (fallback nohup)  │
  │  stop.sh → openclaw daemon stop                     │
  └──────────┬──────────────────────────────────────────┘
             │ delegates to
             ▼
  ┌─────────────────────────────────────────────────────┐
  │  openclaw daemon install --port 2090                │
  │  (writes platform-native service config)            │
  │                                                     │
  │  Linux: ~/.config/systemd/user/openclaw-gateway.service │
  │  macOS: ~/Library/LaunchAgents/ai.openclaw.gateway.plist│
  └──────────┬──────────────────────────────────────────┘
             │ manages
             ▼
  ┌─────────────────────────────────────────────────────┐
  │         openclaw gateway run                        │
  │         --bind loopback --port 2090 --force         │
  │                                                     │
  │  PID: tracked by supervisor                         │
  │  Restart: SIGUSR1 (self) or supervisor              │
  │  Config watch: hybrid mode (hot + restart)          │
  └─────────────────────────────────────────────────────┘
```

### Linux: systemd User Service

Created by `openclaw daemon install --port 2090`. OpenClaw writes the service file with upstream-maintained defaults.

**Service file**: `~/.config/systemd/user/openclaw-gateway.service`

```ini
[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/path/to/openclaw gateway run --bind loopback --port 2090 --force
Restart=always
RestartSec=5
TimeoutStopSec=30
TimeoutStartSec=30
SuccessExitStatus=0 143
KillMode=control-group

[Install]
WantedBy=default.target
```

| Setting | Value | Purpose |
|---|---|---|
| `Restart=always` | Restart on any exit | Survive crashes and SIGUSR1 restarts |
| `RestartSec=5` | 5-second delay | Prevent rapid restart loops |
| `TimeoutStopSec=30` | 30-second stop grace | Allow pending work to drain |
| `SuccessExitStatus=0 143` | Clean + SIGTERM | Both are normal exits |
| `KillMode=control-group` | Kill entire tree | Prevent orphan workers |

**User lingering**: AcaClaw's service installer runs `loginctl enable-linger $(whoami)` to ensure the service stays running even when the user is not logged in (important for headless/SSH servers).

**Management commands:**

```bash
# Install and enable (via AcaClaw wrapper)
bash scripts/acaclaw-service.sh install

# Or directly via OpenClaw CLI
openclaw daemon install --port 2090

# Check status
openclaw daemon status
systemctl --user status openclaw-gateway

# Restart
openclaw daemon restart

# View logs
journalctl --user -u openclaw-gateway -f

# Stop
openclaw daemon stop

# Remove
openclaw daemon uninstall
```

### macOS: launchd User Agent

Created by `openclaw daemon install --port 2090`. OpenClaw writes the plist with upstream-maintained defaults.

**Plist file**: `~/Library/LaunchAgents/ai.openclaw.gateway.plist`

OpenClaw's native plist settings:

| Setting | Value | Purpose |
|---|---|---|
| `KeepAlive = true` | Restart on any exit | Keep gateway always running |
| `RunAtLoad = true` | Auto-start on login | Gateway starts when user logs in |
| `ThrottleInterval = 1` | Min 1s between relaunches | Fast recovery from crashes |
| `Umask = 63` (octal 077) | Owner-only files | Security: no group/world access |

**Management commands:**

```bash
# Install (via AcaClaw wrapper)
bash scripts/acaclaw-service.sh install

# Or directly via OpenClaw CLI
openclaw daemon install --port 2090

# Check status
openclaw daemon status

# Restart (force kill + relaunch)
openclaw daemon restart

# Stop and unload
openclaw daemon stop

# View logs
tail -f ~/.openclaw/logs/gateway.log

# Remove
openclaw daemon uninstall
```

### OpenClaw Native Daemon Defaults

Since AcaClaw now delegates to `openclaw daemon install`, the service configuration matches OpenClaw's upstream defaults:

| Setting | Linux (systemd) | macOS (launchd) |
|---|---|---|
| Auto-start | `WantedBy=default.target` (enabled) | `RunAtLoad=true` |
| Auto-restart | `Restart=always` | `KeepAlive=true` |
| Restart delay | `RestartSec=5` | `ThrottleInterval=1` |
| Stop timeout | `TimeoutStopSec=30` | SIGTERM (launchd default) |
| Kill mode | `control-group` (kills process tree) | SIGTERM to main process |
| Success exits | `0 143` (clean + SIGTERM) | Clean exit = no restart |
| File permissions | Inherited | `Umask=077` (owner only) |

### PATH Resolution for Service Supervisors

Both systemd and launchd launch processes with a minimal PATH that doesn't include the user's shell profile. AcaClaw's service installer resolves this by:

1. Following `command -v openclaw` to the real binary path (resolving fnm/nvm symlinks)
2. Building a sanitized PATH that excludes ephemeral dirs (fnm multishell) and dirs with spaces
3. Injecting the resolved PATH into the service definition

If `openclaw` moves (Node.js version change, package manager update), re-run `bash scripts/acaclaw-service.sh install` to update the service PATH.

---

## Connection Keep-Alive

### WebSocket Heartbeat

The gateway uses the WebSocket protocol's built-in ping/pong mechanism (RFC 6455) plus an application-level tick interval:

| Parameter | Value |
|---|---|
| Tick interval | 30,000 ms (30 seconds) |
| Communicated to client | In `hello-ok` handshake response (`tickIntervalMs`) |
| Ping/pong | Handled by the `ws` library (RFC 6455 frames) |
| Preauth timeout | Configurable; closes unconnected sockets with code `1008` |

### Client-Side Reconnection (AcaClaw UI)

The AcaClaw UI implements automatic reconnection with exponential backoff:

| Event | Action |
|---|---|
| WebSocket `close` | Start reconnect timer (2s → 4s → 8s → ... → 30s max) |
| Tab gains focus | Attempt immediate reconnect if disconnected |
| Network `online` event | Attempt immediate reconnect if disconnected |
| Reconnect success | Re-run `connect` handshake, refresh all state |
| API key state | Reset `_loaded` flag on disconnect so keys refresh on reconnect |

### Connection Loss Scenarios

| Scenario | What Happens | Recovery |
|---|---|---|
| Gateway crash | systemd/launchd restarts process (3–5s) | UI auto-reconnects after restart |
| Config restart (SIGUSR1) | Gateway exits, supervisor relaunches | UI sees disconnect, reconnects in ~5s |
| API key change | Env write → SIGUSR1 → restart | UI reconnects, reloads keys |
| Network loss | WebSocket closes, no ping/pong | UI retries on network `online` event |
| Browser tab backgrounded | Browser may throttle WebSocket | UI reconnects on tab focus |
| OOM kill | Process killed by kernel | systemd/launchd restart (3–5s) |

### Ensuring Continuous Availability

For research workflows that require uninterrupted connectivity:

1. **Use the service supervisor** — always install via `bash scripts/acaclaw-service.sh install` instead of manual `nohup` launches
2. **Monitor service health** — `systemctl --user status acaclaw-gateway` or `launchctl print gui/$(id -u)/com.acaclaw.gateway`
3. **Check restart limits** — if the gateway hits the 5-restart-per-60s limit, check logs: `tail -50 ~/.acaclaw/gateway.log`
4. **Avoid env writes during active chat** — model changes are hot-reloaded instantly; API key changes cause a brief restart
5. **Keep memory in check** — `NODE_OPTIONS=--max-old-space-size=512` prevents unbounded growth; increase if needed for heavy workloads

---

## Comparison: AcaClaw vs OpenClaw Defaults

| Setting | AcaClaw | OpenClaw (standalone) |
|---|---|---|
| **Port** | 2090 | 18789 |
| **Bind** | loopback only | loopback only (macOS app), configurable |
| **Auth mode** | `none` | `token` (auto-generated on first run) |
| **Device auth** | Disabled | Enabled (HMAC-SHA256 signed payloads) |
| **Control UI** | Enabled at `/openclaw/` | Enabled at `/` |
| **Custom UI** | AcaClaw research UI at `/` | None (Control UI is the default) |
| **Rate limiting** | Not needed (auth is `none`) | 10 attempts/min, 5-min lockout |
| **HTTPS** | Not used | Optional (TLS config available) |
| **Control UI UI routing** | Path-based at `/openclaw/` | Path-based at `/` (or custom `basePath`) |
| **AcaClaw UI routing** | Hash-based (`/#chat`, `/#settings`) | N/A |

### Why AcaClaw Disables Auth

1. **Loopback binding** — the gateway is physically unreachable from other machines
2. **Single user** — AcaClaw is a local research tool, not a multi-user server
3. **No remote channels** — no Discord/Telegram/Slack integration by default
4. **Simplicity** — scientists should never encounter auth prompts for a local tool

### When to Enable Auth

If you modify AcaClaw to listen on a non-loopback interface (e.g., `--bind 0.0.0.0`), you **must** enable authentication:

```json
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": { "source": "env", "id": "ACACLAW_GATEWAY_TOKEN" }
    },
    "controlUi": {
      "dangerouslyDisableDeviceAuth": false
    }
  }
}
```

---

## Troubleshooting

### "Gateway not connected" in the UI

1. Is the gateway running?
   ```bash
   bash scripts/start.sh --status
   ```

2. Check logs:
   ```bash
   tail -20 ~/.acaclaw/gateway.log
   ```

3. Port conflict?
   ```bash
   ss -ltnp | grep 2090
   ```

4. Check startup timing:
   ```bash
   cat ~/.acaclaw/startup-timing.log
   ```

### UI loads but shows "disconnected"

The WebSocket connection failed after page load. Common causes:

- **Gateway crashed**: check `~/.acaclaw/gateway.log` and restart with `start.sh`
- **Port changed**: verify `gateway.port` in `~/.openclaw/openclaw.json` matches the browser URL
- **Network issue**: verify gateway is listening: `ss -ltnp | grep 2090`

### OpenClaw Control UI at /openclaw/ not loading

1. Verify `controlUi.enabled` is `true` in config:
   ```bash
   grep -A3 controlUi ~/.openclaw/openclaw.json
   ```

2. Restart the gateway — config changes require a restart:
   ```bash
   bash scripts/stop.sh && bash scripts/start.sh
   ```

3. Check that `basePath` is set to `/openclaw`:
   ```bash
   curl -s http://localhost:2090/openclaw/ | head -5
   ```

### Desktop icon doesn't launch

1. **PATH issue**: the `.desktop` launcher uses a minimal PATH. Check that `openclaw` is installed globally or that fnm/nvm is set up
2. **Stale PID file**: delete `~/.acaclaw/gateway.pid` and retry
3. **Missing .desktop file**: reinstall with `bash scripts/install-desktop.sh`

---

## Related Documentation

- [Architecture](/en/architecture/) — System design and responsibility boundaries
- [Chat Handling](/en/chat-handling/) — Message flow, streaming, tool and skill calling
- [Security](/en/security/) — Security policies and sandbox configuration
- [Providers & Models](/en/providers-and-models/) — API key management and model catalog
