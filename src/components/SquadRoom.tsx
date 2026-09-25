"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { deleteSquadPost, loadChallenges, loadLeaderboard, loadSquadPosts, nudgeMember, postSquadPhoto, sendSquadMessage } from "@/lib/actions";
import { postStamp } from "@/lib/display";
import { CHAT_KINDS, FEED_KINDS } from "@/lib/squadPosts";
import { toJpegBase64 } from "@/lib/image";
import type { BattleWinner, Challenge, ChallengeBoardRow, LeaderRow, Squad, SquadPost } from "@/lib/types";
import { Avatar } from "./Avatar";
import { BattleTab } from "./BattleTab";
import { ArrowLeft, Bowl, Chat, Check, ChevronRight, Dumbbell, Fist, Flame, Medal, People, Photo, Plus, Send, Spinner, Target, Trash } from "./icons";
import { ChallengesTab } from "./SquadChallenges";
import { SquadRankRow } from "./SquadRankRow";
import { SquadIcon } from "./SquadIcon";
import { BottomSheet, BreathingFlame, ErrorNote } from "./ui";


type Tab = "chat" | "challenges" | "battle" | "feed" | "leaderboard";

/** Battle (v2.8) only shows when the squad owner has turned it on. */
const TABS: { key: Tab; label: string; battle?: true }[] = [
  { key: "chat", label: "Chat" },
  { key: "challenges", label: "Challenges" },
  { key: "battle", label: "Battle 👑", battle: true },
  { key: "feed", label: "Feed" },
  { key: "leaderboard", label: "Leaderboard" },
];

type Props = {
  me: string;
  today: string;
  squad: Squad;
  chat: SquadPost[];
  feed: SquadPost[];
  leaderboard: LeaderRow[];
  challenges: Challenge[];
  proteinGoal: number | null;
  sentNudges: string[];
  shareStats: boolean;
  pendingRequests: number;
  initialTab: Tab;
  /** Whether `initialTab` came from a deep link (?tab=, a notification) — that always wins over the remembered tab. */
  hasDeepLinkTab?: boolean;
  /** v2.8: yesterday's Food Battle crown, already closed server-side on this page load. */
  crown?: BattleWinner;
  /** v2.8: yesterday's date (Asia/Kolkata) — what the crown card refers to; today's board reads live. */
  yesterday?: string;
};

const rememberedTabKey = (squadId: string) => `squad-tab:${squadId}`;

/**
 * v2.6 squad page (Cal AI group): header with the squad's icon and a members button, then
 * Chat · Challenges (v2.7) · Battle (v2.8, when the owner has turned it on) · Feed · Leaderboard.
 * Chat and Feed poll every 5 s / 15 s while visible; meals, workouts and PRs arrive in the Feed by
 * themselves (see actions.ts → post_to_my_groups).
 */
