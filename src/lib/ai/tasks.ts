import type { ProviderId, TaskId } from "./types";

/** The Sonnet model every vision task defaults to (kept in sync with scanFlows.VISION_MODEL). */
export const DEFAULT_VISION_MODEL = "claude-sonnet-5";
export const DEFAULT_TEXT_MODEL = "claude-haiku-4-5-20251001";

export type TaskDef = {
  /** Today's provider — always "anthropic", so no env vars means no behaviour change. */
  defaultProvider: ProviderId;
  defaultModel: string;
  maxTokens: number;
  images: boolean;
  /** True when the task uses an Anthropic-only feature (web_search, a fused two-tool choice) and can
   *  never be routed to another provider — `AI_ROUTE_*` is ignored for these. */
  anthropicOnly?: boolean;
  /** What tomorrow's alternative provider is expected to be, for `.env.example` / README docs only. */
  plannedAlternative: string;
};

export const TASKS: Record<TaskId, TaskDef> = {
  meal_vision: { defaultProvider: "anthropic", defaultModel: DEFAULT_VISION_MODEL, maxTokens: 2500, images: true, plannedAlternative: "qwen:qwen3-vl (routine scans)" },
  meal_vision_hard: { defaultProvider: "anthropic", defaultModel: DEFAULT_VISION_MODEL, maxTokens: 2500, images: true, plannedAlternative: "gemini:gemini-pro (escalation)" },
  scan_classify: { defaultProvider: "anthropic", defaultModel: DEFAULT_VISION_MODEL, maxTokens: 2500, images: true, anthropicOnly: true, plannedAlternative: "gemini:gemini-flash (classification only)" },
  label_ocr: { defaultProvider: "anthropic", defaultModel: DEFAULT_VISION_MODEL, maxTokens: 2000, images: true, plannedAlternative: "paddleocr:default (self-hosted PaddleOCR-VL)" },
  label_ocr_verify: { defaultProvider: "anthropic", defaultModel: DEFAULT_VISION_MODEL, maxTokens: 2000, images: true, plannedAlternative: "deepseekocr:default (disabled by default)" },
  label_structure: { defaultProvider: "anthropic", defaultModel: DEFAULT_TEXT_MODEL, maxTokens: 2500, images: false, plannedAlternative: "qwen:qwen-plus" },
  label_analysis: { defaultProvider: "anthropic", defaultModel: DEFAULT_TEXT_MODEL, maxTokens: 3000, images: false, anthropicOnly: true, plannedAlternative: "Claude only — web_search is an Anthropic server tool" },
  barcode_digits: { defaultProvider: "anthropic", defaultModel: DEFAULT_VISION_MODEL, maxTokens: 60, images: true, plannedAlternative: "gemini:gemini-flash" },
  meal_text_parse: { defaultProvider: "anthropic", defaultModel: DEFAULT_TEXT_MODEL, maxTokens: 1800, images: false, plannedAlternative: "qwen:qwen-plus or gemini:gemini-flash" },
  exercise_parse: { defaultProvider: "anthropic", defaultModel: DEFAULT_TEXT_MODEL, maxTokens: 1500, images: false, plannedAlternative: "qwen:qwen-plus or gemini:gemini-flash" },
  food_lookup: { defaultProvider: "anthropic", defaultModel: DEFAULT_TEXT_MODEL, maxTokens: 300, images: false, plannedAlternative: "qwen:qwen-plus or openai-compatible (was LIVE_FOOD_PROVIDER)" },
  // v2.13 restaurant menu scan: Haiku reads the menu first; Sonnet only when Haiku fails or finds nothing.
  menu_vision: { defaultProvider: "anthropic", defaultModel: DEFAULT_TEXT_MODEL, maxTokens: 4000, images: true, plannedAlternative: "gemini:gemini-flash" },
  menu_vision_hard: { defaultProvider: "anthropic", defaultModel: DEFAULT_VISION_MODEL, maxTokens: 4000, images: true, plannedAlternative: "gemini:gemini-pro" },
  // v2.14 AI coach: Haiku by default, Sonnet when a photo is attached. Chat uses native tool calls.
  coach_chat: { defaultProvider: "anthropic", defaultModel: DEFAULT_TEXT_MODEL, maxTokens: 700, images: false, anthropicOnly: true, plannedAlternative: "Claude only — multi-step tool use" },
  coach_chat_vision: { defaultProvider: "anthropic", defaultModel: DEFAULT_VISION_MODEL, maxTokens: 700, images: true, anthropicOnly: true, plannedAlternative: "Claude only — multi-step tool use" },
  coach_memory: { defaultProvider: "anthropic", defaultModel: DEFAULT_TEXT_MODEL, maxTokens: 300, images: false, plannedAlternative: "qwen:qwen-plus or gemini:gemini-flash" },
  coach_note: { defaultProvider: "anthropic", defaultModel: DEFAULT_TEXT_MODEL, maxTokens: 250, images: false, plannedAlternative: "qwen:qwen-plus or gemini:gemini-flash" },
};
