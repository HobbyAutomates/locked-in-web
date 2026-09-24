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

/** Two people: the Squad tab. */
export function People(p: P) {
  return (
    <Stroke {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M15.5 5.2a3 3 0 0 1 0 5.6M17.5 13.8a5.5 5.5 0 0 1 3 5.7" />
    </Stroke>
  );
}

/** A raised fist: the nudge. */
export function Fist(p: P) {
  return (
    <Stroke {...p}>
      <path d="M7 11V8.5a1.5 1.5 0 0 1 3 0V11M10 10V7.5a1.5 1.5 0 0 1 3 0V10M13 10V8a1.5 1.5 0 0 1 3 0v3M16 10.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.5A5.5 5.5 0 0 1 6 14.5V12a1.5 1.5 0 0 1 3 0" />
    </Stroke>
  );
}

export function Close(p: P) {
  return (
    <Stroke {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Stroke>
  );
}

export function Copy(p: P) {
  return (
    <Stroke {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </Stroke>
  );
}

/** Moon + stars for the 9 pm wrap. */
export function MoonStar(p: P) {
  return (
    <Stroke {...p}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5zM17 3v4M15 5h4" />
    </Stroke>
  );
}

/** Down chevron: expanders ("Details", a collapsed Home row). */
export function ChevronDown(p: P) {
  return (
    <Stroke {...p}>
      <path d="M6 9l6 6 6-6" />
    </Stroke>
  );
}

/** A teaspoon, for the sugar-spoons row of a scan report. */
export function Spoon(p: P) {
  return (
    <Stroke {...p}>
      <ellipse cx="12" cy="7" rx="3.6" ry="4.4" />
      <path d="M12 11.4V21" />
    </Stroke>
  );
}

/** A phone, for "Add to Home Screen". */
export function Phone(p: P) {
  return (
    <Stroke {...p}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </Stroke>
  );
}

/** Price tag for label scans in the Scan history. */
export function Tag(p: P) {
  return (
    <Stroke {...p}>
      <path d="M3 12.2V4.5A1.5 1.5 0 0 1 4.5 3h7.7a1.5 1.5 0 0 1 1.06.44l7.3 7.3a1.5 1.5 0 0 1 0 2.12l-7.7 7.7a1.5 1.5 0 0 1-2.12 0l-7.3-7.3A1.5 1.5 0 0 1 3 12.2z" />
      <circle cx="8" cy="8" r="1.5" />
    </Stroke>
  );
}

/** Barcode bars for barcode scans in the Scan history. */
export function Barcode(p: P) {
  return (
    <Stroke {...p}>
      <path d="M3 7V5a1 1 0 0 1 1-1h2M18 4h2a1 1 0 0 1 1 1v2M21 17v2a1 1 0 0 1-1 1h-2M6 20H4a1 1 0 0 1-1-1v-2" />
      <path d="M7 8v8M10 8v8M13 8v8M15.5 8v8M17.5 8v8" />
    </Stroke>
  );
}

/** Warning triangle for ingredient flags in a scan report. */
export function Alert(p: P) {
  return (
    <Stroke {...p}>
      <path d="M10.3 4.2L2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.5M12 17.2v.1" />
    </Stroke>
  );
}
