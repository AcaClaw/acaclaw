---
layout: page
title: 服务商与模型
lang: zh-CN
permalink: /zh-CN/providers-and-models/
---

> **基本原则**：OpenClaw 负责管理服务商、模型发现和 API 密钥存储。AcaClaw GUI 通过 OpenClaw API 进行读写 —— 绝不维护独立的目录。

---

## OpenClaw 如何管理 LLM 服务商

### 服务商定义

每个 LLM 服务商是 `openclaw.json` 中 `models.providers.<id>` 下的 `ModelProviderConfig` 对象：

```json
{
  "models": {
    "providers": {
      "anthropic": {
        "baseUrl": "https://api.anthropic.com",
        "apiKey": "sk-ant-...",
        "auth": "api-key",
        "api": "anthropic-messages",
        "models": [
          {
            "id": "claude-opus-4-6",
            "name": "Claude Opus",
            "reasoning": true,
            "input": ["text", "image"],
            "contextWindow": 200000,
            "maxTokens": 4096,
            "cost": { "input": 0.003, "output": 0.015, "cacheRead": 0.0003, "cacheWrite": 0.00375 }
          }
        ]
      }
    }
  }
}
```

### 服务商类型参考

```
ModelProviderConfig
├── baseUrl: string              # API 端点 URL
├── apiKey?: SecretInput         # 字面值、环境变量引用或执行源
├── auth?: ModelProviderAuthMode # "api-key" | "aws-sdk" | "oauth" | "token"
├── api?: ModelApi               # API 格式（见下表）
├── headers?: Record<string, SecretInput>  # 自定义认证/路由头
├── authHeader?: boolean         # 是否发送 Authorization 头
├── injectNumCtxForOpenAICompat?: boolean  # Ollama 上下文注入
└── models: ModelDefinitionConfig[]        # 静态模型列表
```

### 支持的 API 格式 (`ModelApi`)

| 值 | 适用场景 |
|---|---|
| `openai-completions` | OpenAI、DeepSeek、Together、Groq 及大多数 OpenAI 兼容接口 |
| `openai-responses` | OpenAI Responses API |
| `anthropic-messages` | Anthropic Claude |
| `google-generative-ai` | Google Gemini (Generative AI) |
| `bedrock-converse-stream` | AWS Bedrock |
| `ollama` | Ollama（本地模型） |
| `github-copilot` | GitHub Copilot |
| `openai-codex-responses` | OpenAI Codex |

### 服务商认证模式

| 模式 | 使用场景 |
|---|---|
| `api-key` | 标准 API 密钥认证（大多数服务商） |
| `oauth` | OAuth2 令牌交换（Google Vertex 等企业场景） |
| `aws-sdk` | AWS IAM / Bedrock（使用 AWS SDK 凭证） |
| `token` | Bearer 令牌认证 |

---

## OpenClaw 如何映射服务商 → 模型列表

### 三个模型来源

OpenClaw 的模型目录由三个来源合并而成：

```
┌─────────────────────────────────────────────┐
│  1. 内置目录 (PI SDK)                        │
│     约 50+ 模型 (Claude, GPT, Gemini 等)    │
│     从嵌入式模型注册表加载                    │
├─────────────────────────────────────────────┤
│  2. 用户配置 (openclaw.json)                 │
│     models.providers.<id>.models[]           │
│     用户自定义或覆盖的模型                    │
├─────────────────────────────────────────────┤
│  3. 插件扩展                                 │
│     extensions/<id>/provider-catalog.ts      │
│     动态服务商发现钩子                        │
└─────────────────────────────────────────────┘
         │
         ▼
   ┌───────────────┐
   │ 模型目录       │  ← 去重、按服务商+名称排序
   │ (内存缓存)     │
   └───────────────┘
```

### 模型定义结构

目录中每个模型包含以下字段：

```
ModelDefinitionConfig
├── id: string           # 模型 ID（如 "claude-opus-4-6"、"gpt-5.4"）
├── name: string         # 显示名称
├── api?: ModelApi       # 覆盖服务商级别的 API 格式
├── reasoning: boolean   # 是否支持扩展思维 / 推理链
├── input: string[]      # ["text"] 或 ["text", "image"]
├── contextWindow: number # 最大输入 token 数（如 200000）
├── maxTokens: number    # 最大输出 token 数
├── cost: CostConfig     # 按 token 计价
│   ├── input: number
│   ├── output: number
│   ├── cacheRead: number
│   └── cacheWrite: number
├── headers?: Record     # 模型特定请求头
└── compat?: CompatConfig # API 兼容性配置
```

