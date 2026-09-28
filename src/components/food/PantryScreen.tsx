"use client";

import { useEffect, useState } from "react";
import { deletePantry, listPantry, loadGrocery, setPantryStock, upsertPantry, type PantryItem } from "@/lib/food/foodActions";
import { PANTRY_CATEGORIES, groceryText, type GroceryItem } from "@/lib/food/grocery";
import SubPage from "../SubPage";
import { LineIcon } from "../lineIcons";
import { MRise } from "../motion";
import { Close, Spinner } from "../icons";
import { ErrorNote } from "../ui";
import { AccentButton, ComingSoon, PCard, Pill } from "../nutrition/kit";

/**
 * v2.18 A11 pantry + weekly grocery list. The list comes from what you actually ate over the last two
 * weeks (roti → atta, dal → toor dal…), scaled to a week, plus protein staples when your average is
 * short of the target. Anything in the pantry marked in stock drops off the list. Tick items off as
 * you shop (on this device), or copy / share the list.
 */
export default function PantryScreen() {
  const [tab, setTab] = useState<"list" | "pantry">("list");
  const [grocery, setGrocery] = useState<{ list: GroceryItem[]; days: number; avgProtein: number; proteinTarget: number; pantryAvailable: boolean } | null>(null);
  const [pantry, setPantry] = useState<PantryItem[] | null>(null);
  const [pantryOff, setPantryOff] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function fetchAll() {
    return Promise.all([loadGrocery(), listPantry()]);
  }
  function apply([g, p]: Awaited<ReturnType<typeof fetchAll>>) {
    if (g.ok) setGrocery(g);
    else setError(g.error);
    if (p.ok) setPantry(p.items);
    else if (p.unavailable) setPantryOff(true);
  }
  const reload = () => fetchAll().then(apply);
  useEffect(() => {
    let live = true;
    void fetchAll().then((r) => {
      if (!live) return;
      apply(r);
      try {
        const raw = window.localStorage.getItem("li.grocery.ticked");
        if (raw) setTicked(new Set(JSON.parse(raw) as string[]));
      } catch {
        // ticks are a per-device nicety
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on open
  }, []);

  function tick(key: string) {
    setTicked((cur) => {
      const n = new Set(cur);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      try {
        window.localStorage.setItem("li.grocery.ticked", JSON.stringify([...n]));
      } catch {
        // fine
      }
      return n;
    });
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    const r = await upsertPantry({ name: n, in_stock: true });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setName("");
    await reload();
  }

  async function share() {
    if (!grocery) return;
    const body = `Groceries for the week\n${groceryText(grocery.list)}`;
    try {
      if (navigator.share) await navigator.share({ title: "Grocery list", text: body });
      else {
        await navigator.clipboard.writeText(body);
        setCopied(true);
      }
    } catch {
      // share sheet closed
    }
  }

  const pending = (grocery?.list ?? []).filter((i) => !i.inPantry);
  const stocked = (grocery?.list ?? []).filter((i) => i.inPantry);

  return (
    <SubPage title="Pantry & groceries">
      <MRise>
        <div className="grid grid-cols-2 gap-1 rounded-2xl p-1" style={{ background: "var(--card2)" }} role="tablist">
          {(["list", "pantry"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className="press h-10 rounded-xl text-[14px] font-semibold" style={{ background: tab === t ? "var(--card)" : "transparent", color: "var(--ink)", border: 0, boxShadow: tab === t ? "var(--shadow-sm)" : undefined }} onClick={() => setTab(t)}>
              {t === "list" ? "This week's list" : "My pantry"}
            </button>
          ))}
        </div>
      </MRise>
      <ErrorNote text={error} />

      {tab === "list" ? (
        !grocery ? (
          <p className="flex items-center justify-center gap-2 py-6 text-[13px] muted">
            <Spinner size={14} /> Building your list…
          </p>
        ) : (
          <>
            <MRise delay={40}>
              <PCard label="About this list">
                <p className="text-[13px] leading-[19px] muted">
                  From {grocery.days} day{grocery.days === 1 ? "" : "s"} of your logs, scaled to a week.
                  {grocery.proteinTarget > 0 ? ` You average ${grocery.avgProtein} g protein a day against ${grocery.proteinTarget} g.` : ""}
                </p>
                <div className="flex gap-2">
                  <AccentButton onClick={() => void share()} className="flex-1">
                    <LineIcon name="share" size={16} /> {copied ? "Copied" : "Share the list"}
                  </AccentButton>
                </div>
              </PCard>
            </MRise>
            {PANTRY_CATEGORIES.map((c) => {
              const rows = pending.filter((i) => i.category === c.key);
              if (!rows.length) return null;
              return (
                <MRise key={c.key} delay={80}>
                  <PCard label={c.label} padding={8}>
                    <p className="px-2.5 pt-1.5 text-[13px] font-semibold muted">{c.label}</p>
                    {rows.map((i) => (
                      <button key={i.key} type="button" role="checkbox" aria-checked={ticked.has(i.key)} onClick={() => tick(i.key)} className="press flex min-h-[52px] w-full items-center gap-3 px-2.5 text-left" style={{ background: "none", border: 0, color: "var(--ink)" }}>
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ boxShadow: "inset 0 0 0 1.5px var(--hair)", background: ticked.has(i.key) ? "var(--accent)" : "transparent", color: "var(--accent-ink)" }}>
                          {ticked.has(i.key) ? <LineIcon name="check" size={14} /> : null}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[15px] font-semibold" style={{ textDecoration: ticked.has(i.key) ? "line-through" : undefined, opacity: ticked.has(i.key) ? 0.55 : 1 }}>
                            {i.name}
                          </span>
                          <span className="truncate text-[12px] muted">{i.why}</span>
                        </span>
                        <span className="num shrink-0 text-[13px] font-semibold">{i.qty}</span>
                      </button>
                    ))}
                  </PCard>
                </MRise>
              );
            })}
            {stocked.length ? (
              <MRise delay={120}>
                <p className="px-1 text-[12px] muted">In your pantry, so not on the list: {stocked.map((i) => i.name).join(", ")}</p>
              </MRise>
            ) : null}
          </>
        )
      ) : pantryOff ? (
        <ComingSoon what="Pantry" />
      ) : (
        <>
          <MRise delay={40}>
            <div className="flex gap-2">
              <input className="field min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder="Add: atta, toor dal, paneer…" aria-label="Pantry item" />
              <AccentButton onClick={() => void add()} disabled={busy || !name.trim()}>
                {busy ? <Spinner size={16} /> : "Add"}
              </AccentButton>
            </div>
          </MRise>
          <MRise delay={80}>
            <PCard label="Pantry" padding={8}>
              {pantry === null ? <Spinner size={16} /> : null}
              {pantry && !pantry.length ? <p className="px-2.5 py-3 text-[13px] muted">Add what you keep at home. Items in stock drop off your grocery list.</p> : null}
              {(pantry ?? []).map((p, i) => (
                <div key={p.id} className="flex min-h-[52px] items-center gap-2 px-2.5" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" style={{ opacity: p.in_stock ? 1 : 0.55 }}>
                    {p.name}
                  </span>
                  <button type="button" className="press" style={{ background: "none", border: 0, padding: 0 }} onClick={() => void setPantryStock(p.id, !p.in_stock).then(reload)}>
                    <Pill tone={p.in_stock ? "good" : "warn"}>{p.in_stock ? "In stock" : "Ran out"}</Pill>
                  </button>
                  <button type="button" aria-label={`Remove ${p.name}`} className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "none", border: 0, color: "var(--muted)" }} onClick={() => void deletePantry(p.id).then(reload)}>
                    <Close size={14} />
                  </button>
                </div>
              ))}
            </PCard>
          </MRise>
        </>
      )}
    </SubPage>
  );
}
