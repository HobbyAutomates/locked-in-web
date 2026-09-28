"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveProfile, signOut } from "@/lib/actions";
import type { BadgeProgress } from "@/lib/badges";
import { today as todayIso } from "@/lib/dates";
import { onCount } from "@/lib/reminders";
import { goalEta, goalFraction, monthDay, monthYear, slopePerDay, weightTrend } from "@/lib/progressStats";
import { ageFrom, type Profile, type WeightEntry } from "@/lib/types";
import { APP_VERSION, CHANGELOG, compareVersions } from "@/lib/version";
import { displayName, weightText } from "@/lib/display";
import { AvatarPicker } from "./Avatar";
import TrophyWall from "./TrophyWall";
import { COVER_STORAGE_KEY, DEFAULT_COVER, isCoverId } from "@/lib/covers";
import { saveCoverPreset } from "@/lib/v216Actions";
import type { MemberPlate } from "@/lib/memberPlate";
import { Cover } from "./Cover";
import CoverPicker from "./CoverPicker";
import BadgeUnlock from "./BadgeUnlock";
import ProfileSetupSheet from "./ProfileSetupSheet";
import { TeenGoalMigration } from "./Science";
import { CountUp, MRise, md } from "./motion";
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
  proLabel = "Beta",
  cover = { available: false, preset: null },
  plate = null,
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
  /** v2.13: what the Locked In Pro row says ("Beta", "Pro" or the price). */
  proLabel?: string;
  /** v2.16 (schema_v40): the saved cover; available false = column not there yet (local storage then). */
  cover?: { available: boolean; preset: string | null };
  /** v2.17 (schema_v41): FOUNDER, "OG #nn" or none (lib/memberPlate.ts). Null before v41 = no plate. */
  plate?: MemberPlate | null;
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
  const place = [squadName, joinedText ? `since ${joinedText}` : null].filter(Boolean).join(" · ");
  const [coverId, setCoverId] = useState<string>(isCoverId(cover.preset) ? cover.preset : DEFAULT_COVER);
  const [picker, setPicker] = useState(false);
  // Until schema_v40 is applied the cover lives in this browser; once it is, a local pick moves up.
  useEffect(() => {
    let local: string | null = null;
    try {
      local = window.localStorage.getItem(COVER_STORAGE_KEY);
    } catch {
      local = null;
    }
    if (!isCoverId(local)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the local cover (pre-v40) is read after mount
    if (!cover.available || cover.preset == null) setCoverId(local);
    if (cover.available && cover.preset == null && local !== DEFAULT_COVER) void saveCoverPreset(local);
  }, [cover.available, cover.preset]);

  function pickCover(id: string) {
    setCoverId(id);
    try {
      window.localStorage.setItem(COVER_STORAGE_KEY, id);
    } catch {
      // Private mode: it still shows for this visit.
    }
    void saveCoverPreset(id).then((r) => {
      if (!r.ok && r.error) setError(r.error);
    });
  }
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
            <Cover id={coverId} />
          </div>
          <button type="button" aria-label="Change the cover" onClick={() => setPicker(true)} className="press absolute inline-flex items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold" style={{ right: 34, bottom: 66, height: 36, background: "rgba(0,0,0,.55)", color: "#fff", border: 0, backdropFilter: "blur(6px)" }}>
            <LineIcon name="edit" size={14} stroke={1.8} />
            Cover
          </button>
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
        {/* ---- who (v2.16 identity band, board IdentityFinal) ---- */}
        <MRise delay={340}>
          <div className="flex flex-col items-center px-1 pt-[48px] text-center">
            <h1 className="max-w-full truncate text-[30px] font-semibold" style={{ letterSpacing: "-.035em", lineHeight: 1.15 }}>
              {shownName || "Your name"}
            </h1>
            <p className="mt-1.5 inline-flex flex-wrap items-center justify-center gap-2 text-[13px] muted">
              {profile.username ? (
                <span>@{profile.username}</span>
              ) : (
                <button type="button" className="press font-semibold" style={{ background: "none", border: 0, padding: 0, color: "var(--ember)" }} onClick={() => setSetup("full")}>
                  Create a username
                </button>
              )}
              {plate ? (
                <>
                  <span aria-hidden="true" className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "var(--muted)" }} />
                  <PlateBadge plate={plate} />
                </>
              ) : null}
            </p>
            {place ? <p className="mt-1 text-[12.5px] muted">{place}</p> : null}
          </div>
        </MRise>

        {error ? (
          <div className="mt-3">
            <ErrorNote text={error} />
          </div>
        ) : null}

        {/* ---- liquid spheres: streak (ember), protein (gold), weight (silver) ---- */}
        <MRise delay={510}>
          <div className="grid grid-cols-3 justify-items-center pt-[22px]">
            <Sphere label="Streak" tint="ember" fill={bestStreak > 0 ? streak / bestStreak : streak > 0 ? 1 : 0} aria={`Streak ${streak} days, best ${bestStreak}`} delay={900}>
              <CountUp value={streak} delay={900} />
              <small>d</small>
            </Sphere>
            <Sphere label="Protein" tint="gold" fill={profile.protein_target_g > 0 ? proteinToday / profile.protein_target_g : 0} aria={`Protein today ${Math.round(proteinToday)} of ${Math.round(profile.protein_target_g)} grams`} delay={1000}>
              <CountUp value={Math.round(proteinToday)} delay={1000} />
              <small>g</small>
            </Sphere>
            <Sphere label="Weight" tint="silver" fill={goal != null ? frac : 0.5} aria={current == null ? "No weight logged yet" : `Weight ${conv(current)} ${unit}${goal != null ? `, ${Math.round(frac * 100)} percent of the way to the goal` : ""}`} delay={1100}>
              {current != null ? <CountUp value={conv(current)} decimals={1} delay={1100} format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))} /> : "—"}
              <small>{unit}</small>
            </Sphere>
          </div>
        </MRise>

        {/* ---- actions ---- */}
        <MRise delay={680}>
          <div className="grid grid-cols-2 gap-2.5 pt-6">
            <button type="button" className="press h-[50px] rounded-2xl text-[15.5px] font-semibold" style={{ background: "var(--ember)", color: "#fff", border: 0, boxShadow: "inset 0 1px 0 rgba(255,255,255,.3), 0 10px 22px rgba(255,91,31,.3)" }} onClick={() => setSheet("edit")}>
              Edit profile
            </button>
            <button type="button" className="press flex h-[50px] items-center justify-center gap-2 rounded-2xl text-[15.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--ink) 4%, transparent)", color: "var(--ink)", border: 0, boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent)" }} onClick={() => void invite()}>
              Invite
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
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
          <TrophyWall progress={badges} delay={850} />
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

        {/* ---- you ---- */}
        <MRise delay={1190}>
          <ListCard>
            <ListRow icon="trophy" label="Locked In Pro" value={proLabel} href="/profile/pro" />
            <ListRow icon="flame" label="Training" sub="Routines, muscle map, PR charts" value="" href="/train" />
            {/* v2.14: the AI coach (chat, memory, style) and buddy streaks. */}
            <ListRow icon="spark" label="Coach" sub="Chat, style, what it knows" value="" href="/coach" />
            <ListRow icon="users" label="Buddy streak" sub="Log together, nudge each other" value="" href="/buddy" />
            {/* v2.18 social stream: freezes, invites, wrapped, pledges, events, coach access, packs, export */}
            <ListRow icon="award" label="Social and rewards" sub="Streak freezes, invites, wrapped, pledges and more" value="" href="/social" />
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

      <CoverPicker open={picker} value={coverId} onPick={pickCover} onClose={() => setPicker(false)} />
      <BadgeUnlock progress={badges} />

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

