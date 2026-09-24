import { Avatar } from "./Avatar";

/**
 * One ranked member card: "#1", avatar, name (· you), @username and a small meta line, with a
 * right-hand slot. Shared by the squad Leaderboard and a challenge's board (v2.7); `children`
 * renders under the row (the challenge progress bar).
 */
export function SquadRankRow({
  rank,
  avatarPath,
  name,
  username,
  isMe,
  meta,
  right,
  children,
}: {
  rank: number;
  avatarPath: string | null;
  name: string;
  username: string | null;
  isMe: boolean;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-2.5" style={{ padding: "12px 14px", outline: isMe ? "2px solid var(--ink)" : "none" }}>
      <div className="flex items-center gap-3">
        <span className="num w-8 shrink-0 text-[15px] font-extrabold" style={{ color: rank === 1 ? "var(--flame)" : "var(--ink)" }}>
          #{rank}
        </span>
        <Avatar path={avatarPath} name={name} size={46} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-bold">
            {name}
            {isMe ? <span className="font-medium muted"> · you</span> : null}
          </span>
          <span className="truncate text-xs muted">{username ? `@${username}` : "no username yet"}</span>
          {meta ? <span className="num text-[11px] muted">{meta}</span> : null}
        </span>
        {right ? <span className="flex shrink-0 flex-col items-end gap-1.5">{right}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** A thin rounded progress bar on the track colour. */
export function ProgressBar({ fraction, color = "var(--ink)", height = 8 }: { fraction: number; color?: string; height?: number }) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: "var(--track)" }} aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${Math.round(f * 100)}%`, background: color, transition: "width 500ms cubic-bezier(.2,.8,.2,1)" }} />
    </div>
  );
}
