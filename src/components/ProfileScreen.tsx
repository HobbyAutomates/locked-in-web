"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveProfile, signOut } from "@/lib/actions";
import { ALL_BADGES, earnedCount, type BadgeProgress } from "@/lib/badges";
import { today as todayIso } from "@/lib/dates";
import { onCount } from "@/lib/reminders";
import { goalEta, goalFraction, monthDay, monthYear, slopePerDay, weightTrend } from "@/lib/progressStats";
import { ageFrom, type Profile, type WeightEntry } from "@/lib/types";
import { APP_VERSION, CHANGELOG, compareVersions } from "@/lib/version";
import { displayName, weightText } from "@/lib/display";
import { AvatarPicker } from "./Avatar";
import GraffitiWall from "./GraffitiWall";
import { GROUP_ICON, LockedMedal, MetalMedal, TierLabel, medalShelf, moreText } from "./Medal";
import ProfileSetupSheet from "./ProfileSetupSheet";
import { TeenGoalMigration } from "./Science";
import { CountUp, MRise, drawLen, md } from "./motion";
import { LineIcon, type LineName } from "./lineIcons";
import { Pencil } from "./icons";
import { BottomSheet, ErrorNote } from "./ui";

const APK_URL = "https://evizkfvltacrfngsgbuu.supabase.co/storage/v1/object/public/app/LockedIn-14.apk";
const WEB_URL = "https://web-production-ff1cf.up.railway.app";
const INVITE_TEXT = `Locked In — workouts, meals by voice, label scanner. Android: ${APK_URL} · iPhone: ${WEB_URL} (Safari → Add to Home Screen)`;

/**
 * The Profile tab, v2.12: a monochrome weight-plate cover with settings and invite on its edge,
 * the avatar (tap to change the photo), who you are, three dials (streak, today's protein, weight
 * toward the goal), Edit profile / Invite, the medal shelf, the goal card and one quiet list of
 * everything else. Every v2.4–v2.11 entry is still here: details, nutrition goals, goal weight,
 * weight history, badges, preferences, what's new, invite, Add to Home Screen, feature requests,
 * the update check, and sign out.
 */
