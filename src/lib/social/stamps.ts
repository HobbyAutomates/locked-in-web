/**
 * v2.18 D6 clean / cheat stamps on squad meal photos (schema_v44 post_stamps + RPC
 * post_stamp_counts). One stamp per person per post; tapping yours again removes it, the other
 * one switches. Pure. Android: util/Stamps.kt. The 7 new reactions live in lib/reactions.ts.
 */
export const STAMPS = ["clean", "cheat"] as const;
export type Stamp = (typeof STAMPS)[number];
export type StampState = { clean: number; cheat: number; mine: Stamp | null };

export const EMPTY_STAMPS: StampState = { clean: 0, cheat: 0, mine: null };

export function parseStamp(v: unknown): Stamp | null {
  return v === "clean" || v === "cheat" ? v : null;
}

const count = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** post_stamp_counts rows → { postId: state }. */
export function parseStampRows(rows: { post_id?: unknown; clean?: unknown; cheat?: unknown; mine?: unknown }[]): Record<string, StampState> {
  const out: Record<string, StampState> = {};
  for (const r of rows) if (typeof r.post_id === "string") out[r.post_id] = { clean: count(r.clean), cheat: count(r.cheat), mine: parseStamp(r.mine) };
  return out;
}

/** Tap `s`: returns the new state and what to save (null = delete my stamp). */
export function toggleStamp(state: StampState, s: Stamp): { state: StampState; save: Stamp | null } {
  const next = { ...state };
  if (state.mine) next[state.mine] = Math.max(0, next[state.mine] - 1);
  if (state.mine === s) return { state: { ...next, mine: null }, save: null };
  next[s] += 1;
  return { state: { ...next, mine: s }, save: s };
}

/** The big stamp on the photo: the majority, when anyone stamped; a tie shows nothing. */
export function stampVerdict(s: StampState): Stamp | null {
  if (s.clean === s.cheat) return null;
  return s.clean > s.cheat ? "clean" : "cheat";
}

/** Only meal posts and photo posts with a photo get stamps. */
export function stampable(p: { kind: string; photo_path: string | null }): boolean {
  return (p.kind === "meal" || p.kind === "photo") && !!p.photo_path;
}

export const STAMP_LABEL: Record<Stamp, string> = { clean: "CLEAN", cheat: "CHEAT" };
