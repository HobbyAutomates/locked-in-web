import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang, type Lang } from "./i18n";

/** v2.18 E2: the UI language for a server component (the `li-lang` cookie; English by default). */
export async function getLang(): Promise<Lang> {
  try {
    const jar = await cookies();
    return parseLang(jar.get(LANG_COOKIE)?.value);
  } catch {
    return "en";
  }
}
