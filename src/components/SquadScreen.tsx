"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestJoin } from "@/lib/actions";
import { unreadLabel } from "@/lib/reactions";
import type { PublicSquad, Squad } from "@/lib/types";
import { namesLine, type FriendToday, type SquadCard } from "@/lib/squadCards";
import { Avatar } from "./Avatar";
import { Check, Close, Help, Key, Padlock, Plus, Spinner } from "./icons";
import ProfileSetupSheet from "./ProfileSetupSheet";
import { SquadIcon } from "./SquadIcon";
import { BottomSheet, Card, ErrorNote, PillButton, Rise } from "./ui";

type Props = {
  me: string;
  squads: Squad[];
  publicSquads: PublicSquad[];
  /** v2.11: unread Chat posts per squad id (empty until schema_v35 is applied). */
  unread?: Record<string, number>;
  profile: { name: string; username: string | null; avatar_path: string | null };
  /** v2.16: per-squad card data (avatars, latest activity, best streak, #1) and friends who logged today. */
  cards?: Record<string, SquadCard>;
  friends?: FriendToday[];
};

/**
 * v2.6 Squads hub (Cal AI "Groups" + Strava clubs): your squads, Discover public squads, and the +
 * menu (Create a squad → the 3-step flow, Join with code, How squads work). A squad opens its own
 * page with Chat · Feed · Leaderboard. No username yet → the one-time profile sheet first.
 */
