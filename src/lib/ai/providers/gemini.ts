import { CONFIG } from "../config";
import type { ImagePart, JsonSchema, RawUsage } from "../types";

/** Google Generative Language REST API (`fetch` only — no SDK). */
const BASE = "https://generativelanguage.googleapis.com/v1beta";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number };
};

function parts(text: string, images?: ImagePart[]) {
  return [...(images ?? []).map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.base64 } })), { text }];
}

function usageOf(j: GeminiResponse): RawUsage {
  return { in: j.usageMetadata?.promptTokenCount ?? 0, out: j.usageMetadata?.candidatesTokenCount ?? 0, ...(j.usageMetadata?.cachedContentTokenCount ? { cache_read: j.usageMetadata.cachedContentTokenCount } : {}) };
}

async function generate(opts: { model: string; system?: string; images?: ImagePart[]; text: string; maxTokens: number; responseSchema?: JsonSchema }): Promise<{ text: string; usage: RawUsage }> {
  const apiKey = CONFIG.gemini.apiKey;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: parts(opts.text, opts.images) }],
    generationConfig: {
      maxOutputTokens: opts.maxTokens,
      ...(opts.responseSchema ? { responseMimeType: "application/json", responseSchema: opts.responseSchema } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  const res = await fetch(`${BASE}/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const j = (await res.json()) as GeminiResponse;
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return { text, usage: usageOf(j) };
}

export async function completeText(opts: { model: string; system?: string; images?: ImagePart[]; text: string; maxTokens: number }): Promise<{ text: string; usage: RawUsage }> {
  return generate(opts);
}

export async function completeJson(opts: { model: string; system?: string; images?: ImagePart[]; text: string; maxTokens: number; schema: JsonSchema; schemaName: string }): Promise<{ data: unknown; usage: RawUsage }> {
  const { text, usage } = await generate({ ...opts, responseSchema: opts.schema });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON");
  }
  return { data, usage };
}
