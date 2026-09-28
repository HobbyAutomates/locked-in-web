"use client";

import { useSyncExternalStore } from "react";
import { SKIN_KEY, parseSkin, type BadgeSkin } from "@/lib/social/packs";

/**
 * v2.18 D11: the badge skin this device shows (Packs → Badge skins). Server render and first paint
 * are "classic"; the chosen skin applies right after hydration. Changes broadcast in-tab.
 */
const EVENT = "li-badge-skin";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function read(): BadgeSkin {
  try {
    return parseSkin(localStorage.getItem(SKIN_KEY));
  } catch {
    return "classic";
  }
}

export function useBadgeSkin(): BadgeSkin {
  return useSyncExternalStore(subscribe, read, () => "classic");
}

export function setDeviceSkin(skin: BadgeSkin) {
  try {
    if (skin === "classic") localStorage.removeItem(SKIN_KEY);
    else localStorage.setItem(SKIN_KEY, skin);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // Private mode: the skin shows on this page only.
  }
}
