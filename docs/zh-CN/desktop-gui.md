---
layout: page
title: Web 界面
lang: zh-CN
permalink: /zh-CN/desktop-gui/
---

> **设计原则**：安装完成后，用户不应再需要终端。监控、配置、技能管理、备份、安全等所有操作都可通过 GUI 完成。

---

## 目录

- [设计理念](#philosophy)
- [架构](#architecture)
- [界面导览](#screen-map)
- [1. 仪表盘（首页）](#1-dashboard-home)
- [2. 智能体监控](#2-agent-monitor)
- [3. 技能与环境](#3-skills-and-environment)
- [4. API 密钥与服务商](#4-api-keys-and-providers)
- [5. 网关与连接](#5-gateway-and-connections)
- [6. 安全、备份与工作区](#6-security-backup-and-workspace)
- [7. 设置向导（浏览器）](#7-setup-wizard-browser-based)
- [AcaClaw 界面包含什么](#what-acaclaws-ui-includes)
- [实现方式](#implementation-approach)
- [桌面启动（浏览器）](#desktop-launch-browser-based)
  - [→ 认证与令牌完整说明](/zh-CN/auth-and-app-launch/)
- [GUI 与 CLI 对照](#gui-to-cli-mapping)

---

## 设计理念 {: #philosophy}

### 尽量少用终端

AcaClaw 面向的不是软件工程师的科研用户。初次安装时可以使用终端（下载、运行安装脚本），但之后每一项操作都必须能通过 Web GUI 完成。

| 阶段 | 需要终端？ | 用户做什么 |
|---|---|---|
| **安装** | 是（一条命令） | 运行安装脚本，随后在浏览器中打开设置向导 |
| **首次启动** | 否 | 向导：选择学科、输入 API 密钥，完成 |
| **日常使用** | 否 | 对话、查看结果、管理文件 |
| **配置** | 否 | GUI 设置面板 |
| **监控** | 否 | 带实时指标的仪表盘 |
| **技能管理** | 否 | 在 GUI 中浏览、安装、更新 |
| **备份 / 恢复** | 否 | 在 GUI 中一键恢复 |
| **故障排查** | 否 | 内置诊断面板 |

### GUI 封装 CLI

GUI 底层调用 OpenClaw 与 AcaClaw 命令。每个 GUI 操作都对应某条 CLI 命令或网关 API。因此：

- 高级用户仍可用 CLI 完成一切
- GUI 从不绕过 CLI，只是可视化封装
- CLI 能做的，GUI 也能做
- GUI 做不了的，普通用户也不应被要求去做

### 一窗多面板

AcaClaw 采用单窗口 + 侧边栏导航。无弹窗、无多窗口管理，避免科研用户迷失界面层级。

---

## 架构 {: #architecture}

### 与 OpenClaw 共存

AcaClaw 可与已有 OpenClaw 安装并存，且不修改对方。这依赖 OpenClaw 的 `--profile` 标志，为 AcaClaw 提供完全隔离的状态目录。

```
~/.openclaw/                  ← OpenClaw（不动，AcaClaw 从不写入）
│   openclaw.json             ← 用户既有配置、API 密钥、模型偏好
│   plugins/                  ← 用户既有插件
│   skills/                   ← 用户既有技能
│   sessions/                 ← 用户既有会话
│
~/.openclaw-acaclaw/          ← AcaClaw 配置文件（由安装程序创建）
│   openclaw.json             ← AcaClaw 配置（$include → ~/.openclaw/openclaw.json）
│   plugins/                  ← 仅 AcaClaw 的插件（backup、security、env、ui 等）
│   skills/                   ← 来自 ClawHub 的学术技能
│   sessions/                 ← AcaClaw 会话
│
~/.acaclaw/                   ← AcaClaw 数据（conda、备份、审计日志）
│   miniforge3/               ← 科学计算 Python/R 环境
│   backups/                  ← 自动文件备份
│   audit/                    ← 安全审计日志
│   config/                   ← AcaClaw 元数据（conda 前缀、设置状态）
```

**配置继承如何工作：**

AcaClaw 在 `~/.openclaw-acaclaw/openclaw.json` 中使用 OpenClaw 的 `$include` 指令继承用户现有设置：

```json
{
  "$include": "~/.openclaw/openclaw.json",
  "gateway": {
    "port": 2090,
    "controlUi": {
      "basePath": "/",
      "root": "~/.openclaw-acaclaw/ui"
    }
  },
  "agents": {
    "defaults": { "workspace": "~/AcaClaw" }
  },
  "tools": { ... },
  "plugins": { ... }
}
```

深度合并行为：AcaClaw 的值（工作区、安全、插件）会覆盖。用户的 API 密钥、模型偏好与通道配置从被 include 的文件流入。若无既有 OpenClaw 安装，则省略 `$include`，AcaClaw 独立运行。

**关键保证：**

| 场景 | 行为 |
|---|---|
| 用户已有 OpenClaw | AcaClaw 通过 `$include` 继承 API 密钥，**从不**写入 `~/.openclaw/` |
| 用户更新 OpenClaw | `npm install -g openclaw@latest` — AcaClaw 不受影响 |
| 用户卸载 AcaClaw | `rm -rf ~/.openclaw-acaclaw ~/.acaclaw` — OpenClaw 不受影响 |
| 用户同时运行两者 | OpenClaw 网关在默认端口，AcaClaw 网关在 2090（不同 profile = 不同进程） |
| 用户先装 AcaClaw | AcaClaw 创建独立配置，之后安装的 OpenClaw 与之分离 |

### 两套 UI，两个网关

AcaClaw 自带浏览器 UI — 基于 Lit 的独立 SPA，面向学术工作流。OpenClaw 内置管理后台在默认网关上运行，供高级功能使用。

两个网关、两个端口、同一 WebSocket API。两个前端，服务不同人群。

```
http://localhost:2090           → AcaClaw UI  （科研工作区）
http://localhost:18789          → OpenClaw UI（通道、调试、cron — 不变）
```

```
┌───────────────────────────────────────────────────────────┐
│  Browser                                                   │
│                                                            │
│  ┌──────── :2090 ────────────┐  ┌──── :18789 ──────────┐  │
│  │  AcaClaw UI               │  │  OpenClaw UI          │  │
│  │  (academic workspace)     │  │  (full admin)         │  │
│  │                           │  │                       │  │
│  │  ┌─────────┐ ┌────────┐  │  │  13 tabs:             │  │
│  │  │ Sidebar  │ │ Main   │  │  │  chat, overview,      │  │
│  │  │          │ │ area   │  │  │  channels, instances,  │  │
│  │  │ Overview │ │        │  │  │  sessions, usage,      │  │
│  │  │ Chat     │ │        │  │  │  cron, agents, skills, │  │
│  │  │ Usage    │ │        │  │  │  nodes, config,        │  │
│  │  │ Skills   │ │        │  │  │  debug, logs           │  │
│  │  │ Environ. │ │        │  │  │                       │  │
│  │  │ Backup   │ │        │  │  │  (unchanged, served   │  │
│  │  │ Settings │ │        │  │  │   by default gateway) │  │
│  │  └─────────┘ └────────┘  │  └───────────────────────┘  │
│  └───────────┬───────────────┘             │               │
│              │          WebSocket (JSON-RPC)│               │
│              │                             │               │
├──────────────┼─────────────────────────────┼───────────────┤
│  AcaClaw 网关 (port 2090)    OpenClaw 网关 (18789)        │
│              ▼                             ▼               │
│  ┌──────────────────────────┐  ┌──────────────────────┐   │
│  │  controlUi 服务           │  │  默认 OpenClaw        │   │
│  │  AcaClaw SPA at /        │  │  控制面板              │   │
│  │                          │  │                       │   │
│  │  WebSocket methods:      │  │  WebSocket methods:   │   │
│  │  health · config ·       │  │  同一 API 接口         │   │
│  │  sessions · skills ·     │  │                       │   │
│  │  agent · ...             │  │                       │   │
│  │                          │  │                       │   │
│  │  AcaClaw 插件方法:        │  │                       │   │
│  │  acaclaw.env.*           │  │                       │   │
│  │  acaclaw.backup.*        │  │                       │   │
│  └──────────────────────────┘  └──────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

### 工作原理

AcaClaw 运行专用网关进程（`acaclaw-gateway.service`）在端口 2090。网关的 `controlUi` 中间件从 `~/.openclaw-acaclaw/ui/` 服务 AcaClaw SPA。OpenClaw 默认网关（`openclaw-gateway.service`）在端口 18789 独立运行，提供自带的控制面板。

AcaClaw 的配置：

```json
{
  "gateway": {
    "controlUi": {
      "basePath": "/",
      "root": "~/.openclaw-acaclaw/ui"
    }
  }
}
```

AcaClaw 的 UI 插件也在 `/` 注册前缀路由，用于注入认证令牌并放行保留网关路径：

```typescript
api.registerHttpRoute({
  path: "/",
  match: "prefix",
  auth: "gateway",
  handler: async (req, res, next) => {
    // Pass through reserved gateway paths — these are handled
    // by lower-priority middleware (health probes at priority 13, etc.)
    const reserved = ["/health", "/ready", "/api/", "/plugins/", "/admin"];
    if (reserved.some((p) => req.url.startsWith(p))) return next();

    // Serve AcaClaw's built SPA (static files + index.html fallback)
  },
});
```

处理器必须放行保留路径。AcaClaw 的前缀路由在网关 HTTP 管线中优先级为 10 — 早于健康/就绪探测（优先级 13）。若无排除，`GET /health` 会返回 AcaClaw 的 `index.html` 而非探测响应。排除列表小而稳定 — OpenClaw 自带控制 UI 使用同一集合。

### 为何使用独立网关

AcaClaw 在端口 2090 运行自己的网关，OpenClaw 默认网关保持在端口 18789。这避免了两套 SPA 在同一端口的路由冲突。科研用户输入 `localhost:2090` 即可直达 AcaClaw 工作区。高级用户可通过 `localhost:18789` 或 AcaClaw 设置中的"OpenClaw"标签页访问完整的 OpenClaw 控制面板。

### URL 路由

AcaClaw SPA 在端口 2090 处理所有客户端路由。OpenClaw 控制面板在端口 18789 独立运行。

| URL | 网关 | 视图 |
|---|---|---|
| `localhost:2090/` | AcaClaw | 概览（健康、用量、快捷操作） |
| `localhost:2090/chat` | AcaClaw | 对话界面 |
| `localhost:2090/usage` | AcaClaw | 用量追踪 |
| `localhost:2090/skills` | AcaClaw | 技能浏览器 |
| `localhost:2090/environment` | AcaClaw | Conda 环境查看器 |
| `localhost:2090/backup` | AcaClaw | 备份管理 |
| `localhost:2090/settings` | AcaClaw | 设置 + "OpenClaw" 标签页 → 打开控制面板 |
| `localhost:18789/` | OpenClaw | OpenClaw 控制面板 |
| `localhost:18789/chat` | OpenClaw | OpenClaw 对话 |
| `localhost:18789/config` | OpenClaw | 完整配置编辑器 |
| `localhost:18789/channels` | OpenClaw | 通道管理 |
| `localhost:18789/debug` | OpenClaw | 调试检查器 |
| `localhost:2090/api/*` | AcaClaw | REST API（网关） |
| `localhost:2090/health` | AcaClaw | 健康探测 |

无路径冲突 — 各网关独立服务自己的 UI。

### 为何不做成一套 UI？

| 做法 | 问题 |
|---|---|
| **Fork OpenClaw UI** | 需维护 fork — 每次 OpenClaw UI 更新都要合并。 |
| **扩展 OpenClaw UI** | 导航写死 — 无插件 API 增删标签页。 |
| **完全替换** | 需要通道、cron 或调试的用户失去入口。 |
| **两套 UI、两个网关** | AcaClaw 自建清晰 UI 在端口 2090；OpenClaw 控制面板在端口 18789 不变；无需 fork；两类用户都照顾到。 |

### 各 UI 提供什么

| 功能 | AcaClaw UI（`:2090`） | OpenClaw UI（`:18789`） |
|---|---|---|
| 概览仪表盘 | 学术工作区（健康、用量、快捷操作） | 网关视角（在线时间、认证、设备配对） |
| 对话 | ✓ | ✓ |
| 用量追踪 | ✓ | ✓ |
| 技能浏览器 | ✓ | ✓ |
| 配置编辑器 | ✓（带预设的简化版） | ✓（完整 schema 驱动表单） |
| 会话 | ✓ | ✓ |
| 智能体管理 | ✓ | ✓ |
| 环境（Conda） | ✓ | — |
| 备份管理 | ✓ | — |
| 审计日志 | ✓ | — |
| 设置向导 | ✓ | — |
| 通道（WhatsApp、Telegram 等） | — | ✓ |
| 实例（Instances） | — | ✓ |
| Cron | — | ✓ |
| 节点（设备配对） | — | ✓ |
| 调试检查器 | — | ✓ |
| 日志 | —（经审计日志） | ✓ |

日常科研用 AcaClaw（`:2090`）。若需要通道或调试，设置页"OpenClaw"标签页可打开 `localhost:18789` 控制面板。

### 视觉差异

| OpenClaw UI（`:18789`） | AcaClaw UI（`:2090`） |
|---|---|
| 面向高级用户的管理台 | 面向科研用户的工作区 |
| 4 组共 13 个标签 | 7 个标签，扁平侧边栏 |
| 红色强调色（#ff5c5c） | 学术蓝/青绿强调色 |
| 「OpenClaw」品牌 | 「AcaClaw」品牌与 Logo |
| 以通道为中心的概览 | 以研究为中心、带健康分的概览 |
| 原始配置编辑器 | 带预设的简化设置 |

### 技术栈

| 组件 | 技术 | 理由 |
|---|---|---|
| UI 框架 | Lit（Web Components） | 与 OpenClaw 一致 — 可复用共享组件 |
| 状态管理 | Lit signals | 与 OpenClaw 响应式模式一致 |
| 网关通信 | WebSocket JSON-RPC | 使用既有网关协议 |
| 样式 | CSS 自定义属性 | AcaClaw 自有 `base.css` 与学术配色 |
| 构建工具 | Vite | 输出到 `dist/`，由插件 HTTP 路由提供 |
| 服务方式 | AcaClaw 插件（`registerHttpRoute`） | 同端口、同进程、零额外开销 |

### 插件网关方法

AcaClaw 插件注册自定义 WebSocket 方法，两套 UI 均可调用（但只有 AcaClaw UI 有对应面板）：

| 方法 | 作用 |
|---|---|
| `acaclaw.env.install` | 安装学科软件包（后台运行 `conda env create`） |
| `acaclaw.env.list` | 列出 Conda 环境与已安装包 |
| `acaclaw.env.activate` | 切换活动环境 |
| `acaclaw.backup.list` | 列出文件备份与版本 |
| `acaclaw.backup.restore` | 将文件恢复到先前版本 |
| `acaclaw.workspace.info` | 获取工作区元数据（学科、大小、文件数） |
| `acaclaw.audit.query` | 按条件查询审计日志 |

---

## 界面导览 {: #screen-map}

```
┌───────────────────────────────────────────────────────────┐
│  AcaClaw                                          ─ □ ×   │
├──────────────┬────────────────────────────────────────────┤
│              │                                            │
│  📊 Overview │  [Active panel content area]               │
│  Today's     │                                            │
│  status      │                                            │
│              │                                            │
│  💬 Chat     │                                            │
│  Ask         │                                            │
│  questions   │                                            │
│              │                                            │
│  📈 Usage    │                                            │
│  Budget &    │                                            │
│  costs       │                                            │
│              │                                            │
│  🧩 Skills   │                                            │
│  Tools &     │                                            │
│  abilities   │                                            │
│              │                                            │
│  🔬 Environ. │                                            │
│  Python, R,  │                                            │
│  packages    │                                            │
│              │                                            │
│  💾 Backup   │                                            │
│  File        │                                            │
│  history     │                                            │
│              │                                            │
│  ⚙️ Settings │                                            │
│  Security &  │                                            │
│  connections │                                            │
│              │                                            │
├──────────────┴────────────────────────────────────────────┤
│  Gateway: ● Running   │  Agent: idle   │  ▲ 1.2K tokens  │
└───────────────────────────────────────────────────────────┘
```

### 侧边栏分区

| 标签页 | 用途 | 网关方法 |
|---|---|---|
| **Overview** | 健康分、用量摘要、活动智能体、最近活动 | `health`、`usage.cost`、`sessions.list` |
| **Chat** | 发消息、查看对话、会话历史 | `send`、`agent`、`sessions.preview` |
| **Usage** | Token/费用追踪、每日图表、按模型分解、CSV 导出 | `usage.cost` |
| **Skills** | 浏览已安装、从 ClawHub 安装、更新、启用/禁用 | `skills.status`、`skills.install`、`skills.update` |
| **Environment** | Conda 环境、已装包、学科选择、安装 R | `acaclaw.env.list`、`acaclaw.env.install`、`acaclaw.env.activate` |
| **Backup** | 文件备份、带 diff 的恢复、保留策略、回收站 | `acaclaw.backup.list`、`acaclaw.backup.restore` |
| **Settings** | 安全级别、API 密钥、网关配置、工作区路径、审计日志 | `config.set`、`config.get`、`acaclaw.audit.query` |

---

## 1. 仪表盘（首页） {: #1-dashboard-home}

用户首先看到的内容：所有重要信息的实时总览。

### 布局

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard                                               │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Token Usage      │  │  System Resources            │ │
│  │                   │  │                              │ │
│  │  Today: 12.4K     │  │  CPU  ████░░░░░░  38%       │ │
│  │  This week: 89K   │  │  RAM  ██████░░░░  62%       │ │
│  │  Cost: $0.42      │  │  Disk ████████░░  78%       │ │
│  │                   │  │                              │ │
│  │  [View details →] │  │  Workspace: 2.1 GB          │ │
│  └──────────────────┘  └──────────────────────────────┘ │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Agent Status     │  │  Quick Actions               │ │
│  │                   │  │                              │ │
│  │  ● Idle           │  │  [💬 New Chat]               │ │
│  │  Last active: 2m  │  │  [📊 Analyze Data]           │ │
│  │  Session: #12     │  │  [🔍 Search Papers]          │ │
│  │  Model: Claude 4  │  │  [📝 Write Document]         │ │
│  └──────────────────┘  └──────────────────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Recent Activity                                      ││
│  │  14:32  Analyzed experiment-results.csv — 3 figures   ││
│  │  14:28  Backed up manuscript-draft.docx               ││
│  │  14:15  Installed skill: bio-tools v1.2.0             ││
│  │  13:50  Paper search: "CRISPR delivery" — 12 results  ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### Token 用量卡片

| 指标 | 来源 | 更新频率 |
|---|---|---|
| 当日 Token（输入/输出） | 按日分组的 `usage.cost` | 每条消息后 |
| 本周/本月 Token | `usage.cost` 日期范围 | 每条消息后 |
| 估算费用 | `usage.cost` 与模型定价 | 每条消息后 |
| 按模型费用 | 按模型分组的 `usage.cost` | 打开面板时 |
| 按智能体费用 | 按智能体分组的 `usage.cost` | 打开面板时 |
| 每日趋势图 | `usage.cost` 30 日历史 | 打开面板时 |

**详情视图**（点击 `View details`）：
- 柱状图：每日 Token 用量（输入 vs 输出）
- 饼图：按服务商/模型的费用占比
- 表格：各会话用量（模型、Token、费用）
- 导出：将用量数据下载为 CSV

### 系统资源卡片

| 指标 | 来源 | 更新频率 |
|---|---|---|
| CPU 使用率（%） | 操作系统 API（经 Node.js `os.cpus()`） | 每 5 秒 |
| 内存（已用/总计） | 操作系统 API（经 Node.js `os.totalmem`/`freemem`） | 每 5 秒 |
| 磁盘（工作区） | 对工作区路径的 `fs.statfs()` | 每 60 秒 |
| 工作区大小 | 递归目录大小 | 每 60 秒 |
| Conda 环境大小 | `~/.acaclaw/miniforge3` 的大小 | 打开面板时 |
| 备份占用空间 | `~/.acaclaw/backups/` 的大小 | 打开面板时 |

**告警**：
- 磁盘 > 90%：黄色警告条
- 磁盘 > 95%：红色警告并提示释放空间
- 智能体运行期间内存 > 90%：建议降低并发

### 智能体状态卡片

| 字段 | 来源 |
|---|---|
| 状态（空闲 / 运行中 / 出错） | 网关 `health` |
| 当前模型 | `config.get` agents.defaults.model |
| 活动会话 | `sessions.list` + 当前会话 ID |
| 最近活动时间 | 会话元数据 |
| 正在运行的工具（若有） | 智能体流式事件 |

### 最近活动 feed

来自审计日志（`~/.acaclaw/audit/`）。显示最近 20 条事件：

- 工具调用（文件修改、检索、分析）
- 备份事件
- 技能安装/更新
- 配置变更
- 安全告警

---

## 2. 智能体监控 {: #2-agent-monitor}

实时查看智能体工作：调用了哪些工具、读写哪些文件、每次操作消耗多少 Token。

### 布局

```
┌─────────────────────────────────────────────────────────┐
│  Agent Monitor                                           │
│                                                          │
│  Status: ● Running          Model: Claude 4 Opus         │
│  Session: #12 — "Analyze CRISPR data"                    │
│  Tokens: 4,281 input · 1,923 output · $0.08              │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Live Tool Calls                                      ││
│  │                                                       ││
│  │  14:32:05  ▶ read_file("data/raw/experiment.csv")     ││
│  │            ✓ 2,481 bytes read                         ││
│  │                                                       ││
│  │  14:32:08  ▶ execute_code("import pandas as pd...")   ││
│  │            ✓ DataFrame: 150 rows × 8 columns          ││
│  │            ⚙ Env: acaclaw-bio (Python 3.12)           ││
│  │                                                       ││
│  │  14:32:12  ▶ write_file("figures/crispr-compare.png") ││
│  │            ✓ 48 KB written                            ││
│  │            💾 Backup created                           ││
│  │                                                       ││
│  │  14:32:14  ▶ write_file("data/processed/results.csv") ││
│  │            ⏳ In progress...                           ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  [⏸ Pause]  [⏹ Stop]  [📋 Copy Log]                     │
└─────────────────────────────────────────────────────────┘
```

### 用户可见信息

| 信息 | 来源 | 为何重要 |
|---|---|---|
| 当前智能体状态 | 网关智能体流式输出 | 判断在工作还是卡住 |
| 实时每条工具调用 | 智能体工具调用事件 | 理解 AI 在做什么 |
| 读写的文件 | 工具调用参数 | 跟踪触及哪些文件 |
| 备份确认 | 备份插件事件 | 确认数据已保护 |
| Token 数（累计） | 会话用量追踪 | 成本意识 |
| 活动 Conda 环境 | 学术环境插件上下文 | 可知可用哪些包 |
| 错误与重试 | 智能体错误事件 | 无需终端即可诊断失败 |

### 用户可执行操作

| 操作 | 效果 | 网关方法 |
|---|---|---|
| 暂停智能体 | 挂起当前任务（可稍后恢复） | 智能体控制 API |
| 停止智能体 | 取消当前任务 | 智能体取消 |
| 复制日志 | 将工具调用历史复制到剪贴板 | 本地 |
| 打开文件 | 在系统文件管理器中打开提及的文件 | 本地 `shell.openPath()` |
| 查看会话历史 | 切换到会话转写视图 | `sessions.preview` |

---

## 3. 技能与环境 {: #3-skills-and-environment}

浏览已安装技能、从 ClawHub 安装新技能、查看计算环境 — 全程无需终端。

### 技能标签页

```
┌─────────────────────────────────────────────────────────┐
│  Skills & Environment                                    │
│                                                          │
│  [Installed]  [ClawHub]  [Environment]                   │
│                                                          │
│  ── Installed Skills ─────────────────────────────────── │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  📄 paper-search                          v1.2.0     ││
│  │  Search arXiv, PubMed, Semantic Scholar, CrossRef    ││
│  │  Source: ClawHub · Category: Core Academic           ││
│  │  [Update Available: v1.3.0]  [Disable]               ││
│  ├──────────────────────────────────────────────────────┤│
│  │  📊 data-analyst                          v2.0.1     ││
│  │  Statistical analysis from natural language          ││
│  │  Source: ClawHub · Category: Core Academic           ││
│  │  ✓ Up to date  [Disable]                            ││
│  ├──────────────────────────────────────────────────────┤│
│  │  🧬 bio-tools                             v1.0.3     ││
│  │  Biopython, sequence analysis, genomics              ││
│  │  Source: ClawHub · Category: Biology                 ││
│  │  Env: acaclaw-bio  ✓ Up to date  [Disable]          ││
│  ├──────────────────────────────────────────────────────┤│
│  │  📔 nano-pdf                              (bundled)  ││
│  │  Read and extract text from PDF files                ││
│  │  Source: OpenClaw · Category: Foundation             ││
│  │  (Cannot disable — bundled with OpenClaw)            ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  10 skills installed · 4 core · 1 discipline · 4 bundled │
└─────────────────────────────────────────────────────────┘
```

### ClawHub 标签页

```
┌─────────────────────────────────────────────────────────┐
│  [Installed]  [ClawHub]  [Environment]                   │
│                                                          │
│  Search ClawHub: [________________________] [🔍]         │
│                                                          │
│  ── Recommended by AcaClaw ──────────────────────────── │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  🔬 gel-analyzer                    ★ 4.8 (23 users) ││
│  │  Analyze gel electrophoresis images                   ││
│  │  By @labtech · Category: Biology                     ││
│  │  🏷️ AcaClaw Recommended                              ││
│  │  [Install]                                           ││
│  ├──────────────────────────────────────────────────────┤│
│  │  📐 cad-viewer                      ★ 4.5 (12 users) ││
│  │  View and annotate CAD files for engineering papers   ││
│  │  By @mech-eng · Category: Engineering                ││
│  │  [Install]                                           ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ── All ClawHub Skills ──────────────────────────────── │
│  (browse by category, rating, recency)                   │
└─────────────────────────────────────────────────────────┘
```

### 环境标签页

```
┌─────────────────────────────────────────────────────────┐
│  [Installed]  [ClawHub]  [Environment]                   │
│                                                          │
│  ── Active Environment ──────────────────────────────── │
│                                                          │
│  Name: acaclaw-bio                                       │
│  Python: 3.12.8                                          │
│  R: not installed                    [Install R]         │
│  Conda: Miniforge 24.11                                  │
│  Path: ~/.acaclaw/miniforge3/envs/acaclaw-bio            │
│  Size: 1.8 GB                                            │
│                                                          │
│  ── Installed Packages (142) ────────────────────────── │
│                                                          │
│  Search: [________________________] [🔍]                  │
│                                                          │
│  │ Package        │ Version │ Channel     │ Required by │ │
│  │────────────────│─────────│─────────────│─────────────│ │
│  │ numpy          │ 1.26.4  │ conda-forge │ (base)      │ │
│  │ scipy          │ 1.14.1  │ conda-forge │ (base)      │ │
│  │ pandas         │ 2.2.3   │ conda-forge │ (base)      │ │
│  │ biopython      │ 1.84    │ conda-forge │ bio-tools   │ │
│  │ matplotlib     │ 3.9.3   │ conda-forge │ (base)      │ │
│  │ ...            │         │             │             │ │
│                                                          │
│  ── Other Environments ──────────────────────────────── │
│                                                          │
│  acaclaw (base)       1.4 GB   ✓ Active                  │
│  acaclaw-bio          1.8 GB   ← Current                 │
│  acaclaw-chem         1.6 GB   ✓ Available               │
└─────────────────────────────────────────────────────────┘
```

### 技能相关操作

所有操作均在浏览器 GUI 中完成，无需终端。

| 操作 | GUI 元素 | 底层行为 |
|---|---|---|
| 从 ClawHub 安装 | `Install` 按钮 | 网关方法 `skills.install` — 下载并解压技能 |
| 更新技能 | `Update` 按钮（有更新时显示） | 网关方法 `skills.update` |
| 禁用技能 | `Disable` 开关 | 从活动技能列表移除（未卸载） |
| 查看技能详情 | 点击技能名 | 显示 SKILL.md、贡献者、变更日志 |
| 安装 R | `Install R` 按钮 | 插件方法 `acaclaw.env.install` — 后台运行 `conda install r-base r-irkernel` |
| 添加学科软件包 | 环境标签页的 `Add Discipline` 按钮 | 插件方法 `acaclaw.env.install` — 创建/扩展带学科包的 Conda 环境 |
| 搜索软件包 | 环境标签页搜索框 | 过滤已安装包 |
| 切换环境 | 点击环境名 | 设置 AI 上下文的活动环境 |

### 无终端时软件包如何安装

用户点击技能的 `Install` 或软件包的 `Add Discipline` 时，浏览器向网关发送 WebSocket 消息。网关（或 AcaClaw 插件）在后台进程执行实际命令（`clawhub install`、`conda install`、`conda env create`）。浏览器显示进度条，用户不会看到终端。

```
  Browser                    Gateway                     System
  ───────                    ───────                     ──────
  [Install bio-tools] ──→  skills.install("bio-tools")  → clawhub install bio-tools
                             ↓ progress events             ↓ download + extract
  [████████░░ 80%]  ←──   WebSocket progress updates    ← done
  [✓ Installed]     ←──   success response

  [Add Chemistry]   ──→  acaclaw.env.install("chem")    → conda env create -f environment-chem.yml
                             ↓ progress events             ↓ install packages
  [████████░░ 60%]  ←──   WebSocket progress updates    ← done
  [✓ Chemistry added] ←── success response
```

---

## 4. API 密钥与服务商 {: #4-api-keys-and-providers}

配置 AI 服务商、API 密钥与模型选择。敏感字段默认遮罩。

### 布局

```
┌─────────────────────────────────────────────────────────┐
│  API Keys & Providers                                    │
│                                                          │
│  ── AI Providers ────────────────────────────────────── │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Anthropic                              ● Connected  ││
│  │  API Key: sk-ant-•••••••••••••••••c4    [👁] [Edit]  ││
│  │  Default model: Claude 4 Opus                        ││
│  │  Models available: Sonnet, Opus, Haiku               ││
│  │  Usage this month: $12.40                            ││
│  ├──────────────────────────────────────────────────────┤│
│  │  OpenAI                                 ○ Not set    ││
│  │  API Key: [________________________]    [Save]       ││
│  ├──────────────────────────────────────────────────────┤│
│  │  Google AI                              ○ Not set    ││
│  │  API Key: [________________________]    [Save]       ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ── Default Model ───────────────────────────────────── │
│                                                          │
│  Model: [Claude 4 Opus          ▾]                       │
│  Provider: Anthropic (auto-detected)                     │
│                                                          │
│  ── Web Access ──────────────────────────────────────── │
│                                                          │
│  OpenClaw Web Login                                      │
│  Status: ● Logged in as davy@example.com                 │
│  [Log out]  [Refresh credentials]                        │
│                                                          │
│  Web provider credentials are stored at                  │
│  ~/.openclaw/credentials/ (encrypted)                    │
└─────────────────────────────────────────────────────────┘
```

### 服务商配置

| 操作 | GUI 元素 | 网关方法 |
|---|---|---|
| 设置 API 密钥 | 文本输入（遮罩） | `config.set` models.providers.{provider}.apiKey |
| 移除 API 密钥 | `Remove` 按钮 | `config.set` models.providers.{provider}.apiKey = "" |
| 选择默认模型 | 下拉框 | `config.set` agents.defaults.model |
| 测试连接 | `Test` 按钮 | `models.list`（校验密钥） |
| 查看 Web 登录状态 | 状态指示 | Web 服务商的 `channels.status` |
| 登录 OpenClaw Web | `Log in` 按钮 | `openclaw login` 流程 |
| 退出登录 | `Log out` 按钮 | `openclaw logout` |

### 安全注意

- API 密钥默认以 `•` 遮罩；点击眼睛图标可显示
- 密钥从不写入审计轨迹
- 密钥保存在 `openclaw.json`，文件权限为仅所有者可读写（`0o600`）
- GUI 在任何日志或错误信息中都不会完整显示密钥

---

## 5. 网关与连接 {: #5-gateway-and-connections}

配置网关运行方式、连接移动应用并管理远程访问。

### 布局

```
┌─────────────────────────────────────────────────────────┐
│  Gateway & Connections                                   │
│                                                          │
│  ── Gateway Status ──────────────────────────────────── │
│                                                          │
│  Status: ● Running                                       │
│  Bind: 127.0.0.1:2090 (loopback)                        │
│  Uptime: 2h 14m                                          │
│  Connected clients: 2 (web UI, iOS app)                  │
│                                                          │
│  [Restart Gateway]  [View Logs]                          │
│                                                          │
│  ── Bind Mode ───────────────────────────────────────── │
│                                                          │
│  (●) Loopback — local only (recommended)                 │
│  ( ) Tailnet — Tailscale network                         │
│  ( ) LAN — local network (⚠ requires auth token)        │
│  ( ) Custom — specify address                            │
│                                                          │
│  Port: [2090]                                           │
│                                                          │
│  ── Mobile App Connection ───────────────────────────── │
│                                                          │
│  ┌────────────────────┐                                  │
│  │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  │  Scan this QR code with the     │
│  │  █ ▄▄▄▄▄ █▄█ ▄█▄█ │  AcaClaw mobile app to connect.  │
│  │  █ █   █ █▀█▄██ █ │                                  │
│  │  █ ▀▀▀▀▀ █▀▄█▀▄ █ │  Or enter manually:              │
│  │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  │  Host: 192.168.1.42              │
│  └────────────────────┘  Port: 2090                     │
│                          Token: ••••••••                  │
│                          [Show Token] [Regenerate]        │
│                                                          │
│  ── Paired Devices ──────────────────────────────────── │
│                                                          │
│  │ Device           │ Platform │ Status    │ Last seen  │ │
│  │──────────────────│──────────│───────────│────────────│ │
│  │ Davy's iPhone    │ iOS 19   │ ● Online  │ now        │ │
│  │ Lab iPad         │ iPadOS   │ ○ Offline │ 2h ago     │ │
│  │                                                       │
│  [Unpair Device]                                         │
│                                                          │
│  ── Auth Token ──────────────────────────────────────── │
│                                                          │
│  Current token: ••••••••••••  [Show] [Regenerate]        │
│  Auth mode: [Token ▾]                                    │
│                                                          │
│  ── TLS (for non-loopback) ──────────────────────────── │
│                                                          │
│  ☑ Require TLS for remote connections                    │
│  Cert: [_______________________] [Browse]                │
│  Key:  [_______________________] [Browse]                │
└─────────────────────────────────────────────────────────┘
```

### 连接相关操作

| 操作 | GUI 元素 | 网关方法 |
|---|---|---|
| 重启网关 | 按钮 | 结束并重启网关进程 |
| 更改绑定模式 | 单选按钮 | `config.set` gateway.bind |
| 更改端口 | 数字输入 | `config.set` gateway.port |
| 生成配对二维码 | 自动（非 loopback 时显示） | `node.pair.request` |
| 配对移动设备 | 移动端扫码 | `node.pair.approve` |
| 取消配对 | 每设备按钮 | `node.unpair` |
| 重新生成认证令牌 | 按钮 | `config.set` gateway.auth.token（新随机值） |
| 查看网关日志 | 按钮 → 日志查看面板 | 读取网关日志文件 |
| 配置 TLS | 证书/密钥文件选择 | `config.set` gateway.tls.* |

### 安全升级

当用户从 Loopback 切换到任意非 loopback 模式时：

1. **警告对话框**说明安全影响
2. **要求认证令牌** — 若未设置则自动生成
3. **建议 TLS** — 提示配置证书
4. **事件写入**审计轨迹
5. **需确认** — 「我已了解风险」

---

## 6. 安全、备份与工作区 {: #6-security-backup-and-workspace}

数据保护、安全策略与工作区管理相关的三个面板。

### 安全面板

```
┌─────────────────────────────────────────────────────────┐
│  Security                                                │
│                                                          │
│  [Security Tier]  [Rules]  [Audit Log]                   │
│                                                          │
│  ── Security Tier ───────────────────────────────────── │
│                                                          │
│  Current: Tier 1 — Local Workspace (Default)             │
│                                                          │
│  (●) Tier 1: Local Workspace                             │
│      Workspace confinement, deny-lists, backup,          │
│      credential scrubbing. No Docker required.           │
│                                                          │
│  ( ) Tier 2: Remote Access                               │
│      Tier 1 + TLS, auth tokens, scoped logging.          │
│      ⚠ Exposes gateway beyond localhost.                 │
│                                                          │
│  ( ) Tier 3: Docker Sandbox                              │
│      Full container isolation. All code runs in          │
│      a disposable Docker container.                      │
│      Requires: Docker installed and running.             │
│      [Check Docker Status]                               │
│                                                          │
│  ── Active Controls ─────────────────────────────────── │
│                                                          │
│  ✓ Workspace confinement (workspaceOnly: true)           │
│  ✓ Tool deny-list (8 tools blocked)                      │
│  ✓ Command deny-list (15 patterns blocked)               │
│  ✓ Network allowlist (academic domains only)             │
│  ✓ Credential scrubbing (12 patterns)                    │
│  ✓ Prompt injection detection (8 patterns)               │
│  ✓ Pre-modification backup                               │
│  ✓ Audit logging                                         │
└─────────────────────────────────────────────────────────┘
```

### 安全规则标签页

```
┌─────────────────────────────────────────────────────────┐
│  [Security Tier]  [Rules]  [Audit Log]                   │
│                                                          │
│  ── Tool Policy ─────────────────────────────────────── │
│                                                          │
│  Denied tools:                                           │
│  ☑ gateway        ☑ cron           ☑ sessions_spawn      │
│  ☑ plugin_manage  ☐ web_fetch      ☐ image_gen           │
│  [Add custom deny rule...]                               │
│                                                          │
│  ── Command Deny-List ───────────────────────────────── │
│                                                          │
│  ☑ rm -rf /       ☑ chmod 777      ☑ curl | sh           │
│  ☑ dd if=         ☑ mkfs           ☑ iptables            │
│  ... (15 patterns)                                       │
│  [Add custom pattern...]                                 │
│                                                          │
│  ── Network Allowlist ───────────────────────────────── │
│                                                          │
│  Allowed domains:                                        │
│  ☑ arxiv.org             ☑ api.semanticscholar.org       │
│  ☑ eutils.ncbi.nlm.nih.gov  ☑ api.crossref.org          │
│  ☑ pypi.org              ☑ github.com                    │
│  [Add domain...]                                         │
│                                                          │
│  ── Execution Approvals ─────────────────────────────── │
│                                                          │
│  Shell commands require approval: [Always ▾]             │
│  (Always / First time only / Never)                      │
└─────────────────────────────────────────────────────────┘
```

### 审计日志标签页

```
┌─────────────────────────────────────────────────────────┐
│  [Security Tier]  [Rules]  [Audit Log]                   │
│                                                          │
│  Filter: [All ▾]  Date: [Today ▾]  [Export CSV]          │
│                                                          │
│  │ Time     │ Event              │ Detail                │
│  │──────────│────────────────────│──────────────────────│
│  │ 14:32:05 │ tool_call          │ read_file(experiment │
│  │          │                    │ .csv)                │
│  │ 14:32:08 │ tool_call          │ execute_code(pandas  │
│  │          │                    │ analysis)            │
│  │ 14:32:10 │ backup_created     │ experiment.csv →     │
│  │          │                    │ backup 2026-03-14    │
│  │ 14:32:12 │ tool_call          │ write_file(crispr-   │
│  │          │                    │ compare.png)         │
│  │ 14:30:00 │ credential_scrub   │ Stripped OpenAI key  │
│  │          │                    │ from output          │
│  │ 14:28:00 │ config_change      │ gateway.port 2090   │
│  │          │                    │ → 18790              │
│                                                          │
│  Showing 42 events today                                 │
└─────────────────────────────────────────────────────────┘
```

### 备份面板

```
┌─────────────────────────────────────────────────────────┐
│  Backup                                                  │
│                                                          │
│  [File Backups]  [Trash]  [Snapshots]  [Settings]        │
│                                                          │
│  ── File Backups ────────────────────────────────────── │
│                                                          │
│  Workspace: ~/AcaClaw/                                   │
│  Backup location: ~/.acaclaw/backups/AcaClaw-a1b2c3d4/   │
│  Total backup size: 148 MB                               │
│  Files backed up: 234                                    │
│                                                          │
│  Search: [________________________] [🔍]                  │
│                                                          │
│  ── Today (March 14) ────────────────────────────────── │
│                                                          │
│  │ Time     │ File                    │ Size  │ Action  │ │
│  │──────────│─────────────────────────│───────│─────────│ │
│  │ 14:32:10 │ data/experiment.csv     │ 24 KB │[Restore]│ │
│  │ 14:28:05 │ documents/manuscript.docx│ 1.2MB│[Restore]│ │
│  │ 13:50:22 │ references/refs.bib     │ 8 KB  │[Restore]│ │
│                                                          │
│  ── Yesterday ───────────────────────────────────────── │
│  │ 16:10:30 │ figures/plot-v2.png     │ 48 KB │[Restore]│ │
│  │ ...                                                   │
│                                                          │
│  [Restore] opens a diff view (current vs backup)         │
│  before applying the restore.                            │
└─────────────────────────────────────────────────────────┘
```

### 备份设置标签页

```
┌─────────────────────────────────────────────────────────┐
│  [File Backups]  [Trash]  [Snapshots]  [Settings]        │
│                                                          │
│  ── Retention Policy ────────────────────────────────── │
│                                                          │
│  Keep file backups for: [30 days ▾]                      │
│  (7 days / 30 days / 90 days / Forever)                  │
│                                                          │
│  Maximum backup storage: [5 GB ▾]                        │
│  (1 GB / 5 GB / 10 GB / Unlimited)                       │
│                                                          │
│  ── Periodic Sync (Layer A3) ────────────────────────── │
│                                                          │
│  ☑ Sync workspace changes periodically                   │
│  Interval: [15 minutes ▾]                                │
│                                                          │
│  ── Workspace Snapshots (Layer B) ───────────────────── │
│                                                          │
│  ☐ Enable full workspace snapshots (off by default)      │
│  Schedule: [Daily at midnight ▾]                         │
│  Max snapshot storage: [10 GB ▾]                         │
│                                                          │
│  ── Trash ───────────────────────────────────────────── │
│                                                          │
│  Empty trash after: [30 days ▾]                          │
│  Current trash size: 12 MB                               │
│  [Empty Trash Now]                                       │
└─────────────────────────────────────────────────────────┘
```

### 工作区面板

```
┌─────────────────────────────────────────────────────────┐
│  Workspace                                               │
│                                                          │
│  ── Current Workspace ───────────────────────────────── │
│                                                          │
│  Path: ~/AcaClaw/                       [Open in Finder] │
│  Size: 2.1 GB                                            │
│  Files: 1,842                                            │
│  Discipline: Biology                                     │
│  Created: 2026-02-15                                     │
│                                                          │
│  ── Directory Structure ─────────────────────────────── │
│                                                          │
│  📁 data/                                                │
│  ├── 📁 raw/           (328 MB, 45 files) — read-only   │
│  └── 📁 processed/     (892 MB, 120 files)               │
│  📁 documents/                                           │
│  ├── 📁 drafts/        (24 MB, 8 files)                  │
│  └── 📁 final/         (12 MB, 3 files)                  │
│  📁 figures/            (148 MB, 67 files)               │
│  📁 references/         (420 MB, 89 files)               │
│  📁 notes/              (2 MB, 15 files)                 │
│  📁 output/             (180 MB, 95 files)               │
│                                                          │
│  ── Workspace Settings ──────────────────────────────── │
│                                                          │
│  Workspace path: [~/AcaClaw/           ] [Change]        │
│  Workspace confinement: ☑ Enabled (recommended)          │
│  Git auto-init: ☑ Enabled                                │
│                                                          │
│  ── Multiple Workspaces ─────────────────────────────── │
│                                                          │
│  │ Name              │ Path          │ Discipline │      │
│  │───────────────────│───────────────│────────────│      │
│  │ AcaClaw (default) │ ~/AcaClaw/    │ Biology    │ ●    │
│  │ Grant-2026        │ ~/Grant-2026/ │ Medicine   │ ○    │
│  │                                                       │
│  [Create New Workspace]  [Switch Workspace]              │
└─────────────────────────────────────────────────────────┘
```

---

## 7. 设置向导（浏览器） {: #7-setup-wizard-browser-based}

安装脚本（`install.sh`）在终端中自动完成所有下载与系统设置。完成后启动 OpenClaw 网关，并在浏览器中打开基于网页的设置向导：`http://localhost:2090/`。

### 为何用浏览器而非原生安装 GUI？

终端脚本无法安全启动原生 GUI 应用：

- **macOS**：Gatekeeper 会隔离未签名的下载 `.app` 包
- **Windows**：SmartScreen 会拦截未签名 `.exe`
- **Linux**：可行，但显示服务器环境各异（X11/Wayland/无头）

打开浏览器页面可规避上述问题。浏览器已安装且受信任。向导完全经本地网关运行 — 不向互联网发送向导内容。

### 终端做什么（自动，无交互提示）

| 步骤 | 内容 | 需要用户输入？ |
|---|---|---|
| 安装 OpenClaw | `npm install -g openclaw` | 否 |
| 安装 Miniforge | 静默下载并安装 | 否 |
| 创建基础 Conda 环境 | Python + R + 核心科学栈 | 否 |
| 复制 AcaClaw 插件 | 到 `~/.openclaw-acaclaw/plugins/`（隔离 profile） | 否 |
| 安装学术技能 | 从 ClawHub 安装到 `~/.openclaw-acaclaw/skills/` | 否 |
| 应用 AcaClaw 配置 | 写入 `~/.openclaw-acaclaw/openclaw.json`（含 `$include`） | 否 |
| 创建工作区目录 | `~/AcaClaw/` 结构 | 否 |
| 启动网关并打开浏览器 | `openclaw --profile acaclaw gateway run` → `http://localhost:2090/` | 否 |

### 浏览器向导做什么（用户选择）

```
  ┌─────────────┐     ┌─────────────┐     ┌──────────────┐
  │  Discipline │────▶│  AI Provider│────▶│  Workspace   │
  │  Selection  │     │  + API Key  │     │  Location    │
  └─────────────┘     └─────────────┘     └──────┬───────┘
                                                  │
                      ┌─────────────┐     ┌──────▼───────┐
                      │  Ready!     │◀────│  Security    │
                      │  Dashboard  │     │  Level       │
                      └─────────────┘     └──────────────┘
```

**界面 1：学科选择**

- 学科多选（生物学、化学、医学、物理学、工程学、数学、通用）
- 说明各学科增加的内容（软件包、工具）
- 动态显示估算安装体积
- 提交时：调用网关 API 创建学科专用 Conda 环境
- 安装软件包时显示进度条

**界面 2：AI 服务商设置**

- 选择服务商：Anthropic / OpenAI / Google AI / OpenClaw Web
- 输入 API 密钥（附「如何获取 API 密钥」链接）
- 测试连接按钮 — 继续前校验密钥
- 模型下拉选择
- 提交时：经网关 API 调用 `config.set`

**界面 3：工作区位置**

- 默认：`~/AcaClaw/`（脚本已创建）
- 可更改路径
- 显示工作区结构预览

**界面 4：安全级别**

- 单选：标准（推荐）/ 最高（Docker）
- 清晰说明各自含义
- Docker 状态指示（已检测到/未检测到）
- 提交时：若选最高，调用 `config.set` 设置沙箱相关项

**界面 5：完成**

- 汇总所有选择
- `Finish Setup` 按钮
- 跳转到 AcaClaw 仪表盘

### 无显示 / SSH 回退

若无可用显示服务器（如无头服务器、SSH 会话），脚本会打印 URL，用户从任意能访问 `localhost:2090` 的浏览器打开即可。向导功能相同 — 只是普通网页。

### 未来：原生安装包

当 AcaClaw 提供各平台签名包后，可采用原生安装程序：

| 平台 | 安装包类型 | 状态 |
|---|---|---|
| **macOS** | `.dmg`（签名 + 公证） | 未来 |
| **Windows** | `.exe`（签名 NSIS/Inno） | 未来 |
| **Linux** | `.AppImage` 或 `.deb`/`.rpm` | 未来 |
| **全平台** | Shell 脚本 + 浏览器向导 | **当前** |

---

## AcaClaw 界面包含什么 {: #what-acaclaws-ui-includes}

AcaClaw 在端口 2090 提供独立 UI。它不是 OpenClaw UI 的 fork — 而是共享同一网关 WebSocket API 的独立 SPA。OpenClaw 完整管理后台运行在默认网关端口 18789，覆盖 AcaClaw UI 未包含的功能。

### AcaClaw UI 视图

| 视图 | 用途 | 使用的插件方法 |
|---|---|---|
| **Overview** | 健康分、用量摘要、最近活动、快捷操作 | `health`、`usage.cost`、`sessions.list` |
| **Chat** | 发消息、查看回复、与智能体交互 | （内置网关方法） |
| **Usage** | Token/费用图表、按日分解、CSV 导出、按模型统计 | `usage.cost` |
| **Skills** | 列表、搜索、过滤、启用/禁用、从 ClawHub 安装 | `skills.install`、`skills.list` |
| **Environment** | Conda 环境查看、软件包列表、学科选择、安装 R | `acaclaw.env.list`、`acaclaw.env.install`、`acaclaw.env.activate` |
| **Backup** | 文件备份列表、带 diff 的恢复、保留策略 | `acaclaw.backup.list`、`acaclaw.backup.restore` |
| **Settings** | 带预设的简化配置、审计日志、OpenClaw 标签页打开 `localhost:18789` 控制面板 | `config.get`、`config.set`、`acaclaw.audit.query` |
| **Setup wizard** | 首次启动引导（学科、API 密钥、工作区、安全） | `config.set`、`acaclaw.env.install` |

### OpenClaw 控制面板功能（`:18789`）

以下功能供有需要的用户通过 AcaClaw 设置中的 OpenClaw 标签页访问（在新标签页中打开 `localhost:18789`）：

| 功能 | 科研用户较少需要的原因 |
|---|---|
| 通道（WhatsApp、Telegram、Discord 等） | 消息服务管理 — 非典型学术工作流 |
| Instances | 多模型实例管理 — 高级配置 |
| Cron | 定时任务 — 高级用户功能 |
| Nodes（设备配对） | 多设备管理 — 实验室场景不常见 |
| 调试检查器 | 排查网关内部的开发者工具 |
| 完整配置编辑器 | 含全部设置的 schema 驱动表单（AcaClaw 为简化预设） |
| Logs | 原始网关日志查看器 |

### 平台说明

| 平台 | 界面 |
|---|---|
| **macOS** | OpenClaw 原生 Swift 应用独立存在。AcaClaw UI 在浏览器 `http://localhost:2090/` 运行。两者可并行使用。 |
| **iOS / Android** | 原生移动应用经 WebSocket 连接同一网关 |
| **Linux / Windows / 全平台** | AcaClaw UI：`http://localhost:2090/`，OpenClaw 管理：`http://localhost:18789/` |

---

## 实现方式 {: #implementation-approach}

### 当前：基于浏览器的独立 SPA

AcaClaw 将自有 UI 构建为独立 SPA。AcaClaw 网关的 `controlUi` 中间件在 `/` 提供构建产物。OpenClaw 默认网关在端口 18789 独立运行，提供自带控制面板。用户在任意浏览器访问 `http://localhost:2090` 使用 AcaClaw。

| 优势 | 说明 |
|---|---|
| 零额外安装 | 已内置 — 网关提供 UI |
| 跨平台 | macOS、Windows、Linux 行为一致 |
| 无需维护 fork | AcaClaw UI 独立 — OpenClaw 更新不必合并 |
| 保留 OpenClaw 功能 | `localhost:18789` 完整控制面板 — 无功能缺失 |
| 同一构建体系 | Vite + Lit，输出 `dist/` |
| 迭代快 | `vite dev` 热重载，无需重编应用 |
| 无 Electron 开销 | 无 150+ MB 的 Chromium 打包 |

| 局限 | 说明 |
|---|---|
| 无系统托盘 | 无法在系统任务栏显示网关状态图标 |
| 无原生通知 | 浏览器通知可用但体验较粗糙 |
| 无原生文件对话框 | 使用浏览器文件选择器（可用但较基础） |
| 需保持浏览器标签 | 用户需保留一个标签页 |

### 源码结构

```
acaclaw/
└── ui/                             ← AcaClaw's own UI (not a fork)
    ├── package.json                ← lit, vite deps
    ├── vite.config.ts
    └── src/
        ├── main.ts                 ← 7-tab navigation, router
        ├── styles/
        │   └── base.css            ← AcaClaw color scheme (academic blue/teal)
        ├── views/
        │   ├── overview.ts         ← Dashboard (health score, usage, quick actions)
        │   ├── chat.ts             ← Chat interface (calls gateway chat methods)
        │   ├── usage.ts            ← Usage tracking (calls usage.cost)
        │   ├── skills.ts           ← Skills browser (calls skills.list, skills.install)
        │   ├── environment.ts      ← Conda env viewer (calls acaclaw.env.*)
        │   ├── backup.ts           ← Backup management (calls acaclaw.backup.*)
        │   ├── settings.ts         ← Config presets + audit log + OpenClaw tab (opens :18789)
        │   └── onboarding.ts       ← First-launch wizard
        └── controllers/
            ├── gateway.ts          ← WebSocket connection to gateway (shared methods)
            ├── backup.ts           ← calls acaclaw.backup.* gateway methods
            └── environment.ts      ← calls acaclaw.env.* gateway methods
```

### 兼容性如何成立

| 因素 | 说明 |
|---|---|
| **无 fork、无合并** | AcaClaw UI 为独立代码库。OpenClaw UI 更新自动生效 — `npm install -g openclaw@latest` 更新 `localhost:18789` 管理后台，不触碰 AcaClaw。 |
| **网关 API 稳定** | WebSocket JSON-RPC 方法在版本间不变。若变更，OpenClaw 自带 UI 也会坏。 |
| **AcaClaw 只做加法、不冲突** | AcaClaw 面板调用自定义插件方法（`acaclaw.backup.*`、`acaclaw.env.*`），命名空间独立。 |
| **两套独立构建** | AcaClaw 构建自有 `dist/`。OpenClaw 构建自有产物。互不影响。 |
| **Compat-checker 插件** | `@acaclaw/compat-checker` 在启动时校验 OpenClaw 版本，必要时提示更新。 |

### 更新如何流动

```
OpenClaw update (npm install -g openclaw@latest)
  └── Updates: gateway binary, built-in skills, core plugins, admin UI at :18789
  └── Does NOT touch: ~/.openclaw-acaclaw/, AcaClaw UI, AcaClaw plugins, AcaClaw skills

AcaClaw update (install.sh --upgrade)
  └── Updates: AcaClaw UI build at /, AcaClaw plugins, AcaClaw skills
  └── Writes to: ~/.openclaw-acaclaw/plugins/, ~/.openclaw-acaclaw/skills/
  └── Does NOT touch: ~/.openclaw/ (OpenClaw's config, plugins, sessions)
```

### 未来：Electron 或 Tauri 外壳

若需要系统托盘、原生通知或登录自启，可用桌面外壳在同一原生窗口加载同一 SPA。Lit 组件不变 — 外壳仅替代浏览器标签。

| 选项 | 优点 | 缺点 |
|---|---|---|
| **Electron** | 成熟、系统托盘、原生通知、自启 | 150+ MB 开销、捆绑 Chromium |
| **Tauri** | 约 5 MB 二进制、系统 WebView、Rust IPC | 生态较新、WebView 兼容性因系统而异 |

首版未计划。基于浏览器的 SPA 已覆盖所需功能。

### 分阶段推出

#### 阶段 1：核心视图 + 双 UI 配置

构建 AcaClaw 独立 UI 核心视图。AcaClaw 网关在 `:2090` 提供 UI，OpenClaw 默认网关在 `:18789` 提供控制面板。

| 交付项 | 说明 |
|---|---|
| 独立 SPA，7 标签导航 | Overview、Chat、Usage、Skills、Environment、Backup、Settings |
| AcaClaw 配色 | 自定义 `base.css`，学术向调色板 |
| Overview 面板 | 健康分、用量摘要、最近活动、快捷操作 |
| 插件 HTTP 路由 | AcaClaw 网关在 `:2090` 提供 `dist/`，OpenClaw 网关在 `:18789` 提供控制面板 |
| OpenClaw 标签页 | 设置页打开 `localhost:18789` 控制面板（通道、调试、cron） |

#### 阶段 2：AcaClaw 专用面板

构建依赖 AcaClaw 插件后端方法的面板。

| 面板 | 插件依赖 |
|---|---|
| **Environment**（Conda 查看、软件包列表、安装 R） | `@acaclaw/academic-env` |
| **Backup**（文件列表、带 diff 的恢复、保留策略） | `@acaclaw/backup` |
| **Audit log**（设置内，安全事件，CSV 导出） | `@acaclaw/security` |
| **Setup wizard**（首次启动引导） | 全部 AcaClaw 插件 |

#### 阶段 3：原生安装包（未来）

当 AcaClaw 提供各平台签名包后，用原生安装程序替代终端脚本。

| 平台 | 安装包类型 |
|---|---|
| macOS | `.dmg`（签名 + 公证） |
| Windows | `.exe`（签名） |
| Linux | `.AppImage` 或 `.deb`/`.rpm` |
| 全平台 | Shell 脚本 + 浏览器向导 **（当前）** |

---

## 桌面启动（浏览器） {: #desktop-launch-browser-based}

AcaClaw 作为本地 Web 应用运行：网关提供 UI，用户在浏览器中打开。本节介绍桌面快捷方式与平台集成。完整的认证流程、令牌生命周期与 WebSocket 握手说明见 [认证与启动](/zh-CN/auth-and-app-launch/)。

### 脚本

| 脚本 | 用途 |
|---|---|
| `scripts/start.sh` | 启动网关并打开浏览器（主启动器） |
| `scripts/stop.sh` | 优雅停止网关 |
| `scripts/install-desktop.sh` | 安装各平台桌面快捷方式 |

### 各平台行为

| 平台 | 桌面快捷方式 | 浏览器启动方式 | 说明 |
|---|---|---|---|
| **Linux** | `~/.local/share/applications/` 中的 `.desktop` | `xdg-open` | 出现在 GNOME、KDE、XFCE 应用启动器中 |
| **macOS** | `~/Applications/` 中的 `.command` | `open` | 在 Finder 中双击或拖到程序坞 |
| **WSL2** | Windows 桌面上的 `.lnk` | `powershell.exe Start-Process` | 在 WSL 内运行网关，在 Windows 浏览器中打开 |
| **无头/SSH** | 无 | 在终端打印 URL | 用户从任意浏览器访问该 URL |

### 用法

```bash
# Launch (start gateway + open browser)
bash scripts/start.sh

# Headless (gateway only)
bash scripts/start.sh --no-browser

# Check status
bash scripts/start.sh --status

# Stop
bash scripts/stop.sh

# Install desktop shortcut (run once)
bash scripts/install-desktop.sh
```

---

## GUI 与 CLI 对照 {: #gui-to-cli-mapping}

每个 GUI 操作都有对应 CLI。高级用户可任选其一。

| GUI 操作 | CLI 等价命令 |
|---|---|
| 查看 Token 用量 | `openclaw usage` |
| 查看系统资源 | `openclaw status --deep` |
| 查看智能体状态 | `openclaw status` |
| 安装技能 | `clawhub install <skill>` |
| 更新技能 | `clawhub update <skill>` |
| 查看已安装技能 | `openclaw skills list` |
| 设置 API 密钥 | `openclaw config set models.providers.anthropic.apiKey <key>` |
| 设置默认模型 | `openclaw config set agents.defaults.model <model>` |
| Web 登录 | `openclaw login` |
| 更改绑定模式 | `openclaw config set gateway.bind <mode>` |
| 配对移动设备 | `openclaw pair`（交互式） |
| 取消配对 | `openclaw unpair <device>` |
| 重启网关 | `openclaw gateway restart` |
| 更改安全级别 | `openclaw config set agents.defaults.sandbox.mode <off\|docker>` |
| 查看审计日志 | `cat ~/.acaclaw/audit/YYYY-MM-DD.jsonl` |
| 从备份恢复文件 | `openclaw acaclaw-backup restore <file>` |
| 更改备份保留期 | `openclaw config set acaclaw.backup.retentionDays <N>` |
| 更改工作区路径 | `openclaw config set agents.defaults.workspace <path>` |
| 新建工作区 | `openclaw acaclaw-workspace create <name> --discipline <field>` |
| 查看 Conda 环境 | `conda list -n acaclaw` |
| 安装 R | `conda install -n acaclaw r-base r-irkernel` |

---

## 设计规则 {: #design-rules}

| 规则 | 理由 |
|---|---|
| **每个面板都有 CLI 对应** | 高级用户总能回到终端 |
| **敏感字段默认遮罩** | API 密钥、认证令牌默认隐藏，需操作才显示 |
| **破坏性操作需确认** | 删除工作区、清空回收站、取消配对等 |
| **安全升级须警告** | 切换到非 loopback、禁用工作区限制等 |
| **更改立即生效** | 无「应用」按钮 — 输入即保存 |
| **总能撤销** | 配置变更有备份，文件恢复前显示 diff |
| **标签避免生僻术语** | 用「工作区」而非「工作目录」，用「AI 服务商」而非「LLM 端点」 |
| **状态始终可见** | 底栏显示网关状态、智能体状态、Token 数 |
| **错误附带下一步** | 「网关未运行 → [Start Gateway]」，而非仅 `Error: ECONNREFUSED` |
| **响应式布局** | 面板随窗口缩放（窄屏时侧边栏可折叠） |
