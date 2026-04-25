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
