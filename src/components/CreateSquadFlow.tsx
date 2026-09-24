"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { createSquadV2 } from "@/lib/actions";
import { uploadSquadPhoto } from "@/lib/squadPhoto";
import { ArrowLeft, Globe, Padlock, Spinner } from "./icons";
import { SQUAD_ICON_KEYS, SQUAD_ICON_LABELS, SquadIconArt, type SquadIconKey } from "./SquadIcon";
import { ErrorNote, PillButton } from "./ui";

const SUGGESTIONS = ["Plate Checkers", "Fuel & Flex", "Snack Team", "Locked In Bengaluru", "Cutting Season", "Bulk Szn", "Protein Posse", "Gym Rats"];

type Step = 0 | 1 | 2;

/**
 * v2.6 Create a squad — Cal AI's "Create group" crossed with Strava's club flow:
 * 1 name + description + suggestion chips → 2 choose a squad icon (12 presets or upload) →
 * 3 public or private → Create. Progress bars on top; back steps back.
 */
export default function CreateSquadFlow({ userId }: { userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<SquadIconKey>("biceps");
  const [upload, setUpload] = useState<{ file: File; preview: string } | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const coverUrl = upload ? await uploadSquadPhoto(upload.file, userId) : null;
      const g = await createSquadV2({ name, description, icon: upload ? null : icon, coverUrl, isPublic });
      router.replace(`/squad/${g.id}/members?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the squad");
      setBusy(false);
    }
  }

  const back = () => (step === 0 ? router.push("/squad") : setStep((s) => (s - 1) as Step));

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4" style={{ paddingTop: "calc(8px + env(safe-area-inset-top, 0px))", paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
      <div className="flex items-center gap-2 py-2">
        <button type="button" onClick={back} aria-label="Back" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-bold">Create a squad</h1>
        <span className="w-10" />
      </div>
      <div className="mt-1 flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? "var(--ink)" : "var(--hair)", transition: "background .2s" }} />
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} className="flex flex-1 flex-col" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
          {step === 0 ? (
            <>
              <h2 className="mt-6 text-center text-[24px] font-extrabold" style={{ letterSpacing: "-0.03em" }}>
                Create squad name
              </h2>
              <p className="mt-1 text-center text-[14px] muted">Pick something fun or goal-focused. Your squad name helps set the vibe.</p>
              <label className="mt-6 text-[12px] font-semibold muted" htmlFor="squad-name">
                Squad name
              </label>
              <input id="squad-name" className="field mt-1" value={name} maxLength={40} autoFocus placeholder="Fuel & Flex" onChange={(e) => setName(e.target.value)} />
              <textarea
                className="field mt-3 resize-none py-3"
                rows={3}
                value={description}
                maxLength={200}
                placeholder="Description (optional)"
                aria-label="Description"
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="-mx-4 mt-3 overflow-x-auto px-4" style={{ scrollbarWidth: "none" }}>
                <div className="flex w-max gap-2 py-1">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="chip press" style={{ height: 36 }} aria-pressed={name === s} onClick={() => setName(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-auto pt-6">
                <PillButton disabled={!name.trim()} onClick={() => setStep(1)}>
                  Next
                </PillButton>
              </div>
            </>
          ) : step === 1 ? (
            <>
              <h2 className="mt-6 text-center text-[24px] font-extrabold" style={{ letterSpacing: "-0.03em" }}>
                Choose a squad icon
              </h2>
              <p className="mt-1 text-center text-[14px] muted">Select one of our pre-made icons or upload your own.</p>
              <div className="mt-5 flex flex-col items-center">
                <div className="grid place-items-center rounded-full" style={{ width: 124, height: 124, boxShadow: "0 0 0 4px var(--card), 0 0 0 6px var(--ink)" }}>
                  {upload ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local preview
                    <img src={upload.preview} alt="" className="h-[124px] w-[124px] rounded-full object-cover" />
                  ) : (
                    <SquadIconArt k={icon} size={124} />
                  )}
                </div>
                <p className="mt-3 text-[16px] font-bold">{upload ? "Your photo" : SQUAD_ICON_LABELS[icon]}</p>
              </div>
              <div className="mt-4 grid grid-cols-6 gap-2.5">
                {SQUAD_ICON_KEYS.map((k) => {
                  const sel = !upload && k === icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-label={SQUAD_ICON_LABELS[k]}
                      aria-pressed={sel}
                      className="press grid aspect-square place-items-center rounded-full"
                      style={{ padding: 0, border: 0, background: "none", outline: sel ? "2.5px solid var(--ink)" : "none", outlineOffset: 2 }}
                      onClick={() => {
                        setUpload(null);
                        setIcon(k);
                      }}
                    >
                      <SquadIconArt k={k} size={46} />
                    </button>
                  );
                })}
              </div>
              <div className="my-4 flex items-center gap-3 text-[12px] muted">
                <span className="h-px flex-1" style={{ background: "var(--hair)" }} />
                OR
                <span className="h-px flex-1" style={{ background: "var(--hair)" }} />
              </div>
              <PillButton soft height={48} onClick={() => fileRef.current?.click()}>
                Upload a photo
              </PillButton>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) setUpload({ file: f, preview: URL.createObjectURL(f) });
                }}
              />
              <div className="mt-auto pt-6">
                <PillButton onClick={() => setStep(2)}>Next</PillButton>
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-6 text-center text-[24px] font-extrabold" style={{ letterSpacing: "-0.03em" }}>
                Private or public?
              </h2>
              <p className="mt-1 text-center text-[14px] muted">Decide who can get in.</p>
              <div className="mt-6 flex flex-col gap-2.5" role="radiogroup" aria-label="Privacy">
                <PrivacyOption
                  selected={isPublic}
                  icon={<Globe size={20} />}
                  title="Public"
                  sub="Anyone on Locked In can find your squad in Discover and join it."
                  onClick={() => setIsPublic(true)}
                />
                <PrivacyOption
                  selected={!isPublic}
                  icon={<Padlock size={20} />}
                  title="Private"
                  sub="People must request to join with your invite link. Only you can approve new members."
                  onClick={() => setIsPublic(false)}
                />
              </div>
              <p className="mt-4 text-center text-[12px] muted">You can always change this later</p>
              {error ? (
                <div className="mt-3">
                  <ErrorNote text={error} />
                </div>
              ) : null}
              <div className="mt-auto pt-6">
                <PillButton disabled={busy} onClick={() => void create()}>
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size={16} /> Creating…
                    </span>
                  ) : (
                    "Create Squad"
                  )}
                </PillButton>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function PrivacyOption({ selected, icon, title, sub, onClick }: { selected: boolean; icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="press flex items-center gap-3 rounded-[20px] p-4 text-left"
      style={{ background: "var(--card)", border: selected ? "2px solid var(--ink)" : "2px solid transparent", boxShadow: "var(--shadow-sm)", color: "var(--ink)" }}
      onClick={onClick}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-bold">{title}</span>
        <span className="text-[13px] leading-snug muted">{sub}</span>
      </span>
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ border: `2px solid ${selected ? "var(--ink)" : "var(--hair)"}` }}>
        {selected ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--ink)" }} /> : null}
      </span>
    </button>
  );
}
