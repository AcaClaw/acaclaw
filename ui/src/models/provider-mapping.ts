/** Shared provider mapping between model catalog IDs and config provider IDs. */

export interface ProviderDef {
  id: string;
  name: string;
  placeholder: string;
  baseUrl?: string;
  /** Provider works without an API key. */
  noKey?: boolean;
}

export interface ModelInfo {
  /** Full reference: "provider/model-id" */
  id: string;
  name: string;
  provider: string;
}

export const LLM_PROVIDERS: ProviderDef[] = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-api03-..." },
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
  { id: "google", name: "Google AI", placeholder: "AIza..." },
  { id: "deepseek", name: "DeepSeek", placeholder: "sk-..." },
  { id: "github-copilot", name: "GitHub Copilot", placeholder: "ghu_... / GH_TOKEN" },
  { id: "mistral", name: "Mistral", placeholder: "..." },
  { id: "moonshot", name: "Moonshot / Kimi", placeholder: "sk-..." },
  { id: "modelstudio", name: "Qwen (Alibaba Model Studio)", placeholder: "sk-..." },
  { id: "nvidia", name: "NVIDIA", placeholder: "nvapi-..." },
  { id: "ollama", name: "Ollama (local)", placeholder: "ollama (no key needed)" },
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-..." },
  { id: "qianfan", name: "Qianfan (Baidu)", placeholder: "..." },
  { id: "together", name: "Together AI", placeholder: "..." },
  { id: "venice", name: "Venice AI", placeholder: "..." },
  { id: "volcengine", name: "Volcengine (Doubao)", placeholder: "..." },
  { id: "xai", name: "xAI (Grok)", placeholder: "xai-..." },
  { id: "amazon-bedrock", name: "Amazon Bedrock", placeholder: "AWS credentials" },
  { id: "azure", name: "Azure OpenAI", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
  { id: "huggingface", name: "Hugging Face", placeholder: "hf_..." },
  { id: "minimax", name: "MiniMax", placeholder: "..." },
];

export const BROWSER_PROVIDERS: ProviderDef[] = [
  { id: "brave-search", name: "Brave Search", placeholder: "BSA..." },
  { id: "duckduckgo", name: "DuckDuckGo", placeholder: "(no key needed)", noKey: true },
  { id: "exa", name: "Exa Search", placeholder: "exa-..." },
  { id: "firecrawl", name: "Firecrawl", placeholder: "fc-..." },
  { id: "gemini", name: "Gemini (Google)", placeholder: "AIza..." },
  { id: "grok", name: "Grok (xAI)", placeholder: "xai-..." },
  { id: "kimi", name: "Kimi (Moonshot)", placeholder: "sk-..." },
  { id: "perplexity", name: "Perplexity", placeholder: "pplx-..." },
  { id: "tavily", name: "Tavily", placeholder: "tvly-..." },
];

/**
 * Maps a catalog provider ID (from models.list) to the config provider ID
 * used by our LLM_PROVIDERS. The model catalog uses different internal IDs
 * from what OpenClaw stores in openclaw.json under models.providers.<id>.
 */
export const CATALOG_TO_CONFIG_PROVIDER: Record<string, string> = {
  // Core providers
  "anthropic": "anthropic",
  "openai": "openai",
  "openai-codex": "openai",
  "openai-responses": "openai",
  "azure-openai-responses": "azure",
  "google": "google",
  "google-vertex": "google",
  "google-gemini-cli": "google",
  "deepseek": "deepseek",
  "mistral": "mistral",
  "openrouter": "openrouter",
  "ollama": "ollama",
  // Moonshot / Kimi
  "moonshot": "moonshot",
  "kimi": "moonshot",
  "kimi-coding": "moonshot",
  // xAI
  "xai": "xai",
  // ModelStudio (Alibaba / Qwen)
  "modelstudio": "modelstudio",
  // Volcengine (Doubao / ByteDance)
  "volcengine": "volcengine",
  "volcengine-plan": "volcengine",
  // GitHub Copilot
  "github-copilot": "github-copilot",
  // Together AI
  "together": "together",
  // NVIDIA
  "nvidia": "nvidia",
  // Venice AI
  "venice": "venice",
  // Qianfan (Baidu)
  "qianfan": "qianfan",
  // Amazon Bedrock
  "amazon-bedrock": "amazon-bedrock",
  // Hugging Face
  "huggingface": "huggingface",
  // MiniMax
  "minimax": "minimax",
  "minimax-portal": "minimax",
  // BytePlus (international Volcengine)
  "byteplus": "volcengine",
  "byteplus-plan": "volcengine",
};

/**
 * Default base URLs for each LLM provider.
 * Used when creating a new provider entry in the config (which requires baseUrl + models).
 * Source: OpenClaw provider catalogs / extension definitions.
 */
export const PROVIDER_BASE_URLS: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  deepseek: "https://api.deepseek.com",
  "github-copilot": "https://api.individual.githubcopilot.com",
  mistral: "https://api.mistral.ai/v1",
  moonshot: "https://api.moonshot.cn/v1",
  modelstudio: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  ollama: "http://127.0.0.1:11434",
  openrouter: "https://openrouter.ai/api/v1",
  qianfan: "https://qianfan.baidubce.com/v2",
  together: "https://api.together.xyz/v1",
  venice: "https://api.venice.ai/api/v1",
  volcengine: "https://ark.ap-southeast.bytepluses.com/api/v3",
  xai: "https://api.x.ai/v1",
  "amazon-bedrock": "https://bedrock-runtime.us-east-1.amazonaws.com",
  huggingface: "https://router.huggingface.co/v1",
  minimax: "https://api.minimax.io/anthropic",
};

/**
 * Primary env var name for each LLM config provider.
 * When a user saves an API key via the UI, we also write it to config.env
 * under this env var name so OpenClaw's plugin catalog can discover it
 * (plugins check env vars / auth profiles, not models.providers.<id>.apiKey).
 */
export const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  "github-copilot": "GITHUB_TOKEN",
  mistral: "MISTRAL_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  modelstudio: "MODELSTUDIO_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  qianfan: "QIANFAN_API_KEY",
  together: "TOGETHER_API_KEY",
  venice: "VENICE_API_KEY",
  volcengine: "VOLCANO_ENGINE_API_KEY",
  xai: "XAI_API_KEY",
  huggingface: "HF_TOKEN",
  minimax: "MINIMAX_API_KEY",
};

/** Given a catalog provider ID, return the config provider ID. */
export function catalogToConfigProvider(catalogId: string): string {
  return CATALOG_TO_CONFIG_PROVIDER[catalogId] ?? catalogId;
}

/** Check if a catalog provider belongs to any configured config provider. */
export function isProviderConfigured(catalogProvider: string, configuredSet: Set<string>): boolean {
  return configuredSet.has(catalogToConfigProvider(catalogProvider));
}
