"use client";

import { useEffect, useState } from "react";
import { postJson } from "@/lib/image";
import { LEFTOVER_FRACTIONS, fractionLabel, normalizeShares, sizedUsingLabel } from "@/lib/food/foodBits";
import { listSplitPeople, logSplit, type SplitPerson } from "@/lib/food/foodActions";
import type { MealType } from "@/lib/mealType";
import type { MealItem, PlateItem } from "@/lib/types";
import { BottomSheet, ErrorNote, Hair, PillButton } from "../ui";
import { Close, Spinner } from "../icons";
import { HoldMic, LangToggle, useVoiceNote } from "./VoiceHold";
import { refreshFoodHome } from "./FoodHome";
import sc from "../scan/scan.module.css";

/**
 * v2.18 plate tools under a photo estimate: "Sized using: katori" (A5), add details by voice after the
 * photo (A1), "Ate part of it" (A6) and "Split it" (A7). All optional: each hides when it has nothing
 * to show, and the split sheet says so when splitting isn't available yet (schema_v42).
 */

export function SizedUsing({ value }: { value?: string | null }) {
  const label = sizedUsingLabel(value);
  if (!label) return null;
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--card2)", color: "var(--ink)" }}>
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        <path d="M3 17l6-6 4 4 8-8M14 7h7v7" />
      </svg>
      {label}
    </span>
  );
}

/** "From your voice" lines the server applied, under the plate title. */
export function VoiceChanges({ voice, changes }: { voice?: string | null; changes?: string[] }) {
  if (!voice || !changes?.length) return null;
  return (
    <div className="rounded-2xl px-3 py-2.5 text-[12px]" style={{ background: "var(--card2)" }}>
      <p className="font-bold">From your voice: “{voice}”</p>
      <p className="mt-0.5 muted">{changes.join(" · ")}</p>
    </div>
  );
}

/**
 * Add details after the photo: hold the mic ("2 roti, less oil, extra dal") or type them. The plate
 * on screen is merged on the server (/api/scan-voice): counts and extras rescale items, missed foods
 * are looked up on the web, oil cues apply last.
 */
export function PlateVoice({ items, plateNote, onApply }: { items: PlateItem[]; plateNote?: string; onApply: (items: PlateItem[], changes: string[]) => void }) {
  const voice = useVoiceNote();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = voice.dictation.supported;

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await postJson<{ items: PlateItem[]; changes: string[]; notes: string[] }>("/api/scan-voice", { items, voice: t, plate_note: plateNote });
      if (r.changes.length) onApply(r.items, r.changes);
      setMsg([...r.changes, ...r.notes].join(" · ") || "Nothing to change.");
      voice.clear();
      setTyped("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that");
    } finally {
      setBusy(false);
    }
  }

  const listening = voice.dictation.listening;
  const said = voice.value;
  // Words not sent yet: what was typed, else what the mic heard (a late result lands here too).
  const pending = typed || said;
  // Let go of the mic: wait for the last words, then send them.
  const onStop = () => void voice.settle().then(() => send(voice.current()));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {supported ? (
          <>
            <HoldMic dictation={voice.dictation} label="Hold to add details by voice" size={40} onStop={onStop} />
            <LangToggle dictation={voice.dictation} />
          </>
        ) : null}
        <input
          className="field min-w-0 flex-1"
          style={{ height: 40, fontSize: 14 }}
          value={listening ? said || "Listening…" : pending}
          readOnly={listening}
          aria-label="Details about the plate"
          placeholder={supported ? "Hold the mic: “2 roti, less oil”" : "Details: “2 roti, less oil, extra dal”"}
          onChange={(e) => {
            setTyped(e.target.value);
            if (said) voice.clear();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send(pending);
          }}
        />
        {pending.trim() && !listening ? (
          <button type="button" className="chip press shrink-0" style={{ height: 40, padding: "0 14px", fontWeight: 700 }} disabled={busy} onClick={() => void send(pending)}>
            {busy ? <Spinner size={14} /> : "Add"}
          </button>
        ) : busy ? (
          <Spinner size={16} />
        ) : null}
      </div>
      {msg ? <p className="px-1 text-[12px] muted">{msg}</p> : null}
      {voice.dictation.error ? <p className="px-1 text-[12px]" style={{ color: "var(--orange)" }}>{voice.dictation.error}</p> : null}
      <ErrorNote text={error} />
    </div>
  );
}

/** "Ate: All · ¾ · ½ · ¼". The rest becomes a leftover suggestion (A6). */
export function EatenChips({ value, onChange, leftKcal }: { value: number; onChange: (f: number) => void; leftKcal: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="How much you ate">
        <span className="mr-1 text-[13px] font-semibold">Ate</span>
        {LEFTOVER_FRACTIONS.map((f) => (
          <button key={f} type="button" role="radio" aria-checked={value === f} className={`press ${sc.qChip}${value === f ? ` ${sc.qChipOn}` : ""}`} onClick={() => onChange(f)}>
            {fractionLabel(f)}
          </button>
        ))}
      </div>
      {value < 1 ? <p className="px-1 text-[12px] muted">The rest ({leftKcal} kcal) waits as leftovers for the next 3 days.</p> : null}
    </div>
  );
}

/**
 * A7: split this dish across squadmates (and family who aren't on the app). My share is logged now;
 * each squadmate gets a pending entry to accept. Shares are equal by default, − / + per person.
 */
