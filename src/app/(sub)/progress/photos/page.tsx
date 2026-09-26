import { getProfile, getWeights } from "@/lib/data";
import { getPhotos, getPro } from "@/lib/platform-data";
import PhotosScreen from "@/components/platform/PhotosScreen";

export const dynamic = "force-dynamic";

/** v2.13 Progress → Progress photos (manager, before/after, share to squad). */
export default async function PhotosPage() {
  const [{ photos, extended }, weights, profile, pro] = await Promise.all([getPhotos(), getWeights(), getProfile(), getPro()]);
  return <PhotosScreen photos={photos} extended={extended} weights={weights} units={profile.units} pro={pro.pro} />;
}
