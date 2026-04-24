export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  chat(messages: ChatMessage[]): Promise<string>;
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
      throw new Error("OPENAI_API_KEY is required when CODEBOT_LLM_PROVIDER=openai");
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

export function createLLM(provider: string, model: string, baseUrl: string): LLMProvider {
  if (provider.toLowerCase() === "openai") {
    return new OpenAICompatProvider(baseUrl, model, process.env.OPENAI_API_KEY ?? "");
  }
  return new MockProvider();
}
