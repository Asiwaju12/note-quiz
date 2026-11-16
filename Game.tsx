import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import { cn } from "@/utils/cn";
import { buildQueue } from "@/game/deck";
import {
  DAILY_SECONDS,
  DAILY_SIZE,
  LEVEL_SIZE,
  MAX_LIVES,
  levelName,
  levelTime,
  rankFor,
  type Deck,
  type Pace,
  type Question,
  type ScoreEntry,
} from "@/game/types";
import {
  loadLastStartId,
  loadPlayed,
  loadScores,
  renameScore,
  saveLastStartId,
  savePlayed,
  saveScore,
} from "@/game/storage";
import type { PublicAccount } from "@/game/auth";
import {
  dailyStanding,
  dayLabel,
  submitDailyScore,
  type DailyBoard,
} from "@/game/daily";
import { sfx } from "@/game/sound";
import { Icon } from "./Icons";
import { Avatar } from "./Avatar";
import { HighScoreTable } from "./HighScoreTable";
import { DailyBoardList } from "./DailyChallenge";
import {
  Fernandez,
  FernandezSay,
  FERNANDEZ_CORRECT_LINES,
  FERNANDEZ_IDLE_LINES,
  FERNANDEZ_LEVEL_LINES,
  FERNANDEZ_WRONG_LINES,
  fernandezLine,
} from "./Fernandez";
import type { ParticleHandle } from "./ParticleField";
import { AnimatedNumber, Hearts, Logo, SoundToggle } from "./ui";

type Phase = "playing" | "paused" | "levelup" | "over";
type Status = "idle" | "correct" | "wrong";

type GameState = {
  deck: Deck;
  queue: Question[];
  runId: string;
  index: number;
  selected: number | null;
  status: Status;
  phase: Phase;
  level: number;
  levelWins: number;
  levelMisses: number;
  score: number;
  lives: number;
  streak: number;
  bestStreak: number;
  correct: number;
  answered: number;
  gained: number;
  levelUpPending: boolean;
  timedOut: boolean;
  maxQuestions: number;
  daily: boolean;
  pace: Pace;
};

type Action =
  | { type: "answer"; choice: number; timeLeftMs: number; limitMs: number }
  | { type: "timeout" }
  | { type: "advance" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "continue" }
  | { type: "restart" };

function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createInitial(
  deck: Deck,
  options: { pace: Pace; daily: boolean; maxQuestions: number },
): GameState {
  const queue = buildQueue(deck, Math.max(60, options.maxQuestions), {
    avoidFirstId: options.daily ? undefined : loadLastStartId(),
    randomizeOptions: !options.daily,
  });
  return {
    deck,
    queue,
    maxQuestions: options.maxQuestions,
    daily: options.daily,
    pace: options.pace,
    runId: newRunId(),
    index: 0,
    selected: null,
    status: "idle",
    phase: "playing",
    level: 1,
    levelWins: 0,
    levelMisses: 0,
    score: 0,
    lives: MAX_LIVES,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answered: 0,
    gained: 0,
    levelUpPending: false,
    timedOut: false,
  };
}

function resetBoard(state: GameState): GameState {
  return {
    ...state,
    index: state.index + 1,
    selected: null,
    status: "idle",
    phase: "playing",
    levelWins: state.levelUpPending ? 0 : state.levelWins,
    levelMisses: state.levelUpPending ? 0 : state.levelMisses,
    level: state.levelUpPending ? state.level + 1 : state.level,
    gained: 0,
    levelUpPending: false,
    timedOut: false,
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "answer": {
      if (state.phase !== "playing" || state.status !== "idle") return state;
      const question = state.queue[state.index];
      if (!question) return state;
      const isCorrect = action.choice === question.answer;
      if (isCorrect) {
        const ratio = action.limitMs > 0 ? Math.max(0, Math.min(1, action.timeLeftMs / action.limitMs)) : 0;
        const base = 100 + state.level * 20;
        const timeBonus = Math.round(ratio * 80);
        const streakBonus = state.streak * 15;
        const gained = base + timeBonus + streakBonus;
        const levelWins = state.levelWins + 1;
        return {
          ...state,
          selected: action.choice,
          status: "correct",
          score: state.score + gained,
          gained,
          streak: state.streak + 1,
          bestStreak: Math.max(state.bestStreak, state.streak + 1),
          correct: state.correct + 1,
          answered: state.answered + 1,
          levelWins,
          levelUpPending: levelWins >= LEVEL_SIZE && state.answered + 1 < state.maxQuestions,
          timedOut: false,
        };
      }
      return {
        ...state,
        selected: action.choice,
        status: "wrong",
        lives: Math.max(0, state.lives - 1),
        streak: 0,
        answered: state.answered + 1,
        levelMisses: state.levelMisses + 1,
        gained: 0,
        timedOut: false,
      };
    }
    case "timeout": {
      if (state.phase !== "playing" || state.status !== "idle") return state;
      return {
        ...state,
        selected: null,
        status: "wrong",
        lives: Math.max(0, state.lives - 1),
        streak: 0,
        answered: state.answered + 1,
        levelMisses: state.levelMisses + 1,
        gained: 0,
        timedOut: true,
      };
    }
    case "advance": {
      if (state.phase !== "playing" || state.status === "idle") return state;
      if (state.lives <= 0 || state.answered >= state.maxQuestions) {
        return { ...state, phase: "over" };
      }
      if (state.levelUpPending) {
        const perfect = state.levelMisses === 0;
        return {
          ...state,
          phase: "levelup",
          score: state.score + state.level * 150,
          lives: perfect ? Math.min(MAX_LIVES, state.lives + 1) : state.lives,
        };
      }
      return resetBoard(state);
    }
    case "continue": {
      if (state.phase !== "levelup") return state;
      const next = resetBoard({ ...state, levelUpPending: true });
      return { ...next, phase: "playing" };
    }
    case "pause":
      return state.phase === "playing" ? { ...state, phase: "paused" } : state;
    case "resume":
      return state.phase === "paused" ? { ...state, phase: "playing" } : state;
    case "restart":
      return createInitial(state.deck, {
        pace: state.pace,
        daily: state.daily,
        maxQuestions: state.maxQuestions,
      });
    default:
      return state;
  }
}

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* haptics are optional */
  }
}

