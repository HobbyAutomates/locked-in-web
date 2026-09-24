/**
 * v2.6 profile-photo presets (Cal AI's "Add a profile photo"): 8 gradient discs with the user's
 * initials. The chosen one is drawn to a 512 px canvas and uploaded like a picked photo.
 */
export const AVATAR_GRADIENTS: [string, string][] = [
  ["#ff9a3c", "#ff4e50"],
  ["#f953c6", "#b91d73"],
  ["#4facfe", "#2356d8"],
  ["#43e97b", "#16a085"],
  ["#a18cd1", "#6a3fd6"],
  ["#f6d365", "#f08a24"],
  ["#30cfd0", "#2b5876"],
  ["#434343", "#111111"],
];

/** "Hobby H" → "HH", "sohum" → "S". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 1) : parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1);
  return letters.toUpperCase();
}

/** Renders preset `i` with `initials` to a JPEG blob (browser only). */
export async function renderAvatarPreset(i: number, initials: string, size = 512): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the photo");
  const [a, b] = AVATAR_GRADIENTS[((i % AVATAR_GRADIENTS.length) + AVATAR_GRADIENTS.length) % AVATAR_GRADIENTS.length];
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.round(size * (initials.length > 1 ? 0.38 : 0.46))}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(initials, size / 2, size / 2 + size * 0.02);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not draw the photo"))), "image/jpeg", 0.9));
}
