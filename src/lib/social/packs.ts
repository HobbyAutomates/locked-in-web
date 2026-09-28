/**
 * v2.18 D11 premium cover packs and badge skins (schema_v44 pack_unlocks, profiles.badge_skin,
 * cover_preset widened to "-gold"). Payments aren't wired: during the beta every pack unlocks
 * free, and the price is still shown ("₹149 · free in the beta"). Pure. Android: util/Packs.kt.
 *
 * Gold covers are the 17 dark motifs recoloured by goldifySvg(): every #hex in the SVG is mapped by
 * its luminance onto an ink → bronze → gold → pale-gold ramp (brand "dark gold for premium").
 * Id: "<motif>-gold", e.g. "plates-gold". The art index is the motif's DARK cover.
 */
import { COVER_PRESETS, type CoverPreset } from "../covers";

export type PackKind = "covers" | "badge_skin";
export type Pack = { id: string; kind: PackKind; name: string; blurb: string; price_inr: number };

export const PACKS: Pack[] = [
  { id: "covers-gold", kind: "covers", name: "Gold edition covers", blurb: "All 17 covers in dark gold.", price_inr: 149 },
  { id: "skin-obsidian", kind: "badge_skin", name: "Obsidian badges", blurb: "Your jewellery in black glass and gunmetal.", price_inr: 99 },
  { id: "skin-rose", kind: "badge_skin", name: "Rose gold badges", blurb: "Every frame in warm rose gold.", price_inr: 99 },
];

/** Beta flag (app_config.packs.beta_free; default true while payments are off). */
export const PACKS_BETA_FREE_DEFAULT = true;

export function packById(id: string): Pack | null {
  return PACKS.find((p) => p.id === id) ?? null;
}

export function priceLabel(p: Pack, betaFree: boolean): string {
  const price = `₹${p.price_inr.toLocaleString("en-IN")}`;
  return betaFree ? `${price} · free in the beta` : price;
}

/* ---------------- Gold covers ---------------- */

export type GoldCover = { id: string; name: string; darkIndex: number; slug: string };

export const GOLD_COVERS: GoldCover[] = COVER_PRESETS.filter((c) => c.tone === "dark").map((c) => {
  const slug = c.id.replace(/-dark$/, "");
  return { id: `${slug}-gold`, name: c.name, darkIndex: c.n - 1, slug };
});

export function isGoldCover(id: unknown): id is string {
  return typeof id === "string" && GOLD_COVERS.some((g) => g.id === id);
}

export function goldCover(id: string | null | undefined): GoldCover | null {
  return GOLD_COVERS.find((g) => g.id === id) ?? null;
}

/** The dark preset a gold id is drawn from (for names / categories). */
export function goldBase(id: string): CoverPreset | null {
  const g = goldCover(id);
  return g ? (COVER_PRESETS[g.darkIndex] ?? null) : null;
}

/** Ink → bronze → gold → pale gold, by luminance 0..1. */
export const GOLD_RAMP: [number, [number, number, number]][] = [
  [0, [11, 9, 6]],
  [0.3, [94, 69, 24]],
  [0.62, [217, 184, 114]],
  [1, [251, 231, 168]],
];

function hexToRgb(h: string): [number, number, number] | null {
  let s = h.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** Relative luminance-ish (Rec. 601 weights, 0..1). */
export function luma(rgb: [number, number, number]): number {
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

export function goldHex(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const l = luma(rgb);
  for (let i = 1; i < GOLD_RAMP.length; i++) {
    const [p1, c1] = GOLD_RAMP[i];
    const [p0, c0] = GOLD_RAMP[i - 1];
    if (l <= p1) {
      const t = p1 === p0 ? 0 : (l - p0) / (p1 - p0);
      return `#${toHex(c0[0] + (c1[0] - c0[0]) * t)}${toHex(c0[1] + (c1[1] - c0[1]) * t)}${toHex(c0[2] + (c1[2] - c0[2]) * t)}`;
    }
  }
  const last = GOLD_RAMP[GOLD_RAMP.length - 1][1];
  return `#${toHex(last[0])}${toHex(last[1])}${toHex(last[2])}`;
}

/** Every #rgb / #rrggbb in an SVG string → its gold. Lower-case output. */
export function goldifySvg(svg: string): string {
  return svg.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (m) => goldHex(m));
}

/* ---------------- Badge skins ---------------- */

export type BadgeSkin = "classic" | "obsidian" | "rose";
export const SKIN_KEY = "li-badge-skin";

/** Frame metal per skin (overrides the tier metal); classic = the tier's own metal. */
export const SKIN_METAL: Record<Exclude<BadgeSkin, "classic">, [string, string, string]> = {
  obsidian: ["#8a8f98", "#2a2c31", "#060607"],
  rose: ["#ffd9cf", "#c98a7a", "#5a2e25"],
};

export const SKIN_PACK: Record<Exclude<BadgeSkin, "classic">, string> = { obsidian: "skin-obsidian", rose: "skin-rose" };

export function parseSkin(v: unknown): BadgeSkin {
  return v === "obsidian" || v === "rose" ? v : "classic";
}

/** A skin is usable when it's classic or its pack is unlocked. */
export function skinAllowed(skin: BadgeSkin, unlocked: Iterable<string>): boolean {
  if (skin === "classic") return true;
  return new Set(unlocked).has(SKIN_PACK[skin]);
}
