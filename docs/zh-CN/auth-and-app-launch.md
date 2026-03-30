---
layout: page
title: 应用启动与网关连接
lang: zh-CN
permalink: /zh-CN/auth-and-app-launch/
---

> AcaClaw 如何连接本地 OpenClaw 网关，以及应用如何在浏览器中打开。

---

## 目录

- [概述](#概述)
- [安全模型](#安全模型)
- [WebSocket 握手](#websocket-握手)
- [应用启动流程](#应用启动流程)
- [网关生命周期](#网关生命周期)
- [故障排查](#故障排查)

---

## 概述

AcaClaw 是一个本地 Web 应用。网关（一个 OpenClaw 进程）运行在 `localhost`，以静态文件的形式提供 UI，并接受 WebSocket 连接。由于网关仅监听回环地址（127.0.0.1 / ::1），无需令牌或密码。

```
┌─────────────────────────── 运行时 ─────────────────────────────────┐
│                                                                     │
│  start.sh  ──启动──▶  网关 (端口 2090, 仅回环)                     │
│            ──打开──▶  浏览器 http://localhost:2090/                 │
│                                                                     │
│  浏览器    ──加载──▶   index.html                                  │
│            ──打开──▶   WebSocket ws://localhost:2090/               │
│            ──等待──▶   网关发送 connect.challenge 事件              │
│            ──发送──▶   connect 请求 (客户端元数据)                  │
│            ──接收──▶   connect 响应 (ok: true)                      │
│            ──就绪──▶   UI 完全可用                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 安全模型

AcaClaw 使用 `gateway.auth.mode = "none"`。网关仅绑定回环地址，外部访问不可能。回环绑定即为安全边界。

| 属性 | 值 |
|---|---|
| 网关绑定 | `127.0.0.1` / `::1` (仅回环) |
| 认证模式 | `none` |
| 远程访问 | 除非用户更改 `gateway.bind`，否则不可能 |
| HTTPS | 不需要 (localhost 流量无法被拦截) |

---

## WebSocket 握手

网关使用 OpenClaw 协议进行握手：

```
  浏览器                           网关
  ──────                           ────
     │                                │
     │◄── WebSocket 连接 ────────────►│
     │                                │
     │◄── 事件: connect.challenge ────│
     │                                │
     │── 请求: connect ──────────────►│  (客户端元数据 + 权限范围)
     │                                │
     │◄── 响应: { ok: true } ────────│
     │                                │
     │   连接已建立                    │
     │   UI 完全可用                   │
```

每 30 秒发送一次心跳（`health` 调用）以保持连接。

---

## 应用启动流程

用户点击桌面图标或运行 `start.sh`：

```
  用户点击图标
       │
       ▼
  start.sh
       │
       ├── 网关是否已运行？（PID 文件检查）
       │   ├── 是 → 跳到浏览器启动
       │   └── 否 → 启动网关，等待 /health (最多 15 秒)
       │
       └── 打开浏览器
           ├── Linux:  xdg-open http://localhost:2090/
           ├── macOS:  open http://localhost:2090/
           └── WSL2:   powershell.exe Start-Process
```

| 平台 | 启动方式 |
|---|---|
| Linux | `xdg-open` |
| macOS | `open` |
| WSL2 | `powershell.exe` (浏览器在 Windows，网关在 WSL) |
| 无界面 | 打印 URL 供手动访问 |

---

## 网关生命周期

| 关注点 | 处理方式 |
|---|---|
| 已在运行？ | 检查 PID 文件 + `kill -0`。存活则跳过启动。 |
| PID 文件过期？ | 进程已终止 → 清理后重新启动。 |
| 健康检查 | 等待 `/health`（最多 15 秒）后再打开浏览器。 |
| PID 追踪 | `~/.acaclaw/gateway.pid` |
| 日志 | `~/.acaclaw/gateway.log` |
| 优雅关闭 | `stop.sh` 发送 SIGTERM，等待 5 秒后 SIGKILL。 |
| 端口 | 默认 2090，可通过 `ACACLAW_PORT` 配置。 |

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

### UI 加载成功但显示"已断开"

页面加载后 WebSocket 连接失败。常见原因：

- **网关崩溃**：检查 `~/.acaclaw/gateway.log` 并使用 `start.sh` 重启。
- **端口变更**：确认 `~/.openclaw/openclaw.json` 中的 `gateway.port` 与浏览器连接的端口一致。
- **网络问题**：确认网关正在监听：`ss -ltnp | grep 2090`。