### 目录条目（API 返回内容）

`models.list` RPC 返回简化的视图：

```
ModelCatalogEntry
├── id: string            # 模型 ID
├── name: string          # 显示名称
├── provider: string      # 服务商 ID（如 "anthropic"、"openai"）
├── contextWindow?: number
├── reasoning?: boolean
└── input?: string[]      # ["text"] 或 ["text", "image"]
```

### 模型加载流程

```
loadModelCatalog()
│
├─ 1. ensureOpenClawModelsJson()
│     └─ 根据配置 + 环境指纹生成 models.json
│
├─ 2. 导入 PI SDK (pi-model-discovery-runtime)
│     └─ 内置 Anthropic/OpenAI/Google 目录（约 50+ 模型）
│
├─ 3. 从 models.json 构建 ModelRegistry
│     ├─ 过滤被抑制的模型
│     └─ 合并用户配置的可选服务商
│
├─ 4. augmentModelCatalogWithProviderPlugins()
│     └─ 每个扩展的发现钩子添加其模型
│
├─ 5. 按小写 "provider::modelId" 去重
│
└─ 6. 按服务商、模型名称排序 → 返回缓存结果
```

### 配置合并模式：`mode`

| 模式 | 行为 |
|---|---|
| `merge`（默认） | 用户服务商与内置目录合并 |
| `replace` | 仅使用用户配置的服务商（忽略内置目录） |

### 模型允许列表

如果 `agents.defaults.models` 是非空映射，`models.list` 仅返回该映射中的模型。保持为空 `{}` 以获取不受限制的访问。

---

## API 密钥解析链

OpenClaw 需要为服务商获取 API 密钥时，按以下顺序检查：

```
1. 配置中的字面值
   models.providers.<id>.apiKey = "sk-..."

2. 环境变量引用
   models.providers.<id>.apiKey = "${ANTHROPIC_API_KEY}"

3. 认证配置文件存储
   ~/.openclaw/credentials/ 或 auth-profiles.json

4. 已知环境变量
   ANTHROPIC_API_KEY, OPENAI_API_KEY 等

5. OAuth 令牌交换（用于 oauth 认证模式）

6. AWS SDK 凭证（用于 bedrock 认证模式）
```

OpenClaw 在 API 响应中用 `"__OPENCLAW_REDACTED__"` 替换密钥值 —— 实际密钥永远不会通过 `config.get` 返回。

---

## 网关 API 端点

### WebSocket RPC: `models.list`

获取可用模型的主要方式。

```
请求:
  { type: "req", id: "<uuid>", method: "models.list", params: {} }

响应:
  {
    type: "res", id: "<uuid>", ok: true,
    payload: {
      models: [
        { id: "claude-opus-4-6", name: "Claude Opus", provider: "anthropic", contextWindow: 200000, reasoning: true },
        { id: "gpt-5.4", name: "GPT-5.4", provider: "openai", contextWindow: 128000, reasoning: false },
        ...
      ]
    }
  }
```

如果配置了 `agents.defaults.models` 允许列表，响应会被过滤。

### WebSocket RPC: `config.get`

返回完整配置快照（API 密钥已脱敏）。

```
请求:
  { type: "req", id: "<uuid>", method: "config.get", params: {} }

响应:
  {
    type: "res", id: "<uuid>", ok: true,
    payload: {
      config: { ... 完整 openclaw.json ... },
      baseHash: "abc123",
      hash: "def456"
    }
  }
```

### WebSocket RPC: `config.set`

写入完整配置（需要 `baseHash` 实现乐观并发控制）。

```
请求:
  {
    type: "req", id: "<uuid>", method: "config.set",
    params: { raw: "<完整 JSON 字符串>", baseHash: "abc123" }
  }
```

### HTTP: `GET /v1/models`（OpenAI 兼容）

返回智能体级别的模型 ID（不是原始的服务商模型）：

```json
{
  "object": "list",
  "data": [
    { "id": "openclaw", "object": "model", "created": 0, "owned_by": "openclaw" },
    { "id": "openclaw/main", "object": "model", "created": 0, "owned_by": "openclaw" }
  ]
}
```

