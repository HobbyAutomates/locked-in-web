"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveJoin, declineJoin, leaveSquad, setSquadAutoPost, toggleBattle, updateSquad } from "@/lib/actions";
import { inviteLink } from "@/lib/squadPosts";
import type { JoinRequest, Squad, SquadMemberDetail } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ArrowLeft, Chat, Check, Copy, Crown, Flame, Globe, LinkIcon, Padlock, Pencil, Share, Spinner } from "./icons";
import { SQUAD_ICON_KEYS, SQUAD_ICON_LABELS, SquadIcon, SquadIconArt, isSquadIcon } from "./SquadIcon";
import { BottomSheet, BreathingFlame, Card, ErrorNote, PillButton, Rise, Toggle } from "./ui";

type Props = {
  me: string;
  squad: Squad;
  members: SquadMemberDetail[];
  requests: JoinRequest[];
  justCreated: boolean;
  /** v2.9: my "Auto-post my logs here" for this squad; null = schema_v31 not applied yet (switch hidden). */
  autoPost?: boolean | null;
};

/**
 * v2.6 squad details (Cal AI's group info + Strava club page): the squad's icon and name, "Invite
 * your friends" with the link and Share / WhatsApp / Copy, the owner's pending requests
 * (Approve / Decline), Members with an Owner badge and 🔥 day streaks, Edit (owner) and Leave.
 */
