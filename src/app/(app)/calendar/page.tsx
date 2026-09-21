import { getDashboard } from "@/lib/data";
import CalendarView from "@/components/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { today, workouts, meals } = await getDashboard();
  const mealDates = Array.from(new Set(meals.map((m) => m.date)));
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="label">Training</p>
        <h1 className="text-4xl font-extrabold">Calendar</h1>
      </header>
      <CalendarView today={today} workouts={workouts} mealDates={mealDates} />
    </div>
  );
}
