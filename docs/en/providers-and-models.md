---
layout: page
title: Providers & Models
lang: en
permalink: /en/providers-and-models/
---

> **Golden Rule**: OpenClaw owns provider management, model discovery, and API key storage. AcaClaw's GUI reads and writes through OpenClaw's APIs — never maintaining a parallel catalog.

---

## How OpenClaw Manages LLM Providers

### Provider Definition

Each LLM provider is a `ModelProviderConfig` object stored in `openclaw.json` under `models.providers.<id>`:

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

### Provider Type Reference

```
ModelProviderConfig
├── baseUrl: string              # API endpoint URL
├── apiKey?: SecretInput         # Literal string, env var ref, or exec source
├── auth?: ModelProviderAuthMode # "api-key" | "aws-sdk" | "oauth" | "token"
├── api?: ModelApi               # API format (see list below)
├── headers?: Record<string, SecretInput>  # Custom auth/routing headers
├── authHeader?: boolean         # Include Authorization header
├── injectNumCtxForOpenAICompat?: boolean  # Ollama context injection
└── models: ModelDefinitionConfig[]        # Static model list
```

### Supported API Formats (`ModelApi`)

| Value | Used By |
|---|---|
| `openai-completions` | OpenAI, DeepSeek, Together, Groq, most OpenAI-compatible |
| `openai-responses` | OpenAI Responses API |
| `anthropic-messages` | Anthropic Claude |
| `google-generative-ai` | Google Gemini (Generative AI) |
| `bedrock-converse-stream` | AWS Bedrock |
| `ollama` | Ollama (local models) |
| `github-copilot` | GitHub Copilot |
| `openai-codex-responses` | OpenAI Codex |

### Provider Auth Modes

| Mode | When To Use |
|---|---|
| `api-key` | Standard API key authentication (most providers) |
| `oauth` | OAuth2 token exchange (Google Vertex, some enterprise) |
| `aws-sdk` | AWS IAM / Bedrock (uses AWS SDK credentials) |
| `token` | Bearer token authentication |

---

## How OpenClaw Maps Provider → Model Lists

### Three Sources of Models

OpenClaw's model catalog is assembled from three sources, merged at startup:

```
┌─────────────────────────────────────────────┐
│  1. Built-in Catalog (PI SDK)                │
│     ~50+ models (Claude, GPT, Gemini, etc.) │
│     Loaded from embedded model registry      │
├─────────────────────────────────────────────┤
│  2. User Config (openclaw.json)              │
│     models.providers.<id>.models[]           │
│     User-defined or override models          │
├─────────────────────────────────────────────┤
│  3. Plugin Extensions                        │
│     extensions/<id>/provider-catalog.ts      │
│     Dynamic provider discovery hooks         │
└─────────────────────────────────────────────┘
         │
         ▼
   ┌───────────────┐
   │ Model Catalog  │  ← Deduplicated, sorted by provider then name
   │ (in memory)    │
   └───────────────┘
```

### Model Definition Structure

Each model in the catalog has:

```
ModelDefinitionConfig
├── id: string           # Model ID (e.g. "claude-opus-4-6", "gpt-5.4")
├── name: string         # Display name
├── api?: ModelApi       # Override provider-level API format
├── reasoning: boolean   # Supports extended thinking / chain-of-thought
├── input: string[]      # ["text"] or ["text", "image"]
├── contextWindow: number # Max input tokens (e.g. 200000)
├── maxTokens: number    # Max output tokens
├── cost: CostConfig     # Per-token pricing
│   ├── input: number
│   ├── output: number
│   ├── cacheRead: number
│   └── cacheWrite: number
├── headers?: Record     # Model-specific request headers
└── compat?: CompatConfig # API quirks and feature flags
```

### Catalog Entry (What the API Returns)

The `models.list` RPC returns a simplified view:

```
ModelCatalogEntry
├── id: string            # Model ID
├── name: string          # Display name
├── provider: string      # Provider ID (e.g. "anthropic", "openai")
├── contextWindow?: number
├── reasoning?: boolean
└── input?: string[]      # ["text"] or ["text", "image"]
```

### Model Loading Flow

