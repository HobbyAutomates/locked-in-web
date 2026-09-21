/**
 * Inline SVG icons, ported one-for-one from the Android app's `Icons.kt`.
 * Stroke icons use stroke 1.9 with round caps/joins; never emoji.
 */

type P = { size?: number; className?: string; style?: React.CSSProperties };

function Stroke({ size = 24, className, style, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

/** Filled flame — streak and calories. */
export function Flame({ size = 24, className, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className} style={style}>
      <path d="M12 2c1 4 4 5 4 9a4 4 0 0 1-8 0c0-1 .3-2 1-3 0 2 1 3 2 3 0-3-1-6 1-9z" />
    </svg>
  );
}

export function Dumbbell(p: P) {
  return (
    <Stroke {...p}>
      <path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12" />
    </Stroke>
  );
}

export function Bowl(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 11h16l-1.5 8h-13z" />
      <path d="M6 11c0-4 3-6 6-6s6 2 6 6" />
    </Stroke>
  );
}

export function Scan(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3M7 12h10" />
    </Stroke>
  );
}

export function ThumbUp(p: P) {
  return (
    <Stroke {...p}>
      <path d="M7 10v11M3 12v7a2 2 0 0 0 2 2h2M7 10l4-7a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.5 8A2 2 0 0 1 17.5 21H7" />
    </Stroke>
  );
}

export function ThumbDown(p: P) {
  return (
    <Stroke {...p}>
      <path d="M17 14V3M21 12V5a2 2 0 0 0-2-2h-2M17 14l-4 7a2 2 0 0 1-2-2v-4H5a2 2 0 0 1-2-2.3l1.5-8A2 2 0 0 1 6.5 3H17" />
    </Stroke>
  );
}

export function Mic(p: P) {
  return (
    <Stroke {...p}>
      <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
    </Stroke>
  );
}

export function Home(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 12 12 4l8 8M6 10v10h12V10" />
    </Stroke>
  );
}

export function CalendarIcon(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />
    </Stroke>
  );
}

export function Chart(p: P) {
  return (
    <Stroke {...p}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </Stroke>
  );
}

export function Gear(p: P) {
  return (
    <Stroke {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.3 2.6h5l.3-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5c.07-.3.1-.7.1-1z" />
    </Stroke>
  );
}

export function Plus(p: P) {
  return (
    <Stroke {...p}>
      <path d="M12 5v14M5 12h14" />
    </Stroke>
  );
}

export function Trash(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </Stroke>
  );
}

export function ChevronLeft(p: P) {
  return (
    <Stroke {...p}>
      <path d="M15 5l-7 7 7 7" />
    </Stroke>
  );
}

export function ChevronRight(p: P) {
  return (
    <Stroke {...p}>
      <path d="M9 5l7 7-7 7" />
    </Stroke>
  );
}

export function ArrowLeft(p: P) {
  return (
    <Stroke {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Stroke>
  );
}

export function Moon(p: P) {
  return (
    <Stroke {...p}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </Stroke>
  );
}

export function Exit(p: P) {
  return (
    <Stroke {...p}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
    </Stroke>
  );
}

export function Share(p: P) {
  return (
    <Stroke {...p}>
      <path d="M12 15V3M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </Stroke>
  );
}

/** The Locked In mark: padlock with a band-shaped shackle (108 viewBox, as in Icons.kt). */
export function Lock({ size = 26, className, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" fill="none" aria-hidden="true" focusable="false" className={className} style={style}>
      <path d="M40 52V40a14 14 0 0 1 28 0v12" fill="none" stroke="currentColor" strokeWidth={9} strokeLinecap="round" />
      <path d="M34 50h40a5 5 0 0 1 5 5v24a5 5 0 0 1-5 5H34a5 5 0 0 1-5-5V55a5 5 0 0 1 5-5z" fill="currentColor" />
    </svg>
  );
}

/** Small indeterminate spinner (used where Compose shows CircularProgressIndicator). */
export function Spinner({ size = 18, className, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={`spin ${className ?? ""}`} style={style}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
