/**
 * Spaced repetition using FSRS (Free Spaced Repetition Scheduler) via ts-fsrs.
 * We store cards in a JSON-friendly shape (ISO dates, string states) and
 * convert at the boundary.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { SrsCard, SrsState } from "@/data/models";

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }));

const STATE_TO_STRING: Record<State, SrsState> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};
const STRING_TO_STATE: Record<SrsState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

function toSrs(card: Card): SrsCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_TO_STRING[card.state],
    lastReview: card.last_review?.toISOString(),
  };
}

function fromSrs(srs: SrsCard): Card {
  return {
    due: new Date(srs.due),
    stability: srs.stability,
    difficulty: srs.difficulty,
    elapsed_days: srs.elapsedDays,
    scheduled_days: srs.scheduledDays,
    learning_steps: srs.learningSteps,
    reps: srs.reps,
    lapses: srs.lapses,
    state: STRING_TO_STATE[srs.state],
    last_review: srs.lastReview ? new Date(srs.lastReview) : undefined,
  };
}

export function newSrsCard(now = new Date()): SrsCard {
  return toSrs(createEmptyCard(now));
}

export type RatingValue = 1 | 2 | 3 | 4;
export const RATINGS: Array<{ value: RatingValue; label: string; hint: string }> = [
  { value: 1, label: "Again", hint: "Forgot it" },
  { value: 2, label: "Hard", hint: "Struggled" },
  { value: 3, label: "Good", hint: "Recalled it" },
  { value: 4, label: "Easy", hint: "Instant" },
];

const GRADE: Record<RatingValue, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

export function review(srs: SrsCard, rating: RatingValue, now = new Date()): SrsCard {
  const result = scheduler.next(fromSrs(srs), now, GRADE[rating]);
  return toSrs(result.card);
}

/** Human interval preview for each rating button ("10m", "3d"…). */
export function previewIntervals(srs: SrsCard, now = new Date()): Record<RatingValue, string> {
  const out = {} as Record<RatingValue, string>;
  for (const value of [1, 2, 3, 4] as RatingValue[]) {
    const next = scheduler.next(fromSrs(srs), now, GRADE[value]).card;
    out[value] = formatInterval(next.due.getTime() - now.getTime());
  }
  return out;
}

export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function isDue(srs: SrsCard, now = new Date()): boolean {
  return new Date(srs.due).getTime() <= now.getTime();
}

/** A card counts as "mastered" once it is in review with a stability of 3+ weeks. */
export function isMastered(srs: SrsCard): boolean {
  return srs.state === "review" && srs.stability >= 21;
}

export type CardBucket = "new" | "learning" | "review" | "mastered";
export function bucketOf(srs: SrsCard): CardBucket {
  if (srs.state === "new") return "new";
  if (srs.state === "learning" || srs.state === "relearning") return "learning";
  return isMastered(srs) ? "mastered" : "review";
}
