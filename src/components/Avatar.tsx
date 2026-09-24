"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avatarUrl } from "@/lib/display";
import { squareAvatar } from "@/lib/image";
import { Camera, Spinner } from "./icons";

/** A round profile picture: the public avatar when there is one, else the name's first letter. */
export function Avatar({ path, name, size = 44, fontSize }: { path: string | null | undefined; name: string; size?: number; fontSize?: number }) {
  const url = avatarUrl(path);
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- public Storage URL with a ?v= cache-buster
      <img src={url} alt="" width={size} height={size} onError={() => setBroken(true)} className="block rounded-full object-cover" style={{ width: size, height: size, background: "var(--card2)" }} />
    );
  }
  return (
    <span className="grid place-items-center rounded-full font-bold" style={{ width: size, height: size, background: "var(--card2)", fontSize: fontSize ?? Math.round(size * 0.4) }} aria-hidden="true">
      {(name.trim() || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Tap-to-change avatar for the Profile header. Picks an image (phones offer the camera too),
 * centre-crops it square, shrinks it to <= 512 px JPEG, uploads it to avatars/<uid>/avatar.jpg with
 * the user's own session (upsert), then stores "<uid>/avatar.jpg?v=<ms>" on the profile — the ?v
 * busts every cache so the new face shows everywhere at once.
 */
export function AvatarPicker({ userId, path, name, size = 56, onError }: { userId: string; path: string | null; name: string; size?: number; onError: (msg: string | null) => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(path);
  const [busy, setBusy] = useState(false);

  async function onPick(file: File | undefined) {
    if (!file || !userId) return;
    setBusy(true);
    onError(null);
    try {
      const blob = await squareAvatar(file, 512, 0.85);
      const supabase = createClient();
      const key = `${userId}/avatar.jpg`;
      const up = await supabase.storage.from("avatars").upload(key, blob, { upsert: true, contentType: "image/jpeg" });
      if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
      const next = `${key}?v=${Date.now()}`;
      const { error } = await supabase.from("profiles").update({ avatar_path: next }).eq("id", userId);
      if (error) throw new Error(`Couldn't save your photo: ${error.message}`);
      setCurrent(next);
      router.refresh();
    } catch (e) {
      console.error("[AvatarPicker]", e);
      onError(e instanceof Error ? e.message : "Couldn't change your photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="press relative shrink-0 rounded-full" style={{ width: size, height: size, padding: 0, border: 0, background: "none" }} aria-label="Change profile photo" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Avatar path={current} name={name} size={size} />
        <span className="absolute grid place-items-center rounded-full" style={{ right: -2, bottom: -2, width: 22, height: 22, background: "var(--btn)", color: "var(--btn-ink)", border: "2px solid var(--card)" }}>
          {busy ? <Spinner size={11} /> : <Camera size={12} />}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}
