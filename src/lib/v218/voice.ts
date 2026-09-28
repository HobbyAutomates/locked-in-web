/**
 * v2.18 B1 voice coach helpers, pure: what the phone should SAY (no emojis, symbols or markdown;
 * units spoken out) and the phrases that end a hands-free session. Android util/VoiceCoach.kt.
 */

/** Text → something a TTS voice reads naturally. */
export function speakable(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\*\*|__|[*_`#>]/g, "")
    .replace(/\s*[•·]\s*/g, ", ")
    .replace(/(\d)\s?kcal\b/gi, "$1 calories")
    .replace(/(\d)\s?g\b/g, "$1 grams")
    .replace(/(\d)\s?ml\b/gi, "$1 millilitres")
    .replace(/(\d)\s?kg\b/gi, "$1 kilos")
    .replace(/(\d)\s?h\b/g, "$1 hours")
    .replace(/\s*→\s*/g, " to ")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "stop", "bas", "that's all", "bye"… end the hands-free loop. */
export function isStopPhrase(text: string): boolean {
  return /^\s*(stop|stop listening|that'?s (all|it)|bye|goodbye|thank(s| you)( coach)?|bas|bas karo|ruk(o|ja)|band karo|ok bye)\s*[.!]?\s*$/i.test(text);
}

/** The system-prompt line added when the reply will be spoken aloud. */
export const VOICE_RULE = "VOICE MODE: they are listening, not reading. Reply in 1 or 2 short spoken sentences (max 40 words), no lists, no emojis, no symbols. Say numbers plainly ('about 60 grams of protein left'). If you used a tool, say the result in words.";

/** Picks a TTS voice for the language: an Indian English / Hindi voice when the device has one. */
export function pickVoiceName(voices: { name: string; lang: string }[], lang: "en-IN" | "hi-IN"): string | null {
  const exact = voices.find((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
  if (exact) return exact.name;
  const base = lang.slice(0, 2);
  return voices.find((v) => v.lang.toLowerCase().startsWith(base))?.name ?? null;
}
