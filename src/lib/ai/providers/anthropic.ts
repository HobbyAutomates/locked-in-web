import Anthropic from "@anthropic-ai/sdk";
import type { ImagePart, JsonSchema, RawUsage } from "../types";

let client: Anthropic | null = null;

/** The one Anthropic client every adapter (and the scan-flow's `anthropic_native` escape hatch) shares. */
export function anthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function usageOf(m: Anthropic.Message): RawUsage {
  const u = m.usage as Anthropic.Usage & { cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
  return {
    in: u?.input_tokens ?? 0,
    out: u?.output_tokens ?? 0,
    ...(u?.cache_read_input_tokens ? { cache_read: u.cache_read_input_tokens } : {}),
    ...(u?.cache_creation_input_tokens ? { cache_write: u.cache_creation_input_tokens } : {}),
  };
}

function content(text: string, images?: ImagePart[]): Anthropic.MessageParam["content"] {
  if (!images?.length) return text;
  return [...images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 } })), { type: "text" as const, text }];
}

export async function completeText(opts: { model: string; system?: string; images?: ImagePart[]; text: string; maxTokens: number }): Promise<{ text: string; usage: RawUsage; raw: Anthropic.Message }> {
  const m = await anthropicClient().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content: content(opts.text, opts.images) }],
  });
  const text = m.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("\n")
    .trim();
  return { text, usage: usageOf(m), raw: m };
}

export async function completeJson(opts: {
  model: string;
  system?: string;
  images?: ImagePart[];
  text: string;
  maxTokens: number;
  schema: JsonSchema;
  schemaName: string;
}): Promise<{ data: unknown; usage: RawUsage; raw: Anthropic.Message }> {
  const tool: Anthropic.Tool = { name: opts.schemaName, description: `Return ${opts.schemaName} as structured data.`, input_schema: opts.schema };
  const m = await anthropicClient().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...(opts.system ? { system: opts.system } : {}),
    tools: [tool],
    tool_choice: { type: "tool", name: opts.schemaName },
    messages: [{ role: "user", content: content(opts.text, opts.images) }],
  });
  const block = m.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error(`Anthropic did not call ${opts.schemaName}`);
  return { data: block.input, usage: usageOf(m), raw: m };
}