export default function SquadRoom({ me, today, squad, chat: chat0, feed: feed0, leaderboard: board0, challenges: challenges0, proteinGoal, sentNudges, shareStats, pendingRequests, initialTab, hasDeepLinkTab = false, crown = null }: Props) {
  const router = useRouter();
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [chat, setChat] = useState(chat0);
  const [feed, setFeed] = useState(feed0);
  const [board, setBoard] = useState(board0);
  const [challenges, setChallenges] = useState(challenges0);
  const [challengeBoards, setChallengeBoards] = useState<Record<string, ChallengeBoardRow[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [photoSheet, setPhotoSheet] = useState<null | { base64: string; preview: string }>(null);
  const [profileSheet, setProfileSheet] = useState<LeaderRow | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // A remembered tab (this browser's last choice on this squad) wins over the Challenges/Leaderboard
  // default, but a deep link — a notification, a shared "?tab=" link — always wins over both. This
  // reads localStorage, so it has to happen post-mount rather than in the initial render (server and
  // first client render must match) — hence the one-time setState here rather than in useState itself.
  useEffect(() => {
    if (hasDeepLinkTab) return;
    try {
      const remembered = window.localStorage.getItem(rememberedTabKey(squad.id));
      if (remembered && TABS.some((t) => t.key === remembered && (!t.battle || squad.battle_enabled))) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage, an external system, on mount
        setTabState(remembered as Tab);
      }
    } catch {
      // No storage access (private mode) — the computed default stands.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad.id]);

  function setTab(t: Tab) {
    setTabState(t);
    try {
      window.localStorage.setItem(rememberedTabKey(squad.id), t);
    } catch {
      // Not persisted this time; the tab still switches for this visit.
    }
  }

  const refresh = useCallback(
    async (which: Exclude<Tab, "battle">) => {
      try {
        if (which === "chat") setChat(await loadSquadPosts(squad.id, CHAT_KINDS));
        else if (which === "feed") setFeed(await loadSquadPosts(squad.id, FEED_KINDS));
        else if (which === "challenges") {
          const res = await loadChallenges(squad.id);
          setChallenges(res.challenges);
          setChallengeBoards(res.boards);
        } else setBoard(await loadLeaderboard(squad.id));
      } catch {
        // A missed poll is fine; the next one catches up.
      }
    },
    [squad.id],
  );

  // Poll the open tab while the page is visible: chat 5 s, feed 15 s, leaderboard and challenges
  // once on open (opening Challenges also posts "🏆 completed" for anything just finished).
  // Battle has its own polling inside <BattleTab>.
  useEffect(() => {
    if (tab === "battle") return;
    const first = setTimeout(() => void refresh(tab), 0);
    if (tab === "leaderboard" || tab === "challenges") return () => clearTimeout(first);
    const every = tab === "chat" ? 5000 : 15000;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(tab);
    }, every);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [tab, refresh]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const { base64, preview } = await toJpegBase64(file, 1280, 0.82);
      setPhotoSheet({ base64, preview });
    } catch {
      setError("Couldn't read that photo");
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
      <header className="sticky top-0 z-20" style={{ background: "var(--bg)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2.5 px-4 py-2">
          <button type="button" onClick={() => router.push("/squad")} aria-label="Back" className="press grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
            <ArrowLeft size={18} />
          </button>
          <Link
            href={`/squad/${squad.id}/members`}
            aria-label={pendingRequests ? `${squad.name}, members and invite, ${pendingRequests} requests` : `${squad.name}, members and invite`}
            className="press flex min-w-0 flex-1 items-center gap-2.5"
            style={{ color: "var(--ink)" }}
          >
            <SquadIcon icon={squad.icon} cover={squad.cover_url} size={36} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[17px] font-extrabold leading-tight" style={{ letterSpacing: "-0.02em" }}>
                {squad.name}
              </span>
              <span className="text-[11px] font-semibold muted">
                {squad.member_count ?? 1} member{(squad.member_count ?? 1) === 1 ? "" : "s"} · {squad.is_public ? "Public" : "Private"}
              </span>
            </span>
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)", color: "var(--ink)" }}>
              <People size={19} />
              {pendingRequests ? (
                <span className="num absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-extrabold" style={{ background: "var(--red)", color: "#fff" }}>
                  {pendingRequests}
                </span>
              ) : null}
            </span>
          </Link>
        </div>
        <div className="flex" role="tablist" aria-label="Squad">
          {TABS.filter((t) => !t.battle || squad.battle_enabled).map(({ key: t, label }) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className="press relative flex-1 px-0.5 py-3 text-[13px] font-bold"
              style={{ background: "none", border: 0, color: tab === t ? "var(--ink)" : "var(--muted)" }}
              onClick={() => setTab(t)}
            >
              {label}
              {tab === t ? <motion.span layoutId="squad-tab" className="absolute inset-x-3 bottom-0 h-[3px] rounded-full" style={{ background: "var(--ink)" }} /> : null}
            </button>
          ))}
        </div>
        <div className="hair" />
      </header>

      {error ? (
        <div className="px-4 pt-3">
          <ErrorNote text={error} />
        </div>
      ) : null}

      {tab === "chat" ? (
        <ChatTab me={me} today={today} posts={chat} onPhoto={() => photoRef.current?.click()} onSent={() => void refresh("chat")} squadId={squad.id} setPosts={setChat} onError={setError} />
      ) : tab === "challenges" ? (
        <ChallengesTab
          me={me}
          today={today}
          squadId={squad.id}
          challenges={challenges}
          boards={challengeBoards}
          proteinGoal={proteinGoal}
          onCreated={() => {
            void refresh("challenges");
            void refresh("feed");
          }}
        />
      ) : tab === "feed" ? (
        <FeedTab me={me} today={today} squadId={squad.id} posts={feed} shareStats={shareStats} isOwner={squad.owner_id === me} onPhoto={() => photoRef.current?.click()} onChallenges={() => setTab("challenges")} onDeleted={(id) => setFeed((f) => f.filter((p) => p.id !== id))} onError={setError} />
      ) : tab === "leaderboard" ? (
        <LeaderboardTab me={me} squadId={squad.id} rows={board} sentNudges={sentNudges} onError={setError} onOpenProfile={setProfileSheet} />
      ) : (
        <BattleTab me={me} squad={squad} date={today} crown={crown} onError={setError} />
      )}

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void pickPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <PhotoPostSheet
        photo={photoSheet}
        onClose={() => setPhotoSheet(null)}
        onPost={async (caption) => {
          if (!photoSheet) return;
          const res = await postSquadPhoto(squad.id, photoSheet.base64, caption);
          if (!res.ok) throw new Error(res.error);
          setPhotoSheet(null);
          void refresh(tab === "chat" ? "chat" : "feed");
        }}
      />
      <MemberProfileSheet squadId={squad.id} row={profileSheet} onClose={() => setProfileSheet(null)} />
    </div>
  );
}

/** A leaderboard row's mini profile — name, streak and points, with a link through to the full Members page. */
function MemberProfileSheet({ squadId, row, onClose }: { squadId: string; row: LeaderRow | null; onClose: () => void }) {
  return (
    <BottomSheet open={!!row} title="Member" onClose={onClose}>
      {row ? (
        <div className="flex flex-col items-center pb-1 text-center">
          <Avatar path={row.avatar_path} name={row.name} size={72} />
          <p className="mt-3 flex items-center gap-1.5 text-[19px] font-extrabold" style={{ letterSpacing: "-0.02em" }}>
            {row.name}
            {row.is_owner ? (
              <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--card2)", color: "var(--ink)" }}>
                Owner
              </span>
            ) : null}
          </p>
          {row.username ? <p className="text-[13px] muted">@{row.username}</p> : null}
          <div className="mt-4 flex w-full gap-2.5">
            <div className="flex flex-1 flex-col items-center rounded-2xl py-3" style={{ background: "var(--card2)" }}>
              <span className="flex items-center gap-1 text-[20px] font-extrabold">
                {row.flames > 0 ? <BreathingFlame size={18} /> : <span className="muted inline-flex"><Flame size={18} /></span>}
                <span className="num">{row.flames}</span>
              </span>
              <span className="text-[11px] muted">day streak</span>
            </div>
            <div className="flex flex-1 flex-col items-center rounded-2xl py-3" style={{ background: "var(--card2)" }}>
              <span className="num text-[20px] font-extrabold">#{row.rank}</span>
              <span className="text-[11px] muted">rank</span>
            </div>
            <div className="flex flex-1 flex-col items-center rounded-2xl py-3" style={{ background: "var(--card2)" }}>
              <span className="num text-[20px] font-extrabold">{row.week_points}</span>
              <span className="text-[11px] muted">pts this wk</span>
            </div>
          </div>
          <Link href={`/squad/${squadId}/members`} className="press mt-4 text-[13px] font-bold underline" style={{ color: "var(--ink)" }} onClick={onClose}>
            See all members
          </Link>
        </div>
      ) : null}
    </BottomSheet>
  );
}

/* ---------------- Chat ---------------- */

let tempSeq = 0;
const nowIso = () => new Date().toISOString();

function ChatTab({
  me,
  today,
  posts,
  squadId,
  onPhoto,
  onSent,
  setPosts,
  onError,
}: {
  me: string;
  today: string;
  posts: SquadPost[];
  squadId: string;
  onPhoto: () => void;
  onSent: () => void;
  setPosts: React.Dispatch<React.SetStateAction<SquadPost[]>>;
  onError: (e: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const ordered = [...posts].reverse();
  const newest = posts[0]?.id;

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [newest]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    onError(null);
    setSending(true);
    setText("");
    const temp: SquadPost = { id: `temp-${++tempSeq}`, group_id: squadId, user_id: me, kind: "message", body, ref_id: null, photo_path: null, created_at: nowIso(), author_name: "You", author_username: null, author_avatar_path: null };
    setPosts((p) => [temp, ...p]);
    const res = await sendSquadMessage(squadId, body);
    setSending(false);
    if (!res.ok) {
      setPosts((p) => p.filter((x) => x.id !== temp.id));
      setText(body);
      onError(res.error);
      return;
    }
    onSent();
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-28 pt-3">
        {!posts.length ? (
          <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
              <Chat size={30} />
            </span>
            <p className="mt-3 text-[16px] font-bold">No messages yet</p>
            <p className="text-[13px] muted">Be the first to start the conversation!</p>
          </div>
        ) : (
          ordered.map((p, i) => {
            const mine = p.user_id === me;
            const prev = ordered[i - 1];
            const grouped = prev && prev.user_id === p.user_id && new Date(p.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
            return (
              <div key={p.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`} style={{ marginTop: grouped ? -4 : 4 }}>
                {!mine ? <span className="w-8 shrink-0">{!grouped ? <Avatar path={p.author_avatar_path} name={p.author_name} size={32} /> : null}</span> : null}
                <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                  {!mine && !grouped ? <span className="mb-0.5 px-1 text-[11px] font-bold muted">{p.author_name}</span> : null}
                  {p.kind === "photo" && p.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                    <img src={p.photo_url} alt={p.body || "Photo"} className="max-h-72 rounded-2xl object-cover" loading="lazy" />
                  ) : null}
                  {p.body ? (
                    <span
                      className="whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-[15px] leading-snug"
                      style={{ background: mine ? "var(--btn)" : "var(--card)", color: mine ? "var(--btn-ink)" : "var(--ink)", boxShadow: mine ? "none" : "var(--shadow-sm)", marginTop: p.kind === "photo" ? 4 : 0 }}
                    >
                      {p.body}
                    </span>
                  ) : null}
                  {!grouped || i === ordered.length - 1 ? <span className="mt-0.5 px-1 text-[10px] muted">{p.id.startsWith("temp-") ? "Sending…" : postStamp(p.created_at, today)}</span> : null}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <form
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-[480px] items-center gap-2 px-3 pt-2"
        style={{ background: "var(--bg)", paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <button type="button" aria-label="Share a photo" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)", color: "var(--ink)", border: 0 }} onClick={onPhoto}>
          <Plus size={20} />
        </button>
        <input className="field flex-1" style={{ borderRadius: 999, minHeight: 44 }} placeholder="Type a message…" value={text} maxLength={1000} aria-label="Message" onChange={(e) => setText(e.target.value)} />
        <button type="submit" aria-label="Send" disabled={!text.trim() || sending} className="press grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: text.trim() ? "var(--btn)" : "var(--card2)", color: text.trim() ? "var(--btn-ink)" : "var(--muted)", border: 0 }}>
          <Send size={18} />
        </button>
      </form>
    </>
  );
}

/* ---------------- Feed ---------------- */

const KIND_META: Record<string, { verb: string; tint: string; Icon: (p: { size?: number }) => React.ReactNode }> = {
  meal: { verb: "logged a meal", tint: "var(--orange)", Icon: Bowl },
  workout: { verb: "trained", tint: "var(--purple)", Icon: Dumbbell },
  pr: { verb: "hit a new PR", tint: "var(--flame)", Icon: Medal },
  photo: { verb: "shared a photo", tint: "var(--blue)", Icon: Photo },
  challenge: { verb: "started a challenge", tint: "var(--flame)", Icon: Target },
  battle: { verb: "took the Food Battle crown", tint: "var(--orange)", Icon: Medal },
};

/** v2.7: "🏆 completed ..." posts carry ref_id = challenge id; "🏁 started ..." ones don't. */
const isCompletion = (p: SquadPost) => p.kind === "challenge" && p.body.startsWith("🏆");

function FeedTab({
  me,
  today,
  squadId,
  posts,
  shareStats,
  isOwner,
  onPhoto,
  onChallenges,
  onDeleted,
  onError,
}: {
  me: string;
  today: string;
  squadId: string;
  posts: SquadPost[];
  shareStats: boolean;
  isOwner: boolean;
  onPhoto: () => void;
  onChallenges: () => void;
  onDeleted: (id: string) => void;
  onError: (e: string | null) => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  async function remove(id: string) {
    setDeleting(id);
    try {
      await deleteSquadPost(id);
      onDeleted(id);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not delete that");
    } finally {
      setDeleting(null);
    }
  }
  return (
    <div className="flex flex-col gap-3 px-4 pb-10 pt-3">
      <button type="button" className="card press flex items-center gap-3 text-left" style={{ padding: "12px 14px", color: "var(--ink)" }} onClick={onPhoto}>
        <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--blue-bg)", color: "var(--blue)" }}>
          <Photo size={20} />
        </span>
        <span className="flex flex-col">
          <span className="text-[15px] font-bold">Share a photo</span>
          <span className="text-xs muted">Your plate, your pump, your view</span>
        </span>
      </button>
      {!shareStats ? (
        <p className="px-1 text-[12px] muted">
          You share streaks only, so your meals and workouts don&apos;t post here.{" "}
          <Link href="/profile" className="font-semibold underline" style={{ color: "var(--ink)" }}>
            Change
          </Link>
        </p>
      ) : null}
      {!posts.length ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="text-[20px] font-extrabold" style={{ letterSpacing: "-0.02em" }}>
            No Posts Yet
          </p>
          <p className="mt-1 max-w-[260px] text-[14px] muted">Be the first to share what you&apos;re eating with your squad!</p>
          <p className="mt-3 max-w-[280px] text-[12px] muted">Meals, workouts and gym PRs you log show up here on their own.</p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {posts.map((p) => {
            const meta = KIND_META[p.kind] ?? KIND_META.photo;
            const verb = isCompletion(p) ? "crushed a challenge" : meta.verb;
            const canDelete = p.user_id === me || isOwner;
            return (
              <motion.article key={p.id} layout className="card" style={{ padding: 14 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, padding: 0 }}>
                <div className="flex items-center gap-2.5">
                  <Avatar path={p.author_avatar_path} name={p.author_name} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px]">
                      <span className="font-bold">{p.user_id === me ? "You" : p.author_name}</span> <span className="muted">{verb}</span>
                    </span>
                    <span className="truncate text-[11px] muted">
                      {p.author_username ? `@${p.author_username} · ` : ""}
                      {postStamp(p.created_at, today)}
                    </span>
                  </span>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)", color: meta.tint }}>
                    <meta.Icon size={16} />
                  </span>
                </div>
                {p.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                  <img src={p.photo_url} alt="" className="mt-3 max-h-80 w-full rounded-2xl object-cover" loading="lazy" />
                ) : null}
                {p.body ? (
                  <p className={`mt-2.5 whitespace-pre-wrap break-words ${p.kind === "photo" ? "text-[14px]" : "text-[16px] font-bold"}`} style={{ letterSpacing: p.kind === "photo" ? undefined : "-0.01em" }}>
                    {p.body}
                  </p>
                ) : null}
                {p.kind === "challenge" ? (
                  p.ref_id ? (
                    <Link href={`/squad/${squadId}/challenge/${p.ref_id}`} className="press mt-2 inline-flex items-center gap-1 text-[12px] font-bold" style={{ color: "var(--ink)" }}>
                      See the board <ChevronRight size={13} />
                    </Link>
                  ) : (
                    <button type="button" className="press mt-2 inline-flex items-center gap-1 text-[12px] font-bold" style={{ background: "none", border: 0, padding: 0, color: "var(--ink)" }} onClick={onChallenges}>
                      Open challenges <ChevronRight size={13} />
                    </button>
                  )
                ) : null}
                {canDelete ? (
                  <div className="mt-1 flex justify-end">
                    <button type="button" className="hit press flex items-center gap-1 px-1 py-1 text-[11px] font-semibold muted" disabled={deleting === p.id} onClick={() => void remove(p.id)} aria-label="Delete post">
                      {deleting === p.id ? <Spinner size={12} /> : <Trash size={13} />}
                      Delete
                    </button>
                  </div>
                ) : null}
              </motion.article>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}

/* ---------------- Leaderboard ---------------- */

function LeaderboardTab({ me, squadId, rows, sentNudges, onError, onOpenProfile }: { me: string; squadId: string; rows: LeaderRow[]; sentNudges: string[]; onError: (e: string | null) => void; onOpenProfile: (row: LeaderRow) => void }) {
  const [nudged, setNudged] = useState<Set<string>>(() => new Set(sentNudges));
  async function nudge(r: LeaderRow) {
    onError(null);
    setNudged((s) => new Set(s).add(r.user_id));
    try {
      await nudgeMember(squadId, r.user_id);
    } catch (e) {
      setNudged((s) => {
        const n = new Set(s);
        n.delete(r.user_id);
        return n;
      });
      onError(e instanceof Error ? e.message : "Could not send the nudge");
    }
  }
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-10 pt-3">
      {rows.map((r) => {
        const isMe = r.user_id === me;
        const already = nudged.has(r.user_id);
        return (
          <SquadRankRow
            key={r.user_id}
            rank={r.rank}
            avatarPath={r.avatar_path}
            name={r.name}
            username={r.username}
            isMe={isMe}
            meta={`${r.week_points} pts this week`}
            onClick={() => onOpenProfile(r)}
            right={
              <>
                <span className="flex items-center gap-1 text-[17px] font-extrabold" title={`${r.flames}-day streak`}>
                  {r.flames > 0 ? <BreathingFlame size={18} /> : <span className="muted inline-flex"><Flame size={18} /></span>}
                  <span className="num">{r.flames}</span>
                </span>
                {!isMe ? (
                  <button
                    type="button"
                    className="chip press"
                    style={{ height: 28, padding: "0 10px", gap: 4, fontSize: 12, fontWeight: 700, background: already ? "var(--card2)" : "var(--btn)", color: already ? "var(--muted)" : "var(--btn-ink)" }}
                    disabled={already}
                    aria-label={already ? `Nudged ${r.name}` : `Nudge ${r.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void nudge(r);
                    }}
                  >
                    {already ? <Check size={12} /> : <Fist size={12} />}
                    {already ? "Nudged" : "Nudge"}
                  </button>
                ) : null}
              </>
            }
          />
        );
      })}
      <p className="px-1 pt-1 text-center text-[12px] leading-snug muted">🔥 = days in a row with a meal, workout or exercise logged. Points this week: 10 per training day + 5 per day with meals.</p>
    </div>
  );
}

/* ---------------- Photo post ---------------- */

function PhotoPostSheet({ photo, onClose, onPost }: { photo: { base64: string; preview: string } | null; onClose: () => void; onPost: (caption: string) => Promise<void> }) {
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <BottomSheet
      open={!!photo}
      title="Share a photo"
      subtitle="Everyone in this squad sees it in Chat and Feed."
      onClose={() => {
        setCaption("");
        setError(null);
        onClose();
      }}
      primary={{
        label: busy ? "Posting…" : "Post",
        disabled: busy,
        onClick: async () => {
          setBusy(true);
          setError(null);
          try {
            await onPost(caption);
            setCaption("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not post that");
          } finally {
            setBusy(false);
          }
        },
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- local preview
        <img src={photo.preview} alt="" className="max-h-72 w-full rounded-2xl object-cover" />
      ) : null}
      <input className="field mt-3" placeholder="Add a caption (optional)" value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" />
      {error ? (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      ) : null}
    </BottomSheet>
  );
}
