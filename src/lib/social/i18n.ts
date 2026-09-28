/**
 * v2.18 E2 UI language: English, Hinglish (Roman) and Hindi (Devanagari). Stored on the device
 * (web: localStorage + the `li-lang` cookie so server components render the right words;
 * Android: SharedPreferences) and mirrored to profiles.ui_lang (schema_v45) when it exists.
 *
 * Coverage in v2.18: the bottom bar and its dial, the offline chip, Preferences → Language, and
 * every v2.18 screen (Social hub, streak freezes, invites, wrapped, pledges, events, coach access,
 * packs, export, delete account). Older screens stay English until they're moved onto t().
 * Android: util/I18n.kt with the same keys and strings.
 */
export type Lang = "en" | "hinglish" | "hi";
export const LANGS: { key: Lang; label: string; native: string }[] = [
  { key: "en", label: "English", native: "English" },
  { key: "hinglish", label: "Hinglish", native: "Hinglish" },
  { key: "hi", label: "Hindi", native: "हिन्दी" },
];
export const LANG_COOKIE = "li-lang";
export const LANG_STORAGE_KEY = "li-lang";
export const LANG_EVENT = "li-lang-change";

export function parseLang(v: unknown): Lang {
  return v === "hinglish" || v === "hi" ? v : "en";
}

type Entry = [en: string, hinglish: string, hi: string];

