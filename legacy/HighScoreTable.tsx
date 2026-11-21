import { cn } from "@/utils/cn";
import type { ScoreEntry } from "@/game/types";
import { Icon } from "./Icons";

const RANK_STYLES = [
  "bg-lime text-ink",
  "bg-lilac text-ink",
  "bg-coral text-ink",
  "bg-card text-ink",
  "bg-card text-ink",
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function HighScoreTable({
  entries,
  highlightId,
  highlightName,
  limit = 5,
  dense = false,
  dark = false,
  className,
}: {
  entries: ScoreEntry[];
  highlightId?: string;
  highlightName?: string;
  limit?: number;
  dense?: boolean;
  dark?: boolean;
  className?: string;
}) {
  const isMine = (entry: ScoreEntry) =>
    Boolean(highlightName) && entry.name.toUpperCase() === (highlightName ?? "").toUpperCase();
  const shown = entries.slice(0, limit);

  if (shown.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-5 py-8 text-center",
          dark ? "border-cream/20 bg-cream/[0.04]" : "border-ink/20 bg-paper/50",
          className,
        )}
      >
        <span className={cn("grid h-10 w-10 place-items-center rounded-full border-2", dark ? "border-cream/25 text-cream/50" : "border-ink/20 text-ink/50")}>
          <Icon name="trophy" size={20} />
        </span>
        <p className={cn("font-display text-base font-bold", dark ? "text-cream" : "text-ink")}>The board is wide open.</p>
        <p className={cn("max-w-[15rem] text-xs leading-relaxed", dark ? "text-cream/50" : "text-muted")}>
          Finish one run and your name lands right here — stored on this device.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden", className)}>
      <div
        className={cn(
          "hidden grid-cols-[2.2rem_1fr_5.3rem_3.1rem] items-center gap-2 px-2 pb-2 font-mono text-[9px] uppercase tracking-[0.16em] sm:grid",
          dark ? "border-b border-cream/15 text-cream/40" : "border-b border-ink/10 text-muted",
        )}
      >
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Score</span>
        <span className="text-right">Date</span>
      </div>
      <ol className={cn("divide-y", dark ? "divide-cream/10" : "divide-ink/10")}>
        {shown.map((entry, index) => (
          <li
            key={entry.id}
            className={cn(
              "group grid grid-cols-[2rem_1fr_auto] items-center gap-2 px-1.5 py-2.5 sm:grid-cols-[2.2rem_1fr_5.3rem_3.1rem] sm:px-2",
              (highlightId === entry.id || isMine(entry)) &&
                (dark ? "rounded-lg bg-lime/15 ring-1 ring-lime/40" : "rounded-lg bg-lime/35"),
              dense && "py-2",
            )}
          >
            <span
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full border font-mono text-[10px] font-medium",
                RANK_STYLES[index] ?? "bg-card",
                index === 0 ? "border-ink shadow-[1.5px_1.5px_0_#1B1A14]" : dark ? "border-cream/25 text-cream/80" : "border-ink/30",
              )}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-display text-sm font-bold uppercase tracking-wide">{entry.name || "YOU"}</span>
                {isMine(entry) && (
                  <span className="rounded-full bg-ink px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-lime">
                    you
                  </span>
                )}
                {index === 0 && (
                  <span className="hidden rounded-full bg-ink px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-lime sm:inline">
                    best
                  </span>
                )}
              </div>
              <span className={cn("font-mono text-[9px] uppercase tracking-[0.1em]", dark ? "text-cream/45" : "text-muted")}>
                Lv {String(entry.level).padStart(2, "0")} · {entry.accuracy}% acc · ×{entry.streak}
              </span>
            </div>
            <span className={cn("text-right font-display text-sm font-bold tabular-nums", highlightId === entry.id && dark && "text-lime")}>
              {entry.score.toLocaleString()}
            </span>
            <span className={cn("hidden text-right font-mono text-[10px] sm:block", dark ? "text-cream/40" : "text-muted")}>
              {formatDate(entry.date)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
