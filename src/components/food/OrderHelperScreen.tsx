"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveMeal } from "@/lib/actions";
import { today } from "@/lib/dates";
import { makeThumb, postJson, toJpegBase64 } from "@/lib/image";
import { defaultMealType, mealTypeLabel, type MealType } from "@/lib/mealType";
import { midKcal, midProtein } from "@/lib/menuScan";
import { fractionLabel, scaleMealItem } from "@/lib/food/foodBits";
import { orderPlan, planItems, type OrderDish, type OrderPlan } from "@/lib/food/orderHelper";
import type { OrderResult } from "@/lib/food/orderFlow";
import { saveLeftover } from "@/lib/food/foodActions";
import type { MealItem } from "@/lib/types";
import SubPage from "../SubPage";
import { LineIcon } from "../lineIcons";
import { MRise } from "../motion";
import { Spinner } from "../icons";
import { ErrorNote, fmt } from "../ui";
import { AccentButton, GhostButton, PCard, Pill } from "../nutrition/kit";
import { MealSlotChips } from "../scan/LogIt";

const STEPS = [0, 0.25, 0.5, 0.75, 1];

/**
 * v2.18 A4 restaurant and delivery helper: paste a Swiggy / Zomato order or add a screenshot of it
 * (or go to Scan → Menu for a menu). You get each dish with an honest range, a plan for what's left
 * today (protein first, the naan and dessert shrink), and "Pre-log" saves the plan into a meal. What
 * you don't eat can wait as leftovers.
 */
