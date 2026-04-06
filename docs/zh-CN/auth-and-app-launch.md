---
layout: page
title: 应用启动与网关连接
lang: zh-CN
permalink: /zh-CN/auth-and-app-launch/
---

> AcaClaw 如何连接本地 OpenClaw 网关、认证机制概览，以及 AcaClaw 与 OpenClaw 两套 UI 如何共同运行。

---

## 目录

- [概述](#概述)
- [OpenClaw 认证系统](#openclaw-认证系统)
- [AcaClaw 认证配置](#acaclaw-认证配置)
- [WebSocket 握手](#websocket-握手)
- [双 UI 架构](#双-ui-架构)
- [应用启动流程](#应用启动流程)
- [网关生命周期](#网关生命周期)
- [对比：AcaClaw 与 OpenClaw 默认配置](#对比acaclaw-与-openclaw-默认配置)
- [故障排查](#故障排查)

---

## 概述

AcaClaw 是一个本地 Web 应用。网关（一个 OpenClaw 进程）运行在 `localhost`，同时提供 AcaClaw 研究 UI 和 OpenClaw Control UI，并接受 WebSocket 连接。AcaClaw 使用 `auth.mode = "none"`，因为网关仅监听回环地址——外部访问在物理层面不可能。

```
┌──────────────────────────── 运行时 ───────────────────────────────────┐
│                                                                       │
│  start.sh  ──启动──▶  网关 (端口 2090, 仅回环)                       │
│            ──打开──▶  浏览器 http://localhost:2090/                   │
│                                                                       │
│  浏览器    ──加载──▶   AcaClaw UI (插件提供，路径 /)                  │
│            ──打开──▶   WebSocket ws://localhost:2090/                 │
│            ──等待──▶   网关发送 connect.challenge 事件                │
│            ──发送──▶   connect 请求 (无需认证)                        │
│            ──接收──▶   connect 响应 (ok: true)                        │
│            ──就绪──▶   UI 完全可用                                    │
│                                                                       │
│  另可访问：                                                           │
│    http://localhost:2090/openclaw/  → OpenClaw Control UI             │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## OpenClaw 认证系统

OpenClaw 网关支持四种认证模式。了解这些模式有助于理解 AcaClaw 为何禁用认证，以及底层平台提供了哪些安全机制。

### 认证模式

| 模式 | 工作原理 | 使用场景 |
|---|---|---|
| **`none`** | 无需凭证，所有连接均被接受 | 仅本地网关 (AcaClaw 默认) |
| **`token`** | 客户端在连接握手中发送共享令牌 | 远程访问、API 集成 |
| **`password`** | 客户端在连接握手中发送共享密码 | 简单远程访问 |
| **`trusted-proxy`** | 反向代理 (Pomerium、Caddy + OAuth) 提供身份请求头 | 多用户部署 |

### 认证配置结构

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

令牌与密码可引用环境变量中的密钥：

```json
{
  "token": {
    "source": "env",
    "provider": "default",
    "id": "OPENCLAW_GATEWAY_TOKEN"
  }
}
```

### 设备认证 (Control UI)

独立于 `gateway.auth`，Control UI 有自己的**设备认证**层：

- 使用 **HMAC-SHA256** 签名设备身份（v2 或 v3 载荷格式）
- 载荷包含：设备 ID、客户端 ID、模式、角色、权限范围、时间戳、随机数、平台
- 通过 `gateway.controlUi.dangerouslyDisableDeviceAuth` 控制
- AcaClaw 禁用此功能（`dangerouslyDisableDeviceAuth: true`），因为回环绑定已提供安全边界

### 认证优先级

网关评估连接时按以下顺序检查：

1. **Trusted-Proxy 请求头** — 若 `auth.mode = "trusted-proxy"`
2. **None 模式** — 若 `auth.mode = "none"` 则自动放行
3. **Tailscale 请求头** — 可选，仅 Control UI 表面
4. **Token** — 对配置令牌进行恒定时间比较
5. **Password** — 对配置密码进行恒定时间比较
6. **速率限制** — 按 IP 跟踪失败次数；回环默认豁免

缺少凭证不会消耗速率限制配额——只有**错误**凭证会计入。

### 凭证解析顺序

| 优先级 | 来源 | 示例 |
|---|---|---|
| 1 | CLI 参数 | `--token <value>` |
| 2 | Secret 引用 | `{ "source": "env", "id": "OPENCLAW_GATEWAY_TOKEN" }` |
| 3 | 环境变量 | `OPENCLAW_GATEWAY_TOKEN` |
| 4 | 配置文件明文 | `"token": "my-secret"` |

---

## AcaClaw 认证配置

AcaClaw 为本地研究助手使用最简单、最安全的配置：

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

| 设置 | 值 | 原因 |
|---|---|---|
| `auth.mode` | `"none"` | 网关仅回环——无外部访问 |
| `controlUi.enabled` | `true` | 在 `/openclaw/` 访问 OpenClaw 设置 |
| `controlUi.basePath` | `"/openclaw"` | 避免与 `/` 处的 AcaClaw UI 冲突 |
| `dangerouslyDisableDeviceAuth` | `true` | 回环模式下安全；设备认证无额外价值 |

### 安全模型总览

| 属性 | 值 |
|---|---|
| 网关绑定 | `127.0.0.1` / `::1` (仅回环) |
| 认证模式 | `none` |
| 设备认证 | 已禁用 (回环提供等效保护) |
| 远程访问 | 除非用户更改 `gateway.bind`，否则不可能 |
| HTTPS | 不需要 (localhost 流量无法被拦截) |

---

## WebSocket 握手

网关使用 OpenClaw 协议进行握手。每个 WebSocket 连接都遵循以下流程：

```
  浏览器 (AcaClaw UI)             网关
  ─────────────────────            ────
     │                                │
     │── WebSocket 升级 ─────────────►│  (分配 connId = UUID)
     │                                │  (提取 host, origin, UA, x-forwarded-*)
     │                                │
     │◄── 事件: connect.challenge ────│  { nonce: UUID, ts: epoch_ms }
     │                                │
     │── 请求: connect ──────────────►│  { client: "acaclaw-ui", version: "0.1.0",
     │                                │    scopes: ["chat", "config", "sessions"] }
     │                                │
     │                 [认证]          │  (auth.mode = "none" → 自动放行)
     │                                │
     │◄── 响应: { ok: true } ────────│
     │                                │
     │   连接已建立                    │
     │                                │
     │── health (每 30 秒) ──────────►│  (心跳保持连接)
     │◄── pong ──────────────────────│
```

### 连接生命周期

| 事件 | 处理 |
|---|---|
| **WebSocket 打开** | 网关分配 `connId` (UUID)，提取请求头 |
| **Challenge 发送** | 网关发送 `connect.challenge`，含 nonce + 时间戳 |
| **Connect 请求** | 客户端发送元数据：客户端名称、版本、请求的权限范围 |
| **认证** | 检查认证模式；`none` → 立即接受 |
| **连接活跃** | 客户端加入广播集，接收实时事件 |
| **心跳** | 每 30 秒 `health` RPC 保持连接 |
| **断开** | 客户端从广播集移除，发出在线状态更新 |

### 连接失败处理

握手失败时（令牌错误、被速率限制、超时）：

- 网关以错误码关闭 WebSocket
- `token`/`password` 模式下：失败次数计入速率限制
- 速率限制：每分钟 10 次尝试，锁定 5 分钟 (回环豁免)

---

## 双 UI 架构

AcaClaw 在同一网关（端口 2090）上提供两套 Web UI：

```
http://localhost:2090/
├── /                    → AcaClaw UI (研究助手)
│   ├── /#chat           → 与 Agent 对话
│   ├── /#api-keys       → 供应商与模型配置
│   ├── /#monitor        → 系统仪表板
│   ├── /#skills         → 学术技能
│   ├── /#workspace      → 文件与项目
│   ├── /#settings       → 偏好设置
│   └── ...
│
└── /openclaw/           → OpenClaw Control UI (网关管理)
    ├── /openclaw/chat          → 直接对话
    ├── /openclaw/config        → 完整配置编辑器
    ├── /openclaw/channels      → 渠道管理
    ├── /openclaw/agents        → Agent 定义
    ├── /openclaw/sessions      → 会话浏览器
    ├── /openclaw/skills        → 技能管理
    ├── /openclaw/logs          → 网关日志
    └── ...
```

### 各 UI 的服务方式

| UI | 提供者 | 机制 | 路由方式 |
|---|---|---|---|
| **AcaClaw UI** | `acaclaw-ui` 插件 | 插件 HTTP 路由 (`registerHttpRoute`) | 哈希路由 (`/#chat`, `/#settings`) |
| **OpenClaw Control UI** | 网关内置 | `control-ui.ts` + SPA 回退 | 路径路由 (`/openclaw/chat`, `/openclaw/config`) |

### OpenClaw Control UI 配置注入

Control UI 从网关获取引导配置，地址为 `/__openclaw/control-ui-config.json`：

```json
{
  "basePath": "/openclaw",
  "assistantName": "Aca",
  "assistantAvatar": "🎓",
  "assistantAgentId": "main",
  "serverVersion": "2026.4.2"
}
```

`basePath` 确保所有 Control UI 路由以 `/openclaw/` 为前缀，避免与根路径的 AcaClaw UI 冲突。

### 安全响应头 (Control UI)

OpenClaw Control UI 在所有响应上注入以下安全头：

| 头部 | 值 |
|---|---|
| X-Frame-Options | `DENY` |
| Content-Security-Policy | 根据内联脚本哈希计算 |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `no-referrer` |
| Cache-Control | `no-cache`（HTML）、`immutable`（哈希资源） |

---

## 应用启动流程

### 桌面启动

用户点击桌面图标或运行 `start.sh`：

```
  用户点击图标 / 运行 start.sh
       │
       ├── PATH 引导 (fnm → nvm → Homebrew → 常用路径)
       ├── 代理引导 (~/.proxy_env, systemd 环境)
       │
       ├── 网关是否已运行？
       │   ├── PID 文件检查 (~/.acaclaw/gateway.pid + kill -0)
       │   ├── pgrep 回退 (搜索 "openclaw.*gateway.*--port 2090")
       │   └── systemd 回退 (acaclaw-gateway.service)
       │
       ├── 未运行 → 启动网关
       │   ├── 优先使用 systemd 服务 (若 unit 文件存在)
       │   └── 回退：nohup openclaw gateway run --bind loopback --port 2090
       │
       ├── 等待健康检查 (最长 45 秒，检查 http://127.0.0.1:2090/)
       │
       └── 打开浏览器 (除非 --no-browser)
           ├── Linux:   xdg-open http://localhost:2090/
           ├── macOS:   open http://localhost:2090/
           └── WSL2:    powershell.exe Start-Process (浏览器在 Windows 端)
```

### 命令行选项

| 参数 | 效果 |
|---|---|
| (无) | 启动网关 + 打开浏览器 |
| `--no-browser` | 仅启动/验证网关 (无界面、SSH 场景) |
| `--status` | 检查网关状态并退出 |

### 平台检测

| 平台 | 检测方式 | 浏览器命令 |
|---|---|---|
| Linux | `uname -s == Linux` | `xdg-open` |
| macOS | `uname -s == Darwin` | `open` |
| WSL2 | `$WSL_DISTRO_NAME` 或 `/proc/version` 包含 "microsoft" | `powershell.exe Start-Process` |
| 无界面 | 未检测到显示器 | 仅打印 URL |

### PATH 引导

桌面启动器（`.desktop` 文件、Dock 图标）不会继承用户的 shell 配置。`start.sh` 按以下顺序查找 `openclaw`：

1. **fnm** — `~/.local/share/fnm`（首选，尊重 `.node-version`）
2. **nvm** — `~/.nvm/nvm.sh`（仅在 fnm 未找到 `openclaw` 时）
3. **Homebrew** — `/opt/homebrew/bin/brew` 或 `/usr/local/bin/brew`（macOS）
4. **通过 Homebrew 安装的 fnm** — brew shellenv 之后执行 `fnm env`
5. **常用路径** — `~/.npm-global/bin`、`~/.cargo/bin`、`~/.acaclaw/miniforge3/bin`

一旦 `command -v openclaw` 成功，搜索即停止。

### 代理引导

桌面启动器也会缺少代理配置。`start.sh` 从以下来源加载代理变量：

1. `~/.proxy_env` 或 `~/.config/proxy.env`（source 加载）
2. systemd 服务环境（`systemctl show ... -p Environment`）

---

## 网关生命周期

### 进程管理

| 关注点 | 处理方式 |
|---|---|
| **已在运行？** | PID 文件检查 → pgrep 回退 → systemd 回退 |
| **PID 文件过期？** | `kill -0` 失败 → 删除 PID 文件，重新启动 |
| **启动方式** | systemd 服务（首选）→ nohup 回退 |
| **健康检查** | 等待 `http://127.0.0.1:2090/` 返回 HTTP 200（最长 45 秒） |
| **端口冲突** | 网关最多重试 4 次，间隔 500ms（TIME_WAIT） |
| **PID 跟踪** | `~/.acaclaw/gateway.pid` |
| **日志** | `~/.acaclaw/gateway.log` |
| **优雅关闭** | `stop.sh` 发送 SIGTERM，等待 5 秒后 SIGKILL |
| **端口** | 默认 2090，可通过 `ACACLAW_PORT` 环境变量配置 |
| **启动计时** | 记录至 `~/.acaclaw/startup-timing.log` |

### 网关命令

```bash
openclaw gateway run --bind loopback --port 2090 --force
```

| 参数 | 用途 |
|---|---|
| `--bind loopback` | 仅监听 127.0.0.1 (安全边界) |
| `--port 2090` | 端口号 (避免与 OpenClaw 默认端口 18789 冲突) |
| `--force` | 跳过锁检查 (本地单实例安全) |

---

## 对比：AcaClaw 与 OpenClaw 默认配置

| 设置 | AcaClaw | OpenClaw (独立运行) |
|---|---|---|
| **端口** | 2090 | 18789 |
| **绑定** | 仅回环 | 仅回环 (macOS 应用)，可配置 |
| **认证模式** | `none` | `token` (首次运行自动生成) |
| **设备认证** | 已禁用 | 已启用 (HMAC-SHA256 签名载荷) |
| **Control UI** | 启用，路径 `/openclaw/` | 启用，路径 `/` |
| **自定义 UI** | AcaClaw 研究 UI 在 `/` | 无 (Control UI 为默认) |
| **速率限制** | 不需要 (认证为 `none`) | 每分钟 10 次，锁定 5 分钟 |
| **HTTPS** | 不使用 | 可选 (TLS 配置可用) |
| **Control UI 路由** | 路径路由 `/openclaw/` | 路径路由 `/` (或自定义 `basePath`) |
| **AcaClaw UI 路由** | 哈希路由 (`/#chat`, `/#settings`) | 不适用 |

### AcaClaw 禁用认证的原因

1. **回环绑定** — 其他机器物理上无法访问网关
2. **单用户** — AcaClaw 是本地研究工具，非多用户服务器
3. **无远程渠道** — 默认不集成 Discord/Telegram/Slack
4. **简洁性** — 科研人员使用本地工具不应遇到认证提示

### 何时启用认证

如果将 AcaClaw 改为监听非回环接口（如 `--bind 0.0.0.0`），**必须**启用认证：

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

## 故障排查

### UI 中显示"网关未连接"

1. 网关是否在运行？
   ```bash
   bash scripts/start.sh --status
   ```

2. 检查日志：
   ```bash
   tail -20 ~/.acaclaw/gateway.log
   ```

3. 端口冲突？
   ```bash
   ss -ltnp | grep 2090
   ```

4. 检查启动计时：
   ```bash
   cat ~/.acaclaw/startup-timing.log
   ```

### UI 加载成功但显示"已断开"

页面加载后 WebSocket 连接失败。常见原因：

- **网关崩溃**：检查 `~/.acaclaw/gateway.log` 并使用 `start.sh` 重启
- **端口变更**：确认 `~/.openclaw/openclaw.json` 中的 `gateway.port` 与浏览器 URL 一致
- **网络问题**：确认网关正在监听：`ss -ltnp | grep 2090`

### /openclaw/ 处的 OpenClaw Control UI 无法加载

1. 确认配置中 `controlUi.enabled` 为 `true`：
   ```bash
   grep -A3 controlUi ~/.openclaw/openclaw.json
   ```

2. 重启网关——配置变更需要重启：
   ```bash
   bash scripts/stop.sh && bash scripts/start.sh
   ```

3. 检查 `basePath` 是否设置为 `/openclaw`：
   ```bash
   curl -s http://localhost:2090/openclaw/ | head -5
   ```

### 桌面图标无法启动

1. **PATH 问题**：`.desktop` 启动器使用最小 PATH。确认 `openclaw` 已全局安装或 fnm/nvm 已配置
2. **PID 文件过期**：删除 `~/.acaclaw/gateway.pid` 后重试
3. **缺少 .desktop 文件**：使用 `bash scripts/install-desktop.sh` 重新安装

---

## 相关文档

- [架构](/zh-CN/architecture/) — 系统设计与职责边界
- [聊天处理](/zh-CN/chat-handling/) — 消息流、流式传输、工具与技能调用
- [安全](/zh-CN/security/) — 安全策略与沙箱配置
- [供应商与模型](/zh-CN/providers-and-models/) — API Key 管理与模型目录