```
loadModelCatalog()
│
├─ 1. ensureOpenClawModelsJson()
│     └─ Fingerprints config + env → writes models.json if changed
│
├─ 2. Import PI SDK (pi-model-discovery-runtime)
│     └─ Built-in Anthropic/OpenAI/Google catalog (~50+ models)
│
├─ 3. Build ModelRegistry from models.json
│     ├─ Filter suppressed models
│     └─ Merge user-configured opt-in providers
│
├─ 4. augmentModelCatalogWithProviderPlugins()
│     └─ Each extension's discovery hook adds its models
│
├─ 5. Deduplicate by lowercase "provider::modelId"
│
└─ 6. Sort by provider, then model name → return cached
```

### Config Merging: `mode`

| Mode | Behavior |
|---|---|
| `merge` (default) | User providers are ADDED to the built-in catalog |
| `replace` | ONLY user-configured providers are used (built-ins ignored) |

### Model Allowlist

If `agents.defaults.models` is a non-empty map, `models.list` returns ONLY models in that map. Keep it empty (`{}`) for unrestricted access.

---

## API Key Resolution Chain

When OpenClaw needs an API key for a provider, it checks these sources in order:

```
1. Literal value in config
   models.providers.<id>.apiKey = "sk-..."

2. Environment variable reference
   models.providers.<id>.apiKey = "${ANTHROPIC_API_KEY}"

3. Auth profiles store
   ~/.openclaw/credentials/ or auth-profiles.json

4. Well-known environment variables
   ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.

5. OAuth token exchange (for oauth auth mode)

6. AWS SDK credentials (for bedrock auth mode)
```

OpenClaw redacts keys in API responses with `"__OPENCLAW_REDACTED__"` — the actual key value is never returned via `config.get`.

---

## Gateway API Endpoints

### WebSocket RPC: `models.list`

The primary way to get available models.

```
Request:
  { type: "req", id: "<uuid>", method: "models.list", params: {} }

Response:
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

The response is filtered by `agents.defaults.models` allowlist if configured.

### WebSocket RPC: `config.get`

Returns the full config snapshot (with API keys redacted).

```
Request:
  { type: "req", id: "<uuid>", method: "config.get", params: {} }

Response:
  {
    type: "res", id: "<uuid>", ok: true,
    payload: {
      config: { ... full openclaw.json ... },
      baseHash: "abc123",
      hash: "def456"
    }
  }
```

### WebSocket RPC: `config.set`

Writes the full config (requires `baseHash` for optimistic concurrency).

```
Request:
  {
    type: "req", id: "<uuid>", method: "config.set",
    params: { raw: "<full JSON string>", baseHash: "abc123" }
  }
```

### HTTP: `GET /v1/models` (OpenAI-compatible)

Returns agent-level model IDs (not the raw provider models):

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

## Bundled Providers (~30+)

OpenClaw ships with built-in support for these providers (no config needed if API key is set):

### Core LLM Providers

| Config ID | Display Name | API Format | Base URL | Env Var | Catalog IDs |
|---|---|---|---|---|---|
| `anthropic` | Anthropic | `anthropic-messages` | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` | `anthropic` |
| `openai` | OpenAI | `openai-completions` | `https://api.openai.com/v1` | `OPENAI_API_KEY` | `openai`, `openai-codex` |
| `google` | Google AI | `google-generative-ai` | (SDK-managed) | `GOOGLE_API_KEY` | `google`, `google-gemini-cli` |
| `deepseek` | DeepSeek | `openai-completions` | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` | `deepseek` |
| `mistral` | Mistral | `openai-completions` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` | `mistral` |
| `openrouter` | OpenRouter | `openai-completions` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `openrouter` |
| `ollama` | Ollama (local) | `ollama` | `http://localhost:11434` | — | `ollama` |
| `amazon-bedrock` | Amazon Bedrock | `bedrock-converse-stream` | (AWS SDK) | AWS credentials | `amazon-bedrock` |
| `azure` | Azure OpenAI | `openai-completions` | (user-configured) | `AZURE_OPENAI_API_KEY` | `azure-openai-responses` |

### xAI, Chinese Providers, and Others

