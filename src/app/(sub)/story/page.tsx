import SubPage from "@/components/SubPage";
import StoryScreen from "@/components/social/StoryScreen";
import { getWeights } from "@/lib/data";
import { getPhotos } from "@/lib/platform-data";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";
import { storyFrames } from "@/lib/social/story";

export const dynamic = "force-dynamic";

/** v2.18 D10 /story: an opt-in before / after timeline from progress photos and weights, as a reel. */
export default async function StoryPage() {
  const [lang, photos, weights] = await Promise.all([getLang(), getPhotos(120), getWeights()]);
  const frames = storyFrames(
    photos.photos.map((p) => ({ date: p.date, url: p.url, weight_kg: p.weight_kg ?? null })),
    weights.map((w) => ({ date: w.date, weight_kg: w.weight_kg })),
  );
  return (
    <SubPage title={t("story.title", lang)} back="/social">
      <StoryScreen frames={frames} />
    </SubPage>
  );
}
