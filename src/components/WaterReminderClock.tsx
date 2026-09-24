"use client";

import { useEffect } from "react";
import { scheduleWaterReminders } from "@/lib/waterReminders";

/** Keeps the in-tab water reminder timer running with the profile's window and interval. Renders nothing. */
export default function WaterReminderClock({ from, to, every }: { from: string; to: string; every: number }) {
  useEffect(() => {
    scheduleWaterReminders({ from, to, every });
  }, [from, to, every]);
  return null;
}