| Config ID | Display Name | API Format | Base URL | Env Var | Catalog IDs |
|---|---|---|---|---|---|
| `xai` | xAI (Grok) | `openai-completions` | `https://api.x.ai/v1` | `XAI_API_KEY` | `xai` |
| `modelstudio` | Qwen (Alibaba Cloud Model Studio) | `openai-completions` | `https://coding-intl.dashscope.aliyuncs.com/v1` (Global) / `https://coding.dashscope.aliyuncs.com/v1` (CN) | `MODELSTUDIO_API_KEY` | `modelstudio` |
| `volcengine` | Volcengine (Doubao / ByteDance) | `openai-completions` | `https://ark.cn-beijing.volces.com/api/v3` | `VOLCANO_ENGINE_API_KEY` | `volcengine`, `volcengine-plan` |
| `moonshot` | Moonshot / Kimi | `openai-completions` | `https://api.moonshot.ai/v1` (Intl) / `https://api.moonshot.cn/v1` (CN) | `MOONSHOT_API_KEY` | `moonshot`, `kimi`, `kimi-coding` |
| `qianfan` | Qianfan (Baidu) | `openai-completions` | `https://qianfan.baidubce.com/v2` | `QIANFAN_API_KEY` | `qianfan` |
| `minimax` | MiniMax | `openai-completions` | `https://api.minimax.io/v1` | `MINIMAX_API_KEY` | `minimax`, `minimax-portal` |
| `together` | Together AI | `openai-completions` | `https://api.together.xyz/v1` | `TOGETHER_API_KEY` | `together` |
| `nvidia` | NVIDIA | `openai-completions` | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` | `nvidia` |
| `venice` | Venice AI | `openai-completions` | `https://api.venice.ai/api/v1` | `VENICE_API_KEY` | `venice` |
| `github-copilot` | GitHub Copilot | `openai-responses` | `https://api.individual.githubcopilot.com` | `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` | `github-copilot` |
| `huggingface` | Hugging Face | `openai-completions` | (Inference API) | `HF_TOKEN` | `huggingface` |

### Utility-Only Plugins (Not Model Providers)

These extensions provide non-LLM services and do **not** appear in `models.list`:

| Plugin ID | Purpose | Env Var |
|---|---|---|
| `groq` | Audio transcription (Whisper) | `GROQ_API_KEY` |
| `perplexity` | Web search | `PERPLEXITY_API_KEY` |
| `brave` | Brave web search | `BRAVE_API_KEY` |

### Provider ID Aliases

OpenClaw normalizes some legacy/alternative provider IDs via `normalizeProviderId()`:

| Input | Normalized To |
|---|---|
| `bytedance`, `doubao` | `volcengine` |
| `bedrock`, `aws-bedrock` | `amazon-bedrock` |
| `qwen` | `qwen-portal` |
| `kimi`, `kimi-code`, `kimi-coding` | `kimi` |

Additional providers can be added via extensions or user config.

---

## Plugin Provider Discovery

Extensions register providers through the Plugin SDK:

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

Discovery runs in 4 stages: `simple` → `profile` → `paired` → `late`.

---

## Model Reference Format

Models are referenced as `provider/model-id` strings:

```
anthropic/claude-opus-4-6
openai/gpt-5.4
openrouter/anthropic/claude-sonnet-4
moonshot/kimi-k2.5
ollama/llama3
```

The `parseModelRef(raw)` function splits on the FIRST `/`:
- `openrouter/anthropic/claude-sonnet-4` → provider=`openrouter`, model=`anthropic/claude-sonnet-4`

---

## Catalog-to-Config Provider ID Mapping

### The Problem: Two ID Systems

OpenClaw has **two independent provider ID systems** that AcaClaw must bridge:

1. **Config provider IDs** — Keys under `models.providers.<id>` in `openclaw.json` (e.g. `moonshot`, `azure`, `google`)
2. **Catalog provider IDs** — The `provider` field returned by `models.list` (e.g. `kimi-coding`, `azure-openai-responses`, `google-vertex`)

These IDs often **do not match**. For example:
- Config has `moonshot` → catalog returns models with `provider: "kimi-coding"` and `provider: "moonshot"`
- Config has `azure` → catalog returns `provider: "azure-openai-responses"`
- Config has `google` → catalog returns `provider: "google-vertex"` and `provider: "google-generative-ai"`

Without bridging these, the UI cannot filter the model catalog to show only models from configured providers.