export function SplitSheet({ open, onClose, dish, items, mealType, photoPath, onDone }: { open: boolean; onClose: () => void; dish: string; items: MealItem[]; mealType: MealType; photoPath?: string | null; onDone: (sent: number) => void }) {
  const [people, setPeople] = useState<SplitPerson[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [others, setOthers] = useState(0);
  const [shares, setShares] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || people) return;
    let live = true;
    void listSplitPeople().then((r) => {
      if (live) setPeople(r.ok ? r.people : []);
    });
    return () => {
      live = false;
    };
  }, [open, people]);

  const keys = ["me", ...picked, ...Array.from({ length: others }, (_, i) => `other-${i}`)];
  const weights = keys.map((k) => shares[k] ?? 1);
  const fractions = normalizeShares(weights);
  const total = items.reduce((a, i) => a + i.calories, 0);
  const kcalFor = (k: string) => Math.round(total * (fractions[keys.indexOf(k)] ?? 0));
  const bump = (k: string, d: number) => setShares((s) => ({ ...s, [k]: Math.max(0.5, Math.min(4, (s[k] ?? 1) + d)) }));

  async function go() {
    setBusy(true);
    setError(null);
    // Family not on the app only take a share away from me; they get no entry.
    const r = await logSplit({ dish, items, shares: weights, people: picked, meal_type: mealType, photo_path: photoPath ?? null }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Couldn't split it" }));
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    refreshFoodHome();
    onDone(r.sent);
  }

  return (
    <BottomSheet open={open} title="Split this dish" subtitle={`${dish} · ${total} kcal in all`} onClose={onClose} primary={{ label: busy ? "Logging…" : `Log my share · ${kcalFor("me")} kcal`, onClick: () => void go(), disabled: busy }}>
      <div className="flex flex-col gap-2 pb-1">
        <ShareRow name="You" kcal={kcalFor("me")} onMinus={() => bump("me", -0.5)} onPlus={() => bump("me", 0.5)} weight={shares.me ?? 1} />
        {picked.map((id) => (
          <ShareRow key={id} name={people?.find((p) => p.id === id)?.name ?? "Squadmate"} kcal={kcalFor(id)} weight={shares[id] ?? 1} onMinus={() => bump(id, -0.5)} onPlus={() => bump(id, 0.5)} onRemove={() => setPicked((p) => p.filter((x) => x !== id))} />
        ))}
        {Array.from({ length: others }, (_, i) => (
          <ShareRow key={`o${i}`} name={`Family ${i + 1} (not on the app)`} kcal={kcalFor(`other-${i}`)} weight={shares[`other-${i}`] ?? 1} onMinus={() => bump(`other-${i}`, -0.5)} onPlus={() => bump(`other-${i}`, 0.5)} onRemove={i === others - 1 ? () => setOthers((n) => n - 1) : undefined} />
        ))}
        <Hair />
        <p className="text-[12px] font-semibold muted">Add people</p>
        <div className="flex flex-wrap gap-1.5">
          {people === null ? <Spinner size={16} /> : null}
          {(people ?? [])
            .filter((p) => !picked.includes(p.id))
            .slice(0, 16)
            .map((p) => (
              <button key={p.id} type="button" className="chip press" style={{ height: 32, fontSize: 13 }} onClick={() => setPicked((x) => [...x, p.id])}>
                + {p.name}
              </button>
            ))}
          <button type="button" className="chip press" style={{ height: 32, fontSize: 13 }} onClick={() => setOthers((n) => Math.min(8, n + 1))}>
            + Family (not on the app)
          </button>
        </div>
        {people && !people.length ? <p className="text-[12px] muted">Squadmates show up here. Family who aren&apos;t on the app just take a share.</p> : null}
        {picked.length ? <p className="text-[12px] muted">Each squadmate gets their share to accept. It lands in their day only when they tap Accept.</p> : null}
        <ErrorNote text={error} />
      </div>
    </BottomSheet>
  );
}

function ShareRow({ name, kcal, weight, onMinus, onPlus, onRemove }: { name: string; kcal: number; weight: number; onMinus: () => void; onPlus: () => void; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{name}</span>
      <span className="num w-[70px] shrink-0 text-right text-[13px] muted">{kcal} kcal</span>
      <button type="button" className="chip press shrink-0" style={{ width: 32, height: 32, padding: 0 }} aria-label={`Smaller share for ${name}`} onClick={onMinus} disabled={weight <= 0.5}>
        −
      </button>
      <span className="num w-8 shrink-0 text-center text-[13px] font-bold">{weight}×</span>
      <button type="button" className="chip press shrink-0" style={{ width: 32, height: 32, padding: 0 }} aria-label={`Bigger share for ${name}`} onClick={onPlus} disabled={weight >= 4}>
        +
      </button>
      {onRemove ? (
        <button type="button" className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ color: "var(--muted)", background: "none", border: 0 }} aria-label={`Remove ${name}`} onClick={onRemove}>
          <Close size={14} />
        </button>
      ) : (
        <span className="w-8 shrink-0" />
      )}
    </div>
  );
}

/** The split button under the log button. */
export function SplitButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <PillButton soft height={44} disabled={disabled} onClick={onClick}>
      Split it with family or squad
    </PillButton>
  );
}
