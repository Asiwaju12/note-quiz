/**
 * Arcade mode — the original Recall game (timed questions, 3 lives, levels,
 * streak scoring, pace, keyboard controls, high scores and the Daily Drop).
 * Game rules and scoring are unchanged from the original; the interface is redesigned.
 */
import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Flame, Heart, Home, Pause, Play, RotateCcw, Timer, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { buildQueue } from "@/lib/game/deck";
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
} from "@/lib/game/types";
import { getPlayerId, loadLastStartId, loadPlayed, loadScores, renameScore, saveLastStartId, savePlayed, saveScore } from "@/lib/game/storage";
import type { PublicAccount } from "@/services/auth";
import { loadCloudScores, saveCloudScore } from "@/services/cloud";
import { dailyStanding, dayLabel, loadLocalDaily, saveLocalDaily, submitDailyScore, type DailyBoard } from "@/lib/game/daily";
import { sfx } from "@/lib/game/sound";
import { recordAttempt } from "@/data/repos";
import { expectedAnswer } from "@/lib/learning/grading";
import { Button } from "@/components/ui/Button";
import { DailyBoardList, ScoreTable } from "./Boards";
import type { ParticleHandle } from "./ParticleField";

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
  /** Per-question outcomes, used for analytics and weak-topic detection. */
  log: Array<{ question: Question; correct: boolean; choice: number }>;
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
    log: [],
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
          log: [...state.log, { question, correct: true, choice: action.choice }],
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
        log: [...state.log, { question, correct: false, choice: action.choice }],
      };
    }
    case "timeout": {
      if (state.phase !== "playing" || state.status !== "idle") return state;
      const timedQuestion = state.queue[state.index];
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
        log: timedQuestion ? [...state.log, { question: timedQuestion, correct: false, choice: -1 }] : state.log,
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
    if (barRef.current) {
      barRef.current.style.transform = "scaleX(1)";
      barRef.current.style.backgroundColor = "#8B71EE";
    }
    if (textRef.current) {
      textRef.current.textContent = String(limit);
      textRef.current.style.color = "";
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
        barRef.current.style.backgroundColor = ratio <= 0.28 ? "#FF6B7D" : ratio <= 0.55 ? "#F2B445" : "#8B71EE";
      }
      const seconds = Math.max(0, Math.ceil(remaining / 1000));
      if (textRef.current && seconds !== lastSecond) {
        lastSecond = seconds;
        textRef.current.textContent = String(seconds);
        textRef.current.style.color = ratio <= 0.28 ? "#FF6B7D" : "";
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
      <Timer className="h-4 w-4 text-subtle" />
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div ref={barRef} className="absolute inset-0 origin-left rounded-full will-change-transform" style={{ transform: "scaleX(1)", backgroundColor: "#8B71EE" }} />
      </div>
      <span ref={textRef} className="tabular w-7 text-right text-sm font-semibold">
        {limit}
      </span>
    </div>
  );
}

