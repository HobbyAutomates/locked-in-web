import { avatarUrl } from "./display";
import { squareAvatar } from "./image";
import { createClient } from "./supabase/client";

/**
 * v2.6: an uploaded squad photo (browser only) — square 512 px JPEG in the public `avatars` bucket
 * under the uploader's folder, returned as its public URL for `groups.cover_url`.
 */
export async function uploadSquadPhoto(file: File, userId: string): Promise<string> {
  const blob = await squareAvatar(file, 512, 0.85);
  const key = `${userId}/squad-${Date.now()}.jpg`;
  const up = await createClient().storage.from("avatars").upload(key, blob, { upsert: false, contentType: "image/jpeg" });
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
  return avatarUrl(key) as string;
}
