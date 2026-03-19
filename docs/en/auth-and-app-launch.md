---
layout: page
title: Authentication and App Launch
lang: en
permalink: /en/auth-and-app-launch/
---

> How AcaClaw generates, stores, delivers, and verifies its gateway authentication token — and how the app opens in the browser without users ever touching a token.

---

## Table of Contents

- [Overview](#overview)
- [Token Lifecycle](#token-lifecycle)
  - [Generation (Install Time)](#generation-install-time)
  - [Storage](#storage)
  - [Delivery to the Browser](#delivery-to-the-browser)
  - [Verification (Gateway Side)](#verification-gateway-side)
- [WebSocket Handshake](#websocket-handshake)
- [App Launch Flow](#app-launch-flow)
  - [What Happens When the User Opens AcaClaw](#what-happens-when-the-user-opens-acaclaw)
  - [Platform-Specific Browser Launch](#platform-specific-browser-launch)
  - [Gateway Lifecycle](#gateway-lifecycle)
- [Token Resolution Order (Client)](#token-resolution-order-client)
- [Security Model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Design Decisions](#design-decisions)

---

## Overview

AcaClaw is a local web app. The gateway (an OpenClaw process) runs on `localhost`, serves the UI as static files, accepts WebSocket connections, and requires a token for authentication. The user never sees or types this token — it flows automatically from config to HTML to WebSocket.

```
┌─────────────────────────── Install time ───────────────────────────┐
│                                                                     │
│  install.sh  ──generates──▶  token (48 hex chars)                   │
│              ──writes──▶     ~/.openclaw-acaclaw/openclaw.json      │
│              ──injects──▶    <meta name="oc-token"> in index.html   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────── Runtime ────────────────────────────────┐
│                                                                     │
│  start.sh  ──starts──▶  gateway (port 2090, loopback)              │
│            ──opens──▶   browser → http://localhost:2090/            │
│                                                                     │
│  Browser   ──loads──▶   index.html (with <meta> token)             │
│            ──opens──▶   WebSocket ws://localhost:2090/              │
│            ──waits──▶   connect.challenge event from gateway       │
│            ──sends──▶   connect request { auth: { token } }        │
│            ──receives──▶ connect response (ok: true)                │
│            ──ready──▶   UI fully operational                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Token Lifecycle

### Generation (Install Time)

During `install.sh`, a gateway auth token is created:

1. **Existing OpenClaw install**: if `~/.openclaw/openclaw.json` has `gateway.auth.token`, that value is copied into AcaClaw's config. Both gateways share the same token.

2. **No existing token**: a fresh 48-character hex token is generated using Python's `secrets.token_hex(24)`.

```python
# From install.sh — token generation
import secrets
cfg['gateway']['auth'] = {
    'mode': 'token',
    'token': secrets.token_hex(24)  # 24 bytes → 48 hex chars
}
```

The token is written once and never rotated automatically (users can regenerate via config if needed).

### Storage

The token lives in the OpenClaw config file under the AcaClaw profile:

```
~/.openclaw-acaclaw/openclaw.json
```

```json
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "e20b44ec89c2ea66a2d273469b6c36e3398e021547c591ce"
    },
    "port": 2090,
    "bind": "loopback"
  }
}
```

| Field | Value | Purpose |
|---|---|---|
| `gateway.auth.mode` | `"token"` | Tells gateway to use static token auth |
| `gateway.auth.token` | 48 hex chars | The shared secret |
| `gateway.bind` | `"loopback"` | Only accepts connections from localhost |

### Delivery to the Browser

The token reaches the browser UI through an HTML `<meta>` tag injected into `index.html`:

```html
<meta name="oc-token" content="e20b44ec...91ce">
```

Two mechanisms ensure this tag is present:

1. **acaclaw-ui plugin** (runtime): when serving `index.html`, the plugin reads the token from gateway config and injects the `<meta>` tag into the HTML response before sending it. This is the primary mechanism — it works for every request, even after UI rebuilds.

2. **start.sh** (startup): as a belt-and-suspenders check, `ensure_token_in_html()` verifies the `<meta>` tag exists in the HTML file on disk. If missing (e.g., fresh build with no plugin), it injects the tag via `sed`. This is a fallback only.

```
Request: GET /
         │
         ▼
  acaclaw-ui plugin
  ┌──────────────────────────────┐
  │ 1. Read index.html from disk │
  │ 2. Read token from config    │
  │ 3. Inject <meta> tag         │
  │ 4. Serve with no-cache       │
  └──────────────────────────────┘
         │
         ▼
  Browser receives HTML with token embedded
```

The token never appears in the URL. The `<meta>` tag is read by JavaScript on page load — it is not visible to users and is not transmitted to any external server.

### Verification (Gateway Side)

When the UI sends a `connect` request with `auth.token`, the gateway verifies it using a timing-safe comparison (`safeEqualSecret`). This prevents timing attacks where an attacker could guess the token character by character by measuring response times.

```
Client: { method: "connect", params: { auth: { token: "e20b44ec..." } } }
                                                      │
Gateway: safeEqualSecret(provided_token, config_token) ──▶ match? → accept
                                                         ──▶ no match? → reject
```

Failed auth attempts are rate-limited by the gateway to prevent brute force.

---

## WebSocket Handshake

The gateway uses a challenge-response handshake, not simple token-in-header auth:

```
  Browser                          Gateway
  ───────                          ───────
     │                                │
     │◄── WebSocket open ────────────►│
     │                                │
     │◄── event: connect.challenge ───│  (gateway sends nonce)
     │    { nonce: "abc123" }         │
     │                                │
     │── req: connect ───────────────►│  (client sends token + metadata)
     │   { auth: { token },           │
     │     client: { id, version },   │
     │     role: "operator",          │
     │     scopes: [...] }            │
     │                                │
     │◄── res: { ok: true } ─────────│  (gateway accepts)
     │                                │
     │   Connection authenticated     │
     │   UI is now operational        │
     │                                │
```

### Why Challenge-Response?

The gateway does not accept the token on WebSocket open. Instead:

1. Gateway sends a `connect.challenge` event with a nonce after the WebSocket connection opens.
2. Client waits for this event, then sends a `connect` request containing the token and client metadata.
3. Gateway verifies the token and responds.

This design prevents replay attacks and ensures the client is speaking the correct protocol version before the gateway allocates session resources.

### Timeout Handling

- If the gateway does not send `connect.challenge` within **10 seconds** of WebSocket open, the client closes the connection and retries.
- The client sends the connect frame exactly **once** per connection (guarded by a `_connectSent` flag).
- If the connect response is a rejection, the client closes and schedules a reconnect after 5 seconds.
- A heartbeat (`health` call every 30s) keeps the connection alive after authentication.

---

## App Launch Flow

### What Happens When the User Opens AcaClaw

The user clicks a desktop icon or runs `start.sh`. No terminal interaction required after install.

```
  User clicks icon
       │
       ▼
  start.sh
       │
       ├── Is gateway already running?
       │   ├── Yes → skip to browser launch
       │   └── No  → start gateway in background
       │            ├── openclaw --profile acaclaw gateway run
       │            ├── Save PID to ~/.acaclaw/gateway.pid
       │            └── Wait for /health endpoint (up to 15s)
       │
       ├── ensure_token_in_html()
       │   └── Verify <meta name="oc-token"> exists in index.html
       │       └── If missing → inject from config via sed
       │
       └── Open browser
           ├── Linux:  xdg-open http://localhost:2090/
           ├── macOS:  open http://localhost:2090/
           └── WSL2:   powershell.exe Start-Process "http://..."
```

### Platform-Specific Browser Launch

| Platform | Method | Notes |
|---|---|---|
| **Linux** | `xdg-open` | Works on X11 and Wayland (GNOME, KDE, XFCE, Sway) |
| **macOS** | `open` | Launches default browser |
| **WSL2** | `powershell.exe` | Gateway runs in WSL, browser opens on Windows |
| **Headless** | Print URL | User visits from any browser that can reach the host |

For WSL2, the gateway runs inside the Linux subsystem and listens on localhost. Windows and WSL2 share the same `localhost`, so the Windows browser can reach the gateway at `http://localhost:2090/`.

### Gateway Lifecycle

| Concern | How it is handled |
|---|---|
| **Already running?** | Check PID file + `kill -0`. Skip start if alive. |
| **Stale PID file?** | Process dead → clean up PID file, start fresh. |
| **Health check** | Wait for `/health` endpoint (up to 15s) before opening browser. |
| **PID tracking** | Saved to `~/.acaclaw/gateway.pid` for `stop.sh` and status checks. |
| **Logs** | Appended to `~/.acaclaw/gateway.log`. |
| **Clean shutdown** | `stop.sh` sends SIGTERM, waits 5s, then SIGKILL. |
| **Port conflict** | Configurable via `ACACLAW_PORT` env var (default: 2090). |

---

## Token Resolution Order (Client)

The UI JavaScript resolves the auth token using a priority chain. The first source that returns a non-empty value wins:

| Priority | Source | When it is set |
|---|---|---|
| 1 | `<meta name="oc-token">` | Injected by acaclaw-ui plugin on every HTML response |
| 2 | URL hash `#token=...` | Legacy: was used by earlier start.sh versions |
| 3 | `sessionStorage["openclaw.control.token"]` | Set by OpenClaw's built-in control UI bootstrap |

Priority 1 (meta tag) should always be present. Priorities 2 and 3 are fallbacks for edge cases.

```typescript
function resolveAuthToken(): string | undefined {
  // 1. Meta tag (primary — always current, injected per-request)
  const meta = document.querySelector('meta[name="oc-token"]');
  if (meta?.content) return meta.content;

  // 2. URL hash (legacy fallback)
  const hash = location.hash.match(/token=([^&]+)/);
  if (hash) return hash[1];

  // 3. sessionStorage (OpenClaw built-in UI fallback)
  return sessionStorage.getItem("openclaw.control.token") ?? undefined;
}
```

---

## Security Model

### Threat Assumptions

AcaClaw's auth is designed for single-user, local-machine access:

| Assumption | Implication |
|---|---|
| Gateway binds to loopback only | No remote access unless user explicitly changes `gateway.bind` |
| Token never leaves localhost | Not sent to external servers, not in URL query params |
| Token in HTML meta tag | Readable by any JavaScript on the page — acceptable because localhost only |
| No HTTPS | Localhost traffic is not intercepted — TLS adds complexity without benefit |
| Single user | No multi-user auth, no role-based access beyond operator scopes |

### Defense Layers

| Layer | Protection |
|---|---|
| **Loopback binding** | Gateway only accepts connections from `127.0.0.1` / `::1` |
| **Token auth** | WebSocket connect requires valid token |
| **Timing-safe comparison** | `safeEqualSecret()` prevents timing side-channel |
| **Rate limiting** | Failed auth attempts are rate-limited |
| **No URL tokens** | Token is in HTML body, not URL — no leakage via Referer headers or browser history |
| **Cache-Control: no-cache** | `index.html` is not cached — token changes take effect on next page load |
| **SPA isolation** | AcaClaw UI at `/`, OpenClaw admin UI at `/admin` — separate SPAs, same auth |

### What AcaClaw Does NOT Do

| Feature | Status | Reason |
|---|---|---|
| Token rotation | Not automatic | Single user, local only. Users can manually regenerate. |
| HTTPS / TLS | Not used | Localhost does not benefit from TLS. |
| Multi-user auth | Not supported | Single-user design. OpenClaw's built-in pairing handles multi-device. |
| OAuth / SSO | Not supported | No external identity provider needed for local use. |
| Password-based auth | Not used | Tokens are more secure and require no user input. |

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

3. Is the port in use by another process?
   ```bash
   ss -ltnp | grep 2090
   ```

### UI loads but shows "disconnected"

The WebSocket connection failed after the page loaded. Common causes:

- **Token mismatch**: the `<meta>` tag has a stale token. Restart the gateway (`stop.sh` then `start.sh`) — `start.sh` re-injects the current token.
- **Gateway restarted with a new token**: if someone regenerated the token in config but the browser has a cached page, the meta tag is stale. The acaclaw-ui plugin injects the current token on every request, so a page reload picks up the new token. `Cache-Control: no-cache` ensures the browser revalidates.
- **Rate limited**: too many failed auth attempts. Restart the gateway to clear in-memory rate limits.

### Token not found in meta tag

If `resolveAuthToken()` logs "no token found":

1. View page source — look for `<meta name="oc-token">`.
2. If missing, check that the acaclaw-ui plugin loaded:
   ```bash
   grep "acaclaw-ui" ~/.acaclaw/gateway.log
   ```
3. If the plugin failed to load, `start.sh`'s `ensure_token_in_html()` should have injected the tag. Check the HTML file:
   ```bash
   grep "oc-token" ~/.openclaw-acaclaw/ui/index.html
   ```

---

## Design Decisions

### Why a meta tag instead of a cookie?

Cookies are sent with every HTTP request and can leak to subdomains. A `<meta>` tag is only readable by JavaScript on that exact page — it is never sent in HTTP headers. Since we only need the token for the WebSocket handshake (not HTTP requests), a meta tag is the minimal correct mechanism.

### Why not put the token in the URL?

URL tokens (query params or hash) leak through:
- Browser history
- Referer headers (for query params)
- Shoulder surfing
- Shared bookmarks

The meta tag avoids all of these. The URL is always a clean `http://localhost:2090/`.

### Why does the plugin inject the token instead of the gateway?

OpenClaw's built-in static file server (`control-ui.ts`) serves files as-is — no template injection. Rather than modifying OpenClaw core, AcaClaw's UI plugin intercepts the HTTP route and injects the token at serve time. This keeps AcaClaw self-contained (no core patches) and ensures the token is always current even after UI rebuilds.

### Why challenge-response instead of token-on-open?

Sending the token as a WebSocket sub-protocol or header during the upgrade request would expose it in HTTP logs and proxy headers. The challenge-response pattern:
1. Opens a clean WebSocket (no sensitive headers)
2. Server proves it is the real gateway (by sending a nonce)
3. Client proves it knows the token (by responding with `connect`)

This is the OpenClaw gateway protocol — AcaClaw follows it rather than inventing its own.

### Why loopback-only binding?

Scientists do not need remote access to their gateway. Binding to loopback means no firewall rules, no TLS certificates, no exposure to the local network. Users who need remote access can change `gateway.bind` to `lan` or use SSH tunneling.