function QuestionTimer({
  timeKey,
  limit,
  paused,
  frozen,
  onExpire,
  onTick,
}: {
  timeKey: string;
  limit: number;
  paused: boolean;
  frozen: boolean;
  onExpire: () => void;
  onTick: (remainingMs: number) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const remainingRef = useRef(limit * 1000);
  const expireRef = useRef(onExpire);
  const tickRef = useRef(onTick);
  expireRef.current = onExpire;
  tickRef.current = onTick;

  useEffect(() => {
    remainingRef.current = limit * 1000;
    if (barRef.current) barRef.current.style.transform = "scaleX(1)";
    if (barRef.current) barRef.current.style.backgroundColor = "#CBF54A";
    if (textRef.current) {
      textRef.current.textContent = String(limit);
      textRef.current.style.color = "#1B1A14";
    }
    tickRef.current(remainingRef.current);
  }, [timeKey, limit]);

  useEffect(() => {
    if (paused || frozen) return;
    const total = limit * 1000;
    const deadline = performance.now() + remainingRef.current;
    let raf = 0;
    let lastSecond = Math.ceil(remainingRef.current / 1000);

    const paint = (remaining: number) => {
      const ratio = Math.max(0, Math.min(1, remaining / total));
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${ratio})`;
        barRef.current.style.backgroundColor = ratio <= 0.28 ? "#FF8061" : ratio <= 0.55 ? "#B9A6F2" : "#CBF54A";
      }
      const seconds = Math.max(0, Math.ceil(remaining / 1000));
      if (textRef.current && seconds !== lastSecond) {
        lastSecond = seconds;
        textRef.current.textContent = String(seconds);
        textRef.current.style.color = ratio <= 0.28 ? "#C4341A" : "#1B1A14";
      }
    };

    const frame = () => {
      const remaining = Math.max(0, deadline - performance.now());
      remainingRef.current = remaining;
      tickRef.current(remaining);
      paint(remaining);
      if (remaining <= 0) {
        expireRef.current();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [timeKey, limit, paused, frozen]);

  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="flex items-center gap-1.5 text-muted">
        <Icon name="clock" size={14} />
        <span className="font-mono text-[9px] uppercase tracking-[0.12em]">Time</span>
      </div>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full border border-ink/15 bg-ink/10">
        <div
          ref={barRef}
          className="absolute inset-0 origin-left rounded-full bg-lime will-change-transform"
          style={{ transform: "scaleX(1)" }}
        />
      </div>
      <div className="flex w-[2.5rem] items-baseline justify-end gap-0.5">
        <span ref={textRef} className="font-display text-[17px] font-extrabold leading-none tabular-nums">
          {limit}
        </span>
        <span className="font-mono text-[9px] uppercase text-muted">s</span>
      </div>
    </div>
  );
}

export function Game({
  deck,
  account,
  pace,
  daily = false,
  dailyDate = "",
  initials,
  onInitialsChange,
  muted,
  onToggleSound,
  onExit,
  onSignIn,
  particles,
}: {
  deck: Deck;
  account: PublicAccount | null;
  pace: Pace;
  daily?: boolean;
  dailyDate?: string;
  initials: string;
  onInitialsChange: (value: string) => void;
  muted: boolean;
  onToggleSound: () => void;
  onExit: () => void;
  onSignIn: () => void;
  particles: RefObject<ParticleHandle | null>;
}) {
  const runPace: Pace = daily ? "standard" : pace;
  const maxQuestions = daily ? DAILY_SIZE : 1000;
  const [state, dispatch] = useReducer(reducer, deck, (initialDeck) =>
    createInitial(initialDeck, { pace: runPace, daily, maxQuestions }),
  );
  const timeLeftRef = useRef((daily ? DAILY_SECONDS : levelTime(1, runPace)) * 1000);
  const savedRunRef = useRef<string | null>(null);
  const initialsRef = useRef(initials);
  const [board, setBoard] = useState<ScoreEntry[]>(() => loadScores());
  initialsRef.current = initials;

  const question = state.queue[state.index];
  const limit = daily ? DAILY_SECONDS : levelTime(state.level, state.pace);

  useEffect(() => {
    if (!daily && state.queue[0]) saveLastStartId(state.queue[0].id);
  }, [daily, state.runId, state.queue]);

  const finalQuestion = state.answered >= state.maxQuestions;
  const timedOutRef = useRef(false);

  const burstFromAnswer = (index: number, colors?: string[], count = 30) => {
    const element = document.getElementById(`answer-${index}`);
    if (!element) {
      particles.current?.burst(window.innerWidth / 2, window.innerHeight / 2, { count, colors });
      return;
    }
    const rect = element.getBoundingClientRect();
    particles.current?.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, {
      count,
      colors,
      power: 470,
    });
  };

  const selectAnswer = (choice: number) => {
    if (!question || state.phase !== "playing" || state.status !== "idle") return;
    const isCorrect = choice === question.answer;
    dispatch({ type: "answer", choice, timeLeftMs: timeLeftRef.current, limitMs: limit * 1000 });
    if (isCorrect) {
      sfx.correct(state.streak);
      burstFromAnswer(choice);
      vibrate(14);
    } else {
      sfx.wrong();
      burstFromAnswer(choice, ["#FF8061", "#1B1A14", "#FFFCF2"], 20);
      vibrate([25, 35, 25]);
    }
  };

  const handleExpire = () => {
    if (timedOutRef.current) return;
    timedOutRef.current = true;
    dispatch({ type: "timeout" });
    sfx.timeout();
    vibrate([30, 40, 30]);
    particles.current?.burst(window.innerWidth / 2, window.innerHeight * 0.4, {
      count: 16,
      colors: ["#FF8061", "#1B1A14", "#B9A6F2"],
      power: 340,
    });
  };

  const advance = () => {
    if (state.status === "idle") return;
    dispatch({ type: "advance" });
    if (state.lives <= 0) return;
    sfx.tap();
  };

  const continueLevel = () => {
    dispatch({ type: "continue" });
    sfx.tap();
  };

  const restart = () => {
    timersReset();
    dispatch({ type: "restart" });
    sfx.start();
  };

  const togglePause = () => {
    if (state.phase === "playing") {
      dispatch({ type: "pause" });
      sfx.pause();
    } else if (state.phase === "paused") {
      dispatch({ type: "resume" });
      sfx.tap();
    }
  };

  const timersReset = () => {
    timedOutRef.current = false;
  };

  useEffect(() => {
    timersReset();
  }, [state.index, state.runId]);

  useEffect(() => {
    if (state.phase === "levelup") {
      sfx.levelUp();
      particles.current?.shower();
      vibrate([20, 40, 20, 40]);
    }
    if (state.phase === "over") {
      sfx.gameOver();
      vibrate([40, 60, 40]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "over") return;
    const entry: ScoreEntry = {
      id: state.runId,
      name: initialsRef.current || "YOU",
      score: state.score,
      level: state.level,
      streak: state.bestStreak,
      accuracy: state.answered > 0 ? Math.round((state.correct / state.answered) * 100) : 0,
      date: new Date().toISOString(),
    };
    saveScore(entry);
    if (savedRunRef.current !== state.runId) {
      savedRunRef.current = state.runId;
      savePlayed(loadPlayed() + 1);
    }
    setBoard(loadScores());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.runId]);

  useEffect(() => {
    if (state.phase !== "over") return;
    setBoard((previous) =>
      previous.map((entry) => (entry.id === state.runId ? { ...entry, name: initials || "YOU" } : entry)),
    );
    renameScore(state.runId, initials || "YOU");
  }, [initials, state.phase, state.runId]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) dispatch({ type: "pause" });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();

      if (state.phase === "over") {
        if (key === "r") {
          event.preventDefault();
          restart();
        }
        if (key === "escape") {
          event.preventDefault();
          onExit();
        }
        return;
      }

      if (state.phase === "levelup") {
        if (key === "enter" || key === " " || key === "n") {
          event.preventDefault();
          continueLevel();
        }
        return;
      }

      if (state.phase === "paused") {
        if (key === "p" || key === "escape" || key === " ") {
          event.preventDefault();
          togglePause();
        }
        if (key === "r") {
          event.preventDefault();
          restart();
        }
        return;
      }

      if (state.phase === "playing") {
        if (key === "p" || key === "escape") {
          event.preventDefault();
          togglePause();
          return;
        }
        if (key === "r") {
          event.preventDefault();
          restart();
          return;
        }
        if (state.status === "idle") {
          const numeric = Number(key);
          if (numeric >= 1 && numeric <= 4) {
            event.preventDefault();
            selectAnswer(numeric - 1);
            return;
          }
          const letterIndex = ["a", "b", "c", "d"].indexOf(key);
          if (letterIndex >= 0) {
            event.preventDefault();
            selectAnswer(letterIndex);
          }
          return;
        }
        if (key === "enter" || key === " " || key === "n") {
          event.preventDefault();
          advance();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.status, state.index, state.level, state.lives]);

  if (state.phase === "over") {
    return (
      <Results
        state={state}
        board={board}
        account={account}
        daily={daily}
        dailyDate={dailyDate}
        initials={initials}
        onInitialsChange={onInitialsChange}
        muted={muted}
        onToggleSound={onToggleSound}
        onRestart={restart}
        onExit={onExit}
        onSignIn={onSignIn}
      />
    );
  }

  const earnedRank = rankFor(state.score);

  return (
    <div className="grain relative flex min-h-dvh flex-col overflow-hidden bg-night text-cream">
      <div className="pointer-events-none absolute inset-0 bg-dotgrid-light opacity-40" aria-hidden="true" />
      <div
        className="pointer-events-none absolute left-1/2 top-[-22rem] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-lime/10 blur-[120px]"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-lilac/10 blur-[100px]" aria-hidden="true" />

      <header className="relative z-20 border-b border-cream/10">
        <div className="mx-auto flex h-14 w-full max-w-[940px] items-center justify-between gap-2 px-3 sm:h-16 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={state.phase === "playing" ? togglePause : () => onExit()}
              aria-label="Pause and exit run"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-cream/20 text-cream/70 transition-colors hover:border-cream/50 hover:bg-cream/10 hover:text-cream"
            >
              <Icon name="arrow-left" size={16} />
            </button>
            <Logo dark compact />
            {account && (
              <span className="hidden items-center gap-1.5 rounded-full border border-cream/15 bg-cream/[0.05] py-0.5 pl-0.5 pr-2 lg:flex">
                <Avatar account={account} size="xs" />
                <span className="max-w-[100px] truncate font-mono text-[9px] uppercase tracking-[0.08em] text-cream/60">{account.name}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Hearts lives={state.lives} animateKey={state.answered} className="mr-1" />
            <SoundToggle muted={muted} onToggle={onToggleSound} dark />
            <button
              type="button"
              onClick={togglePause}
              aria-label={state.phase === "paused" ? "Resume game" : "Pause game"}
              className="grid h-9 w-9 place-items-center rounded-full border-2 border-cream/25 text-cream transition-colors hover:border-lime hover:bg-lime hover:text-ink"
            >
              <Icon name={state.phase === "paused" ? "play" : "pause"} size={15} />
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-[940px] flex-1 flex-col px-3 pb-4 pt-3 sm:px-5 sm:pt-5">
        <div className="flex flex-1 flex-col justify-center">
        <div className="mb-3 flex items-stretch gap-2 sm:mb-4">
          <div className="relative flex flex-1 flex-col justify-center rounded-xl border border-cream/15 bg-cream/[0.055] px-3 py-2 sm:px-4">
            <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-cream/45">Score</span>
            <div className="flex items-baseline gap-2">
              <AnimatedNumber value={state.score} className="font-display text-[22px] font-extrabold leading-none tabular-nums text-lime sm:text-[26px]" />
              {state.gained > 0 && (
                <span key={state.answered} className="animate-score-float font-mono text-[11px] font-medium text-lime">
                  +{state.gained}
                </span>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-[1.15] flex-col justify-center rounded-xl border border-cream/15 bg-cream/[0.055] px-3 py-2 sm:px-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-cream/45">Level {String(state.level).padStart(2, "0")}</span>
              <span className="hidden truncate font-serif text-[12px] italic text-cream/60 sm:block">{levelName(state.level)}</span>
            </div>
            <div className="mt-1.5 flex gap-1" aria-label={`${state.levelWins} of ${LEVEL_SIZE} correct in this level`}>
              {Array.from({ length: LEVEL_SIZE }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-all duration-300",
                    index < state.levelWins ? "bg-lime" : "bg-cream/15",
                  )}
                />
              ))}
            </div>
          </div>

          <div
            className={cn(
              "flex min-w-[3.8rem] flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors sm:min-w-[5rem]",
              state.streak >= 3 ? "border-lime/60 bg-lime text-ink" : "border-cream/15 bg-cream/[0.055] text-cream",
            )}
          >
            <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.14em] opacity-60">
              <Icon name="flame" size={9} className={state.streak >= 3 ? "text-ink" : "text-coral"} /> streak
            </span>
            <span key={state.streak} className={cn("font-display text-[20px] font-extrabold leading-none", state.streak > 0 && "animate-pop")}>
              ×{state.streak}
            </span>
          </div>
        </div>

        <div className={cn("relative", state.status === "wrong" && "animate-shake", state.status === "correct" && "animate-card-pop")}>
          <div className="relative overflow-hidden rounded-[18px] border-2 border-ink bg-card text-ink shadow-[0_28px_80px_-24px_rgba(0,0,0,0.65)]">
            <div className="flex items-center justify-between gap-2 border-b-2 border-ink bg-paper px-3.5 py-2 sm:px-5">
              <span className="flex min-w-0 items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink/65">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", state.daily ? "bg-coral" : state.deck.kind === "notes" ? "bg-coral" : "bg-lime-deep")} />
                <span className="truncate">
                  {state.daily
                    ? `Daily drop · ${state.maxQuestions} questions`
                    : state.deck.kind === "notes"
                      ? "From your notes"
                      : "Random mix · fresh every run"}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-ink/20 bg-card px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]">
                Q{String(state.index + 1).padStart(2, "0")}
              </span>
            </div>

            <div className="p-3.5 sm:p-5 lg:p-6">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-ink bg-sky/60 px-2.5 py-1 font-mono text-[8px] font-medium uppercase tracking-[0.13em]">
                  <Icon name="sparkle" size={9} /> {question?.category ?? "Recall"}
                </span>
                <span className="hidden font-serif text-[13px] italic text-muted sm:block">trust the notes</span>
              </div>

              <h1 className="mb-3 text-balance font-display text-[clamp(1.2rem,4.4vw,1.72rem)] font-bold leading-[1.18] tracking-[-0.02em] sm:mb-4">
                {question?.prompt}
              </h1>

              <QuestionTimer
                timeKey={`${state.runId}-${state.index}`}
                limit={limit}
                paused={state.phase === "paused"}
                frozen={state.status !== "idle" || state.phase !== "playing"}
                onExpire={handleExpire}
                onTick={(remaining) => {
                  timeLeftRef.current = remaining;
                }}
              />

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {question?.options.map((option, index) => {
                  const isCorrect = state.status !== "idle" && index === question.answer;
                  const isWrongPick = state.status === "wrong" && state.selected === index;
                  const mutedOption = state.status !== "idle" && !isCorrect && !isWrongPick;
                  return (
                    <button
                      key={`${question.id}-${index}`}
                      id={`answer-${index}`}
                      type="button"
                      onClick={() => selectAnswer(index)}
                      disabled={state.status !== "idle"}
                      aria-label={`Answer ${index + 1}: ${option}`}
                      className={cn(
                        "press group relative flex min-h-[58px] w-full items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all duration-150 sm:min-h-[64px]",
                        state.status === "idle"
                          ? "border-ink/20 bg-paper/70 hover:border-ink hover:bg-card hover:shadow-[3px_3px_0_#1B1A14]"
                          : isCorrect
                            ? "border-ink bg-lime shadow-[3px_3px_0_#1B1A14]"
                            : isWrongPick
                              ? "border-ink bg-coral shadow-[3px_3px_0_#1B1A14]"
                              : "border-ink/15 bg-paper/50 opacity-55",
                        mutedOption && "grayscale-[35%]",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-md border font-mono text-[11px] font-medium transition-colors sm:h-8 sm:w-8",
                          isCorrect
                            ? "border-ink bg-ink text-lime"
                            : isWrongPick
                              ? "border-ink bg-ink text-coral"
                              : "border-ink/25 bg-card text-ink/60 group-hover:border-ink group-hover:text-ink",
                        )}
                      >
                        {isCorrect ? <Icon name="check" size={14} /> : isWrongPick ? <Icon name="close" size={13} /> : index + 1}
                      </span>
                      <span className="flex-1 text-[13px] font-medium leading-snug text-ink sm:text-[14px]">{option}</span>
                      <span className="hidden shrink-0 font-mono text-[9px] uppercase tracking-wider text-ink/30 sm:block">{["1", "2", "3", "4"][index]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 min-h-[92px] sm:min-h-[86px]">
                {state.status === "idle" ? (
                  <div className="flex h-full min-h-[74px] items-center justify-between gap-3 rounded-xl border border-dashed border-ink/20 bg-paper/40 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Fernandez size={44} mood="focus" />
                      <div className="min-w-0">
                        <p className="font-mono text-[8px] font-medium uppercase tracking-[0.14em] text-muted">Fernandez says</p>
                        <p className="truncate font-display text-[12px] font-bold leading-tight">
                          {fernandezLine(FERNANDEZ_IDLE_LINES, state.index + state.level)}
                        </p>
                        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">Tap a card or press 1–4</p>
                      </div>
                    </div>
                    <span className="hidden shrink-0 rounded-full border border-ink/15 bg-card px-2.5 py-1 font-mono text-[9px] text-muted sm:block">
                      {state.daily ? "one shot · your best counts" : "faster = more points"}
                    </span>
                  </div>
                ) : (
                  <div
                    role="status"
                    aria-live="polite"
                    className={cn(
                      "animate-scale-in rounded-xl border-2 px-3 py-2.5 sm:px-4",
                      state.status === "correct" ? "border-ink bg-lime/35" : "border-ink bg-coral/25",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <Fernandez
                          size={42}
                          mood={state.status === "correct" ? "happy" : "worried"}
                          bob={state.status === "correct"}
                          className="-mt-1"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-display text-[14px] font-extrabold leading-tight">
                              {state.status === "correct"
                                ? fernandezLine(FERNANDEZ_CORRECT_LINES, state.index)
                                : fernandezLine(FERNANDEZ_WRONG_LINES, state.index)}
                            </p>
                            <span
                              className={cn(
                                "rounded-full border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em]",
                                state.status === "correct" ? "border-ink/25 bg-lime" : "border-ink/25 bg-coral",
                              )}
                            >
                              {state.status === "correct" ? "correct" : state.timedOut ? "time up" : "wrong"}
                            </span>
                            {state.gained > 0 && (
                              <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[9px] font-medium text-lime">+{state.gained}</span>
                            )}
                            {state.status === "wrong" && (
                              <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[9px] font-medium text-coral">−1 heart</span>
                            )}
                            {state.levelUpPending && (
                              <span className="rounded-full border border-ink bg-lilac px-2 py-0.5 font-mono text-[9px] font-medium">level cleared</span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink/65 sm:text-[12px]">{question?.explanation}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={advance}
                        className="press hidden shrink-0 items-center gap-1.5 rounded-lg border-2 border-ink bg-ink px-3 py-2 font-display text-[12px] font-bold text-cream shadow-[2px_2px_0_#CBF54A] sm:inline-flex"
                      >
                        {state.lives <= 0 || finalQuestion
                          ? daily
                            ? "Daily results"
                            : "Results"
                          : state.levelUpPending
                            ? "Level up"
                            : "Next"}
                        <Icon name="arrow" size={13} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={advance}
                      className="press mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-ink bg-ink px-3 py-2 font-display text-[12px] font-bold text-cream sm:hidden"
                    >
                      {state.lives <= 0 || finalQuestion
                        ? "See results"
                        : state.levelUpPending
                          ? "See level clear"
                          : "Next question"}
                      <Icon name="arrow" size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 px-1 font-mono text-[8px] uppercase tracking-[0.12em] text-cream/35 sm:mt-3">
          <span className="hidden sm:inline">1–4 answer · enter next · P pause · R restart</span>
          <span className="sm:hidden">tap answer · tap next</span>
          <span className="inline-flex items-center gap-1">
            <Icon name="target" size={10} /> rank: {earnedRank.label}
          </span>
        </div>
      </div>

      {state.phase === "paused" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-night/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[380px] animate-scale-in">
            <div className="relative overflow-hidden rounded-[20px] border-2 border-ink bg-card p-5 text-ink shadow-[7px_7px_0_#CBF54A]">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-paper px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                  <Icon name="pause" size={10} /> Timeout
                </span>
                <span className="rounded-full bg-lime px-2 py-0.5 font-mono text-[8px] uppercase tracking-widest">run on hold</span>
              </div>
              <h2 className="font-display text-[42px] font-extrabold leading-none tracking-[-0.05em]">
                Paused<span className="font-serif font-normal italic text-coral">.</span>
              </h2>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Fernandez size={52} mood="sleepy" className="-ml-1 shrink-0" />
                <p className="font-serif text-[15px] italic leading-snug text-muted">
                  “Clock&apos;s frozen. Stretch. I&apos;ll guard the hearts.”
                </p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  ["Score", state.score.toLocaleString()],
                  ["Level", String(state.level).padStart(2, "0")],
                  ["Streak", `×${state.streak}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-ink/15 bg-paper/70 px-2 py-1.5">
                    <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted">{label}</p>
                    <p className="font-display text-base font-extrabold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={togglePause}
                className="press mt-4 inline-flex w-full items-center justify-between gap-2 rounded-xl border-2 border-ink bg-lime px-4 py-3 font-display text-[15px] font-extrabold text-ink shadow-hard-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <Icon name="play" size={14} /> Resume run
                </span>
                <span className="font-mono text-[9px] uppercase tracking-wider opacity-50">P</span>
              </button>

              {!account && (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="press mt-2 inline-flex w-full items-center justify-between gap-2 rounded-lg border border-ink/25 bg-paper/70 px-3 py-2 text-left transition-colors hover:border-ink hover:bg-lime/30"
                >
                  <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em]">
                    <Icon name="user" size={11} /> Sign in · save this run
                  </span>
                  <Icon name="arrow" size={12} className="text-muted" />
                </button>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={restart}
                  className="press inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-ink/20 bg-card px-3 py-2.5 font-display text-[12px] font-bold hover:border-ink"
                >
                  <Icon name="restart" size={13} /> Restart
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="press inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-ink/20 bg-card px-3 py-2.5 font-display text-[12px] font-bold hover:border-ink"
                >
                  <Icon name="home" size={13} /> Exit run
                </button>
              </div>
              <p className="mt-3 text-center font-mono text-[8px] uppercase tracking-[0.12em] text-muted">No score is saved when you exit early.</p>
            </div>
          </div>
        </div>
      )}

      {state.phase === "levelup" && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/85 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-[420px] animate-scale-in overflow-hidden rounded-[22px] border-2 border-ink bg-lime p-5 text-ink shadow-[8px_8px_0_#FFFCF2] sm:p-6">
            <div className="pointer-events-none absolute inset-0 bg-dotgrid opacity-25" />
            <svg className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 text-ink/10" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <path d="m50 4 12 30 32 2-24 21 7 31-27-17-27 17 7-31L6 36l32-2L50 4Z" stroke="currentColor" strokeWidth="2" />
            </svg>
            <div className="relative">
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-full border-2 border-ink bg-ink px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-lime">
                  Level {state.level} cleared
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em]">
                  <Icon name="check" size={12} strokeWidth={3} /> {state.levelMisses === 0 ? "flawless" : "through"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-[38px] font-extrabold leading-[0.92] tracking-[-0.05em] sm:text-[46px]">
                    Level up<span className="font-serif font-normal italic">.</span>
                  </h2>
                  <p className="mt-1 max-w-[260px] font-serif text-[15px] italic leading-snug text-ink/70">
                    “{fernandezLine(FERNANDEZ_LEVEL_LINES, state.level)}”
                  </p>
                </div>
                <Fernandez size={84} mood="hyped" bob={false} className="-mr-2 -mt-2 shrink-0" />
              </div>
              <div className="mt-1.5 flex items-end gap-2">
                <span className="font-display text-[64px] font-extrabold leading-none tracking-[-0.06em] sm:text-[76px]">
                  {String(state.level + 1).padStart(2, "0")}
                </span>
                <div className="mb-1.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink/55">now entering</p>
                  <p className="font-serif text-[20px] italic leading-none">{levelName(state.level + 1)}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border-2 border-ink bg-card/80 px-3 py-2">
                  <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted">Level bonus</p>
                  <p className="font-display text-xl font-extrabold">+{state.level * 150}</p>
                </div>
                <div className="rounded-xl border-2 border-ink bg-card/80 px-3 py-2">
                  <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted">Next timer</p>
                  <p className="font-display text-xl font-extrabold">
                    {state.daily ? `${DAILY_SECONDS}s` : `${levelTime(state.level + 1, state.pace)}s`}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/20 bg-paper/60 px-3 py-2">
                <Icon name="heart" size={14} className={state.levelMisses === 0 ? "text-coral" : "text-ink/30"} />
                <p className="text-[11px] font-medium">
                  {state.levelMisses === 0 ? "Flawless level. One heart restored." : `${state.levelMisses} slip${state.levelMisses > 1 ? "s" : ""} this level. Hearts refill on a perfect clear.`}
                </p>
              </div>

              <button
                type="button"
                onClick={continueLevel}
                className="press mt-4 inline-flex w-full items-center justify-between gap-2 rounded-xl border-2 border-ink bg-ink px-4 py-3 font-display text-[15px] font-extrabold text-cream shadow-[3px_3px_0_#FFFCF2]"
              >
                <span className="inline-flex items-center gap-2">
                  Keep the streak <Icon name="arrow" size={15} />
                </span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-cream/50">Enter</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Results({
  state,
  board,
  account,
  daily,
  dailyDate,
  initials,
  onInitialsChange,
  muted,
  onToggleSound,
  onRestart,
  onExit,
  onSignIn,
}: {
  state: GameState;
  board: ScoreEntry[];
  account: PublicAccount | null;
  daily: boolean;
  dailyDate: string;
  initials: string;
  onInitialsChange: (value: string) => void;
  muted: boolean;
  onToggleSound: () => void;
  onRestart: () => void;
  onExit: () => void;
  onSignIn: () => void;
}) {
  const accuracy = state.answered > 0 ? Math.round((state.correct / state.answered) * 100) : 0;
  const rank = rankFor(state.score);
  const best = board[0]?.score ?? state.score;
  const isNewBest = state.score > 0 && state.score >= best && state.answered > 0;
  const isTopFive = board.slice(0, 5).some((entry) => entry.id === state.runId);
  const [dailyBoard, setDailyBoard] = useState<DailyBoard | null>(null);
  const [submittingDaily, setSubmittingDaily] = useState(daily);
  const submittedRef = useRef(false);
  const dailyTag = account?.handle || initials || "YOU";

  useEffect(() => {
    if (!daily || !dailyDate || submittedRef.current) return;
    submittedRef.current = true;
    setSubmittingDaily(true);
    submitDailyScore(dailyDate, {
      handle: dailyTag,
      score: state.score,
      correct: state.correct,
      total: state.answered,
      streak: state.bestStreak,
    })
      .then((next) => setDailyBoard(next))
      .catch(() => setDailyBoard(null))
      .finally(() => setSubmittingDaily(false));
    // The run result is fixed at mount; this must submit exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, dailyDate]);

  const dailyStandingResult = dailyBoard ? dailyStanding(dailyBoard) : { rank: 0, entry: null };

  return (
    <div className="grain relative flex min-h-dvh flex-col overflow-hidden bg-night text-cream">
      <div className="pointer-events-none absolute inset-0 bg-dotgrid-light opacity-35" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/2 top-[-24rem] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-coral/10 blur-[120px]" aria-hidden="true" />

      <header className="relative z-20 border-b border-cream/10">
        <div className="mx-auto flex h-16 w-full max-w-[1000px] items-center justify-between px-4 sm:px-6">
          <Logo dark onClick={onExit} />
          <div className="flex items-center gap-2">
            <SoundToggle muted={muted} onToggle={onToggleSound} dark />
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1.5 rounded-full border border-cream/20 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-cream/70 transition-colors hover:border-cream/50 hover:text-cream"
            >
              <Icon name="home" size={12} /> <span className="hidden sm:inline">Note deck</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1000px] flex-1 content-start items-start gap-3 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[1.04fr_0.96fr] lg:content-center">
        <div className="relative animate-scale-in overflow-hidden rounded-[22px] border-2 border-ink bg-card p-4 text-ink shadow-[6px_6px_0_#CBF54A] sm:p-6">
          <div className="mb-2 flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-paper px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.13em] text-muted">
              <Icon name={daily ? "calendar" : "target"} size={10} /> {daily ? "Daily drop complete" : "Run complete"}
            </span>
            <span className={cn("rotate-[4deg] rounded-lg border-2 border-ink px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.1em] shadow-[2px_2px_0_#1B1A14]", rank.color)}>
              {rank.label}
            </span>
          </div>

          {isNewBest && (
            <div className="mb-2 inline-flex animate-pop items-center gap-1.5 rounded-full bg-lime px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.1em]">
              <Icon name="trophy" size={11} /> new personal best
            </div>
          )}

          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
            {daily ? `Daily memory score · ${dayLabel(dailyDate)}` : "Final memory score"}
          </p>
          <div className="flex items-end gap-2">
            <AnimatedNumber value={state.score} className="font-display text-[clamp(3.2rem,10vw,4.6rem)] font-extrabold leading-[0.9] tracking-[-0.06em]" />
            <span className="mb-2 font-serif text-lg italic text-muted">points</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">{rank.note}</p>

          <FernandezSay
            size={54}
            mood={accuracy >= 75 ? "hyped" : accuracy >= 40 ? "happy" : "worried"}
            className="mt-2.5"
            bubbleClassName="flex-1 py-1.5"
          >
            {daily
              ? dailyStandingResult.rank > 0
                ? `Daily board: rank #${dailyStandingResult.rank}. I'd frame that.`
                : "Daily's in. Board's still warm — want another run?"
              : accuracy >= 75
                ? "That's not luck. That's real recall."
                : accuracy >= 40
                  ? "Solid recall. A little more notes time and you're dangerous."
                  : "Shaky start, great story. Run it back and show me."}
          </FernandezSay>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Level", String(state.level).padStart(2, "0")],
              ["Accuracy", `${accuracy}%`],
              ["Best streak", `×${state.bestStreak}`],
              ["Correct", `${state.correct}/${state.answered}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-ink/15 bg-paper/60 px-2.5 py-2">
                <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted">{label}</p>
                <p className="font-display text-lg font-extrabold leading-tight tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border-2 border-ink/15 bg-paper/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                {daily ? "Daily board entry" : account ? "Scored as your profile" : "Name on the board"}
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
                <Icon name={account || daily ? "shield" : "check"} size={10} />{" "}
                {daily ? "posted by tag only" : account ? "stored on this device" : "saved on this device"}
              </span>
            </div>

            {daily ? (
              <div className="mt-1.5 flex items-center gap-2.5">
                {account ? (
                  <Avatar account={account} size="md" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-sky font-display text-[12px] font-extrabold">
                    {dailyTag.slice(0, 2)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] font-extrabold leading-tight uppercase tracking-[0.08em]">Tag {dailyTag}</p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                    {dailyStandingResult.rank > 0 ? `Rank #${dailyStandingResult.rank} on today's shared board` : "Score saved to today's daily board"}
                  </p>
                </div>
                <span className="hidden rounded-full border border-ink/20 bg-lime/60 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] sm:inline-flex sm:items-center sm:gap-1">
                  <Icon name={dailyBoard?.online ? "globe" : "lock"} size={9} /> {dailyBoard?.online ? "shared" : "local"}
                </span>
              </div>
            ) : account ? (
              <div className="mt-1.5 flex items-center gap-2.5">
                <Avatar account={account} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px] font-extrabold leading-tight">{account.name}</p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                    board tag {account.handle} · {isTopFive ? "on the leaderboard" : "top five next time"}
                  </p>
                </div>
                <span className="hidden rounded-full border border-ink/20 bg-lime/60 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] sm:inline-flex sm:items-center sm:gap-1">
                  <Icon name="check" size={9} strokeWidth={3} /> saved
                </span>
              </div>
            ) : (
              <>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="initials"
                    value={initials}
                    maxLength={3}
                    onChange={(event) => onInitialsChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    onBlur={() => {
                      if (!initials) onInitialsChange("YOU");
                    }}
                    className="w-20 rounded-lg border-2 border-ink bg-card px-2.5 py-1.5 text-center font-display text-lg font-extrabold uppercase tracking-[0.16em] focus:outline-none focus:ring-2 focus:ring-lime"
                    aria-label="Three letter initials"
                  />
                  <p className="text-[11px] leading-snug text-muted">
                    {isTopFive ? "You're on the local leaderboard." : "Keep climbing to crack the top five."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="press mt-2 inline-flex w-full items-center justify-between gap-2 rounded-lg border border-ink/20 bg-card px-2.5 py-2 text-left transition-colors hover:border-ink hover:bg-lime/30"
                >
                  <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em]">
                    <Icon name="user" size={11} /> Sign in to keep your name on future runs
                  </span>
                  <Icon name="arrow" size={12} className="shrink-0 text-muted" />
                </button>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onRestart}
              className="press inline-flex flex-1 items-center justify-between gap-2 rounded-xl border-2 border-ink bg-lime px-3.5 py-3 font-display text-[14px] font-extrabold shadow-hard-sm"
            >
              <span className="inline-flex items-center gap-2">
                <Icon name="restart" size={15} /> {daily ? "Beat your daily best" : "Run it back"}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider opacity-55">R</span>
            </button>
            <button
              type="button"
              onClick={onExit}
              className="press inline-flex items-center justify-center gap-2 rounded-xl border-2 border-ink/20 bg-card px-3.5 py-3 font-display text-[13px] font-bold hover:border-ink"
            >
              <Icon name="note" size={14} /> {daily ? "Leave daily" : "Change notes"}
            </button>
          </div>
          <p className="mt-2 text-center font-mono text-[8px] uppercase tracking-[0.1em] text-muted sm:text-left">
            Keyboard: R to restart · Esc for your notes
          </p>
        </div>

        <div className="relative animate-fade-up rounded-[22px] border border-cream/15 bg-cream/[0.055] p-4 text-cream [animation-delay:100ms] sm:p-5" style={{ animationFillMode: "both" }}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full border border-ink bg-lime text-ink">
                <Icon name={daily ? "globe" : "trophy"} size={16} />
              </span>
              <div>
                <p className="font-display text-sm font-bold leading-tight text-cream">{daily ? "Daily leaders" : "Local legends"}</p>
                <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-cream/45">
                  {daily ? `${dayLabel(dailyDate)} · shared online` : "top five on this device"}
                </p>
              </div>
            </div>
            <span className="rotate-[-3deg] rounded border border-cream/20 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] text-cream/50">
              {daily ? dailyTag : state.answered > 0 ? `${state.answered} answered` : "no run"}
            </span>
          </div>

          {daily ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-cream/12 bg-cream/[0.04] px-2.5 py-1.5">
                <span className="inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-cream/55">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      submittingDaily ? "animate-pulse bg-cream/50" : dailyBoard?.online ? "bg-lime" : "bg-coral",
                    )}
                  />
                  {submittingDaily ? "Posting your score" : dailyBoard?.online ? "Live shared board" : "Saved offline"}
                </span>
                <span className="font-display text-[11px] font-bold text-lime">
                  {dailyStandingResult.rank > 0 ? `Rank #${dailyStandingResult.rank}` : "Unranked"}
                </span>
              </div>
              <div className="rounded-xl border border-cream/10 bg-cream/[0.035] px-2 py-1">
                <DailyBoardList
                  board={dailyBoard}
                  loading={submittingDaily}
                  limit={5}
                  highlightHandle={dailyTag}
                />
              </div>
              {!submittingDaily && dailyBoard && !dailyBoard.online && (
                <p className="mt-2 rounded-lg border border-coral/30 bg-coral/10 px-2.5 py-1.5 font-mono text-[8px] uppercase leading-relaxed tracking-[0.05em] text-coral">
                  Shared board unreachable. Your score is saved on this device and included next time.
                </p>
              )}
              <p className="mt-2 flex items-center gap-1.5 font-mono text-[8px] uppercase leading-relaxed tracking-[0.05em] text-cream/35">
                <Icon name="shield" size={9} /> Shared: tag, score, accuracy, streak. Never your notes.
              </p>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-cream/10 bg-cream/[0.04] px-2 py-1">
                <HighScoreTable entries={board} highlightId={state.runId} limit={5} dark />
              </div>

              <div className="mt-4 rounded-xl border border-cream/15 bg-cream/[0.04] px-3.5 py-3">
                <p className="font-serif text-[17px] italic leading-snug text-cream/85">
                  “{accuracy >= 80 ? "That's not luck. That's recall." : state.answered < 3 ? "Short run. Big potential." : "Your notes are starting to stick."}”
                </p>
                <p className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-cream/40">
                  notes → questions → memory
                </p>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={onExit}
            className="press mt-3 inline-flex w-full items-center justify-between gap-2 rounded-xl border border-cream/20 px-3.5 py-2.5 text-left transition-colors hover:border-lime/60 hover:bg-cream/[0.06]"
          >
            <span>
              <span className="block font-display text-[13px] font-bold">{daily ? "Back to the note deck" : "Build a new deck"}</span>
              <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-cream/40">
                {daily ? "today's board stays open" : "or keep grinding this one"}
              </span>
            </span>
            <Icon name="arrow" size={16} className="text-lime" />
          </button>
        </div>
      </main>
    </div>
  );
}