---

## 内置服务商（约 30+）

OpenClaw 内置支持以下服务商（设置 API 密钥即可使用）：

### 核心 LLM 服务商

| 配置 ID | 显示名称 | API 格式 | 基础 URL | 环境变量 | 目录 ID |
|---|---|---|---|---|---|
| `anthropic` | Anthropic | `anthropic-messages` | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` | `anthropic` |
| `openai` | OpenAI | `openai-completions` | `https://api.openai.com/v1` | `OPENAI_API_KEY` | `openai`, `openai-codex` |
| `google` | Google AI | `google-generative-ai` | (SDK 管理) | `GOOGLE_API_KEY` | `google`, `google-gemini-cli` |
| `deepseek` | DeepSeek | `openai-completions` | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` | `deepseek` |
| `mistral` | Mistral | `openai-completions` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` | `mistral` |
| `openrouter` | OpenRouter | `openai-completions` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `openrouter` |
| `ollama` | Ollama（本地） | `ollama` | `http://localhost:11434` | — | `ollama` |
| `amazon-bedrock` | Amazon Bedrock | `bedrock-converse-stream` | (AWS SDK) | AWS 凭证 | `amazon-bedrock` |
| `azure` | Azure OpenAI | `openai-completions` | (用户配置) | `AZURE_OPENAI_API_KEY` | `azure-openai-responses` |

### xAI、中国服务商及其他

| 配置 ID | 显示名称 | API 格式 | 基础 URL | 环境变量 | 目录 ID |
|---|---|---|---|---|---|
| `xai` | xAI (Grok) | `openai-completions` | `https://api.x.ai/v1` | `XAI_API_KEY` | `xai` |
| `modelstudio` | 通义（阿里云百炼） | `openai-completions` | `https://coding-intl.dashscope.aliyuncs.com/v1`（国际）/ `https://coding.dashscope.aliyuncs.com/v1`（中国） | `MODELSTUDIO_API_KEY` | `modelstudio` |
| `volcengine` | 火山引擎（豆包/字节跳动） | `openai-completions` | `https://ark.cn-beijing.volces.com/api/v3` | `VOLCANO_ENGINE_API_KEY` | `volcengine`, `volcengine-plan` |
| `moonshot` | Moonshot / Kimi | `openai-completions` | `https://api.moonshot.cn/v1` | `MOONSHOT_API_KEY` | `moonshot`, `kimi`, `kimi-coding` |
| `qianfan` | 百度千帆 | `openai-completions` | `https://qianfan.baidubce.com/v2` | `QIANFAN_API_KEY` | `qianfan` |
| `minimax` | MiniMax | `openai-completions` | `https://api.minimax.io/v1` | `MINIMAX_API_KEY` | `minimax`, `minimax-portal` |
| `together` | Together AI | `openai-completions` | `https://api.together.xyz/v1` | `TOGETHER_API_KEY` | `together` |
| `nvidia` | NVIDIA | `openai-completions` | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` | `nvidia` |
| `venice` | Venice AI | `openai-completions` | `https://api.venice.ai/api/v1` | `VENICE_API_KEY` | `venice` |
| `github-copilot` | GitHub Copilot | `openai-responses` | `https://api.individual.githubcopilot.com` | `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` | `github-copilot` |
| `huggingface` | Hugging Face | `openai-completions` | (Inference API) | `HF_TOKEN` | `huggingface` |

### 仅工具插件（非模型服务商）

这些扩展提供非 LLM 服务，**不会**出现在 `models.list` 中：

| 插件 ID | 用途 | 环境变量 |
|---|---|---|
| `groq` | 音频转写 (Whisper) | `GROQ_API_KEY` |
| `perplexity` | 网络搜索 | `PERPLEXITY_API_KEY` |
| `brave` | Brave 网络搜索 | `BRAVE_API_KEY` |

### 服务商 ID 别名

OpenClaw 通过 `normalizeProviderId()` 规范化部分旧版/替代服务商 ID：

| 输入 | 规范化为 |
|---|---|
| `bytedance`、`doubao` | `volcengine` |
| `bedrock`、`aws-bedrock` | `amazon-bedrock` |
| `qwen` | `qwen-portal` |
| `kimi`、`kimi-code`、`kimi-coding` | `kimi` |