export const STRINGS = {
  "nav.home": ["Home", "Home", "होम"],
  "nav.squad": ["Squad", "Squad", "स्क्वॉड"],
  "nav.scan": ["Scan", "Scan", "स्कैन"],
  "nav.progress": ["Progress", "Progress", "प्रगति"],
  "nav.profile": ["Profile", "Profile", "प्रोफ़ाइल"],
  "dial.food": ["Food", "Khana", "खाना"],
  "dial.food.sub": ["type or talk", "likho ya bolo", "लिखें या बोलें"],
  "dial.activity": ["Activity", "Activity", "एक्टिविटी"],
  "dial.water": ["Water +1 glass", "Paani +1 glass", "पानी +1 गिलास"],
  "sync.waiting": ["{n} waiting to sync", "{n} sync hone baaki", "{n} सिंक होना बाकी"],
  "sync.waiting.one": ["1 waiting to sync", "1 sync hona baaki", "1 सिंक होना बाकी"],
  "sync.offline": ["You're offline. Logs are saved on this phone.", "Offline ho. Logs phone pe save hain.", "आप ऑफ़लाइन हैं। लॉग इसी फ़ोन में सेव हैं।"],
  "sync.syncing": ["Syncing…", "Sync ho raha hai…", "सिंक हो रहा है…"],
  "sync.done": ["All synced", "Sab sync ho gaya", "सब सिंक हो गया"],
  "sync.queued": ["Saved offline. It'll sync when you're back online.", "Offline save hua. Net aate hi sync hoga.", "ऑफ़लाइन सेव हुआ। इंटरनेट आते ही सिंक होगा।"],
  "social.title": ["Social and rewards", "Social aur rewards", "सोशल और इनाम"],
  "social.sub": ["Freezes, invites, wrapped, pledges and more", "Freeze, invite, wrapped, pledge aur bahut kuch", "फ़्रीज़, इनवाइट, रैप्ड, संकल्प और भी"],
  "streak.title": ["Streak freezes", "Streak freeze", "स्ट्रीक फ़्रीज़"],
  "streak.sub": ["Miss a day without losing the streak", "Ek din miss, streak safe", "एक दिन छूटे, स्ट्रीक बची रहे"],
  "invite.title": ["Invite friends", "Dost ko bulao", "दोस्तों को बुलाएँ"],
  "invite.sub": ["You both get a week of Pro", "Dono ko ek hafte ka Pro", "दोनों को एक हफ़्ते का Pro"],
  "wrapped.title": ["Wrapped", "Wrapped", "रैप्ड"],
  "wrapped.sub": ["Your week, month and year as story cards", "Hafta, mahina, saal: story cards mein", "आपका हफ़्ता, महीना और साल, स्टोरी कार्ड में"],
  "pledges.title": ["Pledges", "Pledge", "संकल्प"],
  "pledges.sub": ["Put something on the line", "Kuch daav pe lagao", "कुछ दांव पर लगाएँ"],
  "events.title": ["Seasonal events", "Seasonal events", "मौसमी इवेंट"],
  "events.sub": ["Limited-edition jewellery", "Limited edition jewellery", "सीमित संस्करण के बैज"],
  "coach.title": ["Coach access", "Coach access", "कोच एक्सेस"],
  "coach.sub": ["Let a trainer or dietitian see your logs", "Trainer ya dietitian ko logs dikhao", "ट्रेनर या डाइटिशियन को लॉग दिखाएँ"],
  "clients.title": ["My clients", "Mere clients", "मेरे क्लाइंट"],
  "story.title": ["Transformation story", "Transformation story", "बदलाव की कहानी"],
  "story.sub": ["Before and after, as a short reel", "Pehle aur baad, ek chhoti reel", "पहले और बाद, एक छोटी रील"],
  "packs.title": ["Covers and badge packs", "Covers aur badge packs", "कवर और बैज पैक"],
  "packs.sub": ["Free during the beta", "Beta mein free", "बीटा में मुफ़्त"],
  "leagues.title": ["Squad leagues", "Squad leagues", "स्क्वॉड लीग"],
  "export.title": ["Export my data", "Mera data export karo", "मेरा डेटा एक्सपोर्ट करें"],
  "export.sub": ["CSV or a printable PDF", "CSV ya print hone wala PDF", "CSV या प्रिंट होने वाला PDF"],
  "delete.title": ["Delete account", "Account delete karo", "अकाउंट डिलीट करें"],
  "delete.sub": ["Wipes your data for good", "Aapka data hamesha ke liye mit jayega", "आपका डेटा हमेशा के लिए मिट जाएगा"],
  "lang.title": ["Language", "Bhasha", "भाषा"],
  "lang.sub": ["App text. Food search also knows Marathi, Tamil and Bengali names.", "App ka text. Food search Marathi, Tamil aur Bangla naam bhi samajhta hai.", "ऐप का टेक्स्ट। खाने की खोज मराठी, तमिल और बांग्ला नाम भी समझती है।"],
  "common.soon": ["Coming with the next update", "Agle update mein aa raha hai", "अगले अपडेट में आ रहा है"],
  "common.share": ["Share", "Share karo", "शेयर करें"],
  "common.save": ["Save", "Save karo", "सेव करें"],
  "common.cancel": ["Cancel", "Cancel", "रद्द करें"],
  "squad.report": ["Report", "Report karo", "रिपोर्ट करें"],
  "squad.block": ["Block", "Block karo", "ब्लॉक करें"],
  "squad.unblock": ["Unblock", "Unblock karo", "अनब्लॉक करें"],
  "squad.live": ["{name} is training now 🔥", "{name} abhi train kar raha hai 🔥", "{name} अभी ट्रेनिंग कर रहे हैं 🔥"],
  "squad.cheer": ["Cheer", "Cheer karo", "हौसला दें"],
  "squad.join": ["Join", "Join karo", "जुड़ें"],
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;

const IDX: Record<Lang, 0 | 1 | 2> = { en: 0, hinglish: 1, hi: 2 };

/** t("sync.waiting", "hi", { n: 3 }) → "3 सिंक होना बाकी". Unknown keys return the key. */
export function t(key: StringKey, lang: Lang = "en", vars?: Record<string, string | number>): string {
  const e = (STRINGS as Record<string, Entry>)[key];
  let s = e ? e[IDX[parseLang(lang)]] || e[0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** The sync chip text for n queued logs (null for none). */
export function syncLabel(n: number, lang: Lang = "en"): string | null {
  if (!(n > 0)) return null;
  return n === 1 ? t("sync.waiting.one", lang) : t("sync.waiting", lang, { n });
}