### Why Two Systems Exist

OpenClaw extensions often register multiple provider entries under a single API key. The moonshot extension is a good example:

```
Extension: moonshot (api.moonshot.ai, 4 models)
Extension: kimi-coding (api.kimi.com/coding/, 2 models)
Both share the same "moonshot" config key and API key
```

OpenClaw's `normalizeProviderId()` (in `src/agents/provider-id.ts`) maps aliases:
- `kimi`, `kimi-code`, `kimi-coding` → `"kimi"` (internally)
- `bedrock`, `aws-bedrock` → `"amazon-bedrock"`

And `PLUGIN_ID_ALIASES` in `config-state.ts` maps extension IDs:
- `"kimi-coding"` → `"kimi"` (shares moonshot's API key)
- `"openai-codex"` → `"openai"`

### The Fix: `CATALOG_TO_CONFIG_PROVIDER` Mapping

AcaClaw maintains a static mapping table in `ui/src/models/provider-mapping.ts`:

```typescript
export const CATALOG_TO_CONFIG_PROVIDER: Record<string, string> = {
  // Core providers
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
  // Moonshot / Kimi
  "moonshot":                 "moonshot",
  "kimi":                     "moonshot",
  "kimi-coding":              "moonshot",
  // xAI
  "xai":                      "xai",
  // ModelStudio (Alibaba / Qwen)
  "modelstudio":              "modelstudio",
  // Volcengine (Doubao / ByteDance)
  "volcengine":               "volcengine",
  "volcengine-plan":          "volcengine",
  // GitHub Copilot
  "github-copilot":           "github-copilot",
  // Others
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

The helper function `catalogToConfigProvider(catalogId)` returns the config key, falling back to the catalog ID itself for unknown providers.

### How Filtering Works

When a user has `openrouter` configured and the catalog returns 809 models across 23 providers:

```
models.list → 809 models (all providers)
config.get  → env = { OPENROUTER_API_KEY: "..." }
              models.providers = { openrouter: { apiKey: "..." } }  (legacy)

Detection: check config.env for known env vars, then check models.providers (backward compat)
Filter: model.provider → catalogToConfigProvider() → check if result is in configuredProviders
Result: 246 models (only openrouter)
```

AcaClaw detects configured providers from **both** `config.env` (env vars, new approach) and `models.providers` (legacy entries with apiKey).

### Reverse Lookup: Config → Catalog Models

For per-provider model tables (showing which models a configured provider gives you), we do a reverse lookup:

```typescript
// Find all catalog providers that map to a config provider
_modelsForConfigProvider(configId: string) {
  const catalogProviders = Object.entries(CATALOG_TO_CONFIG_PROVIDER)
    .filter(([, cfg]) => cfg === configId)
    .map(([cat]) => cat);
  return this._modelCatalog.filter(m =>
    m.provider && catalogProviders.includes(m.provider)
  );
}
```

For `moonshot`, this returns models from both `"moonshot"` and `"kimi-coding"` catalog entries.

### Default Model and Stale References

The default model is stored at `agents.defaults.model` as a `"provider/model-id"` string (e.g. `"kimi-coding/kimi-k2-thinking"`). If the user later removes the moonshot API key, this reference becomes "stale" — the model still exists in config but its provider is no longer configured. The UI handles this by:

1. Displaying the raw model ID string when no friendly name match exists
2. Keeping the reference intact (the gateway may still honor it via other routing)

### Test Coverage

The mapping is covered by 30 unit tests across three files:
- `tests/provider-mapping.test.ts` — Validates mapping correctness and completeness
- `tests/model-config.test.ts` — Validates model filtering and default save behavior
- `tests/chat-default-model.test.ts` — Validates chat reads config and filters models

---

## AcaClaw GUI Integration Method

### Principle

AcaClaw's GUI is a frontend to OpenClaw's backend. For provider and model management:

1. **Read** provider/model state via `config.get` and `models.list` RPCs
2. **Write** changes via `config.set` RPC (full config with `baseHash`)
3. **Never** maintain a separate provider catalog or model list
4. **Never** hardcode provider URLs — OpenClaw resolves these automatically
5. **Always** use `catalogToConfigProvider()` when filtering catalog models by configured providers

### Data Flow

```
┌─────────────────┐     WebSocket RPC      ┌──────────────────┐
│  AcaClaw GUI    │ ◄─────────────────────► │  OpenClaw Gateway │
│                 │                         │                  │
│  api-keys.ts    │──── config.get ────────►│  Config store    │
│                 │◄─── {config, baseHash} ──│                  │
│                 │                         │                  │
│                 │──── models.list ────────►│  Model catalog   │
│                 │◄─── {models: [...]} ────│  (cached)        │
│                 │                         │                  │
│  provider-      │  catalogToConfigProvider │                  │
│  mapping.ts     │  bridges the two ID     │                  │
│                 │  systems for filtering  │                  │
│                 │                         │                  │
│                 │──── config.set ─────────►│  Validate + save │
│                 │     {raw, baseHash}     │  → restart       │
└─────────────────┘                         └──────────────────┘
```

### Gateway Restart on `config.env` Changes

OpenClaw's config reloader has no hot-reload rule for the `env` prefix.
Any change to `config.env.*` triggers a full gateway restart (default behavior
for unmatched config paths).  AcaClaw handles this by:

1. **Not refreshing models immediately** — env vars are applied only at startup, so
   the model catalog would be stale until the restart completes.
2. **Setting `_loaded = false`** so the existing `state-change` listener on the
   gateway re-runs `_loadState()` (including model refresh) once the WebSocket
   reconnects after the restart.
3. **Showing "gateway reloading…"** in the flash message so the user knows the
   brief disconnect is expected.

### Implementation: Reading Provider State

```typescript
// 1. Get full config (API keys are redacted)
// Note: config.get returns { config: {...}, hash: "..." } — unwrap the .config property
const configResult = await gateway.call<ConfigGetResult>("config.get");
const cfg = (configResult?.config as Record<string, unknown>) ?? configResult ?? {};
const baseHash = configResult.payload?.baseHash;

// 2. Extract configured providers
const providers = cfg.models?.providers ?? {};
// providers = { anthropic: { baseUrl, apiKey: "__OPENCLAW_REDACTED__", models: [...] }, ... }

// 3. Detect which providers have keys set
for (const [id, provider] of Object.entries(providers)) {
  const hasKey = provider.apiKey && provider.apiKey !== "";
  const isRedacted = provider.apiKey === "__OPENCLAW_REDACTED__";
  // hasKey || isRedacted → provider is configured
}

// 4. Also check auth profiles (alternative key storage)
const authProfiles = config.auth?.profiles ?? {};
for (const [profileId, profile] of Object.entries(authProfiles)) {
  // profile.provider tells you which provider this profile configures
}
```

### Implementation: Getting Available Models

```typescript
import { catalogToConfigProvider } from "../models/provider-mapping.js";

// Call models.list — returns the full merged catalog (ALL providers, not just configured ones)
const result = await gateway.call<ModelsListResult>("models.list");
const allModels = result.payload.models;
// allModels may contain 800+ models across 23+ providers

// IMPORTANT: Filter to only configured providers using the mapping
const configuredProviders = new Set(Object.keys(cfg.models?.providers ?? {}));
const models = allModels.filter(m =>
  m.provider ? configuredProviders.has(catalogToConfigProvider(m.provider)) : false
);
// Now models only contains models from providers the user has API keys for
```

### Implementation: Saving API Keys

```typescript
// 1. Read current config + baseHash
const { config, baseHash } = (await gateway.call("config.get")).payload;

// 2. Set the API key in the config
config.models ??= {};
config.models.providers ??= {};
config.models.providers["anthropic"] ??= { baseUrl: "https://api.anthropic.com", models: [] };
config.models.providers["anthropic"].apiKey = "sk-ant-...";

// 3. Write back with baseHash (optimistic concurrency)
await gateway.call("config.set", {
  raw: JSON.stringify(config),
  baseHash,
});

// After config.set, the gateway restarts and model catalog refreshes
```

### Implementation: Setting Default Model

```typescript
// 1. Read config
const { config, baseHash } = (await gateway.call("config.get")).payload;

// 2. Set default model (format: "provider/model-id")
config.agents ??= {};
config.agents.defaults ??= {};
config.agents.defaults.model = "anthropic/claude-opus-4-6";

// 3. Write back
await gateway.call("config.set", { raw: JSON.stringify(config), baseHash });
```

### Implementation: Removing a Provider's API Key

```typescript
// Use updateConfig (read-modify-write) to delete the provider entry
await updateConfig((cfg) => {
  const providers = cfg.models?.providers;
  if (providers) delete providers["anthropic"];

  // Also clean auth profiles that reference this provider
  const profiles = cfg.auth?.profiles;
  if (profiles) {
    for (const [key, val] of Object.entries(profiles)) {
      if (val?.provider === "anthropic") delete profiles[key];
    }
  }

  // If the default model used this provider, clear it
  const defaultModel = cfg.agents?.defaults?.model;
  if (typeof defaultModel === "string" && defaultModel.startsWith("anthropic/")) {
    delete cfg.agents.defaults.model;
  }

  return cfg;
});
```

After removal, re-call `models.list` — the provider's models will no longer appear in the catalog.

### Implementation: Per-Provider Model Browsing

Group models by provider and display each provider's available models. Use `catalogToConfigProvider()` to bridge the two ID systems:

```typescript
import { catalogToConfigProvider, CATALOG_TO_CONFIG_PROVIDER } from "../models/provider-mapping.js";

// After calling models.list
const models = result.payload.models;

// Filter to only configured providers
const configuredProviders = new Set(Object.keys(config.models?.providers ?? {}));
const filtered = models.filter(m =>
  m.provider ? configuredProviders.has(catalogToConfigProvider(m.provider)) : false
);

// For a selected config provider (e.g. "moonshot"),
// find ALL catalog providers that map to it
function modelsForConfigProvider(configId: string) {
  const catalogProviders = Object.entries(CATALOG_TO_CONFIG_PROVIDER)
    .filter(([, cfg]) => cfg === configId)
    .map(([cat]) => cat);
  return models.filter(m => m.provider && catalogProviders.includes(m.provider));
}

// moonshot → returns models from both "moonshot" and "kimi-coding" providers
const moonshotModels = modelsForConfigProvider("moonshot");
```

### Implementation: Chat Uses Default Model

The chat view reads the default model and filters models in `_loadModels()`:

```typescript
import { catalogToConfigProvider } from "../models/provider-mapping.js";

async _loadModels() {
  const [modelsResult, configResult] = await Promise.all([
    gateway.call("models.list", {}),
    gateway.call("config.get"),
  ]);

  // Handle config.get response wrapper: { config: {...}, hash: "..." }
  const cfg = (configResult?.config as Record<string, unknown>) ?? configResult ?? {};

  // Which config providers are configured (have API keys)?
  const providers = cfg.models?.providers;
  const configuredProviders = new Set(providers ? Object.keys(providers) : []);

  // Read the user-saved default model from agents.defaults.model
  const savedDefaultModel = cfg.agents?.defaults?.model ?? "";

  // Filter models to only configured providers using the mapping
  const filtered = modelsResult.models.filter(m =>
    m.provider ? configuredProviders.has(catalogToConfigProvider(m.provider)) : false
  );

  // Build dropdown options
  this._availableModels = filtered.map(m => ({
    value: m.provider ? `${m.provider}/${m.id}` : m.id,
    label: m.provider ? `${m.name} · ${m.provider}` : m.name,
  }));

  // Display the saved default model, or fall back to first available
  if (savedDefaultModel) {
    const match = filtered.find(m => `${m.provider}/${m.id}` === savedDefaultModel);
    this._defaultModelDisplay = match
      ? `${match.name} · ${match.provider}`
      : savedDefaultModel;  // Show raw ID if provider is unconfigured
  }
}
```

Key points:
- Chat reads `agents.defaults.model` from `config.get` (not from `sessions.list`)
- Models are filtered using `catalogToConfigProvider()` to match catalog IDs to config keys
- When the saved default model belongs to an unconfigured provider, the raw model ID is displayed
- The gateway resolves model fallback: session override → agent config → `agents.defaults.model`

### Implementation: Test Connection

OpenClaw has no dedicated "verify API key" endpoint. Use `models.list` as a connectivity test:

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

If `models.list` returns an empty array after setting a key, the key may be invalid or the provider URL unreachable.

### GUI Component Design

```
┌──────────────────────────────────────────────────────────────┐
│  API Keys & Models                                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ Provider Tabs ──────────────────────────────────────┐    │
│  │ [Anthropic ✓] [OpenAI] [Google] [Moonshot] [+More]   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  API Key:  [sk-ant-•••••••••••••]  [👁] [Save]              │
│  Status:   ● Connected (3 models available)                  │
│                                                              │
│  ┌─ Default Model ──────────────────────────────────────┐    │
│  │ [▼ Claude Opus (claude-opus-4-6)                ]    │    │
│  │                                                      │    │
│  │ Context: 200K tokens │ Reasoning: ✓ │ Vision: ✓      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Available Models (from configured providers):               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Provider │ Model         │ Context │ Reasoning │ Cost │    │
│  │──────────│───────────────│─────────│───────────│──────│    │
│  │ anthropic│ Claude Opus   │ 200K    │ ✓         │ $$$  │    │
│  │ anthropic│ Claude Sonnet │ 200K    │ ✓         │ $$   │    │
│  │ openai   │ GPT-5.4       │ 128K    │ –         │ $$   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Rules

| Rule | Rationale |
|---|---|
| Provider tabs come from `config.get` + `models.list`, not hardcoded | New providers automatically appear |
| Show `__OPENCLAW_REDACTED__` as `••••••••` | Never display actual keys; OpenClaw already redacts |
| Use `config.set` with `baseHash` for all writes | Optimistic concurrency prevents config conflicts |
| Refresh `models.list` after saving a new API key | Gateway restarts on config change; new models appear |
| Show model capabilities (reasoning, vision, context) | Helps researchers choose the right model |
| Filter model dropdown to providers with configured keys | Don't show models the user can't actually use |

### Dynamic Provider List Strategy

Instead of hardcoding `["anthropic", "openai", "google", ...]`, derive the provider list dynamically:

```typescript
// Combine providers from config + models.list for the complete picture
function getProviderList(config: OpenClawConfig, models: ModelCatalogEntry[]): ProviderInfo[] {
  const seen = new Map<string, ProviderInfo>();

  // 1. Providers with API keys configured
  for (const [id, p] of Object.entries(config.models?.providers ?? {})) {
    seen.set(id, { id, configured: true, modelCount: 0 });
  }

  // 2. Providers from model catalog (includes built-in + plugin-discovered)
  for (const model of models) {
    const info = seen.get(model.provider) ?? { id: model.provider, configured: false, modelCount: 0 };
    info.modelCount++;
    seen.set(model.provider, info);
  }

  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}
```

### Recommended "Quick Setup" Providers

For the onboarding wizard, show these top-level providers with guided setup. All others accessible via "Add Provider" in settings:

| Provider | Why | Key Prefix |
|---|---|---|
| Anthropic | Best for research tasks, default | `sk-ant-` |
| OpenAI | Widely used, good all-rounder | `sk-` |
| Google AI | Free tier available | — |
| OpenRouter | Aggregator, access to many models | `sk-or-` |
| DeepSeek | Cost-effective, strong reasoning | `sk-` |
| Ollama | Local/private, no API key needed | (none) |

---

## Common Pitfalls

| Pitfall | Solution |
|---|---|
| Setting `agents.defaults.models` to a non-empty map | This creates an allowlist — `models.list` only returns matched models. Keep it `{}` for unrestricted. |
| Provider with `models: []` (empty array) | Fallback resolution skips providers with no model entries. Include at least one model definition. |
| Reading API keys from `config.get` response | Keys are redacted. Check for `__OPENCLAW_REDACTED__` to detect "configured but not shown". |
| Writing config without `baseHash` | Rejected by gateway. Always read `config.get` first to get `baseHash`. |
| After `config.set`, stale model list | Gateway restarts on config change. Re-call `models.list` after a short delay. |
| Hardcoding provider names in UI | New providers from plugins won't appear. Always derive from `config.get` + `models.list`. |

---

## Reference: Full Config Schema for Models

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

## See Also

- [Architecture](/en/architecture/) — Overall system design and layer model
- [Getting Started](/en/getting-started/) — Installation and first setup
- [Security](/en/security/) — API key protection and credential scrubbing