export default function SquadScreen({ me, squads, publicSquads, unread = {}, profile, cards = {}, friends = [] }: Props) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [joining, setJoining] = useState(false);
  const [how, setHow] = useState(false);
  const [setup, setSetup] = useState(!profile.username);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="screen-title">Squads</h1>
            {profile.username ? <p className="text-[14px] font-medium muted">@{profile.username}</p> : null}
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Squad options"
              aria-expanded={menu}
              aria-haspopup="menu"
              className="press grid h-11 w-11 place-items-center rounded-full"
              style={{ background: menu ? "var(--card2)" : "var(--btn)", color: menu ? "var(--ink)" : "var(--btn-ink)", boxShadow: "var(--shadow-sm)", border: 0 }}
              onClick={() => setMenu((v) => !v)}
            >
              {menu ? <Close size={18} /> : <Plus size={20} />}
            </button>
            {menu ? (
              <div role="menu" className="absolute right-0 top-[52px] z-30 w-[236px] overflow-hidden rounded-2xl py-1.5" style={{ background: "var(--card)", boxShadow: "var(--shadow-lg)" }}>
                <MenuItem icon={<Plus size={18} />} label="Create a squad" onClick={() => router.push("/squad/new")} />
                <MenuItem
                  icon={<Key size={18} />}
                  label="Join with code"
                  onClick={() => {
                    setMenu(false);
                    setJoining(true);
                  }}
                />
                <MenuItem
                  icon={<Help size={18} />}
                  label="How squads work"
                  onClick={() => {
                    setMenu(false);
                    setHow(true);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </Rise>

      {joining ? <JoinWithCode onClose={() => setJoining(false)} /> : null}

      {!squads.length ? (
        <Rise index={1}>
          <Card padding={20}>
            <p className="text-[17px] font-extrabold" style={{ letterSpacing: "-0.02em" }}>
              Train with friends
            </p>
            <p className="mt-1 text-[14px] muted">Make a squad, invite your friends with a link, and see everyone&apos;s meals, workouts and 🔥 streaks.</p>
            <div className="mt-3 flex gap-2">
              <PillButton height={46} onClick={() => router.push("/squad/new")}>
                Create a squad
              </PillButton>
              <PillButton soft height={46} onClick={() => setJoining(true)}>
                Join with code
              </PillButton>
            </div>
          </Card>
        </Rise>
      ) : (
        <>
          {friends.length ? (
            <Rise index={1}>
              <Link
                href={`/squad/${friends[0].squadId}?tab=feed`}
                className="press flex items-center gap-3 rounded-[22px] px-4 py-3.5"
                style={{ background: "linear-gradient(120deg, rgba(255,91,31,.16), rgba(168,130,58,.10))", boxShadow: "inset 0 0 0 1px rgba(255,139,94,.18)", color: "var(--ink)" }}
              >
                <AvatarStack people={friends} size={30} ring="var(--bg)" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14.5px] font-bold">
                    {friends.length} friend{friends.length === 1 ? "" : "s"} logged today
                  </span>
                  <span className="truncate text-[12.5px] muted">{namesLine(friends.map((f) => f.name))} · tap to cheer</span>
                </span>
                <ArrowRight />
              </Link>
            </Rise>
          ) : null}
          <Rise index={1}>
            <div className="flex items-baseline justify-between px-1">
              <p className="text-[19px] font-bold" style={{ letterSpacing: "-0.02em" }}>
                Your squads
              </p>
              <span className="num text-[13px] font-medium muted">{squads.length}</span>
            </div>
          </Rise>
          <div className="flex flex-col gap-2.5">
            {squads.map((g, i) => (
              <Rise key={g.id} index={Math.min(6, i + 2)}>
                <PremiumSquadCard squad={g} me={me} card={cards[g.id]} unread={unread[g.id] ?? 0} />
              </Rise>
            ))}
          </div>
        </>
      )}

      {publicSquads.length ? <Discover squads={publicSquads} /> : null}

      <BottomSheet open={how} title="How squads work" onClose={() => setHow(false)} primary={{ label: "Got it", onClick: () => setHow(false) }}>
        <ul className="flex flex-col gap-3 text-[14px] leading-5">
          <li>
            <span className="font-bold">Public squads</span> <span className="muted">are open to everyone — tap + Join and you&apos;re in.</span>
          </li>
          <li>
            <span className="font-bold">Private squads</span> <span className="muted">take requests: share the invite link, the owner approves who gets in.</span>
          </li>
          <li>
            <span className="font-bold">Chat · Feed · Leaderboard.</span> <span className="muted">Your meals, workouts and gym PRs post to the Feed by themselves; the Leaderboard ranks everyone by 🔥 day streak.</span>
          </li>
          <li>
            <span className="font-bold">Privacy:</span> <span className="muted">turn off &quot;Share with squads&quot; in Profile to share streaks only — nothing posts to the Feed then.</span>
          </li>
        </ul>
      </BottomSheet>

      <ProfileSetupSheet open={setup} onClose={() => setSetup(false)} userId={me} name={profile.name} username={profile.username} avatarPath={profile.avatar_path} />
    </div>
  );
}

/** v2.16 (board PremiumSquad): icon tile (gold when you're #1), unread badge, avatars, latest line, streak and #1 chips. */
function PremiumSquadCard({ squad: g, me, card, unread }: { squad: Squad; me: string; card: SquadCard | undefined; unread: number }) {
  const gold = card?.first === true;
  const members = card?.members ?? [];
  const count = g.member_count ?? members.length ?? 1;
  const badge = unreadLabel(unread);
  return (
    <Link
      href={`/squad/${g.id}`}
      className="press flex items-center gap-3.5 rounded-3xl p-3.5"
      style={{ background: "var(--card)", boxShadow: "var(--pcard-ring), var(--shadow-sm)", color: "var(--ink)" }}
      aria-label={`${g.name}${badge ? `, ${unread} unread` : ""}${gold ? ", you're number 1" : ""}`}
    >
      <span
        className="relative grid shrink-0 place-items-center rounded-[18px]"
        style={{ width: 56, height: 56, background: gold ? "linear-gradient(135deg, #D9B872, #A8823A 55%, #5E4518)" : "linear-gradient(135deg, var(--card2), var(--card))", boxShadow: gold ? "0 6px 16px rgba(168,130,58,.3)" : "inset 0 0 0 1px var(--hair)" }}
      >
        <SquadIcon icon={g.icon} cover={g.cover_url} size={42} />
        {badge ? (
          <span className="num absolute grid h-5 min-w-5 place-items-center rounded-full px-[5px] text-[11px] font-bold" style={{ top: -5, right: -5, background: "var(--ember)", color: "#fff", boxShadow: "0 0 0 2px var(--card)" }}>
            {badge}
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[16.5px] font-bold" style={{ letterSpacing: "-0.01em" }}>
            {g.name}
          </span>
          {g.is_public ? null : (
            <span className="shrink-0 muted" aria-label="Private">
              <Padlock size={12} />
            </span>
          )}
        </span>
        <span className="mt-0.5 truncate text-[12.5px] muted">{card?.latest ?? (count <= 1 ? "Just you so far · invite a friend" : "Quiet today · nudge someone")}</span>
        <span className="mt-2 flex items-center gap-2">
          {members.length ? <AvatarStack people={members} size={22} ring="var(--card)" /> : null}
          {card && card.streak > 0 ? (
            <span className="num inline-flex h-[26px] items-center gap-[5px] rounded-full px-2.5 text-[12px] font-semibold" style={{ background: "var(--ember-bg)", color: "var(--ember)" }} title="Best current streak in the squad">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21c3.6 0 6-2.4 6-5.8 0-3.4-2.6-5.2-3.6-8.2-.3 1.8-1.3 3-2.4 3.4.3-2.8-.8-5.6-3.2-7.4.3 3.2-3.8 6-3.8 12.2C5 18.6 8.4 21 12 21z" />
              </svg>
              {card.streak}
            </span>
          ) : (
            <span className="inline-flex h-[26px] items-center rounded-full px-2.5 text-[12px] font-semibold muted" style={{ background: "var(--card2)" }}>
              new
            </span>
          )}
          {gold ? (
            <span className="num inline-flex h-[26px] items-center rounded-full px-2.5 text-[12px] font-semibold" style={{ background: "rgba(168,130,58,.18)", color: "var(--gold-ink)" }}>
              #1
            </span>
          ) : null}
          {g.owner_id === me ? <span className="text-[11px] font-semibold muted">Owner</span> : null}
        </span>
      </span>
      <span className="shrink-0 muted">
        <ArrowRight />
      </span>
    </Link>
  );
}

/** Overlapping avatars (up to four), each ringed in the surface colour. */
function AvatarStack({ people, size, ring }: { people: { user_id: string; name: string; avatar_path: string | null }[]; size: number; ring: string }) {
  return (
    <span className="flex shrink-0" aria-hidden="true">
      {people.slice(0, 4).map((m, i) => (
        <span key={m.user_id} className="rounded-full" style={{ marginLeft: i ? -8 : 0, boxShadow: `0 0 0 2px ${ring}` }}>
          <Avatar path={m.avatar_path} name={m.name} size={size} />
        </span>
      ))}
    </span>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="press flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-semibold" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={onClick}>
      <span className="muted inline-flex">{icon}</span>
      {label}
    </button>
  );
}

/** A 6-letter code from a friend → the /join/<code> page (joins, or asks to join a private squad). */
function JoinWithCode({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <Rise index={1}>
      <Card padding={18}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px]">Got a code or link from a friend? Enter the 6 letters.</p>
          <button type="button" aria-label="Close" className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }} onClick={onClose}>
            <Close size={14} />
          </button>
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) router.push(`/join/${code}`);
          }}
        >
          <input
            className="field num text-center font-extrabold uppercase"
            style={{ letterSpacing: "0.3em", fontSize: 20 }}
            placeholder="LOCK7Q"
            value={code}
            maxLength={40}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="Squad code"
            onChange={(e) => {
              // Pasting a whole invite link works too: keep the code after /join/.
              const raw = e.target.value;
              const fromLink = raw.match(/join\/([a-z0-9]{6})/i)?.[1];
              setCode((fromLink ?? raw).replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6));
            }}
          />
          <PillButton type="submit" height={48} disabled={code.length !== 6} className="!w-auto shrink-0 !px-5">
            Join
          </PillButton>
        </form>
      </Card>
    </Rise>
  );
}

