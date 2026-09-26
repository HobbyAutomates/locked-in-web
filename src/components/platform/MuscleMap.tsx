"use client";

import { REGION_LABEL, type Region } from "@/lib/muscles";
import { md } from "../motion";

/**
 * v2.13 muscle map (spec §12): a front and a back figure with 18 regions. Two modes:
 *   - `split`: one exercise / routine day — primary solid accent, secondary lighter;
 *   - `heat`:  0..1 per region (weekly sets ÷ 20).
 * Shapes are simple on purpose (ellipses and a few paths) so Android can redraw them on a Canvas.
 */

type Shape = { region: Region; d?: string; e?: [number, number, number, number]; mirror?: boolean };

const W = 200;
const mx = (x: number) => W - x;

// Front view (x in 0..200).
const FRONT: Shape[] = [
  { region: "traps", d: "M90,56 L72,68 L90,68 Z", mirror: true },
  { region: "front_delts", e: [64, 80, 10, 12], mirror: true },
  { region: "side_delts", e: [53, 86, 6, 12], mirror: true },
  { region: "chest", d: "M99,74 L74,76 Q66,96 76,106 Q90,111 99,104 Z", mirror: true },
  { region: "biceps", e: [54, 120, 8, 18], mirror: true },
  { region: "forearms", e: [47, 164, 7, 22], mirror: true },
  { region: "abs", d: "M87,112 L113,112 Q116,142 112,176 L88,176 Q84,142 87,112 Z" },
  { region: "obliques", d: "M84,112 L75,114 Q70,142 79,176 L86,176 Q81,142 84,112 Z", mirror: true },
  { region: "quads", e: [80, 244, 13, 44], mirror: true },
  { region: "adductors", e: [95, 226, 4.5, 22], mirror: true },
  { region: "calves", e: [81, 334, 8, 30], mirror: true },
];

// Back view.
const BACK: Shape[] = [
  { region: "traps", d: "M100,52 L78,70 L100,114 L122,70 Z" },
  { region: "rear_delts", e: [62, 82, 10, 11], mirror: true },
  { region: "side_delts", e: [52, 88, 6, 12], mirror: true },
  { region: "upper_back", d: "M96,78 L80,76 Q72,88 78,100 L96,110 Z", mirror: true },
  { region: "triceps", e: [54, 120, 8, 18], mirror: true },
  { region: "forearms", e: [47, 164, 7, 22], mirror: true },
  { region: "lats", d: "M80,104 Q70,110 70,128 Q74,152 92,168 L97,150 L97,116 Z", mirror: true },
  { region: "lower_back", d: "M89,154 L111,154 L113,184 L87,184 Z" },
  { region: "glutes", e: [86, 204, 15, 16], mirror: true },
  { region: "hamstrings", e: [80, 256, 12, 36], mirror: true },
  { region: "calves", e: [80, 324, 11, 26], mirror: true },
];

function mirrorPath(d: string): string {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${mx(Number(x))},${y}`);
}

/** The shared silhouette both views sit on. */
function Silhouette() {
  const fill = "var(--card2)";
  return (
    <g fill={fill}>
      <circle cx={100} cy={30} r={19} />
      <rect x={91} y={46} width={18} height={14} rx={6} />
      <rect x={66} y={62} width={68} height={126} rx={26} />
      <rect x={68} y={170} width={64} height={46} rx={18} />
      {[0, 1].map((k) => {
        const f = (x: number, w: number) => (k ? mx(x) - w : x);
        return (
          <g key={k}>
            <rect x={f(42, 24)} y={70} width={24} height={76} rx={12} />
            <rect x={f(38, 19)} y={138} width={19} height={62} rx={9.5} />
            <circle cx={k ? mx(47) : 47} cy={208} r={8} />
            <rect x={f(66, 34)} y={196} width={34} height={104} rx={17} />
            <rect x={f(70, 23)} y={294} width={23} height={84} rx={11.5} />
            <rect x={f(68, 26)} y={374} width={26} height={10} rx={5} />
          </g>
        );
      })}
    </g>
  );
}

export type MapMode = { kind: "split"; primary: Region[]; secondary: Region[] } | { kind: "heat"; heat: Partial<Record<Region, number>> };

function fillFor(region: Region, mode: MapMode): { fill: string; opacity: number } {
  if (mode.kind === "split") {
    if (mode.primary.includes(region)) return { fill: "var(--accent)", opacity: 1 };
    if (mode.secondary.includes(region)) return { fill: "var(--accent)", opacity: 0.38 };
    return { fill: "var(--track)", opacity: 1 };
  }
  const h = mode.heat[region] ?? 0;
  if (h <= 0) return { fill: "var(--track)", opacity: 1 };
  return { fill: "var(--accent)", opacity: 0.22 + 0.78 * Math.min(1, h) };
}

function View({ shapes, mode, label, delay }: { shapes: Shape[]; mode: MapMode; label: string; delay: number }) {
  return (
    <figure className="m-0 flex flex-1 flex-col items-center gap-1">
      <svg viewBox="30 4 140 386" className="block w-full" style={{ maxHeight: 260 }} aria-hidden="true">
        <Silhouette />
        {shapes.flatMap((s, i) => {
          const { fill, opacity } = fillFor(s.region, mode);
          const style = md(delay + i * 45);
          const one = (key: string, flip: boolean) =>
            s.e ? (
              <ellipse key={key} cx={flip ? mx(s.e[0]) : s.e[0]} cy={s.e[1]} rx={s.e[2]} ry={s.e[3]} fill={fill} fillOpacity={opacity} className="m-fade" style={style}>
                <title>{REGION_LABEL[s.region]}</title>
              </ellipse>
            ) : (
              <path key={key} d={flip ? mirrorPath(s.d as string) : (s.d as string)} fill={fill} fillOpacity={opacity} className="m-fade" style={style}>
                <title>{REGION_LABEL[s.region]}</title>
              </path>
            );
          return s.mirror ? [one(`${s.region}-l-${i}`, false), one(`${s.region}-r-${i}`, true)] : [one(`${s.region}-${i}`, false)];
        })}
      </svg>
      <figcaption className="text-[11px] font-semibold muted">{label}</figcaption>
    </figure>
  );
}

export default function MuscleMap({ mode, delay = 200, label }: { mode: MapMode; delay?: number; label?: string }) {
  const described =
    label ??
    (mode.kind === "split"
      ? `Primary: ${mode.primary.map((r) => REGION_LABEL[r]).join(", ") || "none"}. Secondary: ${mode.secondary.map((r) => REGION_LABEL[r]).join(", ") || "none"}.`
      : `Muscles trained: ${Object.entries(mode.heat)
          .filter(([, v]) => (v ?? 0) > 0)
          .map(([r]) => REGION_LABEL[r as Region])
          .join(", ") || "none yet"}.`);
  return (
    <div role="img" aria-label={described} className="flex gap-3">
      <View shapes={FRONT} mode={mode} label="Front" delay={delay} />
      <View shapes={BACK} mode={mode} label="Back" delay={delay + 300} />
    </div>
  );
}

export function MapLegend({ mode }: { mode: "split" | "heat" }) {
  return (
    <div className="flex flex-wrap gap-3.5 text-[11px] font-semibold muted">
      {mode === "split" ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} /> Primary
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)", opacity: 0.38 }} /> Secondary
          </span>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)", opacity: 0.3 }} /> A few sets
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} /> 20+ sets
          </span>
        </>
      )}
    </div>
  );
}
