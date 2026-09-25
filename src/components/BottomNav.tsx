"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Bowl, Chart, ChevronRight, Glass, Home, People, Person, Plus, Run, Scale, ScanFilled } from "./icons";
import { today } from "@/lib/dates";
import { deleteWater } from "@/lib/actions";
import { logDefaultGlass } from "@/lib/activityActions";
import { UndoSnackbar } from "./LogBits";

/** v2.4: five tabs. Calendar moved to a button in the Home header (the /calendar route stays). */
const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/squad", label: "Squad", Icon: People },
  { href: "/scan", label: "Scan", Icon: ScanFilled },
  { href: "/progress", label: "Progress", Icon: Chart },
  { href: "/profile", label: "Profile", Icon: Person },
];

type DialKey = "food" | "activity" | "water" | "weight";

/** v2.8 speed-dial under the +, bottom-most first so Food sits closest to the thumb. */
const DIAL: { key: DialKey; label: string; Icon: (p: { size?: number }) => React.ReactNode; tint: string }[] = [
  { key: "food", label: "Food", Icon: Bowl, tint: "var(--orange)" },
  { key: "activity", label: "Activity", Icon: Run, tint: "var(--green)" },
  { key: "water", label: "Water +1 glass", Icon: Glass, tint: "var(--blue)" },
  { key: "weight", label: "Weight", Icon: Scale, tint: "var(--ink)" },
];

/**
 * Fixed bottom bar + the black FAB, which opens a speed-dial: Food · Activity · Water · Weight.
 * v2.8: Water adds one glass (your glass size) straight away with an Undo snackbar; long-press it,
 * or tap the small arrow beside it, for the Water page.
 */
export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [snack, setSnack] = useState<{ text: string; id: string | null } | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  useEffect(
    () => () => {
      if (snackTimer.current) clearTimeout(snackTimer.current);
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  function showSnack(text: string, id: string | null) {
    setSnack({ text, id });
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnack(null), 5000);
  }

  async function addGlass() {
    showSnack("Adding a glass…", null);
    try {
      const { entry } = await logDefaultGlass();
      showSnack(`+1 glass of water (${entry.ml} mL)`, entry.id);
      router.refresh();
    } catch (e) {
      showSnack(e instanceof Error ? e.message : "Couldn't log water", null);
    }
  }

  async function undoGlass(id: string) {
    setSnack(null);
    try {
      await deleteWater(id);
      router.refresh();
    } catch (e) {
      showSnack(e instanceof Error ? e.message : "Couldn't undo that", null);
    }
  }

  function openWaterPage() {
    setOpen(false);
    router.push("/water");
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function go(key: DialKey) {
    setOpen(false);
    const d = today();
    if (key === "water") return void addGlass();
    if (key === "weight") return router.push("/profile/weight?log=1");
    router.push(key === "food" ? `/log?date=${d}&mode=meal` : `/log?date=${d}&mode=activity`);
  }

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="dial-backdrop"
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.38)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        ) : null}
      </AnimatePresence>
      <div className="fixed inset-x-0 bottom-0 z-40">
        <div className="relative mx-auto w-full max-w-[480px]">
          <AnimatePresence>
            {open ? (
              <motion.ul
                key="dial"
                className="absolute right-5 z-50 flex flex-col-reverse items-end gap-2.5"
                style={{ bottom: 42 }}
                role="menu"
                aria-label="Log"
                initial="closed"
                animate="open"
                exit="closed"
                variants={{ open: { transition: { staggerChildren: 0.035 } }, closed: { transition: { staggerChildren: 0.02, staggerDirection: -1 } } }}
              >
                {DIAL.map(({ key, label, Icon, tint }) => (
                  <motion.li
                    key={key}
                    variants={{ open: { opacity: 1, y: 0, scale: 1 }, closed: { opacity: 0, y: 14, scale: 0.9 } }}
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  >
                    <span className="flex items-center gap-2">
                      {key === "water" ? (
                        <button type="button" role="menuitem" aria-label="Open the Water page" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--card)", color: "var(--ink)", boxShadow: "var(--shadow-lg)", border: 0 }} onClick={openWaterPage}>
                          <ChevronRight size={18} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        className="press flex items-center gap-2.5 rounded-full py-1.5 pl-4 pr-1.5 text-[15px] font-bold"
                        style={{ background: "var(--card)", color: "var(--ink)", boxShadow: "var(--shadow-lg)", border: 0, touchAction: "manipulation", WebkitTouchCallout: "none", userSelect: "none" }}
                        onPointerDown={() => {
                          if (key !== "water") return;
                          longPressed.current = false;
                          pressTimer.current = setTimeout(() => {
                            longPressed.current = true;
                            openWaterPage();
                          }, 500);
                        }}
                        onPointerUp={() => {
                          if (pressTimer.current) clearTimeout(pressTimer.current);
                        }}
                        onPointerLeave={() => {
                          if (pressTimer.current) clearTimeout(pressTimer.current);
                        }}
                        onContextMenu={(e) => {
                          if (key === "water") e.preventDefault();
                        }}
                        onClick={() => {
                          if (longPressed.current) {
                            longPressed.current = false;
                            return;
                          }
                          go(key);
                        }}
                      >
                        {label}
                        <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--card2)", color: tint }}>
                          <Icon size={20} />
                        </span>
                      </button>
                    </span>
                  </motion.li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
          <button
            type="button"
            aria-label={open ? "Close the log menu" : "Log food, activity, water or weight"}
            aria-expanded={open}
            aria-haspopup="menu"
            className="fab press absolute right-5 z-50 grid place-items-center rounded-full"
            style={{ width: 60, height: 60, top: -30, background: "var(--btn)", color: "var(--btn-ink)", border: 0 }}
            onClick={() => setOpen((v) => !v)}
          >
            <motion.span className="grid place-items-center" animate={{ rotate: open ? 45 : 0 }} transition={{ type: "spring", stiffness: 380, damping: 24 }}>
              <Plus size={28} />
            </motion.span>
          </button>
        </div>
        <UndoSnackbar text={snack?.text ?? null} onUndo={snack?.id ? () => void undoGlass(snack.id as string) : undefined} />
        <nav aria-label="Main" style={{ background: "var(--card)" }}>
          <div className="hair" />
          <div
            className="mx-auto flex w-full max-w-[480px] justify-between pt-2.5 pl-3"
            style={{ paddingRight: 76, paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))" }}
          >
            {TABS.map(({ href, label, Icon }) => {
              // Calendar is reached from Home, so Home stays lit there.
              const active = href === "/" ? path === "/" || path.startsWith("/calendar") : path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="press flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] font-semibold"
                  style={{ color: active ? "var(--ink)" : "var(--muted)" }}
                >
                  <Icon size={24} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}