export default function SquadMembers({ me, squad, members, requests: requests0, justCreated, autoPost = null }: Props) {
  const router = useRouter();
  const isOwner = squad.owner_id === me;
  const link = inviteLink(squad.code);
  const text = `Join my squad "${squad.name}" on Locked In 🔥 ${link}`;
  const [copied, setCopied] = useState(false);
  const [requests, setRequests] = useState(requests0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [posting, setPosting] = useState(autoPost);

  async function toggleAutoPost(on: boolean) {
    setError(null);
    setPosting(on);
    try {
      await setSquadAutoPost(squad.id, on);
    } catch (e) {
      setPosting(!on);
      setError(e instanceof Error ? e.message : "Could not change that");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy — press and hold the link to copy it.");
    }
  }
  async function share() {
    try {
      if (typeof navigator.share === "function") await navigator.share({ title: squad.name, text });
      else await copy();
    } catch {
      // Share sheet cancelled.
    }
  }
  async function decide(r: JoinRequest, ok: boolean) {
    setBusy(r.id);
    setError(null);
    try {
      if (ok) await approveJoin(r.id);
      else await declineJoin(r.id);
      setRequests((list) => list.filter((x) => x.id !== r.id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't do that");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col" style={{ paddingTop: "calc(8px + env(safe-area-inset-top, 0px))", paddingBottom: 40 }}>
      <div className="flex items-center px-4 py-2">
        <button type="button" onClick={() => router.push(`/squad/${squad.id}`)} aria-label="Back" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
          <ArrowLeft size={18} />
        </button>
        <span className="flex-1" />
        {isOwner ? (
          <button type="button" onClick={() => setEdit(true)} aria-label="Edit squad" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)", color: "var(--ink)" }}>
            <Pencil size={16} />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3.5 px-4">
        <Rise index={0}>
          <div className="flex flex-col items-center text-center">
            <SquadIcon icon={squad.icon} cover={squad.cover_url} size={112} />
            <h1 className="mt-3 text-[24px] font-extrabold" style={{ letterSpacing: "-0.03em" }}>
              {squad.name}
            </h1>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold muted">
              {members.length} member{members.length === 1 ? "" : "s"} ·{squad.is_public ? <Globe size={13} /> : <Padlock size={13} />}
              {squad.is_public ? "Public" : "Private"}
            </p>
            {squad.description ? <p className="mt-1 max-w-[320px] text-[14px] muted">{squad.description}</p> : null}
          </div>
        </Rise>

        {justCreated ? (
          <Rise index={1}>
            <div className="rounded-2xl px-4 py-3 text-center text-[14px] font-semibold" style={{ background: "var(--green-bg)", color: "var(--green)" }}>
              {squad.name} is live — now bring your friends.
            </div>
          </Rise>
        ) : null}

        <Rise index={1}>
          <Card padding={18}>
            <p className="text-center text-[17px] font-extrabold" style={{ letterSpacing: "-0.02em" }}>
              Invite your friends to the squad
            </p>
            <button type="button" className="press mt-3 flex w-full items-center gap-2.5 rounded-2xl px-4 py-3.5 text-left" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => void copy()} aria-label={`Copy invite link ${link}`}>
              <span style={{ color: "var(--blue)" }}>
                <LinkIcon size={18} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{link}</span>
            </button>
            <p className="mt-1.5 text-center text-[12px] muted">
              Code <span className="num font-bold" style={{ color: "var(--ink)", letterSpacing: "0.12em" }}>{squad.code}</span>
              {squad.is_public ? " · anyone with the link joins" : " · you approve who gets in"}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <ShareButton label="Share" onClick={() => void share()} bg="var(--card2)" color="var(--ink)">
                <Share size={20} />
              </ShareButton>
              <ShareButton label="WhatsApp" href={`https://wa.me/?text=${encodeURIComponent(text)}`} bg="#25d366" color="#fff">
                <Chat size={20} />
              </ShareButton>
              <ShareButton label={copied ? "Copied" : "Copy"} onClick={() => void copy()} bg="var(--card2)" color={copied ? "var(--green)" : "var(--ink)"}>
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </ShareButton>
            </div>
          </Card>
        </Rise>

        {error ? <ErrorNote text={error} /> : null}

        {isOwner && requests.length ? (
          <Rise index={2}>
            <p className="px-1 text-[13px] font-bold muted">Requests to join</p>
            <Card padding={0} className="mt-2">
              <div className="px-3.5">
                {requests.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-3 py-3" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
                    <Avatar path={r.avatar_path} name={r.name} size={42} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-bold">{r.name}</span>
                      <span className="truncate text-xs muted">{r.username ? `@${r.username}` : "wants to join"}</span>
                    </span>
                    {busy === r.id ? (
                      <Spinner size={16} />
                    ) : (
                      <span className="flex shrink-0 gap-1.5">
                        <button type="button" className="chip press" style={{ height: 34, padding: "0 12px", fontWeight: 700 }} onClick={() => void decide(r, false)}>
                          Decline
                        </button>
                        <button type="button" className="chip press" style={{ height: 34, padding: "0 12px", fontWeight: 700, background: "var(--btn)", color: "var(--btn-ink)" }} onClick={() => void decide(r, true)}>
                          Approve
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </Rise>
        ) : null}

        {posting !== null ? (
          <Rise index={3}>
            <Card padding={0}>
              <div className="flex min-h-[64px] items-center gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-bold">Auto-post my logs here</span>
                  <span className="text-xs muted">{posting ? "Your meals, workouts and PRs show in this squad's Feed" : "Nothing you log posts here. Chat and photos still work"}</span>
                </span>
                <Toggle on={posting} onChange={(v) => void toggleAutoPost(v)} label="Auto-post my logs here" />
              </div>
            </Card>
          </Rise>
        ) : null}

        <Rise index={3}>
          <p className="px-1 text-[17px] font-extrabold" style={{ letterSpacing: "-0.02em" }}>
            Members
          </p>
          <Card padding={0} className="mt-2">
            <div className="px-3.5">
              {members.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 py-3" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
                  <Avatar path={m.avatar_path} name={m.name} size={44} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-bold">
                        {m.name}
                        {m.id === me ? <span className="font-medium muted"> · you</span> : null}
                      </span>
                      {m.is_owner ? (
                        <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--card2)", color: "var(--ink)" }}>
                          Owner
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-xs muted">{m.username ? `@${m.username}` : " "}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[15px] font-extrabold" title={`${m.flames}-day streak`}>
                    {m.flames > 0 ? (
                      <BreathingFlame size={16} />
                    ) : (
                      <span className="muted inline-flex">
                        <Flame size={16} />
                      </span>
                    )}
                    <span className="num">{m.flames}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Rise>

        <Rise index={4}>
          {confirmLeave ? (
            <Card padding={16}>
              <p className="text-[15px] font-semibold">Leave {squad.name}?</p>
              <p className="mt-0.5 text-xs muted">{members.length <= 1 ? "You're the last one in, so the squad will be deleted." : isOwner ? "The longest-standing member becomes the owner." : squad.is_public ? "You can rejoin from Discover any time." : "You'd need the owner to approve you again."}</p>
              <div className="mt-3 flex gap-2">
                <PillButton soft height={44} onClick={() => setConfirmLeave(false)}>
                  Stay
                </PillButton>
                <PillButton
                  height={44}
                  disabled={busy === "leave"}
                  style={{ background: "var(--danger)", color: "#fff" }}
                  onClick={async () => {
                    setBusy("leave");
                    try {
                      await leaveSquad(squad.id);
                      router.push("/squad");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not leave");
                      setBusy(null);
                    }
                  }}
                >
                  Leave
                </PillButton>
              </div>
            </Card>
          ) : (
            <button type="button" className="hit press mx-auto block py-2 text-[13px] font-semibold" style={{ color: "var(--danger)" }} onClick={() => setConfirmLeave(true)}>
              Leave squad
            </button>
          )}
        </Rise>
      </div>

      {isOwner ? <EditSheet open={edit} onClose={() => setEdit(false)} squad={squad} /> : null}
    </div>
  );
}

function ShareButton({ children, label, onClick, href, bg, color }: { children: React.ReactNode; label: string; onClick?: () => void; href?: string; bg: string; color: string }) {
  const inner = (
    <>
      <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: bg, color }}>
        {children}
      </span>
      <span className="text-[12px] font-semibold">{label}</span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="press flex flex-col items-center gap-1.5" style={{ color: "var(--ink)" }}>
      {inner}
    </a>
  ) : (
    <button type="button" className="press flex flex-col items-center gap-1.5" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={onClick}>
      {inner}
    </button>
  );
}

/** Owner: rename, describe, change the icon, flip public / private. */
function EditSheet({ open, onClose, squad }: { open: boolean; onClose: () => void; squad: Squad }) {
  const router = useRouter();
  const [name, setName] = useState(squad.name);
  const [description, setDescription] = useState(squad.description ?? "");
  const [icon, setIcon] = useState<string | null>(squad.icon ?? null);
  const [isPublic, setIsPublic] = useState(!!squad.is_public);
  const [battleEnabled, setBattleEnabled] = useState(!!squad.battle_enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateSquad(squad.id, { name, description, icon: isSquadIcon(icon) ? icon : (squad.icon ?? null), isPublic });
      if (battleEnabled !== !!squad.battle_enabled) await toggleBattle(squad.id, battleEnabled);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <BottomSheet open={open} title="Edit squad" onClose={onClose} primary={{ label: busy ? "Saving…" : "Save", onClick: () => void save(), disabled: busy || !name.trim() }}>
      <input className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Squad name" placeholder="Squad name" />
      <textarea className="field mt-2 resize-none py-3" rows={2} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} aria-label="Description" placeholder="Description (optional)" />
      <p className="mt-3 text-[13px] font-bold muted">Icon</p>
      <div className="mt-2 grid grid-cols-6 gap-2">
        {SQUAD_ICON_KEYS.map((k) => (
          <button key={k} type="button" aria-label={SQUAD_ICON_LABELS[k]} aria-pressed={icon === k} className="press rounded-full" style={{ padding: 0, border: 0, background: "none", outline: icon === k ? "2.5px solid var(--ink)" : "none", outlineOffset: 2 }} onClick={() => setIcon(k)}>
            <SquadIconArt k={k} size={42} />
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: "var(--card2)" }}>
        <span className="flex flex-col">
          <span className="text-[15px] font-bold">Public squad</span>
          <span className="text-[12px] muted">{isPublic ? "Shown in Discover; anyone can join." : "Private: people request, you approve."}</span>
        </span>
        <Toggle on={isPublic} onChange={setIsPublic} label="Public squad" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: "var(--card2)" }}>
        <span className="flex flex-col">
          <span className="flex items-center gap-1.5 text-[15px] font-bold">
            Food Battle
            <Crown size={15} />
          </span>
          <span className="text-[12px] muted">Daily calorie-goal game with a graffiti crown for the winner.</span>
        </span>
        <Toggle on={battleEnabled} onChange={setBattleEnabled} label="Food Battle" />
      </div>
      {error ? (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      ) : null}
    </BottomSheet>
  );
}
