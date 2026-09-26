import { redirect } from "next/navigation";

/** v2.14: the first-run flow moved to /start (the new value-first onboarding). Old links still work. */
export default function OnboardingPage() {
  redirect("/start");
}