export default function ProfileScreen({
  profile,
  email,
  userId,
  joined = null,
  squadName = null,
  streak = 0,
  bestStreak = 0,
  proteinToday = 0,
  weights = [],
  badges = { streakDays: 0, meals: 0, goalDays: 0 },
  isAdmin = false,
}: {
  profile: Profile;
  email: string;
  userId: string;
  joined?: string | null;
  squadName?: string | null;
  streak?: number;
  bestStreak?: number;
  proteinToday?: number;
  weights?: WeightEntry[];
  badges?: BadgeProgress;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<null | "news" | "home" | "edit">(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // v2.6: no username yet → the one-time "Create a username / Add a profile photo" sheet.
  const [setup, setSetup] = useState<null | "full" | "username">(profile.username ? null : "full");
  const age = ageFrom(profile.dob);
  // Blank name → the email's first run of letters ("ayaan.khan@…" → "Ayaan"), like the signup trigger.
  const shownName = displayName(profile.name, email);
  const today = todayIso();

  const current = weights[0]?.weight_kg ?? profile.weight_kg;
  const start = weights.length ? weights[weights.length - 1].weight_kg : profile.weight_kg;
  const goal = profile.goal_weight_kg;
  const frac = goalFraction(start, current, goal);
  const eta = goalEta(current, goal, slopePerDay(weightTrend(weights, today, 30)), profile.goal_speed_kg_wk, today);
  const reminders = onCount(profile.reminders);
  const joinedText = monthYear(joined);
  const meta = [profile.username ? `@${profile.username}` : null, joinedText ? `Joined ${joinedText}` : null, squadName].filter(Boolean) as string[];
  const imperial = profile.units === "imperial";
  const conv = (kg: number) => Math.round((imperial ? kg * 2.20462 : kg) * 10) / 10;
  const unit = imperial ? "lb" : "kg";

  async function invite() {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Locked In", text: INVITE_TEXT });
        return;
      }
      await navigator.clipboard.writeText(INVITE_TEXT);
      setInvited("Invite copied — paste it anywhere.");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(INVITE_TEXT);
        setInvited("Invite copied — paste it anywhere.");
      } catch {
        setInvited(INVITE_TEXT);
      }
    }
  }

  async function saveName(name: string) {
    setError(null);
    try {
      await saveProfile({ name });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your name");
    }
  }

  return (
    <div className="flex flex-col" style={{ marginInline: -16, marginTop: "calc(-12px - env(safe-area-inset-top, 0px))" }}>
      {/* ---- cover, edge buttons, avatar ---- */}
      <MRise delay={0}>
        <div className="relative" style={{ height: "calc(330px + env(safe-area-inset-top, 0px))" }}>
          <div className="overflow-hidden" style={{ height: "calc(300px + env(safe-area-inset-top, 0px))", borderRadius: "0 0 40px 40px" }}>
            <PlatesCover />
          </div>
          <Link href="/profile/preferences" aria-label="Settings" className="press absolute grid place-items-center rounded-full" style={{ left: 34, bottom: 6, width: 50, height: 50, background: "var(--float)", color: "var(--ink)", boxShadow: "var(--shadow-lg)" }}>
            <LineIcon name="gear" size={20} />
          </Link>
          <button type="button" aria-label="Invite friends" onClick={() => void invite()} className="press absolute grid place-items-center rounded-full" style={{ right: 34, bottom: 6, width: 50, height: 50, background: "var(--float)", color: "var(--ink)", boxShadow: "var(--shadow-lg)", border: 0 }}>
            <LineIcon name="share" size={20} />
          </button>
          <div className="absolute left-1/2" style={{ bottom: -34, transform: "translateX(-50%)" }}>
            <div className="m-pop rounded-full" style={md(380, { width: 112, height: 112, padding: 5, background: "var(--bg)", boxShadow: "0 0 0 1px var(--hair), var(--shadow-lg)" })}>
              <AvatarPicker userId={userId} path={profile.avatar_path} name={shownName || email} size={102} onError={setError} />
            </div>
          </div>
        </div>
      </MRise>

      <div className="flex flex-col px-4">
        {/* ---- who ---- */}
        <MRise delay={340}>
          <div className="flex flex-col items-center gap-2 px-1 pt-[50px] text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium" style={{ border: "1px solid var(--accent)", color: "var(--accent)", letterSpacing: ".3px" }}>
              <LineIcon name="spark" size={14} />
              Founding member
            </span>
            <h1 className="mt-1 max-w-full truncate text-[30px] font-semibold" style={{ letterSpacing: "-.8px", lineHeight: 1.15 }}>
              {shownName || "Your name"}
            </h1>
            <p className="text-[14px] muted">
              {profile.username ? null : (
                <>
                  <button type="button" className="press font-semibold" style={{ background: "none", border: 0, padding: 0, color: "var(--blue-ink)" }} onClick={() => setSetup("full")}>
                    Create a username
                  </button>
                  {meta.length ? "  ·  " : ""}
                </>
              )}
              {meta.join("  ·  ")}
            </p>
          </div>
        </MRise>

        {error ? (
          <div className="mt-3">
            <ErrorNote text={error} />
          </div>
        ) : null}

        {/* ---- dials ---- */}
        <MRise delay={510}>
          <div className="grid grid-cols-3 justify-items-center pt-[26px]">
            <Dial label="Streak" icon="flame">
              <TickDial value={streak} best={bestStreak} />
            </Dial>
            <Dial label="Protein" icon="drop">
              <WaveDial fraction={profile.protein_target_g > 0 ? proteinToday / profile.protein_target_g : 0} grams={Math.round(proteinToday)} target={profile.protein_target_g} />
            </Dial>
            <Dial label="Weight" icon="scale">
              <ArcDial fraction={frac} value={current != null ? conv(current) : null} unit={unit} hasGoal={goal != null} />
            </Dial>
          </div>
        </MRise>

        {/* ---- actions ---- */}
        <MRise delay={680}>
          <div className="grid grid-cols-2 gap-2.5 pt-6">
            <button type="button" className="press h-[52px] rounded-2xl text-[16px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0 }} onClick={() => setSheet("edit")}>
              Edit profile
            </button>
            <button type="button" className="press flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold" style={{ background: "transparent", color: "var(--accent)", border: "1.5px solid var(--accent)" }} onClick={() => void invite()}>
              Invite
              <LineIcon name="plus" size={18} stroke={2} />
            </button>
          </div>
          {invited ? (
            <p role="status" className="mt-2 break-all px-1 text-center text-[12px] muted">
              {invited}
            </p>
          ) : null}
        </MRise>

        {/* v2.10: an under-18 "lose" goal moves to maintain here too, with its one-time card. */}
        <div className="mt-3.5 empty:hidden">
          <TeenGoalMigration profile={profile} />
        </div>

        {/* ---- badges ---- */}
        <MRise delay={850}>
          <BadgeShelf progress={badges} />
        </MRise>

        {/* ---- goal ---- */}
        <MRise delay={1020}>
          <section aria-label="Goal" className="mt-3.5 flex flex-col gap-3 rounded-[22px] p-[18px]" style={{ background: "var(--pcard)", boxShadow: "var(--pcard-ring)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[14px] muted">Goal</span>
              <Link href="/profile/goal" className="press -my-2 inline-flex min-h-11 items-center px-1 text-[14px] font-medium" style={{ color: "var(--accent)" }}>
                Edit
              </Link>
            </div>
            {goal != null ? (
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="num text-[30px]" style={{ letterSpacing: "-1px" }}>
                  {current != null ? conv(current) : "—"}
                </span>
                <span className="num muted">
                  → {weightText(goal, profile.units)}
                  {eta.reached ? " · reached" : eta.date ? ` · about ${monthDay(eta.date)}` : ""}
                </span>
              </p>
            ) : (
              <p className="text-[15px]">
                <span className="num text-[30px]" style={{ letterSpacing: "-1px" }}>
                  {current != null ? conv(current) : "—"}
                </span>{" "}
                <span className="muted">{unit} · no goal weight yet</span>
              </p>
            )}
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--track)" }} role="progressbar" aria-label="Progress to goal weight" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
              <div className="m-growx h-full rounded-full" style={md(2100, { width: `${Math.max(goal != null ? 2 : 0, frac * 100)}%`, background: "var(--accent)" })} />
            </div>
            <div className="flex flex-wrap gap-x-[22px] gap-y-1 text-[14px] muted">
              {profile.hide_numbers ? null : (
                <span>
                  <b className="num font-medium" style={{ color: "var(--ink)" }}>
                    {profile.calorie_target.toLocaleString("en-IN")}
                  </b>{" "}
                  kcal
                </span>
              )}
              <span>
                <b className="num font-medium" style={{ color: "var(--ink)" }}>
                  {Math.round(profile.protein_target_g)} g
                </b>{" "}
                protein
              </span>
              <span>
                <b className="num font-medium" style={{ color: "var(--ink)" }}>
                  {reminders}
                </b>{" "}
                reminder{reminders === 1 ? "" : "s"}
              </span>
            </div>
          </section>
        </MRise>

        <div className="mt-3.5 empty:hidden">
          <GraffitiWall />
        </div>

        {/* ---- you ---- */}
        <MRise delay={1190}>
          <ListCard>
            <ListRow icon="user" label="Personal details" value={[age != null ? `${age}` : null, profile.height_cm ? `${Math.round(profile.height_cm)} cm` : null].filter(Boolean).join(" · ")} href="/profile/details" />
            <ListRow icon="target" label="Nutrition goals" value={profile.hide_numbers ? "Set" : `${profile.calorie_target.toLocaleString("en-IN")} kcal`} href="/profile/goals" />
            <ListRow icon="flame" label="Goal weight" value={goal != null ? weightText(goal, profile.units) : profile.goal_type.charAt(0).toUpperCase() + profile.goal_type.slice(1)} href="/profile/goal" />
            <ListRow icon="chart" label="Weight history" value={weights.length ? `${weights.length} ${weights.length === 1 ? "entry" : "entries"}` : weightText(profile.weight_kg, profile.units)} href="/profile/weight" />
            <ListRow icon="bell" label="Reminders" value={reminders ? `${reminders} on` : "Off"} href="/profile/reminders" />
            <ListRow icon="sliders" label="Preferences" value="" href="/profile/preferences" last />
          </ListCard>
        </MRise>

        {/* ---- app ---- */}
        <MRise delay={1360}>
          <ListCard>
            <ListRow icon="spark" label="What's new" value={CHANGELOG[0]?.version ?? APP_VERSION} onClick={() => setSheet("news")} />
            <ListRow icon="chat" label="Request a feature" value="" href="mailto:sohumai.team@gmail.com?subject=Locked%20In%20%E2%80%94%20feature%20request" />
            <ListRow icon="phone" label="Add to Home Screen" value="" onClick={() => setSheet("home")} />
            <VersionRow />
            {isAdmin ? <ListRow icon="shield" label="Admin" value="" href="/admin" /> : null}
            <ListRow icon="logout" label="Sign out" value="" onClick={() => void signOut()} last chevron={false} />
          </ListCard>
        </MRise>
      </div>

      <ProfileSetupSheet open={setup !== null} photo={setup === "full"} onClose={() => setSetup(null)} userId={userId} name={shownName} username={profile.username} avatarPath={profile.avatar_path} />

      <BottomSheet open={sheet === "edit"} title="Edit profile" onClose={() => setSheet(null)}>
        <div className="flex flex-col gap-4 pb-1">
          <div className="flex items-center gap-3.5">
            <AvatarPicker userId={userId} path={profile.avatar_path} name={shownName || email} size={64} onError={setError} />
            <span className="text-[13px] muted">Tap the photo to change it</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold muted">Name</span>
            <div className="rounded-2xl px-3.5 py-3" style={{ background: "var(--card2)" }}>
              <NameField name={shownName} onCommit={saveName} />
            </div>
          </div>
          <button
            type="button"
            className="press flex min-h-12 items-center justify-between rounded-2xl px-3.5 text-left"
            style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }}
            onClick={() => {
              setSheet(null);
              setSetup(profile.username ? "username" : "full");
            }}
          >
            <span className="flex flex-col">
              <span className="text-[13px] font-semibold muted">Username</span>
              <span className="text-[15px]">{profile.username ? `@${profile.username}` : "Create a username"}</span>
            </span>
            <LineIcon name="chev" size={16} style={{ color: "var(--muted)" }} />
          </button>
          <Link href="/profile/details" className="press flex min-h-12 items-center justify-between rounded-2xl px-3.5" style={{ background: "var(--card2)", color: "var(--ink)" }}>
            <span className="flex flex-col">
              <span className="text-[13px] font-semibold muted">Personal details</span>
              <span className="text-[15px]">Age, height, weight</span>
            </span>
            <LineIcon name="chev" size={16} style={{ color: "var(--muted)" }} />
          </Link>
          <p className="truncate text-[12px] muted">Signed in as {email || "—"}</p>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "news"} title="What's new" onClose={() => setSheet(null)}>
        <div className="flex flex-col gap-3 pb-1">
          {CHANGELOG.map((c) => (
            <div key={c.version}>
              <p className="text-[13px] font-bold">
                {c.version} <span className="font-medium muted">· {c.date}</span>
              </p>
              <ul className="mt-1 flex list-none flex-col gap-1 p-0 text-[13px] leading-[18px] muted">
                {c.lines.map((l, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "home"} title="Add to Home Screen" onClose={() => setSheet(null)} primary={{ label: "Got it", onClick: () => setSheet(null) }}>
        <p className="text-[15px] leading-relaxed">On iPhone, open this in Safari, tap Share, then &ldquo;Add to Home Screen&rdquo;. Locked In then runs full-screen, like the Android app.</p>
      </BottomSheet>
    </div>
  );
}

// ---------------------------------------------------------------- cover

/** Monochrome sculptural cover: three weight plates and a bar, light on dark (or dark on light). */
function PlatesCover() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const plate = (cx: number, cy: number, r: number, d: number) => (
    <g className="m-fade" style={md(d)}>
      <circle cx={cx} cy={cy} r={r} fill={`url(#pl${uid})`} />
      <circle cx={cx} cy={cy} r={r * 0.72} fill="none" stroke="#000" strokeOpacity=".35" strokeWidth={r * 0.06} />
      <circle cx={cx} cy={cy} r={r * 0.16} fill={`url(#hub${uid})`} />
      <path d={`M${cx - r * 0.7},${cy - r * 0.5} A${r * 0.86},${r * 0.86} 0 0 1 ${cx + r * 0.2},${cy - r * 0.84}`} fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
  return (
    <svg viewBox="0 0 390 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" className="block h-full w-full">
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--cover-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--cover-b)" }} />
        </linearGradient>
        <radialGradient id={`pl${uid}`} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#3a3a3d" />
          <stop offset=".6" stopColor="#151516" />
          <stop offset="1" stopColor="#050505" />
        </radialGradient>
        <radialGradient id={`hub${uid}`} cx=".4" cy=".35" r=".7">
          <stop offset="0" stopColor="#f4f4f6" />
          <stop offset="1" stopColor="#77777d" />
        </radialGradient>
      </defs>
      <rect x="-200" y="-200" width="790" height="700" fill={`url(#bg${uid})`} />
      {plate(70, 60, 92, 200)}
      {plate(330, 210, 110, 380)}
      {plate(250, -10, 60, 560)}
      <rect x="120" y="120" width="170" height="16" rx="8" transform="rotate(-32 205 128)" fill={`url(#hub${uid})`} opacity=".85" />
    </svg>
  );
}

// ---------------------------------------------------------------- dials

/** Two decimals, so server and browser trig agree on the SVG attributes (no hydration warnings). */
const r2d = (n: number) => Math.round(n * 100) / 100;

function Dial({ label, icon, children }: { label: string; icon: LineName; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      {children}
      <span className="inline-flex items-center gap-1.5 text-[13.5px] muted">
        <LineIcon name={icon} size={15} />
        {label}
      </span>
    </div>
  );
}

/** 48 ticks round the dial, lit in proportion to the current streak over the best one. */
function TickDial({ value, best }: { value: number; best: number }) {
  const n = 48;
  const lit = best > 0 ? Math.round((n * Math.min(value, best)) / best) : 0;
  return (
    <div className="relative" style={{ width: 112, height: 112 }} role="img" aria-label={`Streak ${value} days, best ${best}`}>
      <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => {
          const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
          const r2 = i % 4 === 0 ? 52 : 49;
          const on = i < lit;
          return (
            <line
              key={i}
              x1={r2d(56 + 44 * Math.cos(a))}
              y1={r2d(56 + 44 * Math.sin(a))}
              x2={r2d(56 + r2 * Math.cos(a))}
              y2={r2d(56 + r2 * Math.sin(a))}
              stroke={on ? "var(--accent)" : "var(--track)"}
              strokeOpacity={on ? 0.35 + (0.65 * i) / Math.max(lit, 1) : 1}
              strokeWidth="2"
              strokeLinecap="round"
              className="m-tick"
              style={md(900 + i * 22)}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
        <span className="num text-[30px]" style={{ letterSpacing: "-1px" }}>
          <CountUp value={value} delay={900} />
          <span className="text-[15px] muted">d</span>
        </span>
      </div>
    </div>
  );
}

/** Today's protein as a liquid fill with a slowly drifting wave. */
function WaveDial({ fraction, grams, target }: { fraction: number; grams: number; target: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const f = Math.max(0.03, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const lvl = 56 + 50 - 100 * f;
  const wave = `M-60,${lvl.toFixed(1)}` + Array.from({ length: 10 }, (_, k) => ` q15,${k % 2 === 0 ? -7 : 7} 30,0`).join("") + " L240,122 L-60,122 Z";
  return (
    <div className="relative" style={{ width: 112, height: 112 }} role="img" aria-label={`Protein today ${grams} of ${Math.round(target)} grams`}>
      <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
        <defs>
          <clipPath id={`wc${uid}`}>
            <circle cx="56" cy="56" r="50" />
          </clipPath>
          <linearGradient id={`wg${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--accent2)" }} />
            <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0.25 }} />
          </linearGradient>
        </defs>
        <circle cx="56" cy="56" r="50" fill="var(--pcard)" stroke="var(--track)" strokeWidth="1.5" />
        <g clipPath={`url(#wc${uid})`}>
          <g className="m-fill" style={md(1000)}>
            <path className="m-drift" d={wave} fill={`url(#wg${uid})`} />
          </g>
        </g>
      </svg>
      <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
        <span className="num text-[30px]" style={{ letterSpacing: "-1px" }}>
          <CountUp value={grams} delay={1000} />
          <span className="text-[15px] muted">g</span>
        </span>
      </div>
    </div>
  );
}

/** A 270° arc: how far the weight has come from the start toward the goal. */
function ArcDial({ fraction, value, unit, hasGoal }: { fraction: number; value: number | null; unit: string; hasGoal: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cx = 56;
  const r = 50;
  const a0 = (135 * Math.PI) / 180;
  const sweep = (270 * Math.PI) / 180;
  const pt = (fr: number) => [cx + r * Math.cos(a0 + sweep * fr), cx + r * Math.sin(a0 + sweep * fr)] as const;
  const [x0, y0] = pt(0);
  const [x1, y1] = pt(1);
  const fr = Math.max(0, Math.min(1, fraction));
  const [xf, yf] = pt(fr);
  const f1 = (n: number) => n.toFixed(1);
  const track = `M${f1(x0)},${f1(y0)} A${r},${r} 0 1 1 ${f1(x1)},${f1(y1)}`;
  const val = `M${f1(x0)},${f1(y0)} A${r},${r} 0 ${sweep * fr > Math.PI ? 1 : 0} 1 ${f1(xf)},${f1(yf)}`;
  return (
    <div className="relative" style={{ width: 112, height: 112 }} role="img" aria-label={value == null ? "No weight logged yet" : `Weight ${value} ${unit}${hasGoal ? `, ${Math.round(fr * 100)} percent of the way to the goal` : ""}`}>
      <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
        <defs>
          <linearGradient id={`ag${uid}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: "var(--muted)", stopOpacity: 0.3 }} />
            <stop offset="1" style={{ stopColor: "var(--accent)" }} />
          </linearGradient>
        </defs>
        <path d={track} fill="none" stroke="var(--track)" strokeWidth="3" strokeLinecap="round" />
        {fr > 0.01 ? <path d={val} fill="none" stroke={`url(#ag${uid})`} strokeWidth="3" strokeLinecap="round" pathLength={1} className="m-draw" style={drawLen(1, 1100)} /> : null}
        {hasGoal ? <circle cx={r2d(xf)} cy={r2d(yf)} r="4.5" fill="var(--accent)" className="m-pop" style={md(2600)} /> : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
        <span className="num text-[28px]" style={{ letterSpacing: "-1px" }}>
          {value != null ? <CountUp value={value} decimals={1} delay={1100} format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))} /> : "—"}
          <span className="text-[14px] muted">{unit}</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- badges

function BadgeShelf({ progress }: { progress: BadgeProgress }) {
  const got = earnedCount(progress);
  const { earned, next } = medalShelf(progress);
  return (
    <section aria-label="Badges" className="mt-[26px] flex flex-col gap-3.5 rounded-3xl px-3 pb-4 pt-[18px]" style={{ background: "var(--pcard)", boxShadow: "var(--pcard-ring)" }}>
      <div className="flex items-center justify-between px-1.5">
        <h2 className="text-[19px] font-semibold" style={{ letterSpacing: "-0.3px" }}>
          Badges
        </h2>
        <Link href="/badges" className="press -my-2 inline-flex min-h-11 items-center gap-1 text-[14px] muted" aria-label={`All badges: ${got} of ${ALL_BADGES.length} earned`}>
          <span className="num">
            {got} of {ALL_BADGES.length}
          </span>
          <LineIcon name="chev" size={14} />
        </Link>
      </div>
      <div className={`flex ${earned.length + (next ? 1 : 0) >= 4 ? "justify-between" : "justify-around"}`}>
        {earned.map((x, i) => (
          <Link key={x.badge.name} href="/badges" className="press flex w-20 flex-col items-center gap-1.5" aria-label={`${x.badge.name}, ${x.tier} medal`}>
            <MetalMedal tier={x.tier} icon={GROUP_ICON[x.badge.group]} delay={1300 + i * 120} />
            <TierLabel tier={x.tier} />
            <span className="text-center text-[13px] font-medium leading-4">{x.badge.name}</span>
          </Link>
        ))}
        {next ? (
          <Link href="/badges" className="press flex w-20 flex-col items-center gap-1.5" aria-label={`${next.badge.name}, locked: ${next.value} of ${next.badge.need}`}>
            <LockedMedal progress={next.fraction} icon={GROUP_ICON[next.badge.group]} delay={1300 + earned.length * 120} />
            <TierLabel locked={`${Math.min(next.value, next.badge.need)} of ${next.badge.need}`} />
            <span className="text-center text-[13px] font-medium leading-4">{next.badge.name}</span>
          </Link>
        ) : null}
      </div>
      {next ? (
        <div className="mx-1.5 mt-0.5 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--hair)" }}>
          <div className="flex justify-between gap-2 text-[13.5px]">
            <span>
              Next up: <b className="font-semibold">{next.badge.name}</b>
            </span>
            <span className="num muted">{moreText(next)}</span>
          </div>
          <div className="h-[5px] overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
            <div className="m-growx h-full rounded-full" style={md(1900, { width: `${Math.max(2, next.fraction * 100)}%`, background: "var(--accent)" })} />
          </div>
        </div>
      ) : (
        <p className="px-1.5 text-[13.5px] muted">Every badge earned. Legend.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- list

function ListCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3.5 overflow-hidden rounded-[22px]" style={{ background: "var(--pcard)", boxShadow: "var(--pcard-ring)" }}>
      {children}
    </div>
  );
}

function ListRow({ icon, label, value, href, onClick, last = false, chevron = true, sub }: { icon: LineName; label: string; value: string; href?: string; onClick?: () => void; last?: boolean; chevron?: boolean; sub?: string }) {
  const inner = (
    <>
      <LineIcon name={icon} size={20} style={{ color: "var(--ink)" }} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15.5px]">{label}</span>
        {sub ? <span className="truncate text-[12px] muted">{sub}</span> : null}
      </span>
      {value ? <span className="num shrink-0 text-[13.5px] muted">{value}</span> : null}
      {chevron ? <LineIcon name="chev" size={16} style={{ color: "var(--muted)" }} /> : null}
    </>
  );
  const cls = "press flex min-h-[50px] w-full items-center gap-3.5 px-4 py-[13px] text-left";
  const style: React.CSSProperties = { background: "none", border: 0, color: "var(--ink)" };
  return (
    <>
      {href ? (
        <Link href={href} className={cls} style={style}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cls} style={style}>
          {inner}
        </button>
      )}
      {last ? null : <div className="h-px" style={{ background: "var(--hair)", marginLeft: 50 }} />}
    </>
  );
}

/**
 * "Locked In web 2.1 · Check for updates". iPhone users have no APK, so this is how they learn
 * what changed: /api/version says what the server is running; if it is newer than the build this
 * page loaded with (<meta name="app-version">), we reload.
 */
function VersionRow() {
  const [state, setState] = useState<"idle" | "checking" | "current" | "newer" | "error">("idle");
  const [server, setServer] = useState<string | null>(null);
  const loaded = typeof document !== "undefined" ? document.querySelector('meta[name="app-version"]')?.getAttribute("content") ?? APP_VERSION : APP_VERSION;
  useEffect(() => {
    if (state !== "newer") return;
    const t = setTimeout(() => window.location.reload(), 900);
    return () => clearTimeout(t);
  }, [state]);
  async function check() {
    setState("checking");
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      const j = (await res.json()) as { version: string };
      setServer(j.version);
      setState(compareVersions(j.version, loaded) > 0 ? "newer" : "current");
    } catch {
      setState("error");
    }
  }
  return (
    <ListRow
      icon="refresh"
      label={`Locked In web ${loaded}`}
      sub={state === "newer" ? `Version ${server} is live — reloading…` : state === "current" ? "You're on the latest build" : state === "error" ? "Couldn't reach the server" : "Tap to check for updates"}
      value={state === "checking" ? "Checking…" : state === "current" ? "Up to date" : state === "newer" ? "Updating" : "Check"}
      onClick={() => void check()}
      chevron={false}
    />
  );
}

/** Inline-editable display name, shown as "Enter your name" while empty; the pencil saves. */
export function NameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [text, setText] = useState(name);
  const dirty = text.trim() !== name;
  return (
    <span className="flex items-center gap-1.5">
      <input
        className="min-w-0 flex-1 bg-transparent text-[17px] font-bold outline-none"
        style={{ border: 0, padding: 0, color: "var(--ink)" }}
        value={text}
        placeholder="Enter your name"
        maxLength={40}
        aria-label="Your name"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty) onCommit(text.trim());
        }}
        onBlur={() => {
          if (dirty) onCommit(text.trim());
        }}
      />
      <button
        type="button"
        aria-label="Save name"
        disabled={!dirty}
        onClick={() => onCommit(text.trim())}
        className="hit press grid place-items-center"
        style={{ background: "none", border: 0, padding: 4, color: dirty ? "var(--green)" : "var(--muted)" }}
      >
        <Pencil size={16} />
      </button>
    </span>
  );
}
