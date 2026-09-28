"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cover } from "../Cover";
import { Jewel } from "../Jewel";
import { ErrorNote } from "../ui";
import { saveBadgeSkin, saveGoldCover, unlockPack } from "@/lib/social/actions";
import { GOLD_COVERS, PACKS, SKIN_METAL, SKIN_PACK, priceLabel, skinAllowed, type BadgeSkin, type Pack } from "@/lib/social/packs";
import { COVER_STORAGE_KEY } from "@/lib/covers";
import { setDeviceSkin, useBadgeSkin } from "./useBadgeSkin";
import { GoldChip } from "./kit";

const SKINS: { key: BadgeSkin; label: string }[] = [
  { key: "classic", label: "Classic" },
  { key: "obsidian", label: "Obsidian" },
  { key: "rose", label: "Rose gold" },
];

export default function PacksScreen({ available, unlocked: unlocked0, skin: serverSkin, betaFree, cover }: { available: boolean; unlocked: string[]; skin: BadgeSkin; betaFree: boolean; cover: string | null }) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState<string[]>(unlocked0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(cover);
  const skin = useBadgeSkin();

  // The account's skin wins over a stale device copy (another phone may have changed it).
  useEffect(() => {
    if (available && skinAllowed(serverSkin, unlocked0)) setDeviceSkin(serverSkin);
  }, [available, serverSkin, unlocked0]);

  async function unlock(p: Pack) {
    setBusy(p.id);
    setError(null);
    const r = await unlockPack(p.id);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setUnlocked((u) => [...new Set([...u, p.id])]);
    router.refresh();
  }
  async function useCover(id: string) {
    setCurrent(id);
    try {
      localStorage.setItem(COVER_STORAGE_KEY, id);
    } catch {
      // Account copy only.
    }
    const r = await saveGoldCover(id);
    if (!r.ok && !r.missing) setError(r.error);
  }
  async function useSkin(s: BadgeSkin) {
    setDeviceSkin(s);
    const r = await saveBadgeSkin(s);
    if (!r.ok && !r.missing) setError(r.error);
  }

  const has = (id: string) => unlocked.includes(id);
  return (
    <>
      <section className="flex flex-col gap-2" style={{ background: "linear-gradient(150deg, #0B0B0C, #1d170c 70%, #2a2110)", color: "#F4F1EA", borderRadius: 26, padding: 20 }}>
        <GoldChip>BETA</GoldChip>
        <p className="display text-[26px] font-extrabold leading-tight" style={{ letterSpacing: "-0.03em" }}>
          Dress it up.
        </p>
        <p className="text-[13.5px]" style={{ opacity: 0.75 }}>
          Gold covers and new badge skins. They&rsquo;ll be paid packs later; during the beta every pack unlocks free.
        </p>
      </section>
      <ErrorNote text={error} />
      {!available ? <p className="px-1 text-[13px] muted">Unlocking opens with the next server update.</p> : null}

      {PACKS.map((p) => (
        <section key={p.id} aria-label={p.name} className="flex flex-col gap-3" style={{ background: "var(--card)", borderRadius: 22, padding: 16, boxShadow: "var(--pcard-ring)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-[16px] font-bold">{p.name}</span>
              <span className="text-[12.5px] muted">{p.blurb}</span>
            </div>
            {has(p.id) ? (
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={{ background: "var(--green-bg)", color: "var(--green-ink)" }}>
                Unlocked
              </span>
            ) : (
              <button type="button" disabled={!available || busy === p.id} onClick={() => void unlock(p)} className="press h-10 shrink-0 rounded-full px-3.5 text-[12.5px] font-bold" style={{ background: "linear-gradient(135deg, #fbe7a8, #D9B872 55%, #9c7a35)", color: "#1a1206", border: 0, opacity: available ? 1 : 0.5 }}>
                {busy === p.id ? "…" : priceLabel(p, betaFree)}
              </button>
            )}
          </div>

          {p.kind === "covers" ? (
            <div className="grid grid-cols-3 gap-2">
              {GOLD_COVERS.map((g) => (
                <button key={g.id} type="button" disabled={!has(p.id)} onClick={() => void useCover(g.id)} aria-label={`${g.name} gold cover${current === g.id ? ", current" : ""}`} className="press relative overflow-hidden rounded-[14px]" style={{ height: 62, border: 0, padding: 0, opacity: has(p.id) ? 1 : 0.55, boxShadow: current === g.id ? "0 0 0 2.5px #D9B872" : "var(--pcard-ring)" }}>
                  <Cover id={g.id} animate={false} align="middle" />
                  <span className="absolute bottom-1 left-1.5 text-[10px] font-semibold" style={{ color: "#fbe7a8", textShadow: "0 1px 2px #000" }}>
                    {g.name}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-end gap-4">
              {(["bronze", "silver", "gold"] as const).map((tier) => (
                <Jewel key={tier} category="streak" tier={tier} size={52} metal={SKIN_METAL[p.id === SKIN_PACK.obsidian ? "obsidian" : "rose"]} />
              ))}
            </div>
          )}
        </section>
      ))}

      <section aria-label="Badge skin" className="flex flex-col gap-2.5" style={{ background: "var(--card)", borderRadius: 22, padding: 16, boxShadow: "var(--pcard-ring)" }}>
        <p className="text-[15.5px] font-semibold">Badge skin</p>
        <div role="radiogroup" aria-label="Badge skin" className="grid grid-cols-3 gap-2">
          {SKINS.map((s) => {
            const ok = skinAllowed(s.key, unlocked);
            const on = skin === s.key;
            return (
              <button key={s.key} type="button" role="radio" aria-checked={on} disabled={!ok} onClick={() => void useSkin(s.key)} className="press flex h-12 items-center justify-center rounded-2xl text-[13.5px] font-semibold" style={{ background: on ? "var(--ink)" : "var(--card2)", color: on ? "var(--bg)" : "var(--ink)", border: 0, opacity: ok ? 1 : 0.45 }}>
                {s.label}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] muted">Your badges on Profile and the Trophy wall wear the skin.</p>
      </section>
    </>
  );
}
