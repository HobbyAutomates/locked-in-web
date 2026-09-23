/**
 * Hexagonal medal with the threshold inside — flame-orange once earned, flat grey until then.
 * Point-up hexagon inscribed in the box, like the Android Canvas version.
 */
export default function HexMedal({ number, earned, size }: { number: number; earned: boolean; size: number }) {
  const c = 50;
  const r = 48;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 90) * Math.PI) / 180;
    return `${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  const fill = earned ? "color-mix(in srgb, var(--flame) 18%, transparent)" : "var(--card2)";
  const edge = earned ? "var(--flame)" : "var(--hair)";
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size, flex: "none" }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 100 100" className="absolute inset-0">
        <polygon points={pts} fill={fill} stroke={edge} strokeWidth={6} strokeLinejoin="round" />
      </svg>
      <span className="num relative font-extrabold" style={{ fontSize: Math.round(size * 0.3), color: earned ? "var(--flame)" : "var(--muted)", letterSpacing: "-0.03em" }}>
        {number}
      </span>
    </span>
  );
}
