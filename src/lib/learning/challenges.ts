import type { DailyStat } from "@/data/models";

export type ChallengeDef = {
  id: string;
  title: string;
  metric: keyof Omit<DailyStat, "id" | "points">;
  target: number;
  points: number;
  to: string;
};

const POOL: ChallengeDef[] = [
  { id: "answer5", title: "Answer 5 questions", metric: "questions", target: 5, points: 20, to: "/quiz" },
  { id: "review10", title: "Review 10 flashcards", metric: "cards", target: 10, points: 20, to: "/review" },
  { id: "session1", title: "Complete a study session", metric: "sessions", target: 1, points: 15, to: "/quiz" },
  { id: "topic1", title: "Finish a study-guide topic", metric: "topics", target: 1, points: 25, to: "/study" },
  { id: "minutes15", title: "Study for 15 minutes", metric: "minutes", target: 15, points: 20, to: "/study" },
  { id: "correct8", title: "Get 8 answers right", metric: "correct", target: 8, points: 25, to: "/quiz" },
  { id: "ai1", title: "Ask Recall AI a question", metric: "aiMessages", target: 1, points: 10, to: "/ai" },
];

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Three challenges per day, the same all day, varying day to day. */
export function challengesFor(date: string): ChallengeDef[] {
  const scored = POOL.map((challenge) => ({ challenge, key: hash(`${date}:${challenge.id}`) }));
  return scored.sort((a, b) => a.key - b.key).slice(0, 3).map((item) => item.challenge);
}

export function challengeProgress(challenge: ChallengeDef, stat: DailyStat | undefined): number {
  const value = stat ? Number(stat[challenge.metric]) || 0 : 0;
  return Math.min(1, value / challenge.target);
}