function Hearts({ lives }: { lives: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${lives} of ${MAX_LIVES} lives left`}>
      {Array.from({ length: MAX_LIVES }).map((_, index) => (
        <motion.span key={index} animate={index < lives ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.3 }} transition={{ type: "spring", damping: 14 }}>
          <Heart className={cn("h-[18px] w-[18px]", index < lives ? "text-[#FF6B7D]" : "text-white/40")} fill={index < lives ? "currentColor" : "none"} />
        </motion.span>
      ))}
    </div>
  );
}

function AnimatedScore({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const start = shown;
    const diff = value - start;
    if (!diff) return;
    const began = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - began) / 450);
      setShown(Math.round(start + diff * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={cn("tabular", className)}>{shown.toLocaleString()}</span>;
}

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* haptics are optional */
  }
}

const IDLE_LINES = ["Trust your first instinct.", "Read it twice, answer once.", "Speed earns bonus points.", "Stay calm. You know this."];
const CORRECT_LINES = ["Correct!", "Nailed it.", "That's the one.", "Sharp recall."];
const WRONG_LINES = ["Not quite.", "Close — keep going.", "That one's tricky.", "Learn it and move on."];
const pick = (lines: string[], seed: number) => lines[Math.abs(seed) % lines.length];

function recordRun(state: GameState, title: string, deckId?: string) {
  if (!state.log.length) return;
  const answers = state.log.map(({ question, correct, choice }) => ({
    questionId: question.id,
    prompt: question.prompt,
    type: question.type ?? ("mcq" as const),
    topic: question.topic || question.category || "General",
    correct,
    response: choice >= 0 ? (question.options[choice] ?? "") : "Time ran out",
    expected: expectedAnswer(question),
  }));
  const correct = answers.filter((a) => a.correct).length;
  recordAttempt({
    mode: state.daily ? "daily" : "arcade",
    title,
    deckId,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSec: 0,
    total: answers.length,
    correct,
    scorePct: Math.round((correct / answers.length) * 100),
    points: state.score,
    answers,
  });
}

export function Game({
  deck,
  deckId,
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
  deckId?: string;
  account: PublicAccount | null;
  pace: Pace;
  daily?: boolean;
  dailyDate?: string;
  initials: string;
  onInitialsChange: (value: string) => void;
  muted: boolean;
  onToggleSound: () => void;
  onExit: () => void;
  onSignIn?: () => void;
  particles: RefObject<ParticleHandle | null>;
}) {
  const runPace: Pace = daily ? "standard" : pace;
  const maxQuestions = daily ? DAILY_SIZE : 1000;
  const [state, dispatch] = useReducer(reducer, deck, (initialDeck) => createInitial(initialDeck, { pace: runPace, daily, maxQuestions }));
  const timeLeftRef = useRef((daily ? DAILY_SECONDS : levelTime(1, runPace)) * 1000);
  const savedRunRef = useRef<string | null>(null);
  const initialsRef = useRef(initials);
  const [board, setBoard] = useState<ScoreEntry[]>(() => loadScores());
  initialsRef.current = initials;

  useEffect(() => {
    if (!account) return;
    let active = true;
    void loadCloudScores()
      .then((scores) => active && setBoard(scores))
      .catch((error) => console.error("Could not load cloud scores:", error));
    return () => {
      active = false;
    };
  }, [account?.id]);

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
    particles.current?.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, { count, colors, power: 470 });
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
      burstFromAnswer(choice, ["#FF6B7D", "#3A1F5C", "#F5F0FF"], 20);
      vibrate([25, 35, 25]);
    }
  };

  const handleExpire = () => {
    if (timedOutRef.current) return;
    timedOutRef.current = true;
    dispatch({ type: "timeout" });
    sfx.timeout();
    vibrate([30, 40, 30]);
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
    timedOutRef.current = false;
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

  useEffect(() => {
    timedOutRef.current = false;
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
    if (savedRunRef.current !== state.runId) {
      savedRunRef.current = state.runId;
      if (!daily) {
        if (account) {
          void saveCloudScore(account.id, account.handle, entry)
            .then(setBoard)
            .catch((error) => console.error("Could not save score to Supabase:", error));
        } else {
          saveScore(entry);
          setBoard(loadScores());
        }
      }
      savePlayed(loadPlayed() + 1);
      recordRun(state, daily ? `Daily Drop · ${dailyDate}` : `Arcade · ${deck.title}`, deckId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.runId, account]);

  useEffect(() => {
    if (state.phase !== "over" || daily) return;
    setBoard((previous) => previous.map((entry) => (entry.id === state.runId ? { ...entry, name: initials || "YOU" } : entry)));
    if (!account) renameScore(state.runId, initials || "YOU");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          if (numeric >= 1 && numeric <= (question?.options.length ?? 4)) {
            event.preventDefault();
            selectAnswer(numeric - 1);
            return;
          }
          const letterIndex = ["a", "b", "c", "d"].indexOf(key);
          if (letterIndex >= 0 && letterIndex < (question?.options.length ?? 4)) {
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
        onRestart={restart}
        onExit={onExit}
        onSignIn={onSignIn}
      />
    );
  }

  const earnedRank = rankFor(state.score);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg text-text">
      <div className="pointer-events-none absolute left-1/2 top-[-20rem] h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-[#6d4fe6]/25 blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-[#3a1f94]/30 blur-[100px]" aria-hidden />

      <header className="relative z-20">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-2 px-4">
          <button type="button" onClick={state.phase === "playing" ? togglePause : onExit} aria-label="Pause and exit" className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-white/5 hover:text-text">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <p className="truncate text-sm font-medium text-muted">{state.daily ? `Daily Drop · ${dailyDate}` : deck.title}</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onToggleSound} aria-label={muted ? "Unmute sound" : "Mute sound"} className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-white/5 hover:text-text">
              {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
            </button>
            <button type="button" onClick={togglePause} aria-label={state.phase === "paused" ? "Resume game" : "Pause game"} className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-white/5 hover:text-text">
              {state.phase === "paused" ? <Play className="h-[18px] w-[18px]" /> : <Pause className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 pb-6">
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <p className="text-[11px] text-subtle">Score</p>
            <div className="flex items-baseline gap-1.5">
              <AnimatedScore value={state.score} className="text-xl font-semibold" />
              <AnimatePresence>
                {state.gained > 0 && (
                  <motion.span key={state.answered} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-semibold text-success">
                    +{state.gained}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <p className="truncate text-[11px] text-subtle">
              Level {state.level} · <span className="hidden sm:inline">{levelName(state.level)}</span>
            </p>
            <div className="mt-2 flex gap-1" aria-label={`${state.levelWins} of ${LEVEL_SIZE} correct in this level`}>
              {Array.from({ length: LEVEL_SIZE }).map((_, index) => (
                <span key={index} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", index < state.levelWins ? "bg-accent" : "bg-white/10")} />
              ))}
            </div>
          </div>
          <div className={cn("flex items-center justify-between rounded-2xl border px-3 py-2.5 transition-colors", state.streak >= 3 ? "border-warning/40 bg-warning/10" : "border-white/10 bg-white/[0.04]")}>
            <div>
              <p className="text-[11px] text-subtle">Streak</p>
              <motion.p key={state.streak} initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="tabular text-xl font-semibold">
                ×{state.streak}
              </motion.p>
            </div>
            <Flame className={cn("h-5 w-5", state.streak >= 3 ? "text-warning" : "text-subtle")} fill={state.streak >= 3 ? "currentColor" : "none"} />
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <Hearts lives={state.lives} />
          <span className="text-xs text-subtle">
            Question {state.index + 1}
            {state.daily ? ` of ${state.maxQuestions}` : ""}
          </span>
        </div>

        <motion.div key={`${state.runId}-${state.index}`} initial={{ opacity: 0, y: 14 }} animate={state.status === "wrong" ? { opacity: 1, y: 0, x: [0, -8, 8, -4, 0] } : { opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
          <div className="rounded-3xl border border-white/10 bg-surface p-5 shadow-lg sm:p-7">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="truncate rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent-text">{question?.category ?? "Recall"}</span>
              <span className="shrink-0 text-xs text-subtle">{state.daily ? "Daily Drop" : state.deck.kind === "sample" ? "Random mix" : "Your deck"}</span>
            </div>
            <h1 className="mb-5 text-[19px] font-medium leading-snug tracking-[-0.01em] sm:text-[22px]">{question?.prompt}</h1>

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

            <div className={cn("mt-5 grid gap-2.5", (question?.options.length ?? 4) > 2 && "sm:grid-cols-2")}>
              {question?.options.map((option, index) => {
                const isCorrect = state.status !== "idle" && index === question.answer;
                const isWrongPick = state.status === "wrong" && state.selected === index;
                return (
                  <motion.button
                    key={`${question.id}-${index}`}
                    id={`answer-${index}`}
                    type="button"
                    onClick={() => selectAnswer(index)}
                    disabled={state.status !== "idle"}
                    whileTap={state.status === "idle" ? { scale: 0.98 } : undefined}
                    aria-label={`Answer ${index + 1}: ${option}`}
                    className={cn(
                      "flex min-h-[58px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] leading-snug transition-colors",
                      state.status === "idle"
                        ? "border-border bg-surface-2 hover:border-accent hover:bg-accent-softer"
                        : isCorrect
                          ? "border-success bg-success-soft"
                          : isWrongPick
                            ? "border-danger bg-danger-soft"
                            : "border-border bg-surface-2 opacity-50",
                    )}
                  >
                    <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-mono text-xs", isCorrect ? "border-success bg-success text-white" : isWrongPick ? "border-danger bg-danger text-white" : "border-border-strong text-muted")}>
                      {isCorrect ? <Check className="h-4 w-4" /> : isWrongPick ? <X className="h-4 w-4" /> : index + 1}
                    </span>
                    <span className="flex-1">{option}</span>
                  </motion.button>
                );
              })}
            </div>

            <div className="mt-5 min-h-[76px]">
              {state.status === "idle" ? (
                <p className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-subtle">
                  {pick(IDLE_LINES, state.index + state.level)} <span className="ml-1 hidden sm:inline">· press 1–{question?.options.length ?? 4}</span>
                </p>
              ) : (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} role="status" aria-live="polite" className={cn("rounded-2xl p-4", state.status === "correct" ? "bg-success-soft" : "bg-danger-soft")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("font-semibold", state.status === "correct" ? "text-success" : "text-danger")}>
                      {state.status === "correct" ? pick(CORRECT_LINES, state.index) : state.timedOut ? "Time's up." : pick(WRONG_LINES, state.index)}
                    </p>
                    {state.gained > 0 && <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-semibold text-success">+{state.gained}</span>}
                    {state.status === "wrong" && <span className="rounded-full bg-danger/20 px-2 py-0.5 text-xs font-semibold text-danger">−1 life</span>}
                    {state.levelUpPending && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-text">Level cleared</span>}
                  </div>
                  {question?.explanation && <p className="mt-1 line-clamp-3 text-sm text-text/80">{question.explanation}</p>}
                  <Button onClick={advance} className="mt-3 w-full sm:w-auto">
                    {state.lives <= 0 || finalQuestion ? "See results" : state.levelUpPending ? "Level up" : "Next question"} <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>

        <div className="mt-3 flex items-center justify-between px-1 text-xs text-subtle">
          <span className="hidden sm:inline">1–4 answer · Enter next · P pause · R restart</span>
          <span className="sm:hidden">Tap an answer</span>
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5" /> {earnedRank.label}
          </span>
        </div>
      </main>

      <AnimatePresence>
        {state.phase === "paused" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-2xl font-semibold">Paused</h2>
              <p className="mt-1 text-sm text-muted">The clock is frozen. Take a breath.</p>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Score", state.score.toLocaleString()],
                  ["Level", String(state.level)],
                  ["Streak", `×${state.streak}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-surface-2 px-2 py-2.5">
                    <p className="text-[11px] text-subtle">{label}</p>
                    <p className="tabular font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <Button size="lg" onClick={togglePause} className="mt-5 w-full" icon={<Play className="h-4 w-4" />}>
                Resume
              </Button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={restart} icon={<RotateCcw className="h-4 w-4" />}>
                  Restart
                </Button>
                <Button variant="secondary" onClick={onExit} icon={<Home className="h-4 w-4" />}>
                  Exit
                </Button>
              </div>
              <p className="mt-3 text-center text-xs text-subtle">No score is saved if you exit early.</p>
            </motion.div>
          </motion.div>
        )}
        {state.phase === "levelup" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", damping: 18 }} className="hero-panel w-full max-w-sm rounded-3xl p-6">
              <p className="text-[13px] text-white/70">Level {state.level} cleared{state.levelMisses === 0 ? " · flawless" : ""}</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">Level up</h2>
              <div className="mt-4 flex items-end gap-3">
                <span className="tabular text-6xl font-semibold leading-none">{String(state.level + 1).padStart(2, "0")}</span>
                <span className="mb-1 text-sm text-white/80">{levelName(state.level + 1)}</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/12 px-3 py-2.5">
                  <p className="text-[11px] text-white/70">Level bonus</p>
                  <p className="tabular font-semibold">+{state.level * 150}</p>
                </div>
                <div className="rounded-xl bg-white/12 px-3 py-2.5">
                  <p className="text-[11px] text-white/70">Next timer</p>
                  <p className="tabular font-semibold">{state.daily ? DAILY_SECONDS : levelTime(state.level + 1, state.pace)}s</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-white/80">{state.levelMisses === 0 ? "Flawless level — one life restored." : "Clear a level without mistakes to restore a life."}</p>
              <Button variant="inverse" size="lg" onClick={continueLevel} className="mt-5 w-full">
                Keep going <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
  onRestart: () => void;
  onExit: () => void;
  onSignIn?: () => void;
}) {
  const accuracy = state.answered > 0 ? Math.round((state.correct / state.answered) * 100) : 0;
  const rank = rankFor(state.score);
  const best = board[0]?.score ?? state.score;
  const isNewBest = !daily && state.score > 0 && state.score >= best && state.answered > 0;
  const [dailyBoard, setDailyBoard] = useState<DailyBoard | null>(null);
  const [submittingDaily, setSubmittingDaily] = useState(daily);
  const submittedRef = useRef(false);
  const dailyTag = account?.handle || initials || "YOU";

  useEffect(() => {
    if (!daily || !dailyDate || submittedRef.current) return;
    submittedRef.current = true;
    const submission = { handle: dailyTag, score: state.score, correct: state.correct, total: state.answered, streak: state.bestStreak };
    if (!account) {
      // Local mode: keep the daily result on this device (the original offline fallback board).
      const entry = { ...submission, id: getPlayerId(), at: Date.now() };
      saveLocalDaily(dailyDate, [...loadLocalDaily(dailyDate), entry]);
      setDailyBoard({ date: dailyDate, entries: loadLocalDaily(dailyDate), online: false, fetchedAt: Date.now() });
      setSubmittingDaily(false);
      return;
    }
    setSubmittingDaily(true);
    submitDailyScore(dailyDate, submission)
      .then((next) => setDailyBoard(next))
      .catch(() => setDailyBoard(null))
      .finally(() => setSubmittingDaily(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, dailyDate, account?.id]);

  const standing = dailyBoard ? dailyStanding(dailyBoard, account?.id || getPlayerId()) : { rank: 0, entry: null };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg text-text">
      <div className="pointer-events-none absolute left-1/2 top-[-22rem] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-[#6d4fe6]/20 blur-[120px]" aria-hidden />
      <header className="relative z-10 mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
        <button type="button" onClick={onExit} className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" /> Back to Quiz
        </button>
      </header>
      <main className="relative z-10 mx-auto grid max-w-4xl gap-4 px-4 pb-10 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="hero-panel rounded-3xl p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] text-white/70">{daily ? `Daily Drop · ${dayLabel(dailyDate)}` : "Run complete"}</p>
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">{rank.label}</span>
          </div>
          {isNewBest && (
            <motion.p initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#3a1f94]">
              <Trophy className="h-3.5 w-3.5" /> New personal best
            </motion.p>
          )}
          <div className="mt-4 flex items-end gap-2">
            <AnimatedScore value={state.score} className="text-6xl font-semibold leading-none tracking-[-0.04em]" />
            <span className="mb-1 text-white/70">points</span>
          </div>
          <p className="mt-2 text-sm text-white/80">{rank.note}</p>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Level", String(state.level)],
              ["Accuracy", `${accuracy}%`],
              ["Best streak", `×${state.bestStreak}`],
              ["Correct", `${state.correct}/${state.answered}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/12 px-3 py-2.5">
                <p className="text-[11px] text-white/70">{label}</p>
                <p className="tabular font-semibold">{value}</p>
              </div>
            ))}
          </div>
          {!account && !daily && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/10 p-3">
              <label htmlFor="initials" className="text-sm text-white/80">
                Name on the board
              </label>
              <input
                id="initials"
                value={initials}
                maxLength={3}
                onChange={(event) => onInitialsChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                onBlur={() => !initials && onInitialsChange("YOU")}
                className="w-20 rounded-lg border border-white/30 bg-white/10 px-2 py-1.5 text-center font-mono text-lg font-semibold uppercase tracking-widest text-white focus:outline-none focus:ring-2 focus:ring-white/60"
              />
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button variant="inverse" size="lg" onClick={onRestart} icon={<RotateCcw className="h-4 w-4" />}>
              {daily ? "Play again" : "Run it back"}
            </Button>
            <Button variant="ghost" size="lg" onClick={onExit} className="text-white hover:bg-white/10 hover:text-white">
              Done
            </Button>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="rounded-3xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold">{daily ? "Today's leaderboard" : account ? "Your best runs" : "High scores on this device"}</p>
            {daily && <span className="text-xs text-subtle">{submittingDaily ? "Saving…" : standing.rank ? `You're #${standing.rank}` : dailyBoard?.online ? "Shared" : "This device"}</span>}
          </div>
          {daily ? <DailyBoardList board={dailyBoard} loading={submittingDaily} limit={8} highlightHandle={dailyTag} highlightId={account?.id} /> : <ScoreTable entries={board} highlightId={state.runId} limit={8} />}
          {daily && !account && onSignIn && <p className="mt-3 text-xs text-subtle">Local mode: daily scores are kept on this device. Sign in to join the shared board.</p>}
        </motion.div>
      </main>
    </div>
  );
}
