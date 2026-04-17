---
layout: page
title: TTFT 优化
lang: zh-CN
permalink: /zh-CN/ttft-optimization/
---

<!-- DESIGN-DOC: TTFT（首字符延迟）优化 — 将首字符延迟从 >10s 降低到 <5s 的策略 -->

# TTFT 优化设计

> **目标**：通过流式输出思考 token，将感知 TTFT 从 **>9s** 降低到 **~1s**（完整 prompt 下首个思考 token 在 ~1.1s 到达）。同时将总生成延迟（首个文本 token）降低到 **< 5s**。
>
> **状态**：思考流式输出已通过 AcaClaw 网关补丁（`patches/openclaw-thinking-stream/apply.mjs`）实现。网关现在将 `reasoning_content` 增量转发为 `type: "thinking"` 内容块。感知 TTFT 现在是首个思考 token（直连 ~533ms，网关 ~3.2s）。
>
> 通过 `node scripts/test-ttft.mjs`（思考模式下直连 API 与网关对比）验证。

---

## 目录

- [问题描述](#问题描述)
- [当前测量数据](#当前测量数据)
- [思考模式影响](#思考模式影响)
- [根因分析](#根因分析)
- [系统提示词分解](#系统提示词分解)
- [网关开销分解](#网关开销分解)
- [优化策略](#优化策略)
  - [P0 — 提示词裁剪](#p0--提示词裁剪)
  - [P1 — 提示词缓存](#p1--提示词缓存)
  - [P2 — 延迟工具加载](#p2--延迟工具加载)
  - [P3 — 模型选择](#p3--模型选择)
  - [P4 — 流式 UX](#p4--流式-ux)
- [实施计划](#实施计划)
- [成功标准](#成功标准)

---

## 问题描述

用户在发送聊天消息后，需要等待 **>9 秒** 的空白才能看到任何回复。DashScope API 实际上在 ~1.1s 就返回了首个思考 token（完整 15K prompt），但 OpenClaw 不流式传输思考增量 — 因此用户在文本生成开始前（思考开始后 3–17s）什么都看不到。

两个独立问题：
1. **思考 token 未流式传输** — 最重要的问题。模型的推理输出在流式传输过程中被丢弃，迫使用户等待整个思考阶段完成。
2. **总生成延迟高** — 15,300 token 的系统提示词在每轮对话中增加 ~6.2s 的预填充时间，加上不工作的提示词缓存。

当前测试结果（qwen3.5-plus via DashScope，2026-04-17 验证）：

| 测试 | 首个思考 token | 首个文本 token | 状态 |
|------|---------------|---------------|------|
| 裸 API（9 tokens，无思考） | N/A | **522–726 ms** | **通过** |
| 裸 API（9 tokens，思考） | **0.50–0.69s** | 2.87–4.46s | 首个思考：**通过** |
| 裸 API（~15K tokens） | **0.60–0.69s** | 0.60–0.68s（无思考）/ 2.28–17.74s（思考） | 首个思考：**通过** |
| 网关聊天（~15K tokens） | N/A（未流式传输） | **8,990 ms**（中位数，34 个会话） | **失败** |

### 思考模式对比（2026-04-18 验证，`node scripts/test-ttft.mjs --runs=5`）

直连 API 与网关对比，均启用 `enable_thinking=true`，相同提示词（"25+36=? just answer"）：

| 指标 | 直连 API（中位数） | 网关（中位数） | 开销 |
|------|-------------------|---------------|------|
| TTFT（思考） | **533ms** | **3.23s** | +2.70s（506%） |
| TTFT（文本） | 4.59s | 3.97s | −617ms |
| 总计 | 4.60s | 4.04s | −566ms |

| 路径 | 思考范围 | 文本范围 | 总计范围 |
|------|---------|---------|---------|
| 直连 API | 490ms–1.14s | 4.52s–4.85s | 4.55s–4.89s |
| 网关 | 2.57s–8.57s | 3.43s–9.30s | 3.50s–9.36s |

> **关键发现**：网关为首个思考 token 增加了 ~2.7s 开销（系统提示词注入 + 工具 schema 编译 + WebSocket 路由）。一旦思考开始，文本 TTFT 和总时间是可比的。首次网关运行始终延迟更高（冷启动），从第 2 次运行开始稳定。
>
> **关键发现**：网关的文本和总时间有时*快于*直连 API，因为网关的系统提示词引导模型更简洁地回答，产生更短的思考链。

> **关键发现**：裸 DashScope API 在 9,200 输入 token 下在 ~1.1s 内返回首个思考 token（最小 prompt 下为 0.55s）。即使通过网关的 15K token，首个思考也会在 ~1.4s 内到达 — 完全在可接受的 TTFT 范围内。问题完全在于 OpenClaw 的 WebSocket 层未转发这些 token。
>
> **关键发现**：DashScope 提示词缓存**未工作** — 所有会话显示 0 个缓存 token。

---

## 当前测量数据

### Token 用量（新会话的第一条消息）

| Token 类型 | 数量 | 来源 |
|-----------|------|------|
| 输入 token | 14,997–15,433 | 系统提示词 + 用户消息 |
| 缓存 token | **0（始终）** | DashScope 缓存未工作 |
| 输出 token | 115–665 | 模型回复 |

> 跨 34 个会话测量。输入 token 非常稳定（~15,300 ± 200），因为系统提示词是静态的。

### 延迟管道

```
总 TTFT：中位数 ~8,990 ms（范围 3,670–18,030 ms，34 个会话）
├── 网关开销：~260 ms（3%） ← 由性能分析器测量
│   ├── WS 连接 + message_received：~33 ms
│   ├── 会话创建 + before_agent_reply：~75 ms
│   ├── 模型解析 + agent start：~90 ms
│   └── 提示词构建 + llm_input：~62 ms
│
├── DashScope API（9,200 tokens，无工具，启用思考）：
│   ├── 首个思考 token：~1,100 ms
│   └── 首个文本 token：~2,300 ms（间隔 = ~1,200 ms 思考）
│
├── 工具 schema 开销：~6,200 额外 token
│   └── 额外预填充：~290 ms（估算，0.047 ms/token）
│
└── *** 可变思考：~2,450 ms（估算） *** ← 未解释部分
    └── 与裸 API 相比，模型在完整工具上下文中思考更久
    └── 高度可变：1–17s，取决于查询复杂度
    └── 未流式传输给用户 — 表现为空白等待时间
```

### TTFT 分解（通过性能分析器 + 隔离测试测量）

| 组件 | 中位数 | 范围 | 占总量百分比 |
|------|--------|------|------------|
| 网关开销 | 260 ms | 250–330 ms | 3% |
| DashScope 首个思考 token | 1,100 ms | 768–1,368 ms | 12% |
| 思考→文本间隔（思考生成） | 1,200 ms | 1,150–1,620 ms | 13% |
| 工具 schema 处理（估算） | 290 ms | — | 3% |
| 未解释（额外思考 + 方差） | 6,140 ms | — | 68% |
| **总计（首个文本 token）** | **8,990 ms** | **3,670–18,030 ms** | |

然而，思考 token 确实被输出了 — 如果它们被流式传输，用户将在 ~1.1s 内看到首个思考 token。参见[思考模式影响](#思考模式影响)。

> **关键修正**：早期分析将 ~3s 归因于"网关开销"。性能分析揭示网关仅花费 ~260ms。裸 API 与网关之间的 3s 差异是由于（1）工具 schema 增加了 ~6,200 额外输入 token，以及（2）模型在完整工具上下文中思考更久。

> **注意**：在相同 token 数量下，网关 TTFT 有 160% 的方差（34 个会话中 3.67s–18.03s），这主要由可变长度的思考和 DashScope 服务器端不稳定性造成，而非网关处理。

### 网关开销性能分析

> **关键发现**：网关开销仅 **~260ms** — 通过网关性能分析器验证（已移除；数据保留在下方）。从 `chat.send` 到 `llm_input` 的所有钩子在 260ms 内完成。剩余 5+ 秒是 DashScope API 时间（预填充 + 思考）。

性能分析器时间线（3 次运行，一致）：

```
+0ms     chat.send（WebSocket）
+33ms    message_received, before_dispatch
+107ms   session.start, before_agent_reply
+200ms   before_model_resolve, before_agent_start
+260ms   before_prompt_build, llm_input（API 请求已发送）
         ──── 5,200ms 间隔 ────（DashScope 处理中）
+5,300ms 首个 WS 增量（首个文本 token 收到）
```

| 网关步骤 | 时间 | 备注 |
|---------|------|------|
| WS → 消息分发 | 33ms | WebSocket + 路由 |
| 会话创建 | 75ms | JSONL 写入、会话查找 |
| 模型解析 + agent 启动 | 90ms | 配置解析 |
| 提示词构建 + API 调用 | 62ms | SOUL.md、工作区、技能、工具 schema |
| **网关总计** | **~260ms** | |

5.2s 的间隔**完全是 DashScope API**（~15,400 token 预填充 + 思考生成）。网关仅增加总 TTFT 的 3%。

**含义**：网关代码中没有显著的优化机会。两个优先事项是：
1. **流式传输思考 token** — 感知 TTFT 从 ~5s 降至 ~1.1s（首个思考 token）
2. **减少输入 token** — 更少的 token = 更快的 DashScope 处理（但仅 ~0.047ms/token）

---

## 思考模式影响

> **关键发现**：思考 token 是有效输出，应计入 TTFT。DashScope API 在 15K token 的 prompt 下在 **~0.5–0.7s** 内返回首个思考 token — 出色的延迟。问题在于 **OpenClaw 不通过 WebSocket 流式传输思考增量**，因此用户在首个文本 token 到达前（3–17s 后）什么都看不到。

### 问题

qwen3.5-plus 是一个推理模型，在生成文本之前会产生"思考" token。启用 `enable_thinking=true`（默认）时，DashScope API 流式传输两种内容类型：

1. `reasoning_content` — 思考 token（首个在 ~0.5–0.7s 到达）
2. `content` — 文本 token（在思考完成后到达，2–17s 后）

DashScope API **确实**流式传输思考 token — 它们以与文本 token 相同的低延迟到达（~0.5s TTFT）。然而，**OpenClaw 静默丢弃它们**，不通过 WebSocket 转发思考增量。网关仅发出带有 `type: "text"` 内容的 `chat` 事件增量，从不发出 `type: "thinking"`。

这意味着 AcaClaw 的思考 UI（可折叠块）只显示**最终**消息中的思考内容，而不是在流式传输期间。用户等待 3–17s 什么都看不到。

### AcaClaw UI 修复（已实现）

在 `ui/src/views/chat.ts` 中修复了两个 bug：

1. **字段名不匹配**：会话以 `{type: "thinking", thinking: "..."}` 存储思考内容，但 UI 读取的是 `c.text`（始终为空）。已修复为读取 `c.thinking ?? c.text`。
2. **完成后重新加载历史**：在 `final` 聊天事件后，UI 现在通过 `chat.history` 重新加载历史以捕获会话中的思考内容。这使得思考在回复完成后立即可见。

**结果**：思考内容现在在回复完成后正确显示在可折叠块中。

### AcaClaw 网关补丁（已实现）

AcaClaw 不等待上游 OpenClaw 修复，而是直接打补丁到网关：

- **补丁**：`patches/openclaw-thinking-stream/apply.mjs` — 在 `gateway-cli-CWpalJNJ.js` 的 webchat 回复处理器中添加 `onReasoningStream` 回调
- **机制**：补丁拦截来自 LLM 提供商的 `reasoning_content` 增量，并通过 WebSocket `chat` 事件以 `{type: "thinking"}` 内容块广播
- **节流**：100ms 防抖，避免淹没 WebSocket
- **配置**：`reasoningDefault: "stream"` 在 `config/openclaw-defaults.json` 中对所有 6 个智能体设置
- **UI**：`<details>` 在流式传输期间使用 `?open` 自动打开，完成后折叠

**结果**：完整的实时思考流式传输。首个思考 token 在 UI 中 ~3.2s 内可见（直连 API ~533ms）。2.7s 的差距是网关开销（系统提示词、工具 schema、WebSocket 路由）。

### 测量影响（裸 DashScope API，历史数据）

| 指标 | `enable_thinking=false` | `enable_thinking=true` |
|------|------------------------|------------------------|
| 首个任意 token（思考被流式传输时的 TTFT） | 522–726ms | **0.49–0.69s** |
| 首个文本 token（思考被隐藏时的 TTFT） | 522–726ms | 2.28–17.74s |
| 生成的思考字符数 | 0 | 158–1,148 |
| 总回复时间（最小 prompt） | 0.75–1.37s | 3.03–4.64s |
| 总回复时间（15K prompt） | 2.18–3.56s | 4.18–19.13s |

**关键洞察**：首个思考 token 在 **0.49–0.69s** 到达 — 几乎与非思考 TTFT 相同。如果 OpenClaw 流式传输这些 token，用户将在 0.5–0.7s 内看到可见输出（思考过程），无论 prompt 大小。思考输出也帮助用户理解模型的推理过程。

34 个会话中 160% 的 TTFT 方差（3.67–18.03s）来自可变长度的思考（158–1,148 字符）和服务器端负载，但这只影响首个**文本** token 的时间。如果思考可见，感知 TTFT 稳定在 ~0.5–0.7s。

### 次要问题：`thinkingDefault` 配置 bug

OpenClaw 的 `thinkingDefault: "disabled"` 设置实际上并未在 API 层面禁用思考：

- OpenClaw 在会话 JSONL 中记录 `thinkingLevel: off`
- 然而，存储的 JSONL 即使 `thinkingLevel: off` **仍包含思考块**（200–350 字符）
- DashScope API 的 `enable_thinking` 参数显然**未被转发**
- 所有时间段的全部 34 个会话显示 `thinkingLevel: off` 并且都包含思考内容（158–1,148 字符）

```
Session    | thinkingLevel | 思考字符数 | 输出 token | TTFT
57eb6533   | off           | 257       | 135       | 6.53s   ← 配置为 "disabled"
162e8f4b   | off           | 217       | 111       | 3.78s   ← 配置为 "disabled"
618ae919   | off           | 221       | 110       | 5.90s   ← 配置为 "adaptive"
b7b02635   | off           | 536       | 302       | 5.57s   ← 配置为 "adaptive"
```

这是一个较低优先级的问题：如果思考 token 被流式传输（P0 修复），思考实际上是有益的 — 它提供有用的推理输出。修复此 bug 仍然有用，用于用户想要禁用思考以减少总生成时间和输出 token 成本的情况。

### 思考流式传输 vs 隐藏时的 TTFT

```
当前（思考未流式传输）：
  总 TTFT（到首个可见内容）：中位数 ~8,990 ms
  ├── 网关开销：~260 ms（分发、会话、模型解析、提示词构建）
  ├── DashScope 预填充（15K token）：~1,100 ms
  ├── 思考生成：~4,560 ms（中位数，范围 1–17s）
  └── 用户在此期间什么都看不到

思考流式传输后（上游修复）：
  TTFT（到首个可见思考 token）：~1,100 ms  ← 预填充 + 首个思考 token
  ├── 网关开销：~260 ms
  └── DashScope 首个思考 token：请求后 ~1,100 ms
      └── 用户在模型推理时可以看到思考输出
```

流式传输思考 token 将感知 TTFT 从 **9.0s → ~1.1s** 降低 — 8× 改善 — 不改变模型、提示词或生成行为。

### 思考流式传输状态：已实现

~~**优先级：P0** — 通过 WebSocket 流式传输思考增量~~ — **已完成**（通过 AcaClaw 网关补丁）。

| 操作 | 感知 TTFT | 实际 TTFT | 状态 |
|------|----------|----------|------|
| 流式传输思考增量（网关补丁） | **~3.2s**（网关）/ **~533ms**（直连） | 不变 | **✓ 已实现** |
| 保持思考隐藏（修复前） | ~8,990 ms | ~8,990 ms | — |

网关 3.2s 感知 TTFT（vs 直连 533ms）是由于系统提示词 + 工具 schema 开销，而非补丁本身。参见[思考模式对比](#思考模式对比2026-04-18-验证node-scriptstest-ttftmjs---runs5)。

### 次要问题：`thinkingDefault` 配置 bug

---

## 根因分析

系统提示词为 **~15,300 token**（37,106 字符，Qwen 分词器比率 2.42 字符/token，加上工具 schema 中的 ~6,200 token）— 在**每轮**聊天中发送给 LLM。网关性能分析确认网关本身仅增加 **~260ms**。绝大部分 TTFT 是 DashScope API 时间：token 预填充（~1.1s 到首个思考 token）加上思考生成（1–17s，高度可变）。

**主要因素**：
1. **思考 token 未流式传输** — 模型在 ~1.1s 内开始思考，但 OpenClaw 只转发文本 token。用户等待 5–18s 什么都看不到。如果思考被流式传输，感知 TTFT 降至 ~1.1s。
2. **可变思考时间**（~68% 的 TTFT）— 模型的推理阶段不可预测（1–17s），特别是对于包含许多工具 schema 的复杂提示词。
3. **DashScope 缓存失败** — 如果缓存工作，token 预填充将减少，降低首个思考 token 的时间。
4. **Token 处理**（~15% 的 TTFT）— 15,300 token，0.047ms/token。影响不大。
5. **网关开销可忽略**（~3% 的 TTFT）— 仅 260ms。此处无需优化。

提示词由 **OpenClaw 的 agent runner** 组装（不是 AcaClaw），包含：

1. **OpenClaw 基础**（~14,010 token — **92%**）
   - 工具定义（~20+ 内置工具的 JSON schema）
   - 技能（强制块：~3,820 token）
   - 系统规则（安全、格式化、行为）
   - 心跳、群聊、消息规则
2. **AcaClaw 插件**（~1,290 token — **8%**）
   - Agent SOUL.md 身份（~738 token）
   - 工作区上下文（~470 token）
   - 计算环境上下文（~330 token）
   - ⚠ SOUL.md 被注入两次（见下文）— 浪费 ~450 token

---

## 系统提示词分解

### 已验证的 token 预算（总计 ~15,300 token，37,106 字符）

> Token 比率校准：37,106 字符 ÷ 15,300 token = **2.42 字符/token**（Qwen 分词器）。数据来自裸 LLM 输入捕获（`~/.acaclaw/logs/llm-input-YYYY-MM-DD.jsonl`）。

| 组件 | 字符数 | Token（估算） | 占总量百分比 | 来源 | 可裁剪？ |
|------|--------|-------------|------------|------|---------|
| **技能（强制）** | 9,243 | ~3,820 | **25%** | OpenClaw 核心 | 是 — 技能过滤 |
| **工具 + 调用风格** | 4,716 | ~1,949 | 13% | OpenClaw 核心 | 是 — 拒绝未用工具 |
| **心跳 / 群组 / 主动** | 2,887 | ~1,193 | 8% | OpenClaw 核心 | 部分（上游） |
| **IDENTITY / USER / BOOTSTRAP** | 2,478 | ~1,024 | 7% | OpenClaw 核心 | 部分 |
| **记忆 / 会话** | 1,767 | ~730 | 5% | OpenClaw 核心 | 否 |
| **回复 / 消息** | 1,647 | ~681 | 4% | OpenClaw 核心 | 部分 |
| **TOOLS.md（本地笔记）** | 746 | ~308 | 2% | OpenClaw 核心 | 是 — 裁剪 |
| **其他 OpenClaw**（安全、文档等） | 10,426 | ~4,305 | 28% | OpenClaw 核心 | 部分 |
| **SOUL.md（主 agent）** | 1,786 | ~738 | 5% | AcaClaw | 部分 — 压缩 |
| **工作区上下文** | 1,137 | ~470 | 3% | AcaClaw | 是 — 摘要化 |
| **计算环境** | 798 | ~330 | 2% | AcaClaw | 是 — 未使用时省略 |
| **⚠ SOUL.md 重复** | ~1,098 | ~450 | 3% | AcaClaw（bug） | **是 — 移除** |
| **用户消息** | 141 | ~58 | <1% | 用户 | 否 |
| **会话历史** | 0（新会话） | 0 | 0% | OpenClaw 核心 | 压缩 |
| **总计** | **37,106** | **~15,300** | **100%** | | |

> **⚠ SOUL.md 被注入两次**：一次在 agent 性格部分，一次在工作区文件部分（`/Users/.../AcaClaw/SOUL.md`）。浪费 ~450 token。移除重复可节省 ~1.3% 的输入 token。

### AcaClaw 注册的自定义工具（共 8 个）

| 工具 | 插件 | 可拒绝？ |
|------|------|---------|
| `workspace_info` | acaclaw-workspace | 否 — 必需 |
| `env_status` | acaclaw-academic-env | 是 |
| `backup_restore` | acaclaw-backup | 是 |
| `backup_list` | acaclaw-backup | 是 |
| `compat_check` | acaclaw-compat-checker | 是 |
| `event_log` | acaclaw-logger | 是 |
| `security_audit` | acaclaw-security | 是 |
| `security_status` | acaclaw-security | 是 |

### 关键观察

1. **~92% 的输入 token 来自 OpenClaw 自身**（技能、工具 schema、系统规则、心跳等）。AcaClaw 仅增加 ~8%（~1,290 token）。
2. **SOUL.md 被注入两次** — agent 性格部分 + 工作区文件。浪费 ~450 token。
3. **技能强制块是最大的单一部分** — 9,243 字符，~3,820 token（总量的 25%）。
4. **DashScope 提示词缓存未工作** — 34 个测量会话中缓存 token 为 0。
5. **DashScope API 在相同 token 数量下有 160% 的 TTFT 方差**（34 个会话中 3.67s–18.03s），表明服务器端不稳定。
6. **拒绝 7 个 AcaClaw 工具**可节省 ~1,400–1,750 token（~0.4s），但单独不能达到 5s 目标。

---

## 优化策略

### P0 — 提示词裁剪

**预期减少：3,000–4,500 token → TTFT 节省：~1,350–2,025 ms**

这些更改在不修改代码的情况下减少 token 数量。

#### 1. 基于技能的 agent 过滤

仅包含与活跃 agent 相关的技能。当前所有已安装技能都包含在每个 agent 中。

```json
// openclaw.json — OpenClaw 已支持
{
  "agents": {
    "list": [
      {
        "id": "main",
        "skillFilter": ["literature-review", "pubmed-edirect"]
      }
    ]
  }
}
```

**影响**：6 个技能 × ~800 token = 4,800 token → 过滤为 2 个技能 = 1,600 token。**节省 ~3,200 token**。

#### 2. 拒绝 AcaClaw 工具工具

拒绝 7 个聊天期间不需要的 AcaClaw 注册工具：

```json
{
  "tools": {
    "deny": [
      "gateway", "cron", "sessions_spawn", "sessions_send",
      "mcp_install", "mcp_uninstall", "config_set",
      "backup_restore", "backup_list", "compat_check",
      "event_log", "security_audit", "security_status",
      "env_status"
    ]
  }
}
```

**影响**：7 个 AcaClaw 工具 × ~200–250 token = **节省 ~1,400–1,750 token**（~0.6–0.8s）。

#### 3. 拒绝学术用途不需要的 OpenClaw 工具

拒绝学术 agent 很少使用的 OpenClaw 内置工具：

```json
{
  "tools": {
    "deny": [
      "lsp_diagnostics", "lsp_references", "lsp_hover",
      "notebook_edit", "notebook_read"
    ]
  }
}
```

**影响**：5 个工具 × ~300–500 token = **节省 ~1,500–2,500 token**（~0.7–1.1s）。

#### 4. 压缩 agent SOUL.md

当前主 SOUL.md 为 1,786 字符（~447 token）。可以精简：

```markdown
<!-- 之前：447 token -->
You are AcaClaw's main research assistant. You help researchers with 
literature review, data analysis, scientific writing, and computational 
experiments. You have deep expertise in...

<!-- 之后：200 token -->
AcaClaw main assistant. Expertise: literature review, data analysis, 
scientific writing, computational experiments.
```

**影响**：每个 agent ~247 token。影响不大。

#### 5. 工作区上下文压缩

发送摘要而非完整目录树：

```
Workspace: ~/AcaClaw  (12 files, 3 dirs)
```

vs:

```
Workspace: ~/AcaClaw
├── documents/
│   ├── drafts/
│   │   └── aptamer_drugs_report.docx
│   └── papers/
│       └── ...
├── output/
│   └── aptamer_drugs_2026_review.md
└── ...
```

**影响**：节省 ~200–500 token。

---

### P1 — 提示词缓存

**潜在改善：热缓存 2–4× → TTFT ~2,500–3,500 ms**

#### DashScope（当前提供商）— 已验证未工作

DashScope（阿里云百炼）声称通过 OpenAI 兼容 API 支持 Qwen 模型的**上下文缓存**。然而，**测试显示所有 34 个会话中缓存 token 为 0**：

```
$ node scripts/test-ttft.mjs --history
  Caching: NONE — 0 cached tokens across all sessions
```

可能原因：
- DashScope 可能需要显式缓存 API 调用（非自动前缀匹配）
- `compatible-mode/v1` 端点可能不支持缓存
- 系统提示词可能在请求间略有变化（时间戳、工作区状态）

**待办事项**：
1. ~~验证 DashScope 在 usage 响应中返回 `cached_tokens`~~ → **已验证：始终为 0**
2. 调查 DashScope 的显式缓存 API（context_cache_id 参数）
3. 测试具有已验证缓存功能的提供商（OpenRouter、Anthropic）
4. 确保 AcaClaw 发送**完全相同**的系统提示词 — 检查工作区上下文中的逐请求差异

#### 其他提供商

| 提供商 | 冷缓存 TTFT | 热缓存 TTFT | 加速 |
|-------|-----------|-----------|------|
| OpenRouter (MiniMax M2.7) | 9,579 ms | 2,247 ms | **4.3×** |
| Anthropic (Claude) | ~8,000 ms | ~2,000 ms | **4×** |
| DashScope (qwen3.5-plus) | 8,990 ms | **N/A（缓存不工作）** | **N/A** |

#### 确定性会话 ID（已实现）

AcaClaw 为默认标签页使用确定性会话 ID（`agent:main:web:main`），保持缓存在页面重载间保持热状态。这仅在提供商支持前缀缓存且用户停留在同一会话时有效。

---

### P2 — 延迟工具加载

**预期减少：2,000–4,000 token → TTFT 节省：~1,500–3,000 ms**

不将所有工具 schema 包含在系统提示词中，而使用两步方法：

#### 第一步 — 轻量工具索引

仅发送工具**名称和一行描述**（每个工具 ~50 token 而非 ~300）：

```
Available tools: web_search (search the web), web_fetch (fetch a URL),
read (read a file), write (write a file), edit (edit a file),
bash (run a command), ...
```

#### 第二步 — 按需完整 schema

当模型调用工具时，在下一轮中包含该工具的完整 JSON schema。这需要更改 OpenClaw 的 agent runner（上游贡献或插件钩子）。

**权衡**：没有完整 schema 时，模型可能做出稍差的工具调用决策，特别是对于参数多的复杂工具。

**替代方案 — 类别化**：将工具分组为类别，仅包含用户查询暗示的类别的完整 schema：

| 查询提及 | 加载工具 |
|---------|---------|
| "search", "find papers" | `web_search`, `web_fetch` |
| "write code", "run" | `bash`, `write`, `edit` |
| "read file", "show" | `read`, `list` |

---

### P3 — 模型选择

**潜力：2–5× TTFT 改善**

不同模型具有不同的 TTFT 特性：

| 模型 | 提供商 | 裸 TTFT（9 token） | 预期网关 TTFT |
|------|--------|-------------------|-------------|
| qwen3.5-plus | DashScope | 522–726 ms | 8,990 ms（实测） |
| qwen-plus | DashScope | ~1,500 ms | ~7,500 ms（估算） |
| qwen-turbo | DashScope | ~500 ms | ~3,000 ms（估算） |
| claude-3.5-haiku | Anthropic | ~300 ms | ~2,000 ms（估算） |
| gpt-4o-mini | OpenAI | ~400 ms | ~2,500 ms（估算） |

**策略**：使用更快的模型进行**心跳/路由**阶段，可选地仅在复杂查询时升级到更大模型：

```json
{
  "agents": {
    "defaults": {
      "model": "modelstudio/qwen-turbo",
      "heartbeat": {
        "model": "modelstudio/qwen-turbo"
      }
    }
  }
}
```

**权衡**：更小/更快的模型可能推理质量较低。

---

### P4 — 流式 UX

**感知改善，非实际 TTFT 降低**

#### 输入指示器

发送后立即显示输入动画：

```
User: search aptamer drugs in recent 5 years
Assistant: ⠋ 思考中...  ← 立即出现
```

这不会减少实际 TTFT 但减少**感知**等待时间。

#### 流式传输思考 token — ✅ 已实现

思考流式传输已通过 AcaClaw 网关补丁（`patches/openclaw-thinking-stream/apply.mjs`）实现。网关以 100ms 节流频率将 `reasoning_content` 增量转发为 `type: "thinking"` 内容块。UI 在可折叠的 `<details>` 块中渲染思考内容，流式传输期间自动打开。

**测量结果**（5 次运行，`node scripts/test-ttft.mjs --runs=5`）：
- 直连 API 首个思考 token：**533ms**（范围 490ms–1.14s）
- 网关首个思考 token：**3.23s**（范围 2.57s–8.57s）
- 网关开销：**+2.7s**（系统提示词 + 工具 schema + WebSocket 路由）

这是**最有影响的 TTFT 优化**：感知 TTFT 从 ~9.0s（无思考）降低到 ~3.2s（首个思考 token 可见）。进一步降低需要裁剪系统提示词（阶段 1）或修复提示词缓存（阶段 2）。

---

## 实施计划

### 阶段 0：流式传输思考 token — ✅ 已实现

| 操作 | 感知 TTFT | 状态 |
|------|----------|------|
| 通过网关补丁流式传输思考增量 | **~3.2s**（网关）/ **~533ms**（直连） | **✅ 完成** |
| 修复 `thinkingDefault: disabled` 以传递 `enable_thinking=false` | 附带修复 | 待完成 |

阶段 0 后的感知 TTFT：**~3.2s**（网关，首个思考 token）。直连 API 达到 ~533ms。

### 阶段 1：速赢（配置更改，无代码）

| 操作 | Token 节省 | TTFT 影响 |
|------|-----------|----------|
| 拒绝 7 个 AcaClaw 工具 | ~1,600 | −720 ms |
| 拒绝 5 个 OpenClaw 未用工具（LSP、notebook） | ~2,000 | −900 ms |
| 为主 agent 添加 `skillFilter` | ~1,000 | −450 ms |
| 压缩 SOUL.md | ~250 | −110 ms |
| **总计** | **~4,850** | **~2,180 ms** |

阶段 1 后预期冷缓存 TTFT：**~6,800 ms**（仍高于 5s）

> 注：这些节省不大，因为 token 处理仅占总 TTFT 的 ~15%。网关性能分析确认网关代码开销仅 ~260ms — 主要成本是 DashScope API 时间（预填充 + 思考）。DashScope 提示词缓存未工作。在修复前不能依赖热缓存。

### 阶段 1.5：网关开销（确认可忽略）

网关性能分析（见[网关开销性能分析](#网关开销性能分析)）确认所有网关代码（分发→会话→模型解析→提示词构建→llm_input）在 **~260ms** 内完成。无需对网关本身进行代码级优化 — `llm_input` 和首个文本增量之间的 5.2s 间隔 100% 是 DashScope API 时间（token 预填充 + 思考生成）。

**此阶段无待办事项。**

### 阶段 2：解决 DashScope 方差（提供商端）

| 操作 | TTFT 影响 | 权衡 |
|------|----------|------|
| 调查 DashScope 显式缓存 API | −3,000–5,000 ms（热缓存） | 可能需要 API 变更 |
| 测试 Anthropic/OpenRouter 的提示词缓存 | −5,000 ms（热缓存） | 不同模型 |
| 对简单查询使用 qwen-turbo | −3,000 ms | 推理较弱 |
| **总计（切换提供商）** | **−5,000 ms** | 不同模型/成本 |

热缓存预期 TTFT：**~3,500–5,000 ms**（达到或低于目标）

### 阶段 3：提示词压缩（代码变更，需上游）

| 操作 | Token 节省 | TTFT 影响 |
|------|-----------|----------|
| 延迟工具加载（上游 PR） | ~3,000 | −1,350 ms |
| 压缩工作区上下文 | ~200 | −90 ms |
| **总计** | **~3,200** | **~1,440 ms** |

阶段 1+3 后预期 TTFT：**~5,360 ms**（冷缓存，单一提供商）

### 优先级评估

**最大收益（按顺序）**：

1. ~~**流式传输思考 token**（阶段 0）~~ — **✅ 已完成。** 感知 TTFT 通过 AcaClaw 网关补丁从 ~9.0s 降至 ~3.2s（网关）。直连 API 达到 ~533ms。
2. **修复提示词缓存**（阶段 2）— 如果 DashScope 缓存工作，15,300 token 提示词的预填充时间将大幅下降。当前所有会话中缓存 token 为 0。
3. **裁剪提示词 / 拒绝未用工具**（阶段 1）— 减少 ~4,850 token，节省 ~200–400ms 的预填充时间。也会减少网关思考 TTFT 开销。不大但容易实现的收益（仅配置）。
4. **延迟工具加载**（阶段 3，上游）— 移除 ~3,000 工具 schema token，节省 ~140ms 预填充。需要上游 PR。

> **网关开销不是瓶颈**（阶段 1.5）— 性能分析确认仅 ~260ms。无需代码级优化。

---

## 成功标准

| 指标 | 阈值 | 测试 | 当前 |
|------|------|------|------|
| 网关 TTFT — 首个思考 token | < 4,000 ms | `node scripts/test-ttft.mjs` | **3,230 ms ✓**（思考现在流式传输） |
| 网关 TTFT — 首个文本 token | < 5,000 ms | 同上 | **3,970 ms ✓** |
| 网关开销（纯） | < 500 ms | 网关性能分析器（历史数据） | **260 ms ✓** |
| 直连 API TTFT — 首个思考 token | < 1,000 ms | `node scripts/test-ttft.mjs` | **533 ms ✓** |
| 直连 API TTFT — 首个文本 token | < 5,000 ms | 同上 | **4,590 ms ✓** |
| 网关思考开销 | < 3,000 ms | `node scripts/test-ttft.mjs`（开销） | **2,700 ms ✓** |
| 思考通过 WebSocket 流式传输 | 增量中有 `type: "thinking"` | 检查 chat 事件增量 | **✓ — 通过网关补丁** |
| 提示词缓存活跃 | cacheRead > 0 | 提供商面板 | **0 ✗** |
| Shell 脚本 TTFT | < 5,000 ms | `bash scripts/test-chat-latency.sh` | **10,000+ ms ✗** |

所有 TTFT 测试使用 **5 秒阈值**。TTFT > 5s = 测试失败。

---

## 附录：测量数据

### 真实会话 token 用量

```
Session: 15d01efe-af32-41ac-824e-12e8a54edd07
Model: modelstudio/qwen3.5-plus
Query: "search aptamer drugs in recent 5 years and write a report in word"

首次响应用量：
  输入：      15,291 tokens
  缓存读取：  0 tokens
  缓存写入：  0 tokens
  输出：      590 tokens
```

### TTFT 对比：直连 API vs 网关（思考模式，2026-04-18）

```
直连 API（enable_thinking=true，5 次运行中位数）：
  首个思考 token：   533ms（范围 490ms–1.14s）
  首个文本 token：  4,590ms（范围 4.52s–4.85s）
  总计：            4,600ms（范围 4.55s–4.89s）

网关（enable_thinking=true，5 次运行中位数）：
  首个思考 token：  3,230ms（范围 2.57s–8.57s）
  首个文本 token：  3,970ms（范围 3.43s–9.30s）
  总计：            4,040ms（范围 3.50s–9.36s）

开销（网关 − 直连）：
  思考 TTFT：+2,700ms（直连的 506%）
  文本 TTFT：  −617ms（网关文本常更快 — 更短的思考链）
  总计：       −566ms（可比）
```

### 历史对比：裸 API vs 网关（思考流式传输前）

```
层 A — 裸 API（无 prompt）：     679 ms（16 tokens，3 次运行中位数）
层 B — 裸 API + 系统提示词：  1,110 ms（9,203 tokens，3 次运行中位数）
层 C — 网关（全栈）：         4,420 ms（~15,400 tokens，3 次运行中位数）
网关历史：                    8,990 ms（~15,300 tokens，34 个会话中位数）

Token 开销（B − A）：  431ms，额外 9,187 token = 0.047ms/token
Token 开销（C − A）：3,741ms，额外 ~15,384 token

网关性能分析（历史数据，3 次运行）：
  chat.send → llm_input：   ~260ms（网关代码开销）
  llm_input → 首个增量：  ~5,200ms（DashScope API：预填充 + 思考）
  网关总 TTFT：             ~5,460ms

结论：隔离测试中表面上的 "3,030ms 网关开销"（C − B − token 处理）
是错误归因。层 C 与层 B 的额外时间来自：
  1. ~6,200 额外工具 schema token（15,400 − 9,200）
  2. 模型在完整工具上下文中思考更久
  3. 实际网关代码开销：仅 ~260ms
```

### 思考 vs 非思考（裸 DashScope API）

```
最小 prompt（9 tokens）：
  thinking=false：0.55–0.70s 首个文本  |  总计 0.75–1.37s
  thinking=true：  2.87–4.46s 首个文本  |  总计 3.03–4.64s

大 prompt（~15K tokens）：
  thinking=false：0.60–0.68s 首个文本  |  总计 2.18–3.56s
  thinking=true：  2.28–17.74s 首个文本 |  总计 4.18–19.13s
```

### AcaClaw 中已有的优化

- 确定性会话 ID（`agent:main:web:main`）— 保持提供商缓存热状态
- 认证模式 `"none"` — 消除认证开销（节省 ~5ms）
- 插件加载 — 仅启动时，非每次请求
