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

/** Draw `bitmap` (optionally a centred square crop) into a canvas no larger than `maxEdge`. */
function drawScaled(bitmap: ImageBitmap, maxEdge: number, square: boolean): HTMLCanvasElement {
  const side = Math.min(bitmap.width, bitmap.height);
  const sw = square ? side : bitmap.width;
  const sh = square ? side : bitmap.height;
  const sx = square ? Math.round((bitmap.width - side) / 2) : 0;
  const sy = square ? Math.round((bitmap.height - side) / 2) : 0;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function bitmapOf(source: Blob | string): Promise<ImageBitmap> {
  if (typeof source !== "string") return createImageBitmap(source);
  const blob = await (await fetch(source)).blob();
  return createImageBitmap(blob);
}

/**
 * v2.2 scan thumbnail: longest edge <= 320 px, JPEG q 0.8, as bare base64 (no data: prefix) for
 * the `thumb` field of /api/scan, /api/scan-label, /api/scan-barcode and /api/photo-meal.
 * Accepts the picked File or an existing data URL. Never throws: null when it can't be made.
 */
export async function makeThumb(source: Blob | string, maxEdge = 320, quality = 0.8): Promise<string | null> {
  try {
    const bitmap = await bitmapOf(source);
    const canvas = drawScaled(bitmap, maxEdge, false);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", quality).split(",")[1] || null;
  } catch {
    return null;
  }
}

/** v2.2 avatar: centre-cropped square, <= 512 px, JPEG q 0.85, as a Blob ready for Storage. */
export async function squareAvatar(file: Blob, maxEdge = 512, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = drawScaled(bitmap, maxEdge, true);
  bitmap.close?.();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read that image"))), "image/jpeg", quality));
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