可通过扩展或用户配置添加更多服务商。

---

## 插件服务商发现

扩展通过 Plugin SDK 注册服务商：

```typescript
// extensions/my-provider/provider-catalog.ts
export function buildMyProvider(): ModelProviderConfig {
  return {
    baseUrl: "https://api.myprovider.com/v1",
    api: "openai-completions",
    models: [
      { id: "my-model-1", name: "My Model 1", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 4096, cost: { input: 0.001, output: 0.002 } }
    ]
  };
}
```

发现过程分为 4 个阶段：`simple` → `profile` → `paired` → `late`。

---

## 模型引用格式

模型以 `provider/model-id` 字符串引用：

```
anthropic/claude-opus-4-6
openai/gpt-5.4
openrouter/anthropic/claude-sonnet-4
moonshot/kimi-k2.5
ollama/llama3
```

`parseModelRef(raw)` 函数在第一个 `/` 处分割：
- `openrouter/anthropic/claude-sonnet-4` → provider=`openrouter`, model=`anthropic/claude-sonnet-4`

---

## 目录 ID 到配置 ID 的服务商映射

### 问题：两套 ID 系统

OpenClaw 存在**两套独立的服务商 ID 系统**，AcaClaw 必须在两者之间建立桥梁：

1. **配置服务商 ID** —— `openclaw.json` 中 `models.providers.<id>` 的键名（如 `moonshot`、`azure`、`google`）
2. **目录服务商 ID** —— `models.list` 返回的 `provider` 字段（如 `kimi-coding`、`azure-openai-responses`、`google-vertex`）

这些 ID 通常**不匹配**。例如：
- 配置中是 `moonshot` → 目录返回的模型 `provider` 是 `"kimi-coding"` 和 `"moonshot"`
- 配置中是 `azure` → 目录返回 `provider: "azure-openai-responses"`
- 配置中是 `google` → 目录返回 `provider: "google-vertex"` 和 `provider: "google-generative-ai"`

如果不建立桥梁，UI 无法按已配置服务商过滤模型目录。

### 为什么存在两套系统

OpenClaw 扩展通常在单个 API 密钥下注册多个服务商条目。moonshot 扩展是一个很好的例子：

```
扩展: moonshot (api.moonshot.ai, 4 个模型)
扩展: kimi-coding (api.kimi.com/coding/, 2 个模型)
两者共享相同的 "moonshot" 配置键和 API 密钥
```

OpenClaw 的 `normalizeProviderId()`（位于 `src/agents/provider-id.ts`）映射别名：
- `kimi`、`kimi-code`、`kimi-coding` → `"kimi"`（内部标识）
- `bedrock`、`aws-bedrock` → `"amazon-bedrock"`

`config-state.ts` 中的 `PLUGIN_ID_ALIASES` 映射扩展 ID：
- `"kimi-coding"` → `"kimi"`（共享 moonshot 的 API 密钥）
- `"openai-codex"` → `"openai"`

### 解决方案：`CATALOG_TO_CONFIG_PROVIDER` 映射

AcaClaw 在 `ui/src/models/provider-mapping.ts` 中维护一个静态映射表：

```typescript
export const CATALOG_TO_CONFIG_PROVIDER: Record<string, string> = {
  // 核心服务商
  "anthropic":                "anthropic",
  "openai":                   "openai",
  "openai-codex":             "openai",
  "openai-responses":         "openai",
  "azure-openai-responses":   "azure",
  "google":                   "google",
  "google-vertex":            "google",
  "google-gemini-cli":        "google",
  "deepseek":                 "deepseek",
  "mistral":                  "mistral",
  "openrouter":               "openrouter",
  "ollama":                   "ollama",
  // Moonshot / Kimi 系列
  "moonshot":                 "moonshot",
  "kimi":                     "moonshot",
  "kimi-coding":              "moonshot",
  // xAI
  "xai":                      "xai",
  // 通义（阿里云百炼）
  "modelstudio":              "modelstudio",
  // 火山引擎（豆包/字节跳动）
  "volcengine":               "volcengine",
  "volcengine-plan":          "volcengine",
  // GitHub Copilot
  "github-copilot":           "github-copilot",
  // 其他
  "together":                 "together",
  "nvidia":                   "nvidia",
  "venice":                   "venice",
  "qianfan":                  "qianfan",
  "amazon-bedrock":           "amazon-bedrock",
  "huggingface":              "huggingface",
  "minimax":                  "minimax",
  "minimax-portal":           "minimax",
  "byteplus":                 "volcengine",
  "byteplus-plan":            "volcengine",
};
```