// ---------------------------------------------------------------- liquid spheres

const SPHERE_TINT = {
  ember: ["#FF8B5E", "#C2410C"],
  gold: ["#D9B872", "#5E4518"],
  silver: ["#E6E8EC", "#5f646b"],
} as const;

/**
 * v2.16 (board IdentityFinal): a glass sphere in a gunmetal rim, filled to `fill` with a liquid
 * whose wave drifts sideways forever; the value sits on top. The fill rises in once on mount.
 */
function Sphere({ label, tint, fill, aria, delay, children }: { label: string; tint: keyof typeof SPHERE_TINT; fill: number; aria: string; delay: number; children: React.ReactNode }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const f = Math.max(0.14, Math.min(1, Number.isFinite(fill) ? fill : 0));
  const top = Math.round(78 * (1 - f)) - 5;
  const [a, b] = SPHERE_TINT[tint];
  return (
    <div className="flex flex-col items-center">
      <div role="img" aria-label={aria} className="relative rounded-full" style={{ width: 86, height: 86, padding: 4, background: "linear-gradient(145deg, #5a5a5f, #1a1a1c 50%, #3a3a3e)", boxShadow: "0 12px 26px rgba(0,0,0,.45)" }}>
        <div className="relative overflow-hidden rounded-full" style={{ width: 78, height: 78, background: "radial-gradient(circle at 50% 30%, #1d1d20, #08080a)" }}>
          <div className="m-fill absolute inset-0" style={md(delay)}>
            <svg className="m-wave absolute left-0" width="156" height="78" viewBox="0 0 156 78" style={{ top }} aria-hidden="true">
              <defs>
                <linearGradient id={`lq${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={a} stopOpacity=".95" />
                  <stop offset="1" stopColor={b} />
                </linearGradient>
              </defs>
              <path d="M0 5 Q 9.75 0 19.5 5 T 39 5 T 58.5 5 T 78 5 T 97.5 5 T 117 5 T 136.5 5 T 156 5 V 78 H 0 Z" fill={`url(#lq${uid})`} />
            </svg>
          </div>
          <div aria-hidden="true" className="absolute rounded-full" style={{ left: 12, top: 8, width: 34, height: 14, background: "linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0))", transform: "rotate(-20deg)" }} />
          <div aria-hidden="true" className="sphere-num absolute inset-0 grid place-items-center" style={{ color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,.6)" }}>
            <span className="num text-[20px] font-medium leading-none" style={{ letterSpacing: "-.03em" }}>
              {children}
            </span>
          </div>
        </div>
      </div>
      <span className="mt-2.5 text-[9px] font-medium uppercase muted" style={{ letterSpacing: ".24em" }}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- badges

/** v2.16: every badge as a jewel (earned lit, locked dark with its ember progress line), then "Next up". */
// ---------------------------------------------------------------- member plate

/**
 * v2.17 member plate: the gold FOUNDER plate (the owner only), or the same plate in gunmetal with a
 * silver face for "OG #07" (the first 50 accounts), so FOUNDER stays the special one.
 */
function PlateBadge({ plate }: { plate: MemberPlate }) {
  const founder = plate.kind === "founder";
  return (
    <span
      className="inline-flex h-[22px] items-center rounded-md px-[9px] text-[9.5px] font-bold"
      style={
        founder
          ? { background: "linear-gradient(135deg, var(--gold), var(--gold-deep))", color: "#1a1206", letterSpacing: ".14em", boxShadow: "0 4px 12px rgba(168,130,58,.35)" }
          : { background: "linear-gradient(135deg, #c9ccd2 0%, #7d828b 45%, #3a3d43 100%)", color: "#f4f5f7", letterSpacing: ".14em", boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 4px 12px rgba(40,42,48,.35)", textShadow: "0 1px 0 rgba(0,0,0,.35)" }
      }
      title={founder ? "Founder" : "One of the first 50 members"}
    >
      {plate.label}
    </span>
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
        {/* v2.16: subs wrap instead of truncating ("Tap to check for updates" was cut to "Check for"). */}
        {sub ? <span className="text-[12px] leading-4 muted">{sub}</span> : null}
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