/** "Discover squads": every public squad with its icon / cover, members, tagline and a + Join. */
function Discover({ squads }: { squads: PublicSquad[] }) {
  const router = useRouter();
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function join(g: PublicSquad) {
    setJoining(g.id);
    setError(null);
    try {
      const status = await requestJoin(g.id);
      if (status === "requested") setError(`Asked to join ${g.name} — the owner will let you in.`);
      else router.push(`/squad/${g.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join");
    } finally {
      setJoining(null);
    }
  }
  return (
    <>
      <Rise index={2}>
        <p className="px-1 text-[13px] font-bold muted">Discover squads</p>
      </Rise>
      <Rise index={2}>
        <Card padding={0}>
          <div className="px-3.5">
            {squads.map((g, i) => (
              <div key={g.id} className="flex items-center gap-3 py-3" style={{ borderTop: i > 0 ? "1px solid var(--hair)" : "none" }}>
                <SquadIcon icon={g.icon} cover={g.cover_url} size={56} rounded="2xl" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{g.name}</span>
                  <span className="text-xs font-semibold muted">
                    {g.member_count} member{g.member_count === 1 ? "" : "s"}
                  </span>
                  {g.description || g.tagline ? <span className="truncate text-xs muted">{g.description || g.tagline}</span> : null}
                </span>
                {g.joined ? (
                  <button type="button" className="chip press shrink-0 gap-1 whitespace-nowrap" style={{ height: 34, padding: "0 12px", fontWeight: 700 }} onClick={() => router.push(`/squad/${g.id}`)}>
                    <Check size={14} />
                    Joined
                  </button>
                ) : (
                  <button type="button" className="chip press shrink-0 gap-1 whitespace-nowrap" style={{ height: 34, padding: "0 12px", fontWeight: 700, background: "var(--btn)", color: "var(--btn-ink)" }} disabled={joining !== null} onClick={() => void join(g)} aria-label={`Join ${g.name}`}>
                    {joining === g.id ? <Spinner size={14} /> : <Plus size={14} />}
                    Join
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </Rise>
      {error ? <ErrorNote text={error} /> : null}
    </>
  );
}
