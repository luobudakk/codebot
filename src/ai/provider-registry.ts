export type ProviderGroup = "overseas" | "china" | "relay" | "local";

export interface ProviderRegistryEntry {
  id: string;
  name: string;
  group: ProviderGroup;
  needsApiKey: boolean;
  apiKeyEnv?: string;
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
  defaultModel: string;
}

export const PROVIDER_REGISTRY: ProviderRegistryEntry[] = [
  { id: "ollama", name: "Ollama (Local)", group: "local", needsApiKey: false, baseUrlEnv: "OLLAMA_HOST", defaultBaseUrl: "http://127.0.0.1:11434", defaultModel: "llama3.2" },
  { id: "openai", name: "OpenAI", group: "overseas", needsApiKey: true, apiKeyEnv: "OPENAI_API_KEY", baseUrlEnv: "OPENAI_BASE_URL", defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
  { id: "openai_compat", name: "OpenAI Compatible", group: "relay", needsApiKey: true, apiKeyEnv: "CODEBOT_LLM_API_KEY", baseUrlEnv: "CODEBOT_LLM_BASE_URL", defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
  { id: "deepseek", name: "DeepSeek", group: "china", needsApiKey: true, apiKeyEnv: "DEEPSEEK_API_KEY", baseUrlEnv: "DEEPSEEK_BASE_URL", defaultBaseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" },
  { id: "qwen", name: "Qwen", group: "china", needsApiKey: true, apiKeyEnv: "DASHSCOPE_API_KEY", baseUrlEnv: "DASHSCOPE_BASE_URL", defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", defaultModel: "qwen-plus" },
  { id: "groq", name: "Groq", group: "relay", needsApiKey: true, apiKeyEnv: "GROQ_API_KEY", baseUrlEnv: "GROQ_BASE_URL", defaultBaseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile" },
  { id: "moonshot", name: "Moonshot", group: "china", needsApiKey: true, apiKeyEnv: "MOONSHOT_API_KEY", baseUrlEnv: "MOONSHOT_BASE_URL", defaultBaseUrl: "https://api.moonshot.cn/v1", defaultModel: "moonshot-v1-8k" },
  { id: "zhipu", name: "Zhipu GLM", group: "china", needsApiKey: true, apiKeyEnv: "ZHIPU_API_KEY", baseUrlEnv: "ZHIPU_BASE_URL", defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4", defaultModel: "glm-4-flash" },
  { id: "siliconflow", name: "SiliconFlow", group: "china", needsApiKey: true, apiKeyEnv: "SILICONFLOW_API_KEY", baseUrlEnv: "SILICONFLOW_BASE_URL", defaultBaseUrl: "https://api.siliconflow.cn/v1", defaultModel: "Qwen/Qwen2.5-7B-Instruct" },
  { id: "openrouter", name: "OpenRouter", group: "relay", needsApiKey: true, apiKeyEnv: "OPENROUTER_API_KEY", baseUrlEnv: "OPENROUTER_BASE_URL", defaultBaseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4o-mini" },
  { id: "mistral", name: "Mistral", group: "overseas", needsApiKey: true, apiKeyEnv: "MISTRAL_API_KEY", baseUrlEnv: "MISTRAL_BASE_URL", defaultBaseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest" },
  { id: "xai", name: "xAI Grok", group: "overseas", needsApiKey: true, apiKeyEnv: "XAI_API_KEY", baseUrlEnv: "XAI_BASE_URL", defaultBaseUrl: "https://api.x.ai/v1", defaultModel: "grok-2-latest" },
  { id: "together", name: "Together AI", group: "relay", needsApiKey: true, apiKeyEnv: "TOGETHER_API_KEY", baseUrlEnv: "TOGETHER_BASE_URL", defaultBaseUrl: "https://api.together.xyz/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { id: "fireworks", name: "Fireworks AI", group: "relay", needsApiKey: true, apiKeyEnv: "FIREWORKS_API_KEY", baseUrlEnv: "FIREWORKS_BASE_URL", defaultBaseUrl: "https://api.fireworks.ai/inference/v1", defaultModel: "accounts/fireworks/models/llama-v3p1-70b-instruct" },
  { id: "nvidia_nim", name: "NVIDIA NIM", group: "relay", needsApiKey: true, apiKeyEnv: "NVIDIA_API_KEY", baseUrlEnv: "NVIDIA_BASE_URL", defaultBaseUrl: "https://integrate.api.nvidia.com/v1", defaultModel: "meta/llama-3.1-70b-instruct" },
  { id: "yi", name: "01.AI Yi", group: "china", needsApiKey: true, apiKeyEnv: "YI_API_KEY", baseUrlEnv: "YI_BASE_URL", defaultBaseUrl: "https://api.lingyiwanwu.com/v1", defaultModel: "yi-large" },
  { id: "baichuan", name: "Baichuan", group: "china", needsApiKey: true, apiKeyEnv: "BAICHUAN_API_KEY", baseUrlEnv: "BAICHUAN_BASE_URL", defaultBaseUrl: "https://api.baichuan-ai.com/v1", defaultModel: "Baichuan4-Turbo" },
  { id: "minimax", name: "MiniMax", group: "china", needsApiKey: true, apiKeyEnv: "MINIMAX_API_KEY", baseUrlEnv: "MINIMAX_BASE_URL", defaultBaseUrl: "https://api.minimax.chat/v1", defaultModel: "MiniMax-Text-01" },
  { id: "anthropic", name: "Anthropic Claude", group: "overseas", needsApiKey: true, apiKeyEnv: "ANTHROPIC_API_KEY", baseUrlEnv: "ANTHROPIC_BASE_URL", defaultBaseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-3-5-sonnet-latest" },
  { id: "gemini", name: "Google Gemini", group: "overseas", needsApiKey: true, apiKeyEnv: "GEMINI_API_KEY", baseUrlEnv: "GEMINI_BASE_URL", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", defaultModel: "gemini-1.5-flash" }
];

const BY_ID = new Map(PROVIDER_REGISTRY.map((x) => [x.id, x]));

export function getProviderMeta(id: string): ProviderRegistryEntry | undefined {
  return BY_ID.get(id.toLowerCase());
}

export function listProviders(): ProviderRegistryEntry[] {
  return PROVIDER_REGISTRY.slice();
}
