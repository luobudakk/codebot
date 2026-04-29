import { getProviderMeta } from "./provider-registry";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  chat(messages: ChatMessage[]): Promise<string>;
}

export function resolveProviderApiKey(provider: string, explicitApiKey?: string): string {
  if (explicitApiKey?.trim()) return explicitApiKey.trim();
  const meta = getProviderMeta(provider);
  const providerKey = meta?.apiKeyEnv ? process.env[meta.apiKeyEnv] : "";
  return (providerKey ?? process.env.CODEBOT_LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim();
}

function providerDefaultBaseUrl(provider: string, fallback: string): string {
  const p = provider.toLowerCase();
  const meta = getProviderMeta(p);
  const envBase = meta?.baseUrlEnv ? process.env[meta.baseUrlEnv] : "";
  return fallback?.trim() || envBase?.trim() || meta?.defaultBaseUrl || "https://api.openai.com/v1";
}

class MockProvider implements LLMProvider {
  async chat(messages: ChatMessage[]): Promise<string> {
    const context = messages[messages.length - 1]?.content ?? "";
    return [
      "AI建议摘要（Mock）:",
      "1) 优先修复高严重度异常处理和输入校验问题。",
      "2) 对长函数做拆分并补充单元测试，降低维护成本。",
      "3) 对频繁循环和重复调用点增加缓存/批处理策略。",
      "",
      `上下文片段: ${context.slice(0, 180)}`
    ].join("\n");
  }
}

class OpenAICompatProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey: string
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    if (!this.apiKey.trim()) {
      throw new Error("LLM API key is required (set CODEBOT_LLM_API_KEY or OPENAI_API_KEY)");
    }
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ model: this.model, messages, stream: false })
    });
    if (!res.ok) {
      throw new Error(`OpenAI compat request failed: HTTP ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  }
}

class AnthropicProvider implements LLMProvider {
  constructor(private readonly baseUrl: string, private readonly model: string, private readonly apiKey: string) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    if (!this.apiKey.trim()) {
      throw new Error("LLM API key is required (set CODEBOT_LLM_API_KEY or ANTHROPIC_API_KEY)");
    }
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const content = messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content }]
      })
    });
    if (!res.ok) {
      throw new Error(`Anthropic request failed: HTTP ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    return data.content?.find((c) => c.type === "text")?.text ?? "";
  }
}

class GeminiProvider implements LLMProvider {
  constructor(private readonly baseUrl: string, private readonly model: string, private readonly apiKey: string) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    if (!this.apiKey.trim()) {
      throw new Error("LLM API key is required (set CODEBOT_LLM_API_KEY or GEMINI_API_KEY)");
    }
    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    const url = `${this.baseUrl.replace(/\/$/, "")}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      })
    });
    if (!res.ok) {
      throw new Error(`Gemini request failed: HTTP ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
}

class OllamaProvider implements LLMProvider {
  constructor(private readonly baseUrl: string, private readonly model: string) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages
      })
    });
    if (!res.ok) {
      throw new Error(`Ollama request failed: HTTP ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  }
}

export function createLLM(provider: string, model: string, baseUrl: string, apiKey?: string): LLMProvider {
  const resolvedProvider = provider.toLowerCase();
  const resolvedBaseUrl = providerDefaultBaseUrl(resolvedProvider, baseUrl);
  const resolvedApiKey = resolveProviderApiKey(resolvedProvider, apiKey);
  if (resolvedProvider === "ollama") {
    return new OllamaProvider(resolvedBaseUrl, model);
  }
  if (resolvedProvider === "anthropic") {
    return new AnthropicProvider(resolvedBaseUrl, model, resolvedApiKey);
  }
  if (resolvedProvider === "gemini") {
    return new GeminiProvider(resolvedBaseUrl, model, resolvedApiKey);
  }
  if (
    [
      "openai",
      "openai_compat",
      "deepseek",
      "qwen",
      "groq",
      "moonshot",
      "zhipu",
      "siliconflow",
      "openrouter",
      "mistral",
      "xai",
      "together",
      "fireworks",
      "nvidia_nim",
      "yi",
      "baichuan",
      "minimax"
    ].includes(resolvedProvider)
  ) {
    return new OpenAICompatProvider(resolvedBaseUrl, model, resolvedApiKey);
  }
  return new MockProvider();
}
