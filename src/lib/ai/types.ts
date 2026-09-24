/**
 * Provider-neutral types for the model router (v2.7). See src/lib/ai/README.md.
 *
 * Nothing here is Anthropic-specific: a `JsonSchema` is the JSON-Schema subset every provider's
 * structured-output mode understands (Anthropic tool input_schema, Gemini responseSchema, an
 * OpenAI-compatible json_schema response_format).
 */

export type ProviderId = "anthropic" | "gemini" | "qwen" | "openai" | "local" | "paddleocr" | "deepseekocr";

export const PROVIDER_IDS: ProviderId[] = ["anthropic", "gemini", "qwen", "openai", "local", "paddleocr", "deepseekocr"];

export function isProviderId(v: string): v is ProviderId {
  return (PROVIDER_IDS as string[]).includes(v);
}

/** The tasks every scan-flow / parse-meal / describe-exercise call maps to. See tasks.ts. */
export type TaskId =
  | "meal_vision"
  | "meal_vision_hard"
  | "scan_classify"
  | "label_ocr"
  | "label_ocr_verify"
  | "label_structure"
  | "label_analysis"
  | "barcode_digits"
  | "meal_text_parse"
  | "exercise_parse"
  | "food_lookup";

/** A minimal JSON-Schema-compatible object description — the same shape Anthropic tool
 *  input_schema, Gemini responseSchema and an OpenAI json_schema response_format all accept. */
export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  [k: string]: unknown;
};

export type ImagePart = { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export type RawUsage = { in: number; out: number; cache_read?: number; cache_write?: number };

export type LlmResult<T> = { data: T; usage: RawUsage; provider: ProviderId; model: string; ms: number; fallback: boolean };

/** A free-text completion (OCR transcription, barcode digits — no structured schema). */
export type TextRequest = {
  kind: "text";
  system?: string;
  images?: ImagePart[];
  text: string;
  maxTokens: number;
};

/** A structured, schema-validated completion (a forced "tool call" in Anthropic's terms). */
export type JsonRequest = {
  kind: "json";
  system?: string;
  images?: ImagePart[];
  text: string;
  maxTokens: number;
  schema: JsonSchema;
  schemaName: string;
};

/**
 * An escape hatch for the two tasks that lean on Anthropic-only features (the classifier's fused
 * scan_kind/plate_estimate tool choice, and label_analysis's `web_search` server tool). `build` gets
 * the live Anthropic client and returns the raw Message; the router still owns timing, usage logging
 * and (for every OTHER task) the provider resolution + fallback, so every Anthropic call still goes
 * through `router.run`. These two tasks are marked `anthropicOnly` in tasks.ts and always resolve to
 * Anthropic regardless of `AI_ROUTE_*`.
 */
export type AnthropicNativeRequest = {
  kind: "anthropic_native";
  build: (client: import("@anthropic-ai/sdk").default) => Promise<import("@anthropic-ai/sdk").default.Message>;
};

export type TaskRequest = TextRequest | JsonRequest | AnthropicNativeRequest;
