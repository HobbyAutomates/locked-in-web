import type { Checkin, DayAdjust, Recovery } from "@/lib/v218/checkin";
import type { FestivalMode } from "@/lib/v218/festival";
import type { CycleDay, CycleSettings } from "@/lib/v218/cycle";
import type { Supplement } from "@/lib/v218/supplements";
import type { Consistency } from "@/lib/v218/consistency";
import type { Plateau } from "@/lib/v218/plateau";
import type { WeekFacts, WeekPlan } from "@/lib/v218/weekly";
import type { Why } from "@/lib/v218/targetsWhy";

/** Client-side shapes of the /api/coach/* v2.18 responses (mirrors coachPlusServer.ts). */
export type SupplementRow = Supplement & { takenToday: boolean; current: number; best: number; due: boolean };
export type SupplementsState = { date: string; available: boolean; items: SupplementRow[]; allStreak: number };

export type DailyState = {
  date: string;
  checkinAvailable: boolean;
  checkin: Checkin | null;
  adjust: DayAdjust;
  recovery: Recovery | null;
  targets: { base: number; kcal: number; bump: number; reasons: string[] };
  festival: { available: boolean; active: FestivalMode | null; upcoming: { mode: FestivalMode; inDays: number } | null; line: string | null; modes: FestivalMode[] };
  cycle: { available: boolean; enabled: boolean; today: CycleDay | null };
  supplements: { available: boolean; items: SupplementRow[]; allStreak: number };
  teen: boolean;
};

export type InsightsState = {
  consistency: Consistency;
  plateau: Plateau;
  weekly: { weekStart: string; text: string; plan: WeekPlan; facts: WeekFacts; stored: boolean } | null;
  why: (Why & { oldTarget: number; newTarget: number; weekStart: string }) | null;
};

export type ModesState = { date: string; festival: { available: boolean; modes: FestivalMode[] }; cycle: { available: boolean; settings: CycleSettings; today: CycleDay | null } };
