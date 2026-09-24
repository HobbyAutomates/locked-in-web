import type { ImagePart, JsonSchema, RawUsage } from "../types";

/**
 * Any OpenAI-compatible `/chat/completions` endpoint with a `json_schema` response_format: Qwen
 * (DashScope international or OpenRouter), OpenAI itself, and a local vLLM / InternVL server. `fetch`
 * only. The caller supplies `baseUrl`/`apiKey` from config.ts — this module knows nothing provider-specific.
 */

type ChatResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
};

function messages(system: string | undefined, text: string, images: ImagePart[] | undefined) {
  const user = images?.length
    ? [{ type: "text", text }, ...images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.base64}` } }))]
    : text;
  return [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: user }];
}

function usageOf(j: ChatResponse): RawUsage {
  return { in: j.usage?.prompt_tokens ?? 0, out: j.usage?.completion_tokens ?? 0, ...(j.usage?.prompt_tokens_details?.cached_tokens ? { cache_read: j.usage.prompt_tokens_details.cached_tokens } : {}) };
}

async function chat(opts: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  system?: string;
  images?: ImagePart[];
  text: string;
  maxTokens: number;
  responseFormat?: Record<string, unknown>;
}): Promise<{ text: string; usage: RawUsage }> {
  const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: messages(opts.system, opts.text, opts.images),
      ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${opts.baseUrl} ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const j = (await res.json()) as ChatResponse;
  return { text: j.choices?.[0]?.message?.content ?? "", usage: usageOf(j) };
}

export async function completeText(opts: { baseUrl: string; apiKey?: string; model: string; system?: string; images?: ImagePart[]; text: string; maxTokens: number }): Promise<{ text: string; usage: RawUsage }> {
  return chat(opts);
}

export async function completeJson(opts: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  system?: string;
  images?: ImagePart[];
  text: string;
  maxTokens: number;
  schema: JsonSchema;
  schemaName: string;
}): Promise<{ data: unknown; usage: RawUsage }> {
  const { text, usage } = await chat({ ...opts, responseFormat: { type: "json_schema", json_schema: { name: opts.schemaName, schema: opts.schema, strict: true } } });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${opts.baseUrl} did not return valid JSON`);
  }
  return { data, usage };
}
