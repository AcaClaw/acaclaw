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
- [App Launch Flow](#app-launch-flow)
- [Gateway Lifecycle](#gateway-lifecycle)
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
  "serverVersion": "2026.3.24"
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
