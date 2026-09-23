"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, Chart, Home, Person, Plus, Scan } from "./icons";
import { today } from "@/lib/dates";

const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/scan", label: "Scan", Icon: Scan },
  { href: "/progress", label: "Progress", Icon: Chart },
  { href: "/profile", label: "Profile", Icon: Person },
];

/** Fixed bottom bar + the black FAB that opens the full-screen Log route. */
export default function BottomNav() {
  const path = usePathname();
  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="relative mx-auto w-full max-w-[480px]">
        <Link
          href={`/log?date=${today()}`}
          aria-label="Log a workout or meal"
          className="fab press absolute right-5 grid place-items-center rounded-full"
          style={{ width: 60, height: 60, top: -30, background: "var(--btn)", color: "var(--btn-ink)" }}
        >
          <Plus size={28} />
        </Link>
      </div>
      <nav aria-label="Main" style={{ background: "var(--card)" }}>
        <div className="hair" />
        <div
          className="mx-auto flex w-full max-w-[480px] justify-between pt-2.5 pl-3"
          style={{ paddingRight: 76, paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))" }}
        >
          {TABS.map(({ href, label, Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
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
  );
}