辅助函数 `catalogToConfigProvider(catalogId)` 返回配置键，对于未知服务商则直接返回目录 ID。

### 过滤原理

当用户配置了 `openrouter`，而目录返回 809 个跨 23 个服务商的模型时：

```
models.list → 809 个模型（所有服务商）
config.get  → models.providers = { openrouter: { apiKey: "..." } }

过滤: model.provider → catalogToConfigProvider() → 检查结果是否在 configuredProviders 中
结果: 246 个模型（仅 openrouter）
```

### 反向查找：配置 ID → 目录模型

在显示每个服务商的模型表时（展示已配置服务商提供哪些模型），我们进行反向查找：

```typescript
// 查找映射到指定配置服务商的所有目录服务商
_modelsForConfigProvider(configId: string) {
  const catalogProviders = Object.entries(CATALOG_TO_CONFIG_PROVIDER)
    .filter(([, cfg]) => cfg === configId)
    .map(([cat]) => cat);
  return this._modelCatalog.filter(m =>
    m.provider && catalogProviders.includes(m.provider)
  );
}
```

对于 `moonshot`，这将返回 `"moonshot"` 和 `"kimi-coding"` 两个目录条目中的模型。

### 默认模型与失效引用

默认模型存储在 `agents.defaults.model` 中，格式为 `"provider/model-id"` 字符串（如 `"kimi-coding/kimi-k2-thinking"`）。如果用户随后移除了 moonshot 的 API 密钥，该引用就会变为"失效"——模型仍然存在于配置中，但其服务商不再配置。UI 对此的处理是：

1. 当没有友好名称匹配时，显示原始模型 ID 字符串
2. 保留引用不变（网关可能仍然通过其他路由方式使用它）

### 测试覆盖

映射功能由 30 个单元测试覆盖，分布在三个文件中：
- `tests/provider-mapping.test.ts` —— 验证映射正确性和完整性
- `tests/model-config.test.ts` —— 验证模型过滤和默认保存行为
- `tests/chat-default-model.test.ts` —— 验证聊天读取配置和过滤模型

---

## AcaClaw GUI 集成方法

### 原则

AcaClaw GUI 是 OpenClaw 后端的前端。对于服务商和模型管理：

1. **读取**：通过 `config.get` 和 `models.list` RPC 读取服务商/模型状态
2. **写入**：通过 `config.set` RPC 写入变更（完整配置 + `baseHash`）
3. **绝不**维护独立的服务商目录或模型列表
4. **绝不**硬编码服务商 URL —— OpenClaw 自动解析
5. **始终**使用 `catalogToConfigProvider()` 按已配置服务商过滤目录模型

### 数据流

```
┌─────────────────┐     WebSocket RPC      ┌──────────────────┐
│  AcaClaw GUI    │ ◄─────────────────────► │  OpenClaw 网关    │
│                 │                         │                  │
│  api-keys.ts    │──── config.get ────────►│  配置存储         │
│                 │◄─── {config, baseHash} ──│                  │
│                 │                         │                  │
│                 │──── models.list ────────►│  模型目录         │
│                 │◄─── {models: [...]} ────│  （缓存）         │
│                 │                         │                  │
│  provider-      │  catalogToConfigProvider │                  │
│  mapping.ts     │  桥接两套 ID 系统        │                  │
│                 │  用于模型过滤            │                  │
│                 │                         │                  │
│                 │──── config.set ─────────►│  验证 + 保存      │
│                 │     {raw, baseHash}     │  → 重启           │
└─────────────────┘                         └──────────────────┘
```

### 实现：读取服务商状态

