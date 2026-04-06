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
- [聊天延迟分析](#聊天延迟分析)
  - [提示词缓存](#提示词缓存)
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

### API 密钥查找

网关通过认证配置文件解析 API 密钥：

1. 检查配置中的 `models.providers.<provider>.apiKey`
2. 检查环境变量（如 `ANTHROPIC_API_KEY`、`OPENROUTER_API_KEY`）
3. 检查凭证存储 `~/.openclaw/credentials/`

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

### 附带结果

在长时间运行的代理任务中，网关可能发出 `chat.side_result` 事件 — 代理在工作过程中发现的补充信息：

```json
{
  "type": "event",
  "event": "chat.side_result",
  "payload": {
    "kind": "btw",
    "runId": "abc123",
    "sessionKey": "main:web:default",
    "question": "分析这个蛋白质",
    "text": "顺便说一下，这个结构有一个不寻常的 beta 折叠...",
    "ts": 1711900000000
  }
}
```

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

### 线上工具事件

工具调用和结果作为 WebSocket 事件广播：

```json
{
  "type": "event",
  "event": "session.tool",
  "payload": {
    "runId": "abc123",
    "sessionKey": "main:web:default",
    "toolName": "bash",
    "toolCallId": "call_001",
    "input": { "command": "python analyze.py" },
    "state": "running"
  }
}
```

然后是结果：

```json
{
  "type": "event",
  "event": "session.tool",
  "payload": {
    "runId": "abc123",
    "toolName": "bash",
    "toolCallId": "call_001",
    "output": "分析完成: 发现 3 个结构",
    "state": "done"
  }
}
```

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

### 技能环境

技能可能有特定环境需求。OpenClaw 应用环境覆盖：

```
applySkillEnvOverrides({ cfg, sessionKey, snapshot })
  → 设置技能特定的环境变量（API 密钥、路径）
  → 按技能认证，不暴露至 LLM 提示词
```

AcaClaw 的 `academic-env` 插件管理技能依赖的 Conda 环境（用于数据分析的 Python 包、生物信息学工具等）。

---

## 会话与历史

### 会话键

每个对话由**会话键**标识，格式为：

```
agent:<agentId>:<channel>:<sessionId>

示例:
  agent:main:web:main           — 与主代理的默认 Web 聊天
  agent:biologist:web:biologist — 与生物学家代理的默认 Web 聊天
  agent:main:web:a1b2c3d4       — 用户创建的新聊天（UUID 会话）
  agent:main:main               — OpenClaw 内置 UI 会话
```

#### 确定性 vs. 随机会话键

AcaClaw 为默认标签使用**确定性会话 ID**，以最大化 LLM 提示词缓存命中率：

| 场景 | 会话 ID | 会话键 | 缓存行为 |
|---|---|---|---|
| 默认通用标签 | `"main"` | `agent:main:web:main` | 确定性 — 缓存在页面刷新后保持热状态 |
| 代理标签（如生物学家） | `"biologist"` | `agent:biologist:web:biologist` | 确定性 — 同样受益 |
| 用户点击"+ 新聊天" | 随机 UUID | `agent:main:web:<uuid>` | 全新对话，冷缓存 |

该设计确保日常使用能从 LLM 提供商的提示词缓存中受益（见[提示词缓存](#提示词缓存)），同时"+ 新聊天"按钮可在需要时给用户提供干净的对话。

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

### 会话写锁

同一时间只有一个代理运行可以写入会话。`session-write-lock` 机制根据代理配置的超时时间防止并发修改。

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

## 聊天延迟分析

### 首字延迟流水线

用户发送消息后，到第一个可见响应字符出现的时间（首字延迟，Time-To-First-Token，TTFT），由以下串行阶段决定：

```
用户发送 "hi"
  │
  │  ① WebSocket 往返 + 认证
  │     (~20 ms)
  ▼
网关接收 chat.send
  │
  │  ② 返回 Chat ACK 给 UI
  │     (~10 ms)
  ▼
分发流水线启动
  │
  │  ③ Agent 启动：加载会话、解析模型、
  │     构建系统提示词、组装工具台
  │     (~500–1,300 ms)
  ▼
LLM API 调用开始
  │
  │  ④ 模型处理输入 token 并返回
  │     第一个流式 token
  │     (不定——取决于输入 token 数量)
  ▼
首个 delta 事件到达 UI
```

### 实测延迟数据

以下数据使用 **DeepSeek v3.1**（通过 OpenRouter，后端：DeepInfra），本地网关 `auth.mode: "none"` 测量。

#### 直连 API 调用（基线）

绕过网关，直接向 OpenRouter 发送 9 个 token 的请求：

| 指标 | 数值 |
|---|---|
| 非流式 TTFB | 787 ms |
| 非流式总耗时 | 1,597 ms |
| 流式首个 SSE | 1,510 ms |
| 流式总耗时 | 1,560 ms |

这是 **模型基线延迟** —— 最小输入下 LLM 的响应速度。

#### 网关聊天（thinking=off）

通过 `chat.send` 发送 "What is 2+2?"，关闭思考模式：

| 阶段 | 耗时 | 累计 |
|---|---|---|
| WS 连接 + 认证 | 22 ms | 22 ms |
| Chat ACK | 10 ms | 32 ms |
| Agent 启动 | 508 ms | 540 ms |
| **LLM 处理（TTFT）** | **7,832 ms** | **8,372 ms** |
| 流式传输 + 结束 | 208 ms | 8,580 ms |

网关上报的 token 用量：

| Token 类型 | 数量 |
|---|---|
| 新输入 token | 22 |
| 缓存输入 token | 15,109 |
| 输出 token | 230 |
| **总输入** | **~15,131** |

#### 网关聊天（自适应思考）

相同消息，`thinkingDefault: "adaptive"`：

| 指标 | 数值 |
|---|---|
| 总耗时 | ~23,500 ms |
| Delta 事件数 | 0 |
| 响应内容 | 空（DeepSeek v3.1 + OpenRouter 自适应思考的已知问题） |

### 时间消耗分析

TTFT 分解揭示了清晰的规律：

```
总 TTFT: ~8,400 ms
  ├── 网关开销 (WS + ACK + Agent 启动): ~540 ms  (6%)
  └── LLM API 处理: ~7,800 ms                    (94%)
```

**LLM API 调用占主导地位** —— 主要原因是 OpenClaw 每次请求发送的 **~15,000 token 系统提示词**。

### 系统提示词组成

OpenClaw 为每次聊天回合组装一个大型系统提示词，包含：

| 组成部分 | 大致大小 | 来源 |
|---|---|---|
| **Agent 身份** | ~200 token | Agent 名称、描述、人格设定（来自 `agents.list[]`） |
| **工具定义** | ~3,000–5,000 token | 所有可用工具的 JSON schema（文件操作、bash、MCP、技能） |
| **技能文档** | ~4,000–8,000 token | 已安装技能的描述和参数 |
| **工作区上下文** | ~500–1,000 token | 当前目录、环境信息、操作系统信息 |
| **会话历史** | 可变 | 对话中的先前回合（最多 200 条消息） |
| **对话规则** | ~500–1,000 token | 安全、格式、响应风格指令 |

使用全新会话和 AcaClaw 默认的 6 个学术技能 + 标准工具台，总系统提示词约为 **15,000 token**。

### 对 TTFT 的影响

LLM 提供商必须处理完整个输入（系统提示词 + 用户消息）才能生成第一个输出 token。关系大致呈线性：

| 输入大小 | 预期 TTFT（DeepSeek v3.1 via OpenRouter） |
|---|---|
| ~9 token（裸 API） | ~800 ms |
| ~15,000 token（网关） | ~8,000 ms |

**输入 token 增加 10 倍导致 TTFT 增加约 10 倍**。提供商侧的 **提示词缓存**（显示为 15,109 个已缓存 token）有助于降低成本，但对缓存窗口内的首次请求延迟影响有限。

### 网关开销明细

网关内部的非 LLM 开销相对较小：

| 组件 | 耗时 | 说明 |
|---|---|---|
| WebSocket 连接 | ~15 ms | 本地回环，包含 `connect.challenge` + `connect` 握手 |
| 认证检查 | ~5 ms | `auth.mode: "none"` —— 最小开销 |
| Chat ACK | ~10 ms | 立即返回给 UI 的确认 |
| 会话加载 | ~50–100 ms | 从磁盘加载 JSONL 历史 |
| 模型解析 | ~5 ms | 遍历优先级链 |
| 系统提示词组装 | ~200–500 ms | 构建提示词、技能文档、工具台 |
| 技能快照 | ~100–200 ms | 解析该 Agent 的可用技能 |
| **总网关开销** | **~500–1,300 ms** | 因会话大小和技能数量而异 |

### 插件加载开销

网关启动时（非每次请求）加载 AcaClaw 的 6 个插件。测试中发现插件在初始化过程中被 **重复加载 4 次以上**。这不影响每条消息的延迟，但会增加冷启动时间。

启动阶段观察到的 RPC 耗时：

| RPC | 耗时 |
|---|---|
| `config.get` | ~1,400 ms |
| `chat.history` | ~765 ms |
| `models.list` | ~750 ms |

### 优化策略

降低 TTFT 的方法：

| 策略 | 预期效果 | 实施方式 |
|---|---|---|
| **使用更快的模型** | 高 | 切换到 TTFT 更低的模型（如 Anthropic Haiku、GPT-4o-mini） |
| **减少技能数量** | 中 | 使用 `agents.<id>.skillFilter[]` 限制每个 Agent 的技能 |
| **精简工具台** | 中 | 禁用未使用的工具类别（MCP 服务器、LSP） |
| **使用提供商缓存** | 中 | Anthropic 和 OpenAI 原生支持系统提示词缓存 |
| **缩短系统提示词** | 中 | 精简 Agent 描述，减少对话规则 |
| **本地模型** | 不定 | Ollama/vLLM 消除网络延迟，但取决于硬件性能 |

### 提示词缓存

LLM 提供商（OpenRouter、Anthropic、OpenAI）会缓存输入提示词的**前缀**。当连续请求共享相同的前缀（系统提示词 + 对话历史），提供商会跳过重新处理已缓存部分，显著降低 TTFT。

#### 工作原理

```
请求 1（冷缓存）：
  [系统提示词：15K tokens] + [用户消息：20 tokens]
  → 提供商处理全部 15,020 tokens → TTFT: ~8,000 ms

请求 2（热缓存，同一会话）：
  [系统提示词：15K tokens ← 已缓存] + [历史：200 tokens] + [用户消息：20 tokens]
  → 提供商仅处理 220 个新 tokens → TTFT: ~2,000 ms
```

#### 会话键的影响

缓存基于实际提示词内容，但由于同一 Agent 的所有会话共享相同的系统提示词，缓存实际上在所有会话之间共享——**前提是对话历史前缀匹配**。

对于默认标签，AcaClaw 使用**确定性会话键**（`agent:main:web:main`），确保同一对话历史在页面刷新后复用，保持缓存命中：

| 会话类型 | 缓存行为 | 典型 TTFT（热缓存） |
|---|---|---|
| 确定性（`main`） | 所有使用共享前缀 | ~2,200 ms |
| 随机 UUID（新聊天） | 冷缓存，仅系统提示词 | ~3,400 ms |
| 首次消息 | 完全冷缓存 | ~8,000–10,000 ms |

#### 实测结果（MiniMax M2.7 via OpenRouter）

确定性会话键修复前：

| 测试 | TTFT |
|---|---|
| AcaClaw UI（随机 UUID 会话） | **9,579 ms** |
| OpenClaw 内置 UI（固定 `agent:main:main`） | **3,156 ms** |

修复后：

| 测试 | TTFT |
|---|---|
| AcaClaw UI（确定性 `agent:main:web:main`） | **2,247 ms** |
| OpenClaw 内置 UI（`agent:main:main`） | **3,156 ms** |

修复实现了 **4.3 倍的 TTFT 提升**。

#### 缓存失效

提示词缓存在特定于提供商的不活跃时间窗口后过期（OpenRouter 通常为 5–10 分钟）。缓存过期后，会话中的首条消息将再次承受冷缓存惩罚。频繁使用可保持缓存热状态。

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

### 会话配置

| 键 | 类型 | 说明 |
|---|---|---|
| 会话存储路径 | `~/.openclaw/agents/<id>/sessions/` | 转录保存位置 |
| 最大历史消息数 | 200（默认） | 每会话加载的消息数 |
| 输入指示器间隔 | 6 秒（默认） | 输入指示器节流 |

### 流式限制

| 限制 | 值 | 用途 |
|---|---|---|
| 最大缓冲字节 | 按客户端阈值 | 背压控制 |
| Drop-if-slow | 按事件布尔值 | 为慢客户端跳过非关键事件 |
| 代理超时 | 按代理可配置 | 最大运行时长 |

---

## 相关文档

- [系统架构](/zh-CN/architecture/) — 系统设计和职责边界
- [提供商与模型](/zh-CN/providers-and-models/) — 提供商配置、模型目录、API 密钥
- [技能](/zh-CN/skills/) — 学术技能目录和安装
- [图形界面](/zh-CN/desktop-gui/) — UI 概述和导航
