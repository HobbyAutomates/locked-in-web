import type { ImagePart, RawUsage } from "../types";

/**
 * Self-hosted PaddleOCR-VL: POST the image, get back `{ text, tables?, blocks? }`. No token usage to
 * report (it's not a metered LLM call), so `usage` is always zeroed — the router still logs the line
 * so latency and call counts show up in Railway logs.
 */
type OcrResponse = { text?: string; tables?: string[]; blocks?: { text?: string }[] };

export async function completeText(opts: { url: string; token?: string; images?: ImagePart[]; maxTokens?: number }): Promise<{ text: string; usage: RawUsage }> {
  const image = opts.images?.[0];
  if (!image) throw new Error("PaddleOCR needs an image");
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: JSON.stringify({ image: image.base64, media_type: image.mediaType }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`PaddleOCR ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const j = (await res.json()) as OcrResponse;
  const text = j.text?.trim() || (j.blocks ?? []).map((b) => b.text ?? "").join("\n") || [...(j.tables ?? [])].join("\n\n");
  return { text, usage: { in: 0, out: 0 } };
}
