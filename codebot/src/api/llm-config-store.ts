import fs from "node:fs";
import path from "node:path";

export interface RuntimeLLMConfig {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
}

interface RuntimeLLMState {
  activeProvider: string;
  profiles: Record<string, RuntimeLLMConfig>;
}

function runtimePath(dataDir: string): string {
  return path.join(dataDir, "llm.runtime.json");
}

export function readRuntimeLLMConfig(dataDir: string): RuntimeLLMConfig | null {
  const p = runtimePath(dataDir);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<RuntimeLLMState> & Partial<RuntimeLLMConfig>;
    if (raw.profiles && raw.activeProvider) {
      const profile = raw.profiles[String(raw.activeProvider)];
      if (profile?.provider && profile?.model) return profile;
    }
    if (raw.provider && raw.model) {
      return {
        provider: String(raw.provider),
        model: String(raw.model),
        baseUrl: String(raw.baseUrl ?? ""),
        apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeRuntimeLLMConfig(dataDir: string, config: RuntimeLLMConfig): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const p = runtimePath(dataDir);
  let state: RuntimeLLMState = { activeProvider: config.provider, profiles: {} };
  if (fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<RuntimeLLMState>;
      if (raw && raw.profiles && typeof raw.profiles === "object") {
        state = {
          activeProvider: String(raw.activeProvider ?? config.provider),
          profiles: raw.profiles as Record<string, RuntimeLLMConfig>
        };
      }
    } catch {
      state = { activeProvider: config.provider, profiles: {} };
    }
  }
  state.activeProvider = config.provider;
  state.profiles[config.provider] = config;
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
}
