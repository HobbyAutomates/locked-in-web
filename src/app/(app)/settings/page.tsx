import { redirect } from "next/navigation";

/** Settings became Profile in v1.5; old bookmarks land in the right place. */
export default function SettingsPage() {
  redirect("/profile");
}
