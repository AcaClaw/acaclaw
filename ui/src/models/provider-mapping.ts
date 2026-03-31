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
 * Derive the env var name for a provider ID.
 * OpenClaw's plugin catalog discovers API keys via env vars (not config
 * models.providers.<id>.apiKey), so AcaClaw writes keys to config.env
 * under the correct env var name. Most providers follow the convention
 * <PROVIDER_UPPER>_API_KEY; overrides cover the few exceptions.
 */
const ENV_VAR_OVERRIDES: Record<string, string> = {
  google: "GEMINI_API_KEY",
  "github-copilot": "GITHUB_TOKEN",
  volcengine: "VOLCANO_ENGINE_API_KEY",
  huggingface: "HF_TOKEN",
};

export function providerEnvVar(providerId: string): string {
  return ENV_VAR_OVERRIDES[providerId] ?? `${providerId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

/** Given a catalog provider ID, return the config provider ID. */
export function catalogToConfigProvider(catalogId: string): string {
  return CATALOG_TO_CONFIG_PROVIDER[catalogId] ?? catalogId;
}

/** Check if a catalog provider belongs to any configured config provider. */
export function isProviderConfigured(catalogProvider: string, configuredSet: Set<string>): boolean {
  return configuredSet.has(catalogToConfigProvider(catalogProvider));
}
