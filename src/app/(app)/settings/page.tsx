import { getProfile } from "@/lib/data";
import { signOut } from "@/lib/actions";
import TargetsForm from "@/components/TargetsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfile();
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="label">Targets</p>
        <h1 className="text-4xl font-extrabold">Settings</h1>
      </header>
      <TargetsForm profile={profile} />
      <section className="card">
        <h2 className="text-lg font-bold mb-1">Voice logging</h2>
        <p className="text-sm muted">
          Open Today, tap the box, and dictate with Wispr Flow. Say grams when you know them, or household units like “2 rotis”, “a bowl of dal”, “one scoop whey”. Rice and dal are treated as cooked weights unless you say raw.
        </p>
      </section>
      <form action={signOut}>
        <button className="btn btn-ghost w-full" type="submit">Sign out</button>
      </form>
    </div>
  );
}
