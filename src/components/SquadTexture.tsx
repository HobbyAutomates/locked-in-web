import { useId } from "react";

/**
 * v2.14 "Squad textures" (canvas "Ember is earned", idea 03): every squad gets a mono pattern
 * instead of a colour, so the brand never fragments into a rainbow. The pattern is picked from a
 * stable hash of the squad id (FNV-1a 32-bit over the UUID string, index = hash % 8); Android's
 * SquadTexture.kt uses the same hash and order, so a squad looks the same on both.
 */
export const TEXTURES = ["dots", "stripes", "grid", "waves", "checks", "diagonal", "rings", "zigzag"] as const;
export type Texture = (typeof TEXTURES)[number];

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function textureFor(id: string): Texture {
  return TEXTURES[fnv1a(id) % TEXTURES.length];
}

/** The pattern tile (8×8 user units) drawn in `color`. */
function Tile({ t, color }: { t: Texture; color: string }) {
  const s = { stroke: color, fill: "none", strokeWidth: 1.1 } as const;
  switch (t) {
    case "dots":
      return <circle cx="4" cy="4" r="1.3" style={{ fill: color }} />;
    case "stripes":
      return <path d="M0 2h8M0 6h8" style={s} />;
    case "grid":
      return <path d="M0 .5h8M.5 0v8" style={s} />;
    case "waves":
      return <path d="M0 4c1.3-2 2.7-2 4 0s2.7 2 4 0" style={s} />;
    case "checks":
      return (
        <>
          <rect x="0" y="0" width="4" height="4" style={{ fill: color }} opacity=".55" />
          <rect x="4" y="4" width="4" height="4" style={{ fill: color }} opacity=".55" />
        </>
      );
    case "diagonal":
      return <path d="M-1 1l2-2M0 8l8-8M7 9l2-2" style={s} />;
    case "rings":
      return <circle cx="4" cy="4" r="2.4" style={s} />;
    case "zigzag":
      return <path d="M0 5l2-2 2 2 2-2 2 2" style={s} />;
  }
}

/** An SVG <pattern> for a squad, to fill any shape: <rect fill={`url(#${id})`} />. */
export function SquadPattern({ id, texture, color = "var(--ink)", scale = 1 }: { id: string; texture: Texture; color?: string; scale?: number }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={8 * scale} height={8 * scale} viewBox="0 0 8 8">
      <Tile t={texture} color={color} />
    </pattern>
  );
}

/** A textured tile (circle or rounded square) with optional content centred on a bone disc. */
export function SquadTextureTile({ squadId, size, rounded = "full", children }: { squadId: string; size: number; rounded?: "full" | "2xl"; children?: React.ReactNode }) {
  const pid = `st${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const radius = rounded === "full" ? size / 2 : Math.round(size * 0.28);
  const texture = textureFor(squadId);
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden" style={{ width: size, height: size, borderRadius: radius, background: "var(--card2)" }} aria-hidden="true" data-texture={texture}>
      <svg width={size} height={size} className="absolute inset-0">
        <defs>
          <SquadPattern id={pid} texture={texture} scale={size >= 80 ? 1.6 : size >= 48 ? 1.2 : 0.9} color="color-mix(in srgb, var(--ink) 55%, transparent)" />
        </defs>
        <rect width={size} height={size} fill={`url(#${pid})`} />
      </svg>
      {children ? (
        <span className="relative grid place-items-center rounded-full" style={{ width: Math.round(size * 0.62), height: Math.round(size * 0.62), background: "var(--card)" }}>
          {children}
        </span>
      ) : null}
    </span>
  );
}

/** A thin textured strip (leaderboard rows): the squad's pattern down the left edge. */
export function SquadTextureStrip({ squadId, width = 6 }: { squadId: string; width?: number }) {
  const pid = `ss${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={width} height="100%" className="absolute inset-y-0 left-0" preserveAspectRatio="none" aria-hidden="true" style={{ height: "100%" }}>
      <defs>
        <SquadPattern id={pid} texture={textureFor(squadId)} scale={0.75} color="color-mix(in srgb, var(--ink) 60%, transparent)" />
      </defs>
      <rect width={width} height="100%" fill={`url(#${pid})`} />
    </svg>
  );
}
