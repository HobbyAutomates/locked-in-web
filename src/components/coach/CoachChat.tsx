"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toJpegBase64 } from "@/lib/image";
import { useDictation } from "@/lib/speech";
import { HELPLINES, HELPLINE_NOTE } from "@/lib/goals";
import { mealTypeLabel, isMealType } from "@/lib/mealType";
import type { CoachCard, CoachMessage } from "@/lib/coach";
import { CoachAvatar, OnbIcon } from "@/components/onboarding/kit";
import { ErrorNote } from "@/components/ui";
import { COMING_SOON } from "@/lib/v36";

/**
 * v2.14 coach chat (canvas "Coach · chat with memory"). Iris is the coach's voice: its bubbles, its
 * avatar, its "remembers" line. Tool results render as small cards under the reply ("Logged ·
 * Dinner"); proposed memories as "Learned: … Keep / Forget".
 */

type Loaded = { available: boolean; style?: string; remember?: boolean; messages: CoachMessage[] };

export default function CoachChat({ prompt }: { prompt?: string }) {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [msgs, setMsgs] = useState<CoachMessage[]>([]);
  const [text, setText] = useState(prompt ?? "");
  const [photo, setPhoto] = useState<{ base64: string; media_type: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [decided, setDecided] = useState<Record<string, "kept" | "forgot">>({});
  const end = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const dictation = useDictation((t) => setText((v) => (v ? `${v} ${t}` : t)));

  useEffect(() => {
    let live = true;
    fetch("/api/coach/chat")
      .then((r) => r.json())
      .then((d: Loaded) => {
        if (!live) return;
        setData(d);
        setMsgs(d.messages ?? []);
      })
      .catch(() => live && setData({ available: false, messages: [] }));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs.length, busy]);

  async function send(message: string) {
    const m = message.trim();
    if ((!m && !photo) || busy) return;
    setBusy(true);
    setErr(null);
    seq.current += 1;
    const temp: CoachMessage = { id: `tmp-${seq.current}`, role: "user", text: m || "(photo)", tool: null, created_at: "" };
    setMsgs((x) => [...x, temp]);
    setText("");
    const img = photo;
    setPhoto(null);
    try {
      const res = await fetch("/api/coach/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: m, image: img?.base64, media_type: img?.media_type }) });
      const out = (await res.json().catch(() => ({}))) as { user?: CoachMessage; reply?: CoachMessage; error?: string };
      if (!res.ok || !out.reply || !out.user) throw new Error(out.error ?? "The coach couldn't answer. Try again?");
      setMsgs((x) => [...x.filter((y) => y.id !== temp.id), out.user!, out.reply!]);
      // Something was logged: Home, the rings and the streak need the new numbers.
      if (out.reply.tool?.cards?.some((c) => c.type === "meal_logged" || c.type === "water_logged" || c.type === "fast_started")) router.refresh();
    } catch (e) {
      setMsgs((x) => x.filter((y) => y.id !== temp.id));
      setText(m);
      setErr(e instanceof Error ? e.message : "The coach couldn't answer. Try again?");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, keep: boolean) {
    setDecided((d) => ({ ...d, [id]: keep ? "kept" : "forgot" }));
    await fetch(keep ? "/api/coach/memory" : `/api/coach/memory?id=${encodeURIComponent(id)}`, keep ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, kept: true }) } : { method: "DELETE" }).catch(() => null);
  }

  const chips = ["Calories left?", "Log 500 ml water", "What should I eat?", ...(data?.style === "no_excuses" ? ["Roast my week"] : [])];

  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col" style={{ background: "var(--bg)" }}>
      <header className="flex items-center gap-3" style={{ padding: "calc(12px + env(safe-area-inset-top, 0px)) 16px 12px", borderBottom: "1px solid var(--line)" }}>
        <button type="button" aria-label="Back" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--surf)", border: 0, color: "var(--ink)" }} onClick={() => router.back()}>
          <OnbIcon name="back" size={18} stroke={2} />
        </button>
        <CoachAvatar size={38} />
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 16, fontWeight: 700 }}>Your coach</div>
          <div style={{ fontSize: 12, color: data?.remember === false ? "var(--mute)" : "var(--iris)", fontWeight: 600 }}>{data?.remember === false ? "memory is off" : "● remembers what you tell it"}</div>
        </div>
        <Link href="/coach/memory" aria-label="What your coach knows" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--surf)", color: "var(--ink)" }}>
          <OnbIcon name="brain" size={18} />
        </Link>
        <Link href="/coach/style" aria-label="Coach style" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--surf)", color: "var(--ink)" }}>
          <OnbIcon name="scales" size={18} />
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto" style={{ padding: 16 }} aria-live="polite">
        {!data ? (
          <p className="muted py-10 text-center text-sm">Loading…</p>
        ) : !data.available ? (
          <div className="card mt-6 text-center">
            <p className="font-bold">{COMING_SOON}</p>
            <p className="mt-1 text-sm muted">The coach needs a quick server update. Your logs and streaks work as usual.</p>
          </div>
        ) : msgs.length === 0 ? (
          <div className="m-rise mt-4 flex flex-col gap-3">
            <Bubble role="coach" text="Hey! Ask me anything about food or training, or just tell me what you ate and I'll log it. Try: “2 roti, dal and paneer for lunch”." />
          </div>
        ) : null}
        <div className="flex flex-col gap-3">
          {msgs.map((m) => (
            <div key={m.id} className="m-rise flex flex-col gap-2" style={{ animationDuration: "700ms" }}>
              <Bubble role={m.role} text={m.text} />
              {m.role === "coach" && m.tool?.cards?.length ? (
                <div className="flex flex-col gap-2" style={{ marginLeft: 44 }}>
                  {m.tool.cards.map((c, i) => (
                    <Card key={i} card={c} decided={c.type === "memory" ? decided[c.id] : undefined} onDecide={decide} />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {busy ? (
            <div className="flex items-center gap-2.5">
              <CoachAvatar />
              <span className="flex gap-1 rounded-[4px_20px_20px_20px] px-4 py-3.5" style={{ background: "var(--iris-bg)", border: "1px solid var(--iris-line)" }} aria-label="Coach is typing">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="m-glow block h-2 w-2 rounded-full" style={{ background: "var(--iris)", animationDelay: `${i * 160}ms` }} />
                ))}
              </span>
            </div>
          ) : null}
          <div ref={end} />
        </div>
      </div>

      {data?.available ? (
        <div style={{ padding: "10px 14px calc(14px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
          <ErrorNote text={err ?? dictation.error} />
          <div className="mb-2.5 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {chips.map((c) => (
              <button key={c} type="button" className="press shrink-0 rounded-full" style={{ padding: "9px 13px", background: "var(--surf)", border: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }} disabled={busy} onClick={() => void send(c)}>
                {c}
              </button>
            ))}
          </div>
          {photo ? (
            <div className="mb-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data-URL preview */}
              <img src={photo.preview} alt="Photo to send" className="h-12 w-12 rounded-xl object-cover" />
              <button type="button" className="press text-[13px] font-semibold" style={{ background: "none", border: 0, color: "var(--mute)" }} onClick={() => setPhoto(null)}>
                Remove
              </button>
            </div>
          ) : null}
          <form
            className="flex items-center gap-2 rounded-full"
            style={{ height: 50, padding: "0 6px 0 16px", background: "var(--surf)" }}
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask or log anything…" aria-label="Message your coach" className="min-w-0 flex-1 bg-transparent" style={{ border: 0, outline: "none", fontSize: 15 }} enterKeyHint="send" />
            <label className="press grid h-9 w-9 cursor-pointer place-items-center rounded-full" style={{ color: "var(--mute)" }} aria-label="Attach a photo">
              <OnbIcon name="camera" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) setPhoto(await toJpegBase64(f, 1280, 0.82).catch(() => null));
                }}
              />
            </label>
            {dictation.supported ? (
              <button type="button" aria-label={dictation.listening ? "Stop listening" : "Speak"} aria-pressed={dictation.listening} className="press grid h-9 w-9 place-items-center rounded-full" style={{ border: 0, background: dictation.listening ? "var(--iris-bg)" : "transparent", color: dictation.listening ? "var(--iris)" : "var(--mute)" }} onClick={dictation.toggle}>
                <OnbIcon name="mic" />
              </button>
            ) : null}
            <button type="submit" aria-label="Send" disabled={busy || (!text.trim() && !photo)} className="press grid place-items-center rounded-full" style={{ width: 38, height: 38, border: 0, background: "var(--btn)", color: "var(--btn-ink)" }}>
              <OnbIcon name="send" size={17} />
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function Bubble({ role, text }: { role: "user" | "coach"; text: string }) {
  if (role === "user")
    return (
      <div className="self-end whitespace-pre-wrap" style={{ maxWidth: "78%", background: "var(--btn)", color: "var(--btn-ink)", borderRadius: "20px 20px 4px 20px", padding: "12px 15px", fontSize: 14.5, lineHeight: 1.4 }}>
        {text}
      </div>
    );
  return (
    <div className="flex items-start gap-2.5" style={{ maxWidth: "86%" }}>
      <CoachAvatar />
      <div className="whitespace-pre-wrap" style={{ background: "var(--iris-bg)", border: "1px solid var(--iris-line)", color: "var(--ink)", borderRadius: "4px 20px 20px 20px", padding: "14px 16px", fontSize: 14.5, lineHeight: 1.45 }}>
        {text}
      </div>
    </div>
  );
}

function Card({ card, decided, onDecide }: { card: CoachCard; decided?: "kept" | "forgot"; onDecide: (id: string, keep: boolean) => void }) {
  const box: React.CSSProperties = { padding: "12px 14px", borderRadius: 16, background: "var(--surf)", fontSize: 13.5 };
  switch (card.type) {
    case "meal_logged":
      return (
        <div className="flex justify-between gap-3" style={box}>
          <span className="min-w-0">
            <b>Logged · {isMealType(card.meal_type) ? mealTypeLabel(card.meal_type) : "Meal"}</b>
            <br />
            <span style={{ color: "var(--mute)" }}>{card.title}</span>
          </span>
          <span className="shrink-0 text-right">
            <b className="num">{card.kcal} kcal</b>
            <br />
            <span className="num" style={{ fontWeight: 700 }}>
              +{card.protein_g} g protein
            </span>
          </span>
        </div>
      );
    case "water_logged":
      return (
        <div style={box}>
          <b>Logged · Water</b> <span style={{ color: "var(--mute)" }}>+{card.ml} ml</span>
        </div>
      );
    case "remaining":
      return (
        <div className="grid grid-cols-4 gap-2 text-center" style={box}>
          {([
            [card.kcal, "kcal"],
            [`${card.protein} g`, "protein"],
            [`${card.carbs} g`, "carbs"],
            [`${card.fat} g`, "fat"],
          ] as const).map(([v, l]) => (
            <span key={l}>
              <b className="num block">{v}</b>
              <span className="mono" style={{ fontSize: 9.5, color: "var(--mute)" }}>
                {l} left
              </span>
            </span>
          ))}
        </div>
      );
    case "suggestions":
      return (
        <div className="flex flex-col gap-2" style={box}>
          {card.items.map((i) => (
            <div key={i.name} className="flex justify-between gap-2">
              <span>
                <b>{i.name}</b> <span style={{ color: "var(--mute)" }}>{i.portion}</span>
              </span>
              <span className="num shrink-0">
                {i.kcal} kcal · {i.protein} g P
              </span>
            </div>
          ))}
        </div>
      );
    case "fast_started":
      return (
        <div style={box}>
          <b>Fast started</b> <span style={{ color: "var(--mute)" }}>{card.hours} h · see it on Home</span>
        </div>
      );
    case "memory":
      return (
        <div style={{ ...box, background: "var(--iris-bg)", border: "1px solid var(--iris-line)" }}>
          <b style={{ color: "var(--iris)" }}>Learned:</b> “{card.text}”{" "}
          {decided ? (
            <span style={{ color: "var(--mute)" }}>· {decided === "kept" ? "kept" : "forgotten"}</span>
          ) : (
            <span className="whitespace-nowrap">
              <button type="button" className="press font-bold" style={{ background: "none", border: 0, color: "var(--iris)", padding: "4px 2px" }} onClick={() => onDecide(card.id, true)}>
                Keep
              </button>
              {" · "}
              <button type="button" className="press font-bold" style={{ background: "none", border: 0, color: "var(--iris)", padding: "4px 2px" }} onClick={() => onDecide(card.id, false)}>
                Forget
              </button>
            </span>
          )}
        </div>
      );
    case "helpline":
      return (
        <div className="flex flex-col gap-2" style={box}>
          <b>Talk to someone today</b>
          {HELPLINES.map((h) => (
            <div key={h.name}>
              <span className="font-semibold">{h.name}</span> <span style={{ color: "var(--mute)" }}>{h.detail}</span>
              <div className="mt-0.5 flex flex-wrap gap-2">
                {h.phones.map((p) => (
                  <a key={p} href={`tel:${p.replace(/[^0-9+]/g, "")}`} className="font-bold" style={{ color: "var(--ink)" }}>
                    {p}
                  </a>
                ))}
              </div>
            </div>
          ))}
          <span style={{ fontSize: 12, color: "var(--mute)" }}>{HELPLINE_NOTE}</span>
        </div>
      );
  }
  return null;
}