export default function OrderHelperScreen({ hideNumbers = false }: { hideNumbers?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<OrderResult | null>(null);
  const [eat, setEat] = useState<number[]>([]);
  const [slot, setSlot] = useState<MealType>(() => defaultMealType());
  const [saved, setSaved] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function read(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setRes(null);
    setSaved(null);
    try {
      const r = await postJson<OrderResult>("/api/order-helper", body);
      setRes(r);
      setEat(r.plan.rows.map((x) => x.eat));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that order");
    } finally {
      setBusy(false);
    }
  }

  async function screenshot(file: File | undefined) {
    if (!file) return;
    try {
      const [out] = await Promise.all([toJpegBase64(file, 1600, 0.86), makeThumb(file)]);
      await read({ image: out.base64, media_type: out.media_type, text: text.trim() || undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that image");
    }
  }

  const dishes: OrderDish[] = res?.dishes ?? [];
  // The person's own plan: the server's suggestion, with each dish's portion changeable.
  const plan: OrderPlan | null = res ? { ...orderPlan(dishes, res.remaining), rows: dishes.map((d, index) => ({ index, eat: eat[index] ?? 0, kcal: Math.round(midKcal(d) * d.qty * (eat[index] ?? 0)), protein: Math.round(midProtein(d) * d.qty * (eat[index] ?? 0)), line: "" })) } : null;
  const planKcal = plan ? plan.rows.reduce((a, r) => a + r.kcal, 0) : 0;
  const planProtein = plan ? plan.rows.reduce((a, r) => a + r.protein, 0) : 0;

  async function prelog() {
    if (!res || !plan) return;
    const items = planItems(dishes, plan);
    if (!items.length) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveMeal({ date: today(), raw_text: `${res.restaurant ? `${res.restaurant} order` : "Delivery order"} (pre-logged)`, items, meal_type: slot });
      // What isn't eaten from the order waits as leftovers (quietly skipped before schema_v42).
      const rest: MealItem[] = [];
      dishes.forEach((d, i) => {
        const e = eat[i] ?? 0;
        if (e >= 1) return;
        const whole = planItems([d], { ...plan, rows: [{ index: 0, eat: 1, kcal: 0, protein: 0, line: "" }] })[0];
        if (whole) rest.push(scaleMealItem(whole, 1 - e));
      });
      const orderKcal = plan.total_kcal || 1;
      const restKcal = rest.reduce((a, x) => a + x.calories, 0);
      const leftFraction = Math.min(0.95, Math.max(0.05, Math.round((restKcal / orderKcal) * 100) / 100));
      if (rest.length) await saveLeftover({ name: `${res.restaurant ? `${res.restaurant} ` : ""}order leftovers`, items: rest, fraction_left: leftFraction, meal_id: saved.id }).catch(() => null);
      setSaved(`Pre-logged ${planKcal} kcal to ${mealTypeLabel(slot)}${rest.length ? ". The rest waits as leftovers" : ""}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SubPage title="Eating out">
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void screenshot(e.target.files?.[0]); e.target.value = ""; }} />
      <MRise>
        <PCard label="Your order">
          <p className="text-[15px] font-semibold">Paste your Swiggy or Zomato order</p>
          <textarea className="field" rows={5} style={{ minHeight: 120, paddingTop: 10 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"2 x Butter Naan\nPaneer Tikka x 1\nDal Makhani"} aria-label="Order text" />
          <div className="grid grid-cols-2 gap-2">
            <GhostButton onClick={() => fileRef.current?.click()} disabled={busy}>
              <LineIcon name="camera" size={16} /> Screenshot
            </GhostButton>
            <AccentButton onClick={() => void read({ text })} disabled={busy || !text.trim()}>
              {busy ? <Spinner size={16} /> : "Plan it"}
            </AccentButton>
          </div>
          <Link href="/scan" className="text-center text-[13px] font-semibold muted underline">
            At the restaurant? Scan the menu instead (Scan → Menu)
          </Link>
        </PCard>
      </MRise>
      {busy && !res ? (
        <p className="flex items-center justify-center gap-2 text-[13px] muted">
          <Spinner size={14} /> Pricing each dish and planning for what&apos;s left today… 10–30 s
        </p>
      ) : null}
      <ErrorNote text={error} />

      {res && plan ? (
        <>
          <MRise>
            <PCard label="The plan">
              <p className="text-[15px] font-semibold leading-snug">{res.plan.headline}</p>
              {!hideNumbers ? (
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone="accent">This plan · {planKcal} kcal</Pill>
                  <Pill tone="good">{planProtein} g protein</Pill>
                  <Pill>Left today · {res.remaining.kcal} kcal</Pill>
                </div>
              ) : null}
              {res.note ? <p className="text-[12px] muted">{res.note}</p> : null}
            </PCard>
          </MRise>
          <MRise delay={60}>
            <PCard label="Dishes" padding={8}>
              {dishes.map((d, i) => (
                <div key={`${d.name}-${i}`} className="flex flex-col gap-1.5 px-2.5 py-2.5" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-tight">
                        {d.qty > 1 ? `${d.qty} × ` : ""}
                        {d.name}
                      </span>
                      <span className="num block text-[12px] muted">
                        {hideNumbers ? "" : `${d.kcal_low}–${d.kcal_high} kcal · `}
                        {fmt(d.protein_low)}–{fmt(d.protein_high)} g protein each · {d.confidence} confidence
                        {!d.fits_diet ? ` · not ${res.diet_mode}` : ""}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`How much of ${d.name}`}>
                    {STEPS.map((f) => (
                      <button key={f} type="button" role="radio" aria-checked={(eat[i] ?? 0) === f} className="chip press" style={{ height: 30, fontSize: 12, padding: "0 10px" }} onClick={() => setEat((cur) => cur.map((x, j) => (j === i ? f : x)))}>
                        {f === 0 ? "Skip" : fractionLabel(f)}
                      </button>
                    ))}
                    {res.plan.rows[i] && res.plan.rows[i].eat !== 1 ? <span className="ml-1 text-[11px] muted">Suggested: {res.plan.rows[i].eat === 0 ? "skip / share" : fractionLabel(res.plan.rows[i].eat)}</span> : null}
                  </div>
                </div>
              ))}
            </PCard>
          </MRise>
          <MRise delay={100}>
            <div className="flex flex-col gap-2.5">
              <MealSlotChips value={slot} onChange={setSlot} />
              <AccentButton onClick={() => void prelog()} disabled={busy || !!saved || planKcal <= 0}>
                {busy ? <Spinner size={16} /> : saved ? "Pre-logged" : `Pre-log this plan to ${mealTypeLabel(slot)}`}
              </AccentButton>
              {saved ? <p className="text-center text-[13px] font-semibold" style={{ color: "var(--green)" }}>{saved}</p> : null}
            </div>
          </MRise>
        </>
      ) : null}
    </SubPage>
  );
}
