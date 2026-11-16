export type Question = {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  category: string;
};

export type Deck = {
  title: string;
  questions: Question[];
  kind: "sample" | "notes";
};

export type ScoreEntry = {
  id: string;
  name: string;
  score: number;
  level: number;
  streak: number;
  accuracy: number;
  date: string;
};

export type Rank = {
  label: string;
  note: string;
  color: string;
};

export const LEVEL_SIZE = 3;
export const MAX_LIVES = 3;
export const DAILY_SIZE = 8;
export const DAILY_SECONDS = 18;

export type Pace = "relaxed" | "standard" | "rush";

export const PACES: Array<{
  id: Pace;
  label: string;
  short: string;
  seconds: number;
  note: string;
  color: string;
}> = [
  {
    id: "relaxed",
    label: "Relaxed",
    short: "25s",
    seconds: 25,
    note: "Room to think",
    color: "bg-lilac",
  },
  {
    id: "standard",
    label: "Standard",
    short: "18s",
    seconds: 18,
    note: "The sweet spot",
    color: "bg-lime",
  },
  {
    id: "rush",
    label: "Rush",
    short: "12s",
    seconds: 12,
    note: "Pure reflex",
    color: "bg-coral",
  },
];

export function paceSeconds(pace: Pace): number {
  return PACES.find((item) => item.id === pace)?.seconds ?? 18;
}

export function levelTime(level: number, pace: Pace = "standard"): number {
  const reductions = [0, 2, 4, 6, 8, 9, 10];
  const base = paceSeconds(pace);
  const reduction = level > reductions.length ? 11 : reductions[level - 1];
  return Math.max(7, base - reduction);
}

export function levelName(level: number): string {
  const names = [
    "Warm-up",
    "Finding the groove",
    "Under pressure",
    "Deep focus",
    "Memory palace",
    "Boss brain",
    "Overdrive",
  ];
  return level >= names.length ? "Endless recall" : names[level - 1];
}

export function rankFor(score: number): Rank {
  if (score >= 14000) return { label: "Galaxy brain", note: "Certified recall royalty.", color: "bg-lilac" };
  if (score >= 8000) return { label: "Memory athlete", note: "That was a flex.", color: "bg-lime" };
  if (score >= 4000) return { label: "Sharp recall", note: "Notes officially defeated.", color: "bg-sky" };
  if (score >= 1800) return { label: "Warming up", note: "The combo is coming.", color: "bg-coral" };
  return { label: "Fresh start", note: "Everyone starts somewhere.", color: "bg-card" };
}
