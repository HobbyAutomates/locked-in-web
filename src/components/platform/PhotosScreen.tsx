"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addPhoto, deletePhoto, listShareSquads, sharePhotoToSquad, updatePhoto } from "@/lib/platformActions";
import { POSES, POSE_LABEL, byMonth, photoWeight, type Photo, type Pose } from "@/lib/body";
import { parseIso, today as todayIso } from "@/lib/dates";
import { toJpegBase64 } from "@/lib/image";
import { weightText } from "@/lib/display";
import type { WeightEntry } from "@/lib/types";
import SubPage from "../SubPage";
import { MRise, STAGGER, md } from "../motion";
import { LineIcon } from "../lineIcons";
import { Camera, Photo as PhotoIcon, Spinner, Trash } from "../icons";
import { BottomSheet, ErrorNote } from "../ui";
import BeforeAfter from "./BeforeAfter";
import { ProChip, Snackbar } from "./kit";

const dm = (d: string) => parseIso(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const dmy = (d: string) => parseIso(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

type Draft = { date: string; note: string; weight: string; pose: Pose | null };

/**
 * v2.13 progress photos manager (spec §11): add from camera or gallery, a grid grouped by month,
 * edit date / note / weight / pose, delete (confirm, then Undo for a few seconds before the row and
 * the file go), before/after compare, and "Share to squad" only after an explicit confirmation.
 */
export default function PhotosScreen({ photos, extended, weights, units, pro }: { photos: Photo[]; extended: boolean; weights: WeightEntry[]; units: "metric" | "imperial"; pro: boolean }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [draft, setDraft] = useState<Draft>({ date: todayIso(), note: "", weight: "", pose: null });
  const [open, setOpen] = useState<Photo | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState<Photo | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<Photo | null>(null);
  const [picking, setPicking] = useState<string[] | null>(null);
  const [comparing, setComparing] = useState<[Photo, Photo] | null>(null);
  const [share, setShare] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const undoRef = useRef<Photo | null>(null);

  const visible = photos.filter((p) => !hidden.has(p.id));
  const groups = byMonth(visible);

  // Commit a pending delete if the page goes away before the Undo window ends.
  useEffect(() => {
    return () => {
      const p = undoRef.current;
      if (p) void deletePhoto(p.id);
    };
  }, []);

  const commitDelete = useCallback(() => {
    const p = undoRef.current;
    undoRef.current = null;
    setUndo(null);
    if (!p) return;
    void deletePhoto(p.id).then((r) => {
      if (!r.ok) {
        setError(r.error);
        setHidden((h) => {
          const n = new Set(h);
          n.delete(p.id);
          return n;
        });
      } else router.refresh();
    });
  }, [router]);

  function startDelete(p: Photo) {
    if (undoRef.current) commitDelete();
    undoRef.current = p;
    setHidden((h) => new Set(h).add(p.id));
    setUndo(p);
    setConfirmDel(null);
    setOpen(null);
  }

  function undoDelete() {
    const p = undoRef.current;
    undoRef.current = null;
    setUndo(null);
    if (p)
      setHidden((h) => {
        const n = new Set(h);
        n.delete(p.id);
        return n;
      });
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const { preview } = await toJpegBase64(file, 480, 0.7);
      setPending({ file, preview });
      setDraft({ date: todayIso(), note: "", weight: weights[0] && weights[0].date === todayIso() ? String(weights[0].weight_kg) : "", pose: null });
    } catch {
      setError("Couldn't read that photo. Try another one.");
    } finally {
      if (camera.current) camera.current.value = "";
      if (gallery.current) gallery.current.value = "";
    }
  }

  async function upload() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const { base64 } = await toJpegBase64(pending.file, 1024, 0.82);
      const r = await addPhoto({ base64, date: draft.date, note: draft.note, weight_kg: draft.weight ? Number(draft.weight) : null, pose: draft.pose });
      if (!r.ok) setError(r.error);
      else {
        setPending(null);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that photo");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!open || !edit) return;
    setBusy(true);
    setError(null);
    const r = await updatePhoto(open.id, { date: edit.date, note: edit.note, ...(extended ? { weight_kg: edit.weight ? Number(edit.weight) : null, pose: edit.pose } : {}) });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setEdit(null);
      setOpen(null);
      router.refresh();
    }
  }

  function tapPhoto(p: Photo) {
    if (picking) {
      const next = picking.includes(p.id) ? picking.filter((x) => x !== p.id) : [...picking, p.id].slice(-2);
      setPicking(next);
      if (next.length === 2) {
        const a = photos.find((x) => x.id === next[0]);
        const b = photos.find((x) => x.id === next[1]);
        if (a && b) setComparing([a, b]);
      }
      return;
    }
    setOpen(p);
    setEdit(null);
  }

  return (
    <SubPage title="Progress photos" back="/progress">
      <MRise delay={0}>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" className="press flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0 }} onClick={() => camera.current?.click()}>
            <Camera size={18} /> Camera
          </button>
          <button type="button" className="press flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} onClick={() => gallery.current?.click()}>
            <PhotoIcon size={18} /> Gallery
          </button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
        <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
        <p className="mt-2 flex items-center gap-1.5 px-1 text-[12px] muted">
          <LineIcon name="lock" size={13} /> Private. Only you can see these unless you share one.
        </p>
      </MRise>

      {visible.length >= 2 ? (
        <MRise delay={STAGGER}>
          <button
            type="button"
            className="press flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-[14px] font-semibold"
            style={{ background: picking ? "var(--ink)" : "var(--pcard)", color: picking ? "var(--bg)" : "var(--ink)", border: 0, boxShadow: "var(--pcard-ring)" }}
            onClick={() => (pro ? setPicking(picking ? null : []) : router.push("/profile/pro"))}
          >
            <span className="flex items-center gap-2">
              Before / after <ProChip />
            </span>
            <span className="text-[13px] font-medium" style={{ opacity: 0.75 }}>
              {picking ? (picking.length ? "Pick one more" : "Pick two photos · Cancel") : "Compare two photos"}
            </span>
          </button>
        </MRise>
      ) : null}

      {groups.length === 0 ? (
        <MRise delay={STAGGER}>
          <section className="flex flex-col items-center gap-2 rounded-[22px] px-5 py-8 text-center" style={{ background: "var(--pcard)", boxShadow: "var(--pcard-ring)" }}>
            <Camera size={28} />
            <p className="text-[15px] font-semibold">Your first progress photo</p>
            <p className="text-[13px] muted">Same spot, same light, once every week or two. The change shows up here month by month.</p>
          </section>
        </MRise>
      ) : (
        groups.map((g, gi) => (
          <MRise key={g.key} delay={STAGGER * (gi + 2)}>
            <section aria-label={g.label} className="flex flex-col gap-2">
              <p className="px-1 text-[13px] font-semibold muted">
                {g.label} · {g.items.length}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {g.items.map((p, i) => {
                  const sel = picking?.includes(p.id);
                  return (
                    <button key={p.id} type="button" className="press m-fade relative overflow-hidden rounded-2xl" style={md(STAGGER * (gi + 2) + i * 50, { aspectRatio: "3 / 4", background: "var(--card2)", border: 0, padding: 0, outline: sel ? "3px solid var(--accent)" : "none", outlineOffset: -3 })} onClick={() => tapPhoto(p)} aria-label={`Photo from ${dm(p.date)}${sel ? ", selected" : ""}`} aria-pressed={picking ? !!sel : undefined}>
                      {p.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : null}
                      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between px-2 pb-1.5 pt-5 text-[11px] font-bold" style={{ color: "#fff", background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }}>
                        <span>{dm(p.date)}</span>
                        {p.pose ? <span style={{ opacity: 0.85 }}>{POSE_LABEL[p.pose]}</span> : null}
                      </span>
                      {sel ? (
                        <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full" style={{ background: "var(--accent)", color: "#fff" }}>
                          <LineIcon name="check" size={14} stroke={2.4} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          </MRise>
        ))
      )}

      <ErrorNote text={error} />

      {/* ---- add: details before upload ---- */}
      <BottomSheet open={pending !== null} title="Add progress photo" onClose={() => setPending(null)} primary={{ label: busy ? "Uploading…" : "Save photo", onClick: () => void upload(), disabled: busy }}>
        {pending ? (
          <div className="flex gap-3 pb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.preview} alt="Preview" className="h-40 w-28 shrink-0 rounded-2xl object-cover" />
            <DetailsFields draft={draft} setDraft={setDraft} extended={extended} units={units} />
          </div>
        ) : null}
      </BottomSheet>

      {/* ---- one photo ---- */}
      <BottomSheet open={open !== null && !confirmDel && !share} title={open ? dmy(open.date) : ""} subtitle={open ? [open.pose ? POSE_LABEL[open.pose] : null, photoWeight(open, weights) != null ? weightText(photoWeight(open, weights), units) : null, open.note || null].filter(Boolean).join(" · ") : undefined} onClose={() => { setOpen(null); setEdit(null); }}>
        {open ? (
          <div className="flex flex-col gap-3 pb-1">
            {open.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.url} alt={`Progress photo from ${dmy(open.date)}`} className="max-h-[46vh] w-full rounded-2xl object-contain" style={{ background: "#000" }} />
            ) : null}
            {edit ? (
              <>
                <DetailsFields draft={edit} setDraft={(d) => setEdit(d)} extended={extended} units={units} />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="press h-12 rounded-2xl text-[15px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} onClick={() => setEdit(null)}>
                    Cancel
                  </button>
                  <button type="button" disabled={busy} className="press h-12 rounded-2xl text-[15px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0 }} onClick={() => void saveEdit()}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <SheetAction icon={<LineIcon name="edit" size={18} />} label="Edit" onClick={() => setEdit({ date: open.date, note: open.note, weight: open.weight_kg != null ? String(open.weight_kg) : "", pose: open.pose })} />
                <SheetAction icon={<LineIcon name="users" size={18} />} label="Share to squad" onClick={() => setShare(open)} />
                <SheetAction icon={<Trash size={18} />} label="Delete" danger onClick={() => setConfirmDel(open)} />
              </div>
            )}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet open={confirmDel !== null} title="Delete this photo?" subtitle={confirmDel ? dmy(confirmDel.date) : undefined} onClose={() => setConfirmDel(null)} primary={{ label: "Delete photo", onClick: () => confirmDel && startDelete(confirmDel) }}>
        <p className="text-[14px] muted">The photo and its file are removed. You&rsquo;ll have a few seconds to undo.</p>
      </BottomSheet>

      {share ? <ShareSheet photo={share} onClose={() => setShare(null)} onDone={() => { setShare(null); setOpen(null); }} /> : null}

      {undo ? <Snackbar text="Photo deleted" action="Undo" onAction={undoDelete} onTimeout={commitDelete} /> : null}

      {comparing ? (
        <BeforeAfter
          a={comparing[0]}
          b={comparing[1]}
          weights={weights}
          units={units}
          onClose={() => {
            setComparing(null);
            setPicking(null);
          }}
        />
      ) : null}
    </SubPage>
  );
}

function SheetAction({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className="press flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl text-[12px] font-semibold" style={{ background: danger ? "var(--red-bg)" : "var(--card2)", color: danger ? "var(--red)" : "var(--ink)", border: 0 }} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function DetailsFields({ draft, setDraft, extended, units }: { draft: Draft; setDraft: (d: Draft) => void; extended: boolean; units: "metric" | "imperial" }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <label className="flex flex-col gap-1 text-[12px] font-semibold muted">
        Date
        <input type="date" value={draft.date} max={todayIso()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="rounded-xl px-2.5 py-2 text-[14px]" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} />
      </label>
      {extended ? (
        <>
          <label className="flex flex-col gap-1 text-[12px] font-semibold muted">
            Weight (kg){units === "imperial" ? " — stored in kg" : ""}
            <input inputMode="decimal" value={draft.weight} placeholder="optional" onChange={(e) => setDraft({ ...draft, weight: e.target.value.replace(/[^\d.]/g, "") })} className="num rounded-xl px-2.5 py-2 text-[14px]" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} />
          </label>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Pose">
            {POSES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={draft.pose === p} className="press h-8 rounded-full px-2.5 text-[12px] font-semibold" style={{ border: 0, background: draft.pose === p ? "var(--accent)" : "var(--card2)", color: draft.pose === p ? "var(--accent-ink)" : "var(--ink)" }} onClick={() => setDraft({ ...draft, pose: draft.pose === p ? null : p })}>
                {POSE_LABEL[p]}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <input value={draft.note} maxLength={120} placeholder="Note (optional)" onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="rounded-xl px-2.5 py-2 text-[14px] outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} aria-label="Note" />
    </div>
  );
}

/** "Share to squad": pick a squad, add a caption, and tick the explicit confirmation. */
function ShareSheet({ photo, onClose, onDone }: { photo: Photo; onClose: () => void; onDone: () => void }) {
  const [squads, setSquads] = useState<{ id: string; name: string }[] | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let alive = true;
    void listShareSquads().then((s) => {
      if (!alive) return;
      setSquads(s);
      if (s.length === 1) setGroup(s[0].id);
    });
    return () => {
      alive = false;
    };
  }, []);
  const name = squads?.find((s) => s.id === group)?.name ?? "the squad";
  async function go() {
    if (!group || !sure) return;
    setBusy(true);
    setError(null);
    const r = await sharePhotoToSquad({ photoId: photo.id, groupId: group, caption, confirmed: true });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else setSent(true);
  }
  return (
    <BottomSheet open title="Share to squad" subtitle="Progress photos are private until you share one." onClose={sent ? onDone : onClose} primary={sent ? { label: "Done", onClick: onDone } : { label: busy ? "Sharing…" : "Share photo", onClick: () => void go(), disabled: busy || !group || !sure }}>
      {sent ? (
        <p className="text-[15px]">Shared with {name}.</p>
      ) : squads == null ? (
        <p className="flex items-center gap-2 text-[14px] muted">
          <Spinner size={14} /> Loading your squads…
        </p>
      ) : squads.length === 0 ? (
        <p className="text-[14px] muted">You&rsquo;re not in a squad yet. Join or start one on the Squad tab.</p>
      ) : (
        <div className="flex flex-col gap-3 pb-1">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Squad">
            {squads.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={group === s.id} className="chip press" style={{ height: 38 }} onClick={() => setGroup(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
          <input value={caption} maxLength={300} placeholder="Say something (optional)" onChange={(e) => setCaption(e.target.value)} className="rounded-2xl px-3.5 py-3 text-[14px] outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} aria-label="Caption" />
          <label className="flex items-start gap-3 rounded-2xl p-3 text-[14px] leading-snug" style={{ background: "var(--orange-bg)", color: "var(--orange-ink)" }}>
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
            <span>Yes, show this photo to everyone in {group ? name : "that squad"}. It stays in the squad feed until I delete the post.</span>
          </label>
          <ErrorNote text={error} />
        </div>
      )}
    </BottomSheet>
  );
}