```typescript
// 1. 获取完整配置（API 密钥已脱敏）
// 注意: config.get 返回 { config: {...}, hash: "..." } —— 需要提取 .config 属性
const configResult = await gateway.call<ConfigGetResult>("config.get");
const cfg = (configResult?.config as Record<string, unknown>) ?? configResult ?? {};
const baseHash = configResult.payload?.baseHash;

// 2. 提取已配置的服务商
const providers = cfg.models?.providers ?? {};
// providers = { anthropic: { baseUrl, apiKey: "__OPENCLAW_REDACTED__", models: [...] }, ... }

// 3. 检测哪些服务商设置了密钥
for (const [id, provider] of Object.entries(providers)) {
  const hasKey = provider.apiKey && provider.apiKey !== "";
  const isRedacted = provider.apiKey === "__OPENCLAW_REDACTED__";
  // hasKey || isRedacted → 服务商已配置
}

// 4. 同时检查认证配置文件（替代密钥存储方式）
const authProfiles = cfg.auth?.profiles ?? {};
for (const [profileId, profile] of Object.entries(authProfiles)) {
  // profile.provider 告诉你这个配置文件对应哪个服务商
}
```

### 实现：获取可用模型

```typescript
import { catalogToConfigProvider } from "../models/provider-mapping.js";

// 调用 models.list —— 返回完整合并目录（所有服务商，不仅仅是已配置的）
const result = await gateway.call<ModelsListResult>("models.list");
const allModels = result.payload.models;
// allModels 可能包含 800+ 个跨 23+ 服务商的模型

// 重要：使用映射过滤到仅已配置的服务商
const configuredProviders = new Set(Object.keys(cfg.models?.providers ?? {}));
const models = allModels.filter(m =>
  m.provider ? configuredProviders.has(catalogToConfigProvider(m.provider)) : false
);
// 现在 models 只包含用户已设置 API 密钥的服务商的模型
```

### 实现：保存 API 密钥

```typescript
// 1. 读取当前配置 + baseHash
const { config, baseHash } = (await gateway.call("config.get")).payload;

// 2. 在配置中设置 API 密钥
config.models ??= {};
config.models.providers ??= {};
config.models.providers["anthropic"] ??= { baseUrl: "https://api.anthropic.com", models: [] };
config.models.providers["anthropic"].apiKey = "sk-ant-...";

// 3. 带 baseHash 写回（乐观并发控制）
await gateway.call("config.set", {
  raw: JSON.stringify(config),
  baseHash,
});

// config.set 后，网关重启，模型目录刷新
```

### 实现：设置默认模型

```typescript
// 1. 读取配置
const { config, baseHash } = (await gateway.call("config.get")).payload;

// 2. 设置默认模型（格式："provider/model-id"）
config.agents ??= {};
config.agents.defaults ??= {};
config.agents.defaults.model = "anthropic/claude-opus-4-6";

// 3. 写回
await gateway.call("config.set", { raw: JSON.stringify(config), baseHash });
```

### 实现：移除服务商 API 密钥

```typescript
// 使用 updateConfig（读-改-写）删除服务商条目
await updateConfig((cfg) => {
  const providers = cfg.models?.providers;
  if (providers) delete providers["anthropic"];

  // 同时清理引用此服务商的认证配置文件
  const profiles = cfg.auth?.profiles;
  if (profiles) {
    for (const [key, val] of Object.entries(profiles)) {
      if (val?.provider === "anthropic") delete profiles[key];
    }
  }

  // 如果默认模型使用了此服务商，清除它
  const defaultModel = cfg.agents?.defaults?.model;
  if (typeof defaultModel === "string" && defaultModel.startsWith("anthropic/")) {
    delete cfg.agents.defaults.model;
  }

  return cfg;
});
```

移除后，重新调用 `models.list` —— 该服务商的模型将不再出现在目录中。

### 实现：按服务商浏览模型

按服务商分组模型并显示每个服务商的可用模型。使用 `catalogToConfigProvider()` 桥接两套 ID 系统：

```typescript
import { catalogToConfigProvider, CATALOG_TO_CONFIG_PROVIDER } from "../models/provider-mapping.js";

// 调用 models.list 后
const models = result.payload.models;

// 过滤到仅已配置的服务商
const configuredProviders = new Set(Object.keys(config.models?.providers ?? {}));
const filtered = models.filter(m =>
  m.provider ? configuredProviders.has(catalogToConfigProvider(m.provider)) : false
);

// 对于选定的配置服务商（如 "moonshot"），
// 查找映射到它的所有目录服务商
function modelsForConfigProvider(configId: string) {
  const catalogProviders = Object.entries(CATALOG_TO_CONFIG_PROVIDER)
    .filter(([, cfg]) => cfg === configId)
    .map(([cat]) => cat);
  return models.filter(m => m.provider && catalogProviders.includes(m.provider));
}

// moonshot → 返回 "moonshot" 和 "kimi-coding" 两个服务商的模型
const moonshotModels = modelsForConfigProvider("moonshot");
```

