/** SVG path helpers for the v2.12 charts and dials. Pure. */

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * A smooth line through the points (Catmull-Rom as cubic Béziers). The control points are clamped
 * to the neighbours' y-range so the curve never swings above a peak or below a dip.
 */
export function smoothPath(pts: [number, number][], tension = 0.5): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2;
    const c1y = Math.max(lo, Math.min(hi, p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2));
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2;
    const c2y = Math.max(lo, Math.min(hi, p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2));
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** Arc from 12 o'clock clockwise covering `frac` of the circle (0..1, a full turn is two halves). */
export function ringArc(cx: number, cy: number, r: number, frac: number): string {
  const fr = Math.max(0.0001, Math.min(frac, 0.9999));
  const a = -Math.PI / 2 + 2 * Math.PI * fr;
  return `M${f(cx)},${f(cy - r)} A${r},${r} 0 ${fr > 0.5 ? 1 : 0} 1 ${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`;
}

/** Point on a circle at `deg` degrees (0 = 3 o'clock, clockwise). */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export { f as fx };
