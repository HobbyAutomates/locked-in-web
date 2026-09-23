import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>[l.split("=")[0],l.split("=").slice(1).join("=").trim()]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: "bandlog" } });
const rows = JSON.parse(fs.readFileSync("data/activities.json","utf8")).map(r => ({ ...r, source: "compendium2024" }));
// Everyday + band-specific extras (Compendium 2024 codes where they exist).
rows.push(
  { code:"LI-17190", name:"walking", description:"3.0 mph, level, moderate pace", met:3.5, category:"walking", tags:["walk"], source:"compendium2024" },
  { code:"LI-17200", name:"walking", description:"brisk, 3.5-4 mph", met:4.3, category:"walking", tags:["brisk walk"], source:"compendium2024" },
  { code:"LI-17133", name:"stair climbing", description:"general", met:8.8, category:"walking", tags:["stairs"], source:"compendium2024" },
  { code:"LI-02101", name:"yoga", description:"hatha", met:2.5, category:"conditioningExercise", tags:["yoga"], source:"compendium2024" },
  { code:"LI-02105", name:"yoga", description:"surya namaskar / power yoga", met:3.3, category:"conditioningExercise", tags:["surya namaskar"], source:"compendium2024" },
  { code:"LI-15150", name:"cricket", description:"batting, bowling, fielding", met:4.8, category:"sport", tags:["cricket"], source:"compendium2024" },
  { code:"LI-15030", name:"badminton", description:"social singles and doubles", met:5.5, category:"sport", tags:["badminton"], source:"compendium2024" },
  { code:"LI-15551", name:"jump rope", description:"skipping, moderate", met:11.0, category:"conditioningExercise", tags:["skipping"], source:"compendium2024" },
  { code:"LI-BAND-L", name:"resistance bands", description:"light band, steady sets", met:3.5, category:"conditioningExercise", tags:["bands","Light"], source:"lockedin" },
  { code:"LI-BAND-M", name:"resistance bands", description:"medium band, breaking a sweat", met:5.0, category:"conditioningExercise", tags:["bands","Medium"], source:"lockedin" },
  { code:"LI-BAND-H", name:"resistance bands", description:"heavy band, near failure", met:6.0, category:"conditioningExercise", tags:["bands","Heavy"], source:"lockedin" },
  { code:"LI-05010", name:"home chores", description:"cleaning, sweeping, moderate", met:3.0, category:"home", tags:["chores"], source:"compendium2024" },
);
for (let i = 0; i < rows.length; i += 200) {
  const { error } = await db.from("activities").upsert(rows.slice(i, i + 200), { onConflict: "code" });
  if (error) { console.error(error.message); process.exit(1); }
}
const { count } = await db.from("activities").select("*", { count: "exact", head: true });
console.log("activities in db:", count);