### 实现：聊天使用默认模型

聊天视图在 `_loadModels()` 中读取默认模型并过滤模型列表：

```typescript
import { catalogToConfigProvider } from "../models/provider-mapping.js";

async _loadModels() {
  const [modelsResult, configResult] = await Promise.all([
    gateway.call("models.list", {}),
    gateway.call("config.get"),
  ]);

  // 处理 config.get 响应包装：{ config: {...}, hash: "..." }
  const cfg = (configResult?.config as Record<string, unknown>) ?? configResult ?? {};

  // 哪些配置服务商已配置（有 API 密钥）？
  const providers = cfg.models?.providers;
  const configuredProviders = new Set(providers ? Object.keys(providers) : []);

  // 从 agents.defaults.model 读取用户保存的默认模型
  const savedDefaultModel = cfg.agents?.defaults?.model ?? "";

  // 使用映射过滤模型到仅已配置的服务商
  const filtered = modelsResult.models.filter(m =>
    m.provider ? configuredProviders.has(catalogToConfigProvider(m.provider)) : false
  );

  // 构建下拉选项
  this._availableModels = filtered.map(m => ({
    value: m.provider ? `${m.provider}/${m.id}` : m.id,
    label: m.provider ? `${m.name} · ${m.provider}` : m.name,
  }));

  // 显示保存的默认模型，或回退到第一个可用模型
  if (savedDefaultModel) {
    const match = filtered.find(m => `${m.provider}/${m.id}` === savedDefaultModel);
    this._defaultModelDisplay = match
      ? `${match.name} · ${match.provider}`
      : savedDefaultModel;  // 服务商未配置时显示原始 ID
  }
}
```

关键要点：
- 聊天从 `config.get` 读取 `agents.defaults.model`（不是从 `sessions.list`）
- 使用 `catalogToConfigProvider()` 过滤模型，将目录 ID 匹配到配置键
- 当保存的默认模型属于未配置的服务商时，显示原始模型 ID
- 网关解析模型回退链：会话覆盖 → 智能体配置 → `agents.defaults.model`

### 实现：测试连接

OpenClaw 没有专用的"验证 API 密钥"端点。使用 `models.list` 作为连接测试：

```typescript
async function testConnection(): Promise<boolean> {
  try {
    const result = await gateway.call<ModelsListResult>("models.list");
    return result.payload.models.length > 0;
  } catch {
    return false;
  }
}
```

如果设置密钥后 `models.list` 返回空数组，密钥可能无效或服务商 URL 不可达。

### GUI 组件设计

```
┌──────────────────────────────────────────────────────────────┐
│  API 密钥与模型                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ 服务商标签 ─────────────────────────────────────────┐    │
│  │ [Anthropic ✓] [OpenAI] [Google] [Moonshot] [+更多]    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  API 密钥:  [sk-ant-•••••••••••••]  [👁] [保存]             │
│  状态:      ● 已连接 (3 个模型可用)                          │
│                                                              │
│  ┌─ 默认模型 ───────────────────────────────────────────┐    │
│  │ [▼ Claude Opus (claude-opus-4-6)                ]    │    │
│  │                                                      │    │
│  │ 上下文: 200K tokens │ 推理: ✓ │ 视觉: ✓              │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  可用模型（来自已配置服务商）：                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ 服务商  │ 模型          │ 上下文 │ 推理    │ 费用   │    │
│  │─────────│──────────────│────────│────────│───────│    │
│  │ anthropic│ Claude Opus  │ 200K   │ ✓      │ $$$   │    │
│  │ anthropic│ Claude Sonnet│ 200K   │ ✓      │ $$    │    │
│  │ openai  │ GPT-5.4      │ 128K   │ –      │ $$    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 重要设计规则

| 规则 | 原因 |
|---|---|
| 服务商标签来自 `config.get` + `models.list`，而非硬编码 | 新服务商会自动出现 |
| 将 `__OPENCLAW_REDACTED__` 显示为 `••••••••` | 永远不显示实际密钥；OpenClaw 已经脱敏 |
| 所有写入使用带 `baseHash` 的 `config.set` | 乐观并发控制防止配置冲突 |
| 保存新 API 密钥后刷新 `models.list` | 配置变更后网关重启；新模型会出现 |
| 显示模型能力（推理、视觉、上下文） | 帮助研究者选择合适的模型 |
| 模型下拉框过滤到已配置密钥的服务商 | 不显示用户实际无法使用的模型 |

### 动态服务商列表策略

不要硬编码 `["anthropic", "openai", "google", ...]`，而是动态导出服务商列表：

```typescript
// 结合 config + models.list 的服务商获得完整列表
function getProviderList(config: OpenClawConfig, models: ModelCatalogEntry[]): ProviderInfo[] {
  const seen = new Map<string, ProviderInfo>();

  // 1. 已配置 API 密钥的服务商
  for (const [id, p] of Object.entries(config.models?.providers ?? {})) {
    seen.set(id, { id, configured: true, modelCount: 0 });
  }

  // 2. 模型目录中的服务商（包括内置 + 插件发现的）
  for (const model of models) {
    const info = seen.get(model.provider) ?? { id: model.provider, configured: false, modelCount: 0 };
    info.modelCount++;
    seen.set(model.provider, info);
  }

  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}
