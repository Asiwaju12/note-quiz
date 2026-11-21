export type QuestionType = "mcq" | "tf" | "short" | "fill";
export type Difficulty = "easy" | "medium" | "hard";

/**
 * A quiz question. The original fields (prompt/options/answer/explanation/category)
 * are unchanged so existing decks and cloud rows keep working. New optional fields
 * describe the richer question types used by practice, exam and Study Centre.
 */
export type Question = {
  id: string;
  prompt: string;
  /** Choices for mcq/tf. Empty for short-answer and fill-in-the-blank. */
  options: string[];
  /** Index of the correct option (mcq/tf). -1 when not applicable. */
  answer: number;
  explanation: string;
  category: string;
  type?: QuestionType;
  /** Model answer for short-answer / fill-in-the-blank questions. */
  answerText?: string;
  difficulty?: Difficulty;
  topic?: string;
  /** 1-based page number in the source document, when reliably known. */
  sourcePage?: number;
};

export type Deck = {
  title: string;
  questions: Question[];
  kind: "sample" | "notes" | "manual" | "document";
};

export function questionType(question: Question): QuestionType {
  return question.type ?? "mcq";
}

/** Arcade mode needs a fixed set of choices to tap. */
export function isChoiceQuestion(question: Question): boolean {
  const type = questionType(question);
  return (type === "mcq" || type === "tf") && question.options.length >= 2 && question.answer >= 0;
}

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
