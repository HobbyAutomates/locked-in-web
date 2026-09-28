"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setWaterFromFood } from "@/lib/food/foodActions";
import { Card, Toggle } from "../ui";
import { refreshFoodHome, useFoodHome } from "./FoodHome";

/**
 * v2.18 A10 on the Water page: "Count water in food" (off by default). When on, dal, chaas, curd,
 * fruit, tea, soups… add their water to the day's total on Home (lib/food/foodBits.waterMl).
 * Hidden until schema_v42 (profiles.water_from_food) is there.
 */
export default function WaterFromFoodCard() {
  const router = useRouter();
  const h = useFoodHome();
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!h || h.waterFromFood === null) return null;
  const value = on ?? h.waterFromFood;
  async function change(v: boolean) {
    setOn(v);
    setError(null);
    const r = await setWaterFromFood(v);
    if (!r.ok) {
      setOn(!v);
      setError(r.error);
      return;
    }
    refreshFoodHome();
    router.refresh();
  }
  return (
    <Card padding={18}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">Count water in food</p>
          <p className="mt-0.5 text-[12px] leading-[17px] muted">Dal, chaas, curd, fruit, tea and soups add their water to your day. Off by default.</p>
        </div>
        <Toggle on={value} onChange={(v) => void change(v)} label="Count water in food" />
      </div>
      {error ? <p className="mt-1.5 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </Card>
  );
}