```

### 推荐的"快速设置"服务商

在引导向导中显示这些顶级服务商，其他服务商通过设置中的"添加服务商"访问：

| 服务商 | 推荐理由 | 密钥前缀 |
|---|---|---|
| Anthropic | 最适合研究任务，作为默认 | `sk-ant-` |
| OpenAI | 广泛使用，全能 | `sk-` |
| Google AI | 有免费额度 | — |
| OpenRouter | 聚合器，可访问众多模型 | `sk-or-` |
| DeepSeek | 高性价比，推理能力强 | `sk-` |
| Ollama | 本地/私有部署，无需 API 密钥 | （无） |

---

## 常见陷阱

| 陷阱 | 解决方案 |
|---|---|
| 将 `agents.defaults.models` 设为非空映射 | 这会创建允许列表 —— `models.list` 仅返回匹配的模型。保持 `{}` 表示不限制。 |
| 服务商的 `models: []`（空数组） | 回退解析跳过没有模型条目的服务商。至少包含一个模型定义。 |
| 从 `config.get` 响应中读取 API 密钥 | 密钥已脱敏。检查 `__OPENCLAW_REDACTED__` 以检测"已配置但不显示"。 |
| 不带 `baseHash` 写入配置 | 网关会拒绝。始终先调用 `config.get` 获取 `baseHash`。 |
| `config.set` 后模型列表过时 | 配置变更后网关重启。短暂延迟后重新调用 `models.list`。 |
| 在 UI 中硬编码服务商名称 | 插件中的新服务商不会出现。始终从 `config.get` + `models.list` 导出。 |

---

## 参考：模型完整配置 Schema

```json
{
  "models": {
    "mode": "merge",
    "providers": {
      "<provider-id>": {
        "baseUrl": "https://...",
        "apiKey": "sk-...",
        "auth": "api-key",
        "api": "openai-completions",
        "headers": {},
        "authHeader": true,
        "models": [
          {
            "id": "model-name",
            "name": "Display Name",
            "api": "openai-completions",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0.001, "output": 0.002, "cacheRead": 0.0001, "cacheWrite": 0.0005 },
            "contextWindow": 128000,
            "maxTokens": 4096,
            "headers": {},
            "compat": {
              "supportsTools": true,
              "supportsReasoningEffort": false,
              "thinkingFormat": "openai"
            }
          }
        ]
      }
    },
    "bedrockDiscovery": {
      "enabled": false,
      "region": "us-east-1",
      "providerFilter": [],
      "refreshInterval": 3600,
      "defaultContextWindow": 200000,
      "defaultMaxTokens": 4096
    }
  },
  "agents": {
    "defaults": {
      "model": "anthropic/claude-opus-4-6",
      "models": {}
    }
  }
}
```

---

## 另请参阅

- [架构设计](/zh-CN/architecture/) —— 整体系统设计和分层模型
- [快速开始](/zh-CN/getting-started/) —— 安装和首次设置
- [安全架构](/zh-CN/security/) —— API 密钥保护和凭证擦除
