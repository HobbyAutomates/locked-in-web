"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGS, LANG_COOKIE, LANG_EVENT, LANG_STORAGE_KEY, parseLang, t, type Lang } from "@/lib/social/i18n";
import { saveUiLang } from "@/lib/social/actions";

function readLang(): Lang {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]*)`));
    return parseLang(m?.[1] ?? localStorage.getItem(LANG_STORAGE_KEY));
  } catch {
    return "en";
  }
}

/** v2.18 E2: Preferences → Language. Device first (cookie + localStorage), then profiles.ui_lang. */
export default function LanguagePicker() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => setLang(readLang()), []);

  function pick(l: Lang) {
    setLang(l);
    try {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      localStorage.setItem(LANG_STORAGE_KEY, l);
      window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: l }));
    } catch {
      // Cookie blocked: this page still switches.
    }
    void saveUiLang(l).catch(() => undefined);
    router.refresh();
  }

  return (
    <section aria-label={t("lang.title", lang)} className="flex flex-col gap-3" style={{ background: "var(--card)", borderRadius: 22, padding: 16, boxShadow: "var(--pcard-ring)" }}>
      <div className="flex flex-col gap-0.5 px-1">
        <p className="text-[15.5px] font-semibold">{t("lang.title", lang)}</p>
        <p className="text-[12.5px] leading-4 muted">{t("lang.sub", lang)}</p>
      </div>
      <div role="radiogroup" aria-label={t("lang.title", lang)} className="grid grid-cols-3 gap-2">
        {LANGS.map((l) => {
          const on = l.key === lang;
          return (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(l.key)}
              className="press flex h-12 flex-col items-center justify-center rounded-2xl text-[14px] font-semibold"
              style={{ background: on ? "var(--ink)" : "var(--card2)", color: on ? "var(--bg)" : "var(--ink)", border: 0 }}
            >
              {l.native}
            </button>
          );
        })}
      </div>
    </section>
  );
}
