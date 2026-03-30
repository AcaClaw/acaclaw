---
layout: page
title: App Launch and Gateway Connection
lang: en
permalink: /en/auth-and-app-launch/
---

> How AcaClaw connects to its local OpenClaw gateway and how the app opens in the browser.

---

## Table of Contents

- [Overview](#overview)
- [Security Model](#security-model)
- [WebSocket Handshake](#websocket-handshake)
- [App Launch Flow](#app-launch-flow)
- [Gateway Lifecycle](#gateway-lifecycle)
- [Troubleshooting](#troubleshooting)

---

## Overview

AcaClaw is a local web app. The gateway (an OpenClaw process) runs on `localhost`, serves the UI as static files, and accepts WebSocket connections. No tokens or passwords are needed because the gateway only listens on loopback (127.0.0.1 / ::1).

```
┌─────────────────────────── Runtime ────────────────────────────────┐
│                                                                     │
│  start.sh  ──starts──▶  gateway (port 2090, loopback only)        │
│            ──opens──▶   browser at http://localhost:2090/          │
│                                                                     │
│  Browser   ──loads──▶   index.html                                 │
│            ──opens──▶   WebSocket ws://localhost:2090/              │
│            ──waits──▶   connect.challenge event from gateway       │
│            ──sends──▶   connect request (client metadata)          │
│            ──receives──▶ connect response (ok: true)                │
│            ──ready──▶   UI fully operational                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Security Model

AcaClaw uses `gateway.auth.mode = "none"`. The gateway binds exclusively to loopback, making external access impossible. Loopback binding is the security boundary.

| Property | Value |
|---|---|
| Gateway bind | `127.0.0.1` / `::1` (loopback only) |
| Auth mode | `none` |
| Remote access | Not possible unless user changes `gateway.bind` |
| HTTPS | Not needed (localhost traffic cannot be intercepted) |

---

## WebSocket Handshake

The gateway uses the OpenClaw protocol handshake:

```
  Browser                          Gateway
  ───────                          ───────
     │                                │
     │◄── WebSocket open ────────────►│
     │                                │
     │◄── event: connect.challenge ───│
     │                                │
     │── req: connect ───────────────►│  (client metadata + scopes)
     │                                │
     │◄── res: { ok: true } ─────────│
     │                                │
     │   Connection established       │
     │   UI fully operational         │
```

A heartbeat (`health` call every 30s) keeps the connection alive.

---

## App Launch Flow

The user clicks a desktop icon or runs `start.sh`:

```
  User clicks icon
       │
       ▼
  start.sh
       │
       ├── Is gateway already running? (PID file check)
       │   ├── Yes → skip to browser launch
       │   └── No  → start gateway, wait for /health (up to 15s)
       │
       └── Open browser
           ├── Linux:  xdg-open http://localhost:2090/
           ├── macOS:  open http://localhost:2090/
           └── WSL2:   powershell.exe Start-Process
```

| Platform | Launch method |
|---|---|
| Linux | `xdg-open` |
| macOS | `open` |
| WSL2 | `powershell.exe` (browser on Windows, gateway in WSL) |
| Headless | Print URL for manual access |

---

## Gateway Lifecycle

| Concern | How it is handled |
|---|---|
| Already running? | Check PID file + `kill -0`. Skip start if alive. |
| Stale PID file? | Process dead → clean up, start fresh. |
| Health check | Wait for `/health` (up to 15s) before opening browser. |
| PID tracking | `~/.acaclaw/gateway.pid` |
| Logs | `~/.acaclaw/gateway.log` |
| Clean shutdown | `stop.sh` sends SIGTERM, waits 5s, then SIGKILL. |
| Port | Default 2090, configurable via `ACACLAW_PORT`. |

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

### UI loads but shows "disconnected"

The WebSocket connection failed after page load. Common causes:

- **Gateway crashed**: check `~/.acaclaw/gateway.log` and restart with `start.sh`.
- **Port changed**: verify `gateway.port` in `~/.openclaw/openclaw.json` matches what the browser is connecting to.
- **Network issue**: verify gateway is listening: `ss -ltnp | grep 2090`.
