import { isProviderId, type ProviderId, type TaskId } from "./types";

const env = (name: string): string | undefined => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
};

/** Everything a provider needs, read once from env. Missing values just mean "not configured". */
export const CONFIG = {
  anthropic: { apiKey: env("ANTHROPIC_API_KEY") },
  gemini: { apiKey: env("GEMINI_API_KEY") },
  // Qwen: DashScope international first, else an OpenRouter key against the OpenRouter base URL.
  qwen: {
    apiKey: env("DASHSCOPE_API_KEY") ?? env("OPENROUTER_API_KEY"),
    baseUrl: env("DASHSCOPE_BASE_URL") ?? (env("OPENROUTER_API_KEY") ? "https://openrouter.ai/api/v1" : undefined),
  },
  openai: { apiKey: env("OPENAI_API_KEY"), baseUrl: env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1" },
  // A local / self-hosted OpenAI-compatible server (vLLM, InternVL, …).
  local: { apiKey: env("LOCAL_OPENAI_API_KEY"), baseUrl: env("LOCAL_OPENAI_URL") },
  paddleocr: { url: env("PADDLEOCR_URL"), token: env("PADDLEOCR_TOKEN") },
  deepseekocr: { url: env("DEEPSEEK_OCR_URL"), token: env("DEEPSEEK_OCR_TOKEN") },
} as const;

export function isConfigured(p: ProviderId): boolean {
  switch (p) {
    case "anthropic":
      return !!CONFIG.anthropic.apiKey;
    case "gemini":
      return !!CONFIG.gemini.apiKey;
    case "qwen":
      return !!CONFIG.qwen.apiKey && !!CONFIG.qwen.baseUrl;
    case "openai":
      return !!CONFIG.openai.apiKey;
    case "local":
      return !!CONFIG.local.baseUrl;
    case "paddleocr":
      return !!CONFIG.paddleocr.url;
    case "deepseekocr":
      return !!CONFIG.deepseekocr.url;
  }
}

/** `AI_ROUTE_<TASK>="provider:model"`, e.g. `AI_ROUTE_MEAL_VISION=gemini:gemini-2.5-pro`. Unset,
 *  malformed, or naming an unknown provider all mean "use the task's Claude default". */
export function routeFor(task: TaskId): { provider: ProviderId; model: string } | null {
  const raw = env(`AI_ROUTE_${task.toUpperCase()}`);
  if (!raw) return null;
  const i = raw.indexOf(":");
  const provider = i === -1 ? raw : raw.slice(0, i);
  const model = i === -1 ? "" : raw.slice(i + 1);
  if (!isProviderId(provider)) return null;
  return { provider, model };
}

/** Confidence at/below this escalates a meal_vision result to meal_vision_hard. Off (`null`) by default. */
export function escalateBelow(): "low" | "medium" | null {
  const v = env("AI_ESCALATE_BELOW");
  return v === "low" || v === "medium" ? v : null;
}
