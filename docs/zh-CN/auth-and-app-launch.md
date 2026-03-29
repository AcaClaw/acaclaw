---
layout: page
title: 认证与启动
lang: zh-CN
permalink: /zh-CN/auth-and-app-launch/
---

> AcaClaw 如何生成、存储、下发并校验其网关认证令牌，以及应用如何在用户无需接触令牌的情况下在浏览器中打开。

---

## 目录

- [概述](#概述)
- [令牌生命周期](#令牌生命周期)
  - [生成（安装时）](#生成安装时)
  - [存储](#存储)
  - [下发到浏览器](#下发到浏览器)
  - [校验（网关侧）](#校验网关侧)
- [WebSocket 握手](#websocket-握手)
- [应用启动流程](#应用启动流程)
  - [用户打开 AcaClaw 时发生什么](#用户打开-acaclaw-时发生什么)
  - [各平台浏览器启动方式](#各平台浏览器启动方式)
  - [网关生命周期](#网关生命周期)
- [令牌解析顺序（客户端）](#令牌解析顺序客户端)
- [安全模型](#安全模型)
- [故障排查](#故障排查)
- [设计决策](#设计决策)

---

## 概述

AcaClaw 是本地 Web 应用。网关（OpenClaw 进程）在 `localhost` 上运行，以静态文件形式提供 UI，接受 WebSocket 连接，并需要令牌进行认证。用户不会看到或输入该令牌——它会自动从配置流向 HTML，再流向 WebSocket。

```
┌─────────────────────────── Install time ───────────────────────────┐
│                                                                     │
│  install.sh  ──generates──▶  token (48 hex chars)                   │
│              ──writes──▶     ~/.openclaw/openclaw.json              │
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

## 令牌生命周期

### 生成（安装时）

在运行 `install.sh` 期间会创建网关认证令牌：

1. **已有 OpenClaw 安装**：若 `~/.openclaw/openclaw.json` 中存在 `gateway.auth.token`，该值会复制到 AcaClaw 的配置中。两个网关共用同一令牌。

2. **尚无令牌**：使用 Python 的 `secrets.token_hex(24)` 生成新的 48 位十六进制令牌。

```python
# From install.sh — token generation
import secrets
cfg['gateway']['auth'] = {
    'mode': 'token',
    'token': secrets.token_hex(24)  # 24 bytes → 48 hex chars
}
```

令牌写入一次后不会自动轮换（如需可经配置手动重新生成）。

### 存储

令牌位于 AcaClaw 配置文件的 OpenClaw 配置中：

```
~/.openclaw/openclaw.json
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

| 字段 | 值 | 用途 |
|---|---|---|
| `gateway.auth.mode` | `"token"` | 告知网关使用静态令牌认证 |
| `gateway.auth.token` | 48 位十六进制 | 共享密钥 |
| `gateway.bind` | `"loopback"` | 仅接受来自 localhost 的连接 |

### 下发到浏览器

令牌通过注入到 `index.html` 的 HTML `<meta>` 标签到达浏览器 UI：

```html
<meta name="oc-token" content="e20b44ec...91ce">
```

有两种机制保证该标签存在：

1. **acaclaw-ui 插件**（运行时）：在提供 `index.html` 时，插件从网关配置读取令牌，在发送响应前将 `<meta>` 标签注入 HTML。这是主要机制——适用于每次请求，即便在 UI 重新构建之后。

2. **start.sh**（启动时）：作为双保险，`ensure_token_in_html()` 会检查磁盘上的 HTML 文件是否已有 `<meta>` 标签。若缺失（例如全新构建且尚无插件），则通过 `sed` 注入标签。这仅作后备。

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

令牌不会出现在 URL 中。`<meta>` 标签在页面加载时由 JavaScript 读取——用户不可见，也不会发往任何外部服务器。

### 校验（网关侧）

当 UI 发送带有 `auth.token` 的 `connect` 请求时，网关使用计时安全的比较（`safeEqualSecret`）进行校验。这可防止计时攻击：攻击者无法通过测量响应时间逐字符猜出令牌。

```
Client: { method: "connect", params: { auth: { token: "e20b44ec..." } } }
                                                      │
Gateway: safeEqualSecret(provided_token, config_token) ──▶ match? → accept
                                                         ──▶ no match? → reject
```

失败的认证尝试会被网关限流，以防暴力破解。

---

## WebSocket 握手

网关采用挑战-响应握手，而非简单的“令牌放在请求头”式认证：

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

### 为何采用挑战-响应？

网关在 WebSocket 建立时不会直接接受令牌，而是：

1. 在 WebSocket 连接打开后，网关发送带有 nonce 的 `connect.challenge` 事件。
2. 客户端等待该事件，再发送包含令牌与客户端元数据的 `connect` 请求。
3. 网关校验令牌并响应。

该设计可防止重放攻击，并确保在网关分配会话资源之前，客户端使用的是正确的协议版本。

### 超时处理

- 若网关在 WebSocket 打开后 **10 秒内**未发送 `connect.challenge`，客户端会关闭连接并重试。
- 客户端每个连接只发送一次 connect 帧（由 `_connectSent` 标志保护）。
- 若 connect 响应为拒绝，客户端会关闭连接并在 5 秒后安排重连。
- 心跳（每 30 秒一次 `health` 调用）在认证后保持连接活跃。

---

## 应用启动流程

### 用户打开 AcaClaw 时发生什么

用户点击桌面图标或运行 `start.sh`。安装完成后无需在终端中交互。

```
  User clicks icon
       │
       ▼
  start.sh
       │
       ├── Is gateway already running?
       │   ├── Yes → skip to browser launch
       │   └── No  → start gateway in background
       │            ├── openclaw gateway run
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

### 各平台浏览器启动方式

| 平台 | 方式 | 说明 |
|---|---|---|
| **Linux** | `xdg-open` | 适用于 X11 与 Wayland（GNOME、KDE、XFCE、Sway） |
| **macOS** | `open` | 启动默认浏览器 |
| **WSL2** | `powershell.exe` | 网关在 WSL 中运行，浏览器在 Windows 上打开 |
| **无图形界面** | 打印 URL | 用户从能访问主机的任意浏览器访问 |

在 WSL2 下，网关在 Linux 子系统内运行并监听 localhost。Windows 与 WSL2 共享同一 `localhost`，因此 Windows 浏览器可通过 `http://localhost:2090/` 访问网关。

### 网关生命周期

| 关注点 | 处理方式 |
|---|---|
| **已在运行？** | 检查 PID 文件 + `kill -0`。若进程存活则跳过启动。 |
| **PID 文件陈旧？** | 进程已死 → 清理 PID 文件，重新启动。 |
| **健康检查** | 打开浏览器前等待 `/health` 端点（最多 15 秒）。 |
| **PID 跟踪** | 保存到 `~/.acaclaw/gateway.pid`，供 `stop.sh` 与状态检查使用。 |
| **日志** | 追加到 `~/.acaclaw/gateway.log`。 |
| **干净退出** | `stop.sh` 发送 SIGTERM，等待 5 秒，再发送 SIGKILL。 |
| **端口冲突** | 可通过环境变量 `ACACLAW_PORT` 配置（默认：2090）。 |

---

## 令牌解析顺序（客户端）

UI 中的 JavaScript 按优先级链解析认证令牌。第一个返回非空值的来源生效：

| 优先级 | 来源 | 何时设置 |
|---|---|---|
| 1 | `<meta name="oc-token">` | 由 acaclaw-ui 插件在每次 HTML 响应中注入 |
| 2 | URL 哈希 `#token=...` | 遗留：早期 start.sh 版本曾使用 |
| 3 | `sessionStorage["openclaw.control.token"]` | 由 OpenClaw 内置控制 UI 引导设置 |

优先级 1（meta 标签）应始终存在。优先级 2 和 3 用于边缘情况的后备。

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

## 安全模型

### 威胁假设

AcaClaw 的认证面向单机单用户本地访问：

| 假设 | 含义 |
|---|---|
| 网关仅绑定 loopback | 除非用户显式修改 `gateway.bind`，否则无远程访问 |
| 令牌不离开 localhost | 不发送到外部服务器，不在 URL 查询参数中 |
| 令牌在 HTML meta 标签中 | 页面上任意 JavaScript 可读——在仅 localhost 场景下可接受 |
| 无 HTTPS | 本地流量通常不被窃听——在此场景下 TLS 增加复杂度而无明显收益 |
| 单用户 | 无多用户认证，除 operator 作用域外无基于角色的访问控制 |

### 防御层次

| 层次 | 防护 |
|---|---|
| **Loopback 绑定** | 网关仅接受来自 `127.0.0.1` / `::1` 的连接 |
| **令牌认证** | WebSocket connect 需要有效令牌 |
| **计时安全比较** | `safeEqualSecret()` 防止计时侧信道 |
| **限流** | 失败的认证尝试会被限流 |
| **URL 中无令牌** | 令牌在 HTML 正文中，不在 URL——不会经 Referer 头或浏览器历史泄漏 |
| **Cache-Control: no-cache** | `index.html` 不被缓存——令牌变更在下次页面加载时生效 |
| **SPA 隔离** | AcaClaw UI 在端口 2090，OpenClaw 控制面板在端口 18789——不同网关，认证令牌相同 |

### AcaClaw 不提供的功能

| 功能 | 状态 | 原因 |
|---|---|---|
| 令牌轮换 | 非自动 | 单用户、仅本地。用户可手动重新生成。 |
| HTTPS / TLS | 未使用 | localhost 场景下 TLS 收益有限。 |
| 多用户认证 | 不支持 | 单用户设计。OpenClaw 内置配对处理多设备。 |
| OAuth / SSO | 不支持 | 本地使用无需外部身份提供方。 |
| 基于密码的认证 | 未使用 | 令牌更安全且无需用户输入。 |

---

## 故障排查

### UI 中显示「Gateway not connected」

1. 网关是否在运行？
   ```bash
   bash scripts/start.sh --status
   ```

2. 查看日志：
   ```bash
   tail -20 ~/.acaclaw/gateway.log
   ```

3. 端口是否被其他进程占用？
   ```bash
   ss -ltnp | grep 2090
   ```

### UI 能加载但显示「disconnected」

页面加载后 WebSocket 连接失败。常见原因：

- **令牌不一致**：`<meta>` 标签中是旧令牌。重启网关（`stop.sh` 再 `start.sh`）——`start.sh` 会重新注入当前令牌。
- **网关重启且使用了新令牌**：若有人在配置中重新生成了令牌，但浏览器缓存了旧页面，meta 会过期。acaclaw-ui 插件在每次请求时注入当前令牌，因此刷新页面即可拿到新令牌。`Cache-Control: no-cache` 确保浏览器会重新校验。
- **被限流**：失败认证过多。重启网关可清除内存中的限流状态。

### meta 标签中找不到令牌

若 `resolveAuthToken()` 打印「no token found」：

1. 查看页面源代码——查找 `<meta name="oc-token">`。
2. 若缺失，确认 acaclaw-ui 插件是否已加载：
   ```bash
   grep "acaclaw-ui" ~/.acaclaw/gateway.log
   ```
3. 若插件加载失败，`start.sh` 中的 `ensure_token_in_html()` 应已注入标签。检查 HTML 文件：
   ```bash
   grep "oc-token" ~/.openclaw/ui/index.html
   ```

---

## 设计决策

### 为何用 meta 标签而不是 cookie？

Cookie 会随每次 HTTP 请求发送，且可能泄漏到子域。`<meta>` 标签仅能被该页面的 JavaScript 读取——绝不会出现在 HTTP 头中。我们只需要令牌用于 WebSocket 握手（而非 HTTP 请求），因此 meta 标签是最小且合适的机制。

### 为何不把令牌放在 URL 中？

URL 中的令牌（查询参数或哈希）会通过以下途径泄漏：
- 浏览器历史
- Referer 头（查询参数）
- 旁人窥屏
- 共享书签

meta 标签可避免上述问题。URL 始终是干净的 `http://localhost:2090/`。

### 为何由插件注入令牌而不是网关？

OpenClaw 内置静态文件服务器（`control-ui.ts`）按原样提供文件——不做模板注入。为不修改 OpenClaw 核心，AcaClaw 的 UI 插件拦截 HTTP 路由并在响应时注入令牌。这使 AcaClaw 自成一体（无需改核心），并保证即便在 UI 重建后令牌也始终最新。

### 为何挑战-响应而不是「建立连接时带令牌」？

若将令牌作为 WebSocket 子协议或升级请求中的头在握手阶段发送，会暴露在 HTTP 日志与代理头中。挑战-响应模式：
1. 建立「干净」的 WebSocket（无敏感头）
2. 服务器通过发送 nonce 证明自己是真实网关
3. 客户端通过 `connect` 响应证明持有令牌

这是 OpenClaw 网关协议——AcaClaw 遵循该协议而非自造一套。

### 为何仅绑定 loopback？

科研人员通常不需要远程访问网关。绑定 loopback 意味着无需防火墙规则、TLS 证书，也不会暴露到局域网。需要远程访问的用户可将 `gateway.bind` 改为 `lan` 或使用 SSH 隧道。
