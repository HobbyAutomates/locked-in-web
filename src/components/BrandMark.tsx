/**
 * Brand v1 marks. The monogram is the real padlock (public/icon.svg geometry, viewBox 108): ink
 * tile, bone shackle + body, ember keyhole. The wordmark is lowercase "locked in" in Bricolage 800
 * with the i's dot as an ember circle. Fixed brand colours, so they read the same in both themes.
 */
export function Padlock({ size = 44, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flex: "none" }}>
      <rect width="108" height="108" rx="24" fill="#0B0B0C" />
      <rect x="0.5" y="0.5" width="107" height="107" rx="23.5" fill="none" stroke="rgba(244,241,234,.09)" />
      <path d="M40 52V40a14 14 0 0 1 28 0v12" fill="none" stroke="#F4F1EA" strokeWidth="7" strokeLinecap="round" />
      <path d="M34 50h40a5 5 0 0 1 5 5v24a5 5 0 0 1-5 5H34a5 5 0 0 1-5-5V55a5 5 0 0 1 5-5z" fill="#F4F1EA" />
      <path d="M54 60a4.5 4.5 0 0 1 2.5 8.3L58 76h-8l1.5-7.7A4.5 4.5 0 0 1 54 60z" fill="#FF5B1F" />
    </svg>
  );
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="display" style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--ink)", whiteSpace: "nowrap" }} aria-label="locked in">
      <span aria-hidden="true">
        locked{" "}
        <span style={{ position: "relative", display: "inline-block" }}>
          {"ı"}
          <span style={{ position: "absolute", left: "50%", top: "0.02em", width: "0.2em", height: "0.2em", marginLeft: "-0.1em", borderRadius: 999, background: "var(--ember)" }} />
        </span>
        n
      </span>
    </span>
  );
}
