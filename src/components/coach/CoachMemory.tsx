"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MEMORY_KINDS, type Memory, type MemoryKind } from "@/lib/coach";
import { saveCoachSettings } from "@/lib/coachActions";
import { OnbIcon } from "@/components/onboarding/kit";
import { BottomSheet, ErrorNote, Toggle } from "@/components/ui";
import { COMING_SOON } from "@/lib/v36";

/**
 * v2.14 "What your coach knows" (canvas BCoachMemory): every memory, grouped, each forgettable with
 * ×; "Learned" proposals with Keep / Forget (they expire after 7 days); the "Let coach remember"
 * switch; export and delete for the chat. Only this user ever sees it.
 */

const LABEL: Record<MemoryKind, string> = { goal: "Goals", food: "Food", life: "Life", body: "Body", style: "Style" };

function ago(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

export default function CoachMemory() {
  const router = useRouter();
  const [state, setState] = useState<{ available: boolean; remember: boolean; memories: Memory[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<MemoryKind>("food");
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState<null | "chat" | "all">(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/coach/memory")
      .then((r) => r.json())
      .then((d) => live && setState({ available: d.available !== false, remember: d.remember !== false, memories: d.memories ?? [] }))
      .catch(() => live && setState({ available: false, remember: true, memories: [] }));
    return () => {
      live = false;
    };
  }, []);

  if (!state) return <p className="muted py-10 text-center text-sm">Loading…</p>;
  if (!state.available)
    return (
      <div className="card text-center">
        <p className="font-bold">{COMING_SOON}</p>
        <p className="mt-1 text-sm muted">Coach memory needs a quick server update.</p>
      </div>
    );

  const forget = async (id: string) => {
    setState((s) => (s ? { ...s, memories: s.memories.filter((m) => m.id !== id) } : s));
    await fetch(`/api/coach/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
  };
  const keep = async (id: string) => {
    setState((s) => (s ? { ...s, memories: s.memories.map((m) => (m.id === id ? { ...m, kept: true } : m)) } : s));
    await fetch("/api/coach/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, kept: true }) }).catch(() => null);
  };
  const add = async () => {
    setErr(null);
    const res = await fetch("/api/coach/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, text }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(out.error ?? "Couldn't add that");
    setState((s) => (s ? { ...s, memories: [out.memory as Memory, ...s.memories] } : s));
    setText("");
    setAdding(false);
  };
  const setRemember = async (on: boolean) => {
    setState((s) => (s ? { ...s, remember: on } : s));
    const r = await saveCoachSettings({ remember: on });
    if (!r.ok) setErr(r.error);
  };
  const wipe = async (what: "chat" | "all") => {
    setConfirm(null);
    if (what === "chat") await fetch("/api/coach/chat", { method: "DELETE" }).catch(() => null);
    else {
      await fetch("/api/coach/memory?id=all", { method: "DELETE" }).catch(() => null);
      setState((s) => (s ? { ...s, memories: [] } : s));
    }
    setDone(what === "chat" ? "Chat history deleted." : "Your coach forgot everything.");
    router.refresh();
  };

  const kept = state.memories.filter((m) => m.kept);
  const pending = state.memories.filter((m) => !m.kept);

  return (
    <>
      <p className="m-0 text-[14.5px] leading-snug" style={{ color: "var(--mute)" }}>
        Everything here shapes your notes and suggestions. Tap × to forget it.
      </p>
      {MEMORY_KINDS.map((k) => {
        const list = kept.filter((m) => m.kind === k);
        if (!list.length) return null;
        return (
          <section key={k} className="m-rise">
            <div className="mono mb-2.5" style={{ fontSize: 12, color: "var(--mute)" }}>
              {LABEL[k]}
            </div>
            <div className="flex flex-wrap gap-2">
              {list.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-2 rounded-full" style={{ padding: "9px 8px 9px 14px", background: "var(--surf)", fontSize: 14, fontWeight: 600 }}>
                  {m.text}
                  <button type="button" aria-label={`Forget ${m.text}`} className="press grid h-6 w-6 place-items-center rounded-full" style={{ border: 0, background: "none", color: "var(--mute)" }} onClick={() => void forget(m.id)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </section>
        );
      })}
      {!kept.length ? <p className="text-sm muted">Nothing yet. Chat with your coach, or add something below.</p> : null}
      {pending.map((m) => (
        <div key={m.id} className="m-rise rounded-[18px] px-4 py-3.5 text-[14px] leading-snug" style={{ background: "var(--iris-bg)", border: "1px solid var(--iris-line)" }}>
          <b style={{ color: "var(--iris)" }}>Learned {ago(m.created_at)}:</b> “{m.text}”.{" "}
          <button type="button" className="press font-bold" style={{ background: "none", border: 0, color: "var(--iris)" }} onClick={() => void keep(m.id)}>
            Keep
          </button>
          {" · "}
          <button type="button" className="press font-bold" style={{ background: "none", border: 0, color: "var(--iris)" }} onClick={() => void forget(m.id)}>
            Forget
          </button>
        </div>
      ))}
      <button type="button" className="press flex items-center gap-2 self-start rounded-full px-4 py-2.5 text-[14px] font-semibold" style={{ background: "var(--surf)", border: 0, color: "var(--ink)" }} onClick={() => setAdding(true)}>
        <OnbIcon name="plus" size={16} /> Tell your coach something
      </button>
      <div className="flex items-center justify-between rounded-[18px] px-4 py-3.5" style={{ background: "var(--surf)" }}>
        <div>
          <div className="text-[15px] font-bold">Let coach remember</div>
          <div className="text-[12.5px]" style={{ color: "var(--mute)" }}>
            Only you see this. Delete anything, anytime.
          </div>
        </div>
        <Toggle on={state.remember} onChange={(v) => void setRemember(v)} label="Let coach remember" />
      </div>
      <ErrorNote text={err} />
      {done ? <p className="text-sm muted">{done}</p> : null}
      <div className="flex flex-col gap-1 rounded-[18px] px-4 py-2" style={{ background: "var(--surf)" }}>
        <a href="/api/coach/export" className="py-2.5 text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
          Export chat + memories
        </a>
        <button type="button" className="press py-2.5 text-left text-[15px] font-semibold" style={{ background: "none", border: 0, color: "var(--danger)", borderTop: "1px solid var(--line)" }} onClick={() => setConfirm("chat")}>
          Delete chat history
        </button>
        <button type="button" className="press py-2.5 text-left text-[15px] font-semibold" style={{ background: "none", border: 0, color: "var(--danger)", borderTop: "1px solid var(--line)" }} onClick={() => setConfirm("all")}>
          Forget everything
        </button>
      </div>
      <p className="text-[12.5px]" style={{ color: "var(--mute)" }}>
        Memories are only ever used for your own coaching. Chat older than 90 days is deleted automatically.
      </p>

      <BottomSheet open={adding} title="Tell your coach" subtitle="A routine, a food you love or hate, a constraint. Keep it short." onClose={() => setAdding(false)} primary={{ label: "Remember this", onClick: () => void add(), disabled: text.trim().length < 3 }}>
        <div className="flex flex-col gap-2.5 pb-1">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind">
            {MEMORY_KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className="chip press" onClick={() => setKind(k)}>
                {LABEL[k]}
              </button>
            ))}
          </div>
          <input className="field" maxLength={120} placeholder="e.g. Gym at 6 pm, 4 days" value={text} onChange={(e) => setText(e.target.value)} aria-label="What should your coach remember?" />
        </div>
      </BottomSheet>
      <BottomSheet
        open={confirm != null}
        title={confirm === "chat" ? "Delete chat history?" : "Forget everything?"}
        subtitle={confirm === "chat" ? "Your coach keeps its memories; only the messages go." : "Every memory goes. Your coach starts from your profile again."}
        onClose={() => setConfirm(null)}
        primary={{ label: confirm === "chat" ? "Delete chat" : "Forget everything", onClick: () => void wipe(confirm ?? "chat") }}
      >
        <span />
      </BottomSheet>
    </>
  );
}
