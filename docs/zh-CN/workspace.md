---
layout: page
title: 工作空间
lang: zh-CN
permalink: /zh-CN/workspace/
---

> **原则**：面向用户的文件可见；基础设施文件隐藏。

---

## 问题

OpenClaw 默认工作区在 `~/.openclaw/workspace` — 位于隐藏点目录内。对开发者可行，但对学术用户不友好：

1. **可发现性** — 文件管理器需「显示隐藏文件」才能找到
2. **workspaceOnly 悖论** — 操作限制在工作区时，用户必须知道工作区在哪

AcaClaw 将用户可见文件与基础设施分离：

| 内容 | OpenClaw 默认 | AcaClaw |
|------|---------------|---------|
| 工作区（用户文件） | `~/.openclaw/workspace`（隐藏） | `~/AcaClaw/`（可见） |
| 配置、会话、日志 | `~/.openclaw/`（隐藏） | `~/.acaclaw/`（隐藏） |
| 备份 | — | `~/.acaclaw/backups/`（隐藏） |
| 审计 | — | `~/.acaclaw/audit/`（隐藏） |

---

## 目录布局

```
~/
├── AcaClaw/                    # 工作区 — 可见
│   ├── .acaclaw/               # 项目元数据（对 AI 隐藏）
│   │   ├── workspace.json
│   │   └── .gitignore
│   ├── data/raw/               # 原始数据 — 不修改
│   ├── data/processed/
│   ├── documents/drafts/ | final/
│   ├── figures/ | references/ | notes/ | output/
│   └── README.md
└── .acaclaw/                   # 基础设施 — 隐藏
    ├── backups/
    ├── audit/
    ├── miniforge3/
    └── envs/
```

---

## 访问规则

| 目录 | AI 工具 | AcaClaw 插件 | 用户 |
|------|:-------:|:------------:|:----:|
| `~/AcaClaw/` | 读写 | 读写 | 读写 |
| `~/AcaClaw/data/raw/` | 只读 | 只读 | 读写 |
| `~/AcaClaw/.acaclaw/` | 无 | 读写 | 读写 |
| `~/.openclaw/` | 无 | 无 | 读写 |
| `~/.acaclaw/backups/` | 无 | 写（备份） | 读（恢复） |
| `~/.acaclaw/audit/` | 无 | 写 | 读 |
| 其他路径 | 无 | 无 | 用户全权 |

### 如何强制边界

| 边界 | 机制 |
|------|------|
| AI 限制在工作区 | `tools.fs.workspaceOnly: true` + `resolveSandboxPath()` |
| 符号链接逃逸 | `assertNoPathAliasEscape()` + realpath |
| `..` 逃逸 | 拒绝危险相对路径 |
| `data/raw/` 对 AI 只读 | 系统提示约束 |
| `.acaclaw/` 对 AI 隐藏 | 工作区树扫描中的 `IGNORE_PATTERNS` |
| 备份在工作区外 | `~/.acaclaw/backups/` |

---

## 工作区插件（`@acaclaw/workspace`）

管理项目结构、文件树扫描与向 LLM 注入上下文：

- `before_prompt_build`（优先级 150）：扫描工作区文件树（最多 2 层），注入路径、项目名、学科、文件树与边界规则
- `workspace_info` 工具：元数据与统计
- `acaclaw.workspace.getWorkdir` / `setWorkdir` 网关方法
- CLI：`acaclaw-workspace init | info | tree`

---

## 工作区配置

`~/AcaClaw/.acaclaw/workspace.json` 示例：

```json
{
  "name": "AcaClaw",
  "discipline": "biology",
  "createdAt": "2026-03-12T14:30:00Z",
  "workspaceId": "AcaClaw-a1b2c3d4e5f6"
}
```

---

## 备份组织

按稳定 `workspaceId` 分目录：`~/.acaclaw/backups/<workspaceId>/files/日期/`，含 `.meta.json` 元数据（路径、校验和、操作类型等）。

---

## 工作目录（Workdir）

**工作目录**是智能体读写的根路径，在聊天界面**右上角**以路径徽章显示。

### 修改工作目录

1. 点击路径或 **Change**
2. 在对话框输入新的绝对路径
3. 通过网关持久化，立即生效

也可使用 CLI：

```bash
openclaw config set agents.defaults.workspace ~/my-research
openclaw config set agents.list.0.workspace ~/my-research/biology
```

工作目录由工作区插件在每次提示前注入 LLM，确保智能体知晓边界与当前文件树。

### 网关方法

| 方法 | 说明 |
|------|------|
| `acaclaw.workspace.getWorkdir` | 返回指定智能体的解析后工作目录 |
| `acaclaw.workspace.setWorkdir` | 更新并写入配置 |

---

## 多个工作区

可指向任意目录；每个工作区有独立 `workspace.json`、备份目录与 LLM 上下文注入。

---

## 安全边界

| 策略 | 机制 |
|------|------|
| 文件限制 | `tools.fs.workspaceOnly: true` |
| 执行限制 | Exec 工具默认 CWD 为工作区根 |
| 工具/命令黑名单 | 与 `@acaclaw/security` 协同 |
| 网络白名单 | 学术域名 |
| 修改前备份 | 备份插件（优先级 200） |
| 审计 | 每次工具调用记录 |

**最高模式**下 Docker 再增加一层：仅将工作区以 `rw` 挂载进容器。
