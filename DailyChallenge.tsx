import { useCallback, useEffect, useState } from "react";
import { cn } from "@/utils/cn";
import type { PublicAccount } from "@/game/auth";
import type { Deck } from "@/game/types";
import { DAILY_SECONDS, DAILY_SIZE } from "@/game/types";
import {
  buildDailyDeck,
  dailyKey,
  dailyStanding,
  dayLabel,
  fetchDailyBoard,
  loadLocalDaily,
  nextDailyReset,
  type DailyBoard,
  type DailyEntry,
} from "@/game/daily";
import { getPlayerId, loadInitials } from "@/game/storage";
import { sfx } from "@/game/sound";
import { Icon } from "./Icons";
import { Fernandez, FernandezSay } from "./Fernandez";

function countdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

const RANK_COLORS = ["bg-lime text-ink", "bg-lilac text-ink", "bg-coral text-ink"];

export function DailyBoardList({
  board,
  loading = false,
  limit = 6,
  highlightHandle,
  className,
}: {
  board: DailyBoard | null;
  loading?: boolean;
  limit?: number;
  highlightHandle?: string;
  className?: string;
}) {
  const [playerId, setPlayerId] = useState("");
  useEffect(() => setPlayerId(getPlayerId()), []);

  if (loading && !board) {
    return (
      <div className={cn("space-y-1.5", className)} aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex animate-pulse items-center gap-2 rounded-lg bg-cream/[0.05] px-2.5 py-2">
            <span className="h-6 w-6 rounded-full bg-cream/10" />
            <span className="h-2.5 flex-1 rounded-full bg-cream/10" />
            <span className="h-3 w-10 rounded-full bg-cream/10" />
          </div>
        ))}
      </div>
    );
  }

  const entries = (board?.entries ?? []).slice(0, limit);

  if (entries.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-cream/20 bg-cream/[0.035] px-4 py-7 text-center", className)}>
        <span className="grid h-10 w-10 place-items-center rounded-full border border-cream/25 text-lime">
          <Icon name="trophy" size={19} />
        </span>
        <p className="mt-2 font-display text-sm font-bold text-cream">First in today. Be boldly first.</p>
        <p className="mt-0.5 max-w-[220px] text-[10px] leading-relaxed text-cream/45">
          No one has posted a daily score yet. Finish the eight questions and claim the top row.
        </p>
      </div>
    );
  }

  return (
    <ol className={cn("space-y-1", className)} aria-label="Today's daily leaderboard">
      {entries.map((entry: DailyEntry, index) => {
        const isMe = entry.id === playerId || Boolean(highlightHandle && entry.handle === highlightHandle.toUpperCase());
        return (
          <li
            key={`${entry.id}-${entry.at}`}
            className={cn(
              "grid grid-cols-[1.65rem_1fr_auto] items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
              isMe ? "border-lime/60 bg-lime/15" : "border-transparent bg-cream/[0.045] hover:bg-cream/[0.075]",
            )}
          >
            <span
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full border font-mono text-[9px] font-medium",
                index < 3 ? RANK_COLORS[index] : "border-cream/25 bg-cream/5 text-cream/60",
                index === 0 && "border-2 border-ink shadow-[1.5px_1.5px_0_#1B1A14]",
              )}
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-display text-[12px] font-extrabold uppercase tracking-[0.04em] text-cream">
                {entry.handle}
              </span>
              {isMe && (
                <span className="rounded-full bg-lime px-1 py-0.5 font-mono text-[7px] uppercase tracking-[0.1em] text-ink">you</span>
              )}
              <span className="truncate font-mono text-[8px] uppercase tracking-[0.04em] text-cream/35">
                {entry.correct}/{entry.total} · ×{entry.streak}
              </span>
            </div>
            <span className={cn("font-display text-[13px] font-extrabold tabular-nums", isMe ? "text-lime" : "text-cream/80")}>
              {entry.score.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function DailyChallenge({
  account,
  onStartDaily,
}: {
  account: PublicAccount | null;
  onStartDaily: (deck: Deck, date: string) => void;
}) {
  const [date, setDate] = useState(() => dailyKey());
  const [board, setBoard] = useState<DailyBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [countdownText, setCountdownText] = useState(() => countdown(nextDailyReset() - Date.now()));

  const loadBoard = useCallback(
    async (targetDate: string, quiet = false) => {
      if (!quiet) setLoading(true);
      else setRefreshing(true);
      const result = await fetchDailyBoard(targetDate);
      setBoard(result);
      setLoading(false);
      setRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDailyBoard(date).then((result) => {
      if (!alive) return;
      setBoard(result);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [date]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      setCountdownText(countdown(nextDailyReset(new Date(current)) - current));
      const currentKey = dailyKey(new Date(current));
      setDate((previous) => (previous === currentKey ? previous : currentKey));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const myLocal = loadLocalDaily(date);
  const boardMe = board?.entries.find((entry) => entry.id === (account?.id || getPlayerId())) ?? null;
  const bestLocal = myLocal.reduce((best, entry) => Math.max(best, entry.score), 0);
  const myBest = Math.max(bestLocal, boardMe?.score ?? 0);
  const standing = board ? dailyStanding(board, account?.id || getPlayerId()) : { rank: 0, entry: null };
  const handle = account?.handle || loadInitials() || "YOU";
  const completed = Boolean(boardMe || myLocal.length > 0);

  const handlePlay = () => {
    sfx.tap();
    onStartDaily(buildDailyDeck(date), date);
  };

  return (
    <section id="daily" className="relative scroll-mt-24 overflow-hidden border-y border-ink/10 bg-paper px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
      <div className="pointer-events-none absolute inset-0 bg-dotgrid opacity-35" />
      <div className="relative mx-auto w-full max-w-[1240px]">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <span className="mb-3 inline-flex rotate-[-1deg] items-center gap-2 rounded-full border-2 border-ink bg-coral px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-ink shadow-[2px_2px_0_#1B1A14]">
              <Icon name="calendar" size={12} /> The Daily Drop
            </span>
            <h2 className="max-w-xl font-display text-[clamp(2rem,4.2vw,3.2rem)] font-extrabold leading-[0.98] tracking-[-0.045em]">
              Eight questions. <span className="font-serif font-normal italic">One shared board.</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-ink/15 bg-card/70 px-3 py-2">
            <Icon name="clock" size={14} className="text-muted" />
            <div>
              <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted">Next drop in</p>
              <p className="font-display text-[15px] font-extrabold leading-tight tabular-nums" aria-live="off">
                {countdownText}
              </p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[24px] border-2 border-ink bg-night text-cream shadow-[7px_7px_0_#B9A6F2]">
          <div className="pointer-events-none absolute inset-0 bg-dotgrid-light opacity-30" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-lime/10 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-coral/10 blur-[70px]" />

          <div className="relative grid lg:grid-cols-[1.06fr_0.94fr]">
            <div className="flex flex-col border-b border-cream/10 p-5 sm:p-6 lg:border-b-0 lg:border-r lg:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cream/20 bg-cream/[0.06] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-cream/65">
                  <Icon name="calendar" size={10} className="text-lime" /> {dayLabel(date)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-lime/35 bg-lime/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-lime">
                  <span className={cn("h-1.5 w-1.5 rounded-full", loading ? "animate-pulse bg-cream/50" : board?.online ? "bg-lime" : "bg-coral")} />
                  {loading ? "Connecting" : board?.online ? "Live shared" : "Offline copy"}
                </span>
              </div>

              <h3 className="mt-3 max-w-[350px] font-display text-[clamp(1.8rem,3.2vw,2.5rem)] font-extrabold leading-[0.95] tracking-[-0.045em]">
                Today&apos;s <span className="font-serif font-normal italic text-lime">daily recall.</span>
              </h3>
              <p className="mt-2 max-w-[370px] text-[13px] leading-relaxed text-cream/55">
                The same eight questions for everyone, every day. Replay as often as you like — your best score goes on the shared board.
              </p>

              <FernandezSay
                mood={completed ? "happy" : "focus"}
                size={56}
                tone="dark"
                className="mt-3"
                bubbleClassName="bg-[#24231c] flex-1"
              >
                {completed
                  ? "You're on the board. Again? I could go again."
                  : "Eight questions, one board. Let's put your tag up top."}
              </FernandezSay>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["calendar", `${DAILY_SIZE} questions`],
                  ["clock", `${DAILY_SECONDS}s clock`],
                  ["globe", "Shared rank"],
                ].map(([icon, label]) => (
                  <div key={label} className="rounded-xl border border-cream/12 bg-cream/[0.05] px-2 py-2">
                    <Icon name={icon as "calendar"} size={13} className="mb-1 text-lime" />
                    <p className="font-display text-[11px] font-bold leading-tight text-cream/80">{label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 rounded-xl border border-cream/15 bg-cream/[0.05] px-3 py-2">
                  <p className="font-mono text-[8px] uppercase tracking-[0.11em] text-cream/40">Your best today</p>
                  <div className="flex items-baseline gap-2">
                    <p className="font-display text-[20px] font-extrabold leading-tight tabular-nums text-lime">{myBest.toLocaleString()}</p>
                    <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-cream/40">
                      {completed ? standing.rank > 0 ? `rank #${standing.rank}` : "posted" : "not played"}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-cream/15 bg-cream/[0.05] px-3 py-2 text-center">
                  <p className="font-mono text-[8px] uppercase tracking-[0.11em] text-cream/40">Tag</p>
                  <p className="font-display text-[15px] font-extrabold uppercase tracking-[0.12em]">{handle}</p>
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-2 pt-4">
                <button
                  type="button"
                  onClick={handlePlay}
                  className="press group inline-flex items-center justify-between gap-3 rounded-xl border-2 border-lime bg-lime px-3 py-3 text-ink shadow-[4px_4px_0_#FFFCF2]"
                >
                  <span className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg border border-ink/20 bg-ink text-lime">
                      <Icon name="play" size={14} />
                    </span>
                    <span className="text-left">
                      <span className="block font-display text-[15px] font-extrabold leading-tight">
                        {completed ? "Beat your daily best" : "Play today's drop"}
                      </span>
                      <span className="block font-mono text-[8px] uppercase tracking-[0.1em] text-ink/50">
                        {DAILY_SIZE} questions · one daily board
                      </span>
                    </span>
                  </span>
                  <Icon name="arrow" size={17} className="transition-transform group-hover:translate-x-0.5" />
                </button>
                {!account && (
                  <p className="text-center font-mono text-[8px] uppercase tracking-[0.08em] text-cream/35">
                    Guest tag: {handle} · sign in to use your profile tag
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col p-5 sm:p-6 lg:p-7">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-ink bg-lime text-ink">
                    <Fernandez size={25} mood="happy" bob={false} className="translate-y-[3px]" />
                  </span>
                  <div>
                    <p className="font-display text-[13px] font-bold leading-tight">Daily leaders</p>
                    <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-cream/40">
                      {loading ? "fetching scores" : `${board?.entries.length ?? 0} posted · shared online`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadBoard(date, true)}
                  disabled={loading || refreshing}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cream/20 px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-cream/55 transition-colors hover:border-lime/60 hover:text-lime disabled:opacity-50"
                  aria-label="Refresh daily leaderboard"
                >
                  <Icon name="refresh" size={11} className={refreshing ? "animate-spin" : ""} />
                  {refreshing ? "Syncing" : "Refresh"}
                </button>
              </div>

              <DailyBoardList board={board} loading={loading} limit={7} highlightHandle={account?.handle} />

              {board && !board.online && !loading && (
                <p className="mt-2 rounded-lg border border-coral/30 bg-coral/10 px-2.5 py-1.5 font-mono text-[8px] uppercase leading-relaxed tracking-[0.06em] text-coral">
                  Shared board unreachable. Showing your saved daily scores — try refresh.
                </p>
              )}

              <div className="mt-auto pt-3">
                <div className="flex items-start gap-2 rounded-xl border border-cream/12 bg-cream/[0.04] px-2.5 py-2">
                  <Icon name="globe" size={13} className="mt-0.5 shrink-0 text-lime" />
                  <p className="text-[10px] leading-relaxed text-cream/45">
                    Shared board sends only your <span className="text-cream/70">board tag, score, accuracy, streak</span> and day. Never your notes, email, or password.
                  </p>
                </div>
                <p className="mt-2 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.08em] text-cream/30">
                  <span>Resets at local midnight</span>
                  <span>{now > 0 ? dayLabel(date) : ""}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
