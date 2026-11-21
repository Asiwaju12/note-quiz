/**
 * Leaderboard UI: arcade high scores and the shared Daily Drop board.
 * Data logic is the original Recall implementation (lib/game/daily.ts, storage.ts, services/cloud.ts).
 */
import { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import type { ScoreEntry } from "@/lib/game/types";
import { dailyKey, fetchDailyBoard, nextDailyReset, type DailyBoard } from "@/lib/game/daily";
import { getPlayerId } from "@/lib/game/storage";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/primitives";

const MEDALS = ["bg-[#F2C94C] text-[#3d2c00]", "bg-[#C9CED8] text-[#2a2f3a]", "bg-[#D9A07A] text-[#3a1f0b]"];

function Rank({ index }: { index: number }) {
  return (
    <span className={cn("tabular grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold", index < 3 ? MEDALS[index] : "bg-surface-3 text-muted")}>
      {index + 1}
    </span>
  );
}

export function ScoreTable({ entries, highlightId, highlightName, limit = 10 }: { entries: ScoreEntry[]; highlightId?: string; highlightName?: string; limit?: number }) {
  const shown = entries.slice(0, limit);
  if (!shown.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-strong px-5 py-8 text-center">
        <Trophy className="h-6 w-6 text-subtle" />
        <p className="text-sm font-medium">The board is wide open</p>
        <p className="max-w-[16rem] text-xs text-subtle">Finish an arcade run and your score lands here.</p>
      </div>
    );
  }
  return (
    <ol className="space-y-1">
      {shown.map((entry, index) => {
        const mine = entry.id === highlightId || (highlightName && entry.name.toUpperCase() === highlightName.toUpperCase());
        return (
          <li key={entry.id} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", mine ? "bg-accent-soft" : "odd:bg-surface-2/60")}>
            <Rank index={index} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold uppercase tracking-wide">{entry.name}</span>
              <span className="text-xs text-subtle">
                Level {entry.level} · {entry.accuracy}% · best streak ×{entry.streak}
              </span>
            </span>
            <span className="tabular text-sm font-semibold">{entry.score.toLocaleString()}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function DailyBoardList({ board, loading, limit = 10, highlightHandle, highlightId }: { board: DailyBoard | null; loading?: boolean; limit?: number; highlightHandle?: string; highlightId?: string }) {
  if (loading && !board) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  }
  const entries = (board?.entries ?? []).slice(0, limit);
  if (!entries.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-strong px-5 py-8 text-center">
        <Trophy className="h-6 w-6 text-subtle" />
        <p className="text-sm font-medium">No scores yet today</p>
        <p className="max-w-[16rem] text-xs text-subtle">Finish today's eight questions and claim the top spot.</p>
      </div>
    );
  }
  const me = highlightId ?? getPlayerId();
  return (
    <ol className="space-y-1" aria-label="Today's daily leaderboard">
      {entries.map((entry, index) => {
        const mine = entry.id === me || Boolean(highlightHandle && entry.handle === highlightHandle.toUpperCase());
        return (
          <li key={`${entry.id}-${entry.at}`} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", mine ? "bg-accent-soft" : "odd:bg-surface-2/60")}>
            <Rank index={index} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide">
                {entry.handle}
                {mine && <span className="rounded-full bg-accent px-1.5 text-[10px] normal-case text-white">you</span>}
              </span>
              <span className="text-xs text-subtle">
                {entry.correct}/{entry.total} correct · ×{entry.streak}
              </span>
            </span>
            <span className="tabular text-sm font-semibold">{entry.score.toLocaleString()}</span>
          </li>
        );
      })}
    </ol>
  );
}

function countdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Today's daily board, auto-switching at midnight, with a live reset countdown. */
export function useDailyBoard() {
  const [date, setDate] = useState(() => dailyKey());
  const [board, setBoard] = useState<DailyBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [reset, setReset] = useState(() => countdown(nextDailyReset() - Date.now()));

  const refresh = useCallback(async () => {
    setLoading(true);
    setBoard(await fetchDailyBoard(date));
    setLoading(false);
  }, [date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setReset(countdown(nextDailyReset() - Date.now()));
      const key = dailyKey();
      setDate((previous) => (previous === key ? previous : key));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return { date, board, loading, reset, refresh };
}
