/**
 * Browser-side image helpers shared by Add food (plate photo) and the Scan tab: downscale and
 * re-encode a picked photo as JPEG, and try to read an EAN/UPC from it with ZXing.
 */

/** Downscale and re-encode as JPEG, matching the Android scanner. */
export async function toJpegBase64(file: File, maxEdge = 2200, quality = 0.88): Promise<{ base64: string; media_type: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { base64: dataUrl.split(",")[1] ?? "", media_type: "image/jpeg", preview: dataUrl };
}

/** Try to read an EAN/UPC from a still image in the browser (iPhone Safari has no native reader). */
export async function decodeBarcode(dataUrl: string): Promise<string | null> {
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);
    const result = await reader.decodeFromImageUrl(dataUrl);
    const digits = result.getText().replace(/\D/g, "");
    return digits.length >= 8 ? digits : null;
  } catch {
    return null;
  }
}

/** POST JSON, throwing the route's `{ error }` message on a non-2xx. */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`);
  return (await res.json()) as T;
}
