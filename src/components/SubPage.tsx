"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "./icons";

/**
 * A pushed page: round back button, centred title, then a 14 px-spaced column
 * (Compose's `SubPage`). `back` defaults to the browser's history.
 */
export default function SubPage({ title, back, children }: { title: string; back?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col" style={{ paddingTop: "calc(8px + env(safe-area-inset-top, 0px))", paddingBottom: 32 }}>
      <div className="flex items-center px-4 py-2">
        <button
          type="button"
          onClick={() => (back ? router.push(back) : router.back())}
          aria-label="Back"
          className="press grid h-10 w-10 place-items-center rounded-full"
          style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-bold">{title}</h1>
        <span className="w-10" />
      </div>
      <div className="flex flex-col gap-3.5 px-4 pt-1.5">{children}</div>
    </div>
  );
}
