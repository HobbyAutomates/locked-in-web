import type { ImagePart, RawUsage } from "../types";

/**
 * Self-hosted DeepSeek-OCR, same request/response shape as PaddleOCR — used as an optional second-pass
 * verifier (`label_ocr_verify`, disabled by default: no route points at it unless `AI_ROUTE_LABEL_OCR_VERIFY`
 * and `DEEPSEEK_OCR_URL` are both set).
 */
type OcrResponse = { text?: string; tables?: string[]; blocks?: { text?: string }[] };

export async function completeText(opts: { url: string; token?: string; images?: ImagePart[]; maxTokens?: number }): Promise<{ text: string; usage: RawUsage }> {
  const image = opts.images?.[0];
  if (!image) throw new Error("DeepSeek-OCR needs an image");
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: JSON.stringify({ image: image.base64, media_type: image.mediaType }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`DeepSeek-OCR ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const j = (await res.json()) as OcrResponse;
  const text = j.text?.trim() || (j.blocks ?? []).map((b) => b.text ?? "").join("\n") || [...(j.tables ?? [])].join("\n\n");
  return { text, usage: { in: 0, out: 0 } };
}
