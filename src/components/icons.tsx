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

/** Running figure for the Run option and exercise rows. */
export function Run(p: P) {
  return (
    <Stroke {...p}>
      <circle cx="15" cy="4" r="1.5" />
      <path d="M6 21l3.5-6.5 3 2L14 21" />
      <path d="M9.5 14.5l1-4.5 3.5-1.5 2.5 3.5 3.5.5" />
      <path d="M10.5 10L7 11.5 5 9" />
    </Stroke>
  );
}

/** Three text lines for the Describe option. */
export function TextLines(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 7h16M4 12h12M4 17h8" />
    </Stroke>
  );
}

/** Number keypad for the Manual option. */
export function Keypad(p: P) {
  return (
    <Stroke {...p}>
      <path d="M6 5h.1M12 5h.1M18 5h.1M6 11h.1M12 11h.1M18 11h.1M6 17h.1M12 17h.1M18 17h.1" />
    </Stroke>
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

// ---- v1.5–v1.8 additions (Profile, onboarding, badges), ported from Icons.kt ----

/** Two footprints for the step-goal row. */
export function Steps(p: P) {
  return (
    <Stroke {...p}>
      <path d="M6 3c2 0 3 2 3 5s-1 5-2.5 5S4 11 4 8s.5-5 2-5zM5 15h3v2H5zM18 7c2 0 2 2 2 5s-1 5-2.5 5S15 15 15 12s1-5 3-5zM16 19h3v2h-3z" />
    </Stroke>
  );
}

/** Goal-speed animals: a hunched sloth, an upright rabbit, a stretched-out cheetah. */
export function Sloth(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 6h16M9 6v3M16 6v3" />
      <path d="M12.5 9c3.5 0 5.5 2.5 5.5 5.5S16 20 12.5 20 7 17.5 7 14.5 9 9 12.5 9z" />
      <path d="M10.5 14h.1M14.5 14h.1" />
    </Stroke>
  );
}
export function Rabbit(p: P) {
  return (
    <Stroke {...p}>
      <path d="M9 10c-1-3-1-6 .5-7 1.5 1 1.5 4 1 7M14.5 10c1-3 1-6-.5-7-1.5 1-1.5 4-1 7" />
      <path d="M12 10c3.5 0 6 2.5 6 6s-2.5 5-6 5-6-2-6-5 2.5-6 6-6z" />
      <path d="M10 15h.1M14 15h.1" />
    </Stroke>
  );
}
export function Cheetah(p: P) {
  return (
    <Stroke {...p}>
      <path d="M3 15c2-4 6-5 10-5 3 0 5-1 6-3l2.5.5M3 15c-1 1-1.5 2-1 3" />
      <path d="M6 13.5L5 19M9.5 12.5L9 19M13.5 11.5l1 6.5M16.5 9.5L18 15" />
    </Stroke>
  );
}

/** Bathroom scale for the weight rows. */
export function Scale(p: P) {
  return (
    <Stroke {...p}>
      <path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M8 9c0-2 2-2.5 4-2.5s4 .5 4 2.5M12 9v4" />
    </Stroke>
  );
}

/** Ruler for the height row. */
export function Ruler(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 8h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <path d="M7 8v4M11 8v4M15 8v4M19 8v4" />
    </Stroke>
  );
}

/** Pencil used on the "tap to edit" rows. */
export function Pencil(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 20l.8-3.8L16.5 4.5a2.1 2.1 0 0 1 3 3L7.8 19.2zM14.5 6.5l3 3" />
    </Stroke>
  );
}

/** Target rings for the goal / nutrition rows. */
export function Target(p: P) {
  return (
    <Stroke {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12h.1" />
    </Stroke>
  );
}

export function Check(p: P) {
  return (
    <Stroke {...p}>
      <path d="M5 12.5l5 5 9-11" />
    </Stroke>
  );
}

export function Person(p: P) {
  return (
    <Stroke {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" />
    </Stroke>
  );
}

/** Sliders for the Preferences row. */
export function Tune(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Stroke>
  );
}

export function Bell(p: P) {
  return (
    <Stroke {...p}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4" />
    </Stroke>
  );
}

/** Painter's palette for "Ring colours explained". */
export function Palette(p: P) {
  return (
    <Stroke {...p}>
      <path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a4 4 0 0 0 4-4c0-5.5-4-10-9-10z" />
      <path d="M7.5 10.5h.1M11 7h.1M15.5 8.5h.1M7.5 15h.1" />
    </Stroke>
  );
}

export function Mail(p: P) {
  return (
    <Stroke {...p}>
      <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
    </Stroke>
  );
}

/** Hexagonal medal outline for the Badges tab card. */
export function Medal(p: P) {
  return (
    <Stroke {...p}>
      <path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" />
      <path d="M9.5 12l2 2 3.5-4" />
    </Stroke>
  );
}

/** Magnifier for the food Search tab. */
export function Search(p: P) {
  return (
    <Stroke {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" />
    </Stroke>
  );
}

/** Four tiles for the Presets tab. */
export function Grid(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
    </Stroke>
  );
}

/** Camera for the Photo tab. */
export function Camera(p: P) {
  return (
    <Stroke {...p}>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </Stroke>
  );
}

/** Oil drop for the "Cooked in…" fat chips. */
export function Drop(p: P) {
  return (
    <Stroke {...p}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
    </Stroke>
  );
}

/** Two arrows for "Check for updates". */
export function Refresh(p: P) {
  return (
    <Stroke {...p}>
      <path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3" />
      <path d="M20 4v4h-4M4 20v-4h4" />
    </Stroke>
  );
}

/** Sparkle for "What's new". */
export function Sparkle(p: P) {
  return (
    <Stroke {...p}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </Stroke>
  );
}
