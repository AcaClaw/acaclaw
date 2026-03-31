---
layout: page
title: 聊天处理机制
lang: zh-CN
permalink: /zh-CN/chat-handling/
---

> **黄金法则**: OpenClaw 负责所有聊天处理——消息分发、模型路由、响应流式传输、工具执行和技能调用。AcaClaw 的 UI 只是一个轻量级 WebSocket 客户端，发送 `chat.send` 并渲染收到的事件。

---

## 目录

- [概述](#概述)
- [消息流程](#消息流程)
- [模型解析](#模型解析)
- [响应流式传输](#响应流式传输)
- [智能工具调用](#智能工具调用)
- [技能集成](#技能集成)
- [会话与历史](#会话与历史)
- [AcaClaw UI 集成](#acaclaw-ui-集成)
- [配置参考](#配置参考)

---

## 概述

当用户在 AcaClaw 聊天界面输入消息时，整个处理流程都在 OpenClaw 网关内部执行。AcaClaw 通过 WebSocket 发送一个 `chat.send` RPC 调用，然后监听流式事件。网关负责：

1. **输入验证与清理** — 移除空字节、控制字符，Unicode NFC 标准化
2. **模型解析** — 决定使用哪个 LLM 提供商和模型
3. **媒体理解** — 如有附件则分析图片和文件
4. **智能代理执行** — Pi 嵌入式运行器编排 LLM 对话
5. **工具调用** — 代理可以循环调用工具（文件操作、Shell、MCP、技能）
6. **响应流式传输** — 令牌通过 WebSocket 事件实时发送
7. **会话持久化** — 完整对话记录保存至磁盘

```
用户输入消息
       │
       ▼
┌──────────────┐     WebSocket RPC      ┌──────────────────────┐
│  AcaClaw UI  │ ─── chat.send ───────▶ │  OpenClaw 网关       │
│  (浏览器)    │                        │                      │
│              │ ◀── chat (delta) ───── │  ┌────────────────┐  │
│              │ ◀── chat (delta) ───── │  │ 代理运行器      │  │
│              │ ◀── tool events ────── │  │  ┌──────────┐  │  │
│              │ ◀── chat (final) ───── │  │  │ LLM API  │  │  │
└──────────────┘                        │  │  └──────────┘  │  │
                                        │  │  ┌──────────┐  │  │
                                        │  │  │ 工具     │  │  │
                                        │  │  └──────────┘  │  │
                                        │  │  ┌──────────┐  │  │
                                        │  │  │ 技能     │  │  │
                                        │  └──┴──────────┴──┘  │
                                        └──────────────────────┘
```

---

## 消息流程

### 第一步：客户端发送 `chat.send`

AcaClaw 聊天视图通过 WebSocket RPC 发送以下参数：

```typescript
{
  sessionKey: "main:web:default",   // 代理 + 频道 + 联系人
  message: "分析这个蛋白质结构",
  thinking?: "high",                // 可选思考级别
  deliver?: false,                  // 是否路由到外部频道
  attachments?: [{                  // 可选附件
    mimeType: "image/png",
    fileName: "structure.png",
    content: "base64..."
  }],
  idempotencyKey: "uuid-...",       // 去重键
  timeoutMs?: 300000                // 覆盖代理超时
}
```

### 第二步：网关确认

网关立即返回确认及 `runId`：

```json
{ "runId": "abc123", "status": "started" }
```

这会解除 UI 阻塞——实际处理在后台异步进行。

### 第三步：分发管线

消息流经 OpenClaw 的分发管线：

| 阶段 | 文件 | 用途 |
|---|---|---|
| **验证和清理** | `server-methods/chat.ts` | 移除空字节，Unicode 标准化，解析附件 |
| **入站分发** | `auto-reply/dispatch.ts` | 将消息路由到正确的回复处理器 |
| **加载会话** | `auto-reply/reply/dispatch-from-config.ts` | 加载会话条目，触发插件入站钩子 |
| **解析模型** | `agents/model-selection.ts` | 确定使用哪个 LLM 模型 |
| **媒体理解** | `media-understanding/apply.runtime.ts` | 分析图片/附件 |
| **链接理解** | `link-understanding/apply.runtime.ts` | 获取并摘要链接 URL |
| **解析指令** | `auto-reply/reply/get-reply-directives.ts` | 解析 `/think`、`/model` 等指令 |
| **运行代理** | `agents/pi-embedded-runner/run/attempt.ts` | 执行 LLM 对话和工具循环 |

### 第四步：代理执行

Pi 嵌入式运行器：

1. 构建**系统提示词**（代理身份、工作区上下文、技能文档）
2. 加载**技能快照**（此代理和频道可用的技能）
3. 创建**工具台**（文件操作、Shell、MCP 工具、技能工具）
4. 调用 Pi SDK 的 `streamSimple()` 开始 LLM 生成
5. 订阅会话事件（文本增量、工具调用、推理）
6. 进入**工具循环** — 如果 LLM 请求工具调用，执行并回传结果

### 第五步：广播响应

代理完成后：

- **`broadcastChatFinal()`** — 向所有连接的客户端发送完整响应
- **`broadcastChatError()`** — 如果运行失败则发送错误详情
- **`broadcastSideResult()`** — 发送补充结果（如"顺便说一下"的发现）

---

## 模型解析

OpenClaw 通过优先级链解析模型，首个匹配生效：

| 优先级 | 来源 | 配置路径 | 示例 |
|---|---|---|---|
| 1 | **心跳覆盖** | `agents.defaults.heartbeat.model` | 用于保活的轻量模型 |
| 2 | **会话覆盖** | 每会话 `modelOverride` | 用户为此对话选择的模型 |
| 3 | **频道覆盖** | `channels.<channel>.modelOverride` | Discord 和 Web 使用不同模型 |
| 4 | **代理默认** | `agents.list[].model` | 代理特定模型 |
| 5 | **全局默认** | `agents.defaults.model` | 所有代理的后备模型 |

### AcaClaw 如何设置默认模型

AcaClaw 的 API Keys 页面通过 `config.set` RPC 写入 `agents.defaults.model`：

```typescript
gateway.call("config.set", {
  key: "agents.defaults.model",
  value: "openrouter/anthropic/claude-3.5-sonnet",
  baseHash: currentConfigHash
});
```

### 模型引用格式

所有模型引用使用 **`provider/model-id`** 格式：

```
openrouter/anthropic/claude-3.5-sonnet
anthropic/claude-opus-4-6
openai/gpt-4o
ollama/llama3
```

提供商前缀决定使用哪个 API 密钥和基础 URL。

---

## 响应流式传输

### 传输协议

OpenClaw 通过 WebSocket 使用 JSON 帧进行流式传输：

```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "abc123",
    "sessionKey": "main:web:default",
    "seq": 42,
    "state": "delta",
    "message": {
      "content": [{ "type": "text", "text": "蛋白质结构..." }]
    }
  },
  "seq": 1337
}
```

### 事件状态

| 状态 | 含义 | 时机 |
|---|---|---|
| `"delta"` | 部分流式令牌 | LLM 生成的每个令牌 |
| `"final"` | 完整响应 | LLM 完成生成 |
| `"error"` | 运行失败 | API 错误、超时、中止等 |

### 流式架构

```
LLM API (Anthropic, OpenAI 等)
       │
       │  SSE / 流式响应
       ▼
┌─────────────────────────┐
│  Pi SDK: streamSimple() │   解析提供商特定的流格式
│  @mariozechner/pi-ai    │   标准化为统一事件模型
└────────┬────────────────┘
         │
         │  会话事件: text_delta, text_start, text_end
         ▼
┌──────────────────────────────────────┐
│  subscribeEmbeddedPiSession()        │   订阅会话事件
│  pi-embedded-subscribe.handlers.*.ts │   处理增量、推理、工具
└────────┬─────────────────────────────┘
         │
         │  emitAgentEvent({ stream: "assistant", data: { text, delta } })
         ▼
┌────────────────────────────┐
│  server-broadcast.ts       │   广播到所有连接的 WS 客户端
│  broadcast("chat", payload)│   按客户端权限进行范围控制
└────────┬───────────────────┘
         │
         │  WebSocket JSON 帧
         ▼
┌─────────────────┐
│  AcaClaw UI     │   将增量文本追加到当前消息
│  chat.ts        │   实时重新渲染 Markdown
└─────────────────┘
```

### 背压控制

网关在发送前检查 `socket.bufferedAmount`。如果客户端较慢：

- 标记为 `dropIfSlow` 的事件会被跳过（非关键增量）
- 关键事件（final、error）始终投递

---

## 智能工具调用

### 工具台

当聊天运行开始时，OpenClaw 组装一个**工具台** — 代理在此对话回合中可调用的工具集合：

| 工具类别 | 示例 | 来源 |
|---|---|---|
| **文件操作** | 读取、写入、编辑、列表、搜索 | 内置（沙箱或宿主） |
| **Shell 执行** | 带安全门控的 Bash 命令 | 内置 |
| **MCP 工具** | Model Context Protocol 服务器的工具 | MCP 插件注册表 |
| **LSP 工具** | Language Server Protocol 操作 | LSP 插件注册表 |
| **技能工具** | 领域特定的技能函数 | 技能快照 |

### 工具调用循环

代理在**生成-调用-生成**循环中运行：

```
┌─────────────────────────────────────────┐
│                                         │
│  1. LLM 生成文本                        │
│     │                                   │
│     ▼                                   │
│  2. LLM 请求 tool_use                  │
│     { name: "bash", input: "ls -la" }  │
│     │                                   │
│     ▼                                   │
│  3. 工具调用前钩子运行                   │
│     (验证、参数调整)                     │
│     │                                   │
│     ▼                                   │
│  4. 工具执行，返回结果                   │
│     │                                   │
│     ▼                                   │
│  5. 结果追加到会话                       │
│     │                                   │
│     ▼                                   │
│  6. 会话发送回 LLM                      │
│     │                                   │
│     ▼                                   │
│  7. LLM 继续（文本或更多工具调用）       │
│     │                                   │
│     └───── 回到第 2 步 ────────────────┘
│              (或在 LLM 完成时停止)
└─────────────────────────────────────────┘
```

### 工具名称解析

LLM 提供商有时会改变工具名称（如 `toolsread3` 而非 `functools.read`）。OpenClaw 有一个标准化层：

1. **`normalizeToolCallNameForDispatch()`** — 将提供商改变的名称映射到规范名称
2. **`collectAllowedToolNames()`** — 构建允许的工具名称列表
3. **后备** — 如果名称模糊，从 `toolCallId` 推断工具名称

### 工具调用前钩子

每个工具调用在执行前都通过 `runBeforeToolCallHook()`：

- 插件注册的钩子可以检查和修改调用参数
- 安全门控可以阻止危险操作
- 参数可通过 `consumeAdjustedParamsForToolCall()` 调整

### 工具结果处理

工具返回结果后：

| 处理步骤 | 用途 |
|---|---|
| **截断** | 限制超大结果以防止上下文溢出 |
| **上下文守卫** | 防止工具结果破坏 LLM 解析 |
| **转录修复** | 修复损坏的工具调用/结果配对序列 |

---

## 技能集成

### 什么是技能？

技能是扩展代理知识和工具集的领域特定能力。在 AcaClaw 中，学术技能（文献搜索、引文格式化、数据分析）已预安装并配置。

### 技能发现

当聊天运行开始时，OpenClaw 构建一个**技能快照** — 此代理可用的完整技能集：

```
buildWorkspaceSkillSnapshot()
  → SkillSnapshot { entries: SkillEntry[] }

buildWorkspaceSkillsPrompt()
  → 用于系统提示词的格式化技能文档

resolveSkillsPromptForRun(cfg, skillFilter)
  → 应用: 代理 + 频道技能过滤器
```

### 技能类型

| 类型 | 来源 | 示例 |
|---|---|---|
| **已安装技能** | `~/.openclaw/skills/` 或工作区 | 文献搜索、引用工具 |
| **内置技能** | 扩展内置 | 文件分析、网页搜索 |
| **MCP 技能** | Model Context Protocol 服务器 | 外部工具集成 |
| **LSP 技能** | Language Server Protocol | 代码智能 |

### 技能如何被调用

技能作为**工具**暴露给 LLM。LLM 根据用户请求和系统提示词中的技能文档决定何时调用技能：

1. 系统提示词包含技能文档（名称、描述、参数）
2. 用户提出与某个技能领域匹配的问题
3. LLM 使用适当参数调用技能工具
4. 技能执行并返回结果
5. LLM 将结果整合到回复中

### 技能过滤

并非所有技能在每个上下文中都可用。过滤来自多个来源：

| 来源 | 配置路径 | 用途 |
|---|---|---|
| 代理配置 | `agents.<id>.skillFilter[]` | 按代理限制技能 |
| 频道配置 | `channels.<channel>.skillFilter[]` | 按频道限制技能 |
| 运行时覆盖 | 运行级 `skillFilter` | 按请求过滤 |

---

## 会话与历史

### 会话键

每个对话由**会话键**标识，格式为：

```
<agentId>:<channel>:<contactId>

示例:
  main:web:default        — 与主代理的默认 Web 聊天
  biologist:web:default   — 与生物学家代理的 Web 聊天
  main:discord:@user123   — 与主代理的 Discord 私信
```

### 会话存储

会话持久化到磁盘：

```
~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl
```

JSONL 文件中的每一行是一个转录条目（用户消息、助手响应、工具调用、工具结果）。

### 历史加载限制

| 限制 | 默认值 | 用途 |
|---|---|---|
| 最大消息数 | 200 | 防止超大上下文窗口 |
| 硬性上限 | 1,000 | 绝对上限 |
| 每条消息上限 | 128 KB | 跳过超大条目 |
| 总预算 | 可配置 | 限制加载的总字节数 |

### 历史清理

在将历史发送到 UI 之前，OpenClaw 会进行清理：

- 去除内部指令标签（不用于显示）
- 截断长文本字段（每字段 12,000 字符）
- 移除内联图片数据（保留元数据）
- 验证使用量令牌（必须为有限数字）
- 用占位符替换超大消息

---

## AcaClaw UI 集成

### 发送消息

AcaClaw 聊天视图（`ui/src/views/chat.ts`）通过网关控制器发送消息：

```typescript
gateway.call("chat.send", {
  sessionKey: this._currentSessionKey,
  message: userInput,
  thinking: this._thinkingLevel,
  idempotencyKey: crypto.randomUUID(),
});
```

### 接收流式事件

聊天视图在挂载时订阅 `chat` 事件：

```typescript
this._cleanupChat = gateway.onNotification("chat", (data) => {
  this._handleChatEvent(data);
});
```

### 处理事件状态

`_handleChatEvent()` 处理器处理三种状态：

**Delta（流式）** — 将文本累积到当前助手消息：

```typescript
if (d.state === "delta" && d.message) {
  const text = d.message.content
    ?.filter(c => c.type === "text")
    .map(c => c.text ?? "")
    .join("") ?? "";
  if (last.role === "assistant") {
    last.content = text;
  }
}
```

**Final（完成）** — 用最终版本替换流式内容。

**Error（错误）** — 在聊天气泡中显示错误。

### 渲染

AcaClaw 渲染聊天消息时包括：

- **Markdown** — 带语法高亮的完整 CommonMark 渲染
- **代码块** — 语言感知的高亮和复制按钮
- **LaTeX** — 用于数学公式的 KaTeX 渲染
- **工具调用** — 显示工具输入和输出的可折叠面板
- **思考** — 可展开的推理块（启用思考时）

---

## 配置参考

### 聊天行为

```json
{
  "agents": {
    "defaults": {
      "model": "openrouter/anthropic/claude-3.5-sonnet",
      "thinkingDefault": "adaptive",
      "sandbox": { "mode": "off" },
      "heartbeat": {
        "model": "anthropic/claude-haiku"
      }
    }
  }
}
```

| 键 | 类型 | 说明 |
|---|---|---|
| `agents.defaults.model` | string | 所有代理的默认 LLM 模型 |
| `agents.defaults.thinkingDefault` | string | 默认思考级别: `"off"`, `"low"`, `"adaptive"`, `"high"` |
| `agents.defaults.sandbox.mode` | string | 沙箱模式: `"off"`, `"docker"`, `"podman"` |
| `agents.defaults.heartbeat.model` | string | 心跳/保活的轻量模型 |
| `agents.list[].model` | string | 每代理模型覆盖 |
| `channels.<channel>.modelOverride` | string | 每频道模型覆盖 |

---

## 相关文档

- [系统架构](/zh-CN/architecture/) — 系统设计和职责边界
- [提供商与模型](/zh-CN/providers-and-models/) — 提供商配置、模型目录、API 密钥
- [技能](/zh-CN/skills/) — 学术技能目录和安装
- [图形界面](/zh-CN/desktop-gui/) — UI 概述和导航
