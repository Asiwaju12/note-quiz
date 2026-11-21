/**
 * Learning insights computed from real activity only: streaks, weak/strong
 * topics, recommendations and analytics. No placeholder numbers — when there
 * isn't enough data, functions return empty results and the UI says so.
 */
import { dayKey } from "@/data/db";
import type { Attempt, DailyStat, Flashcard, PlanTask, SavedDeck, StudyDocument } from "@/data/models";
import { bucketOf, isDue, type CardBucket } from "@/lib/srs/fsrs";

export function isActiveDay(stat: DailyStat | undefined): boolean {
  if (!stat) return false;
  return stat.questions + stat.cards + stat.topics + stat.docsOpened + stat.aiMessages > 0 || stat.minutes >= 1;
}

export function computeStreak(stats: DailyStat[]): { current: number; best: number; activeToday: boolean } {
  const byDay = new Map(stats.map((stat) => [stat.id, stat]));
  const activeToday = isActiveDay(byDay.get(dayKey()));
  let current = 0;
  const cursor = new Date();
  if (!activeToday) cursor.setDate(cursor.getDate() - 1);
  while (isActiveDay(byDay.get(dayKey(cursor)))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  const days = stats.filter(isActiveDay).map((stat) => stat.id).sort();
  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const day of days) {
    const [y, m, d] = day.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (previous && Math.round((date.getTime() - previous.getTime()) / 86_400_000) === 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
    previous = date;
  }
  return { current, best: Math.max(best, current), activeToday };
}

export type TopicStat = {
  topic: string;
  total: number;
  correct: number;
  accuracy: number;
  lastAt: string;
  docId?: string;
  deckId?: string;
};

/** Topic performance across practice, exams and arcade runs (most recent 40 answers per topic). */
export function topicStats(attempts: Attempt[]): TopicStat[] {
  const map = new Map<string, { answers: Array<{ correct: boolean; at: string }>; docId?: string; deckId?: string }>();
  const sorted = [...attempts].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  for (const attempt of sorted) {
    for (const answer of attempt.answers) {
      const topic = answer.topic?.trim();
      if (!topic || topic === "General" || topic === "Your notes") continue;
      const entry = map.get(topic) ?? { answers: [] };
      entry.answers.push({ correct: answer.correct, at: attempt.finishedAt });
      entry.docId = attempt.docId ?? entry.docId;
      entry.deckId = attempt.deckId ?? entry.deckId;
      map.set(topic, entry);
    }
  }
  return [...map.entries()].map(([topic, entry]) => {
    const recent = entry.answers.slice(-40);
    const correct = recent.filter((answer) => answer.correct).length;
    return {
      topic,
      total: recent.length,
      correct,
      accuracy: recent.length ? correct / recent.length : 0,
      lastAt: recent[recent.length - 1]?.at ?? "",
      docId: entry.docId,
      deckId: entry.deckId,
    };
  });
}

export function classifyTopics(stats: TopicStat[]) {
  const weak = stats.filter((s) => s.total >= 3 && s.accuracy < 0.6).sort((a, b) => a.accuracy - b.accuracy);
  const strong = stats.filter((s) => s.total >= 4 && s.accuracy >= 0.8).sort((a, b) => b.accuracy - a.accuracy);
  const improving = stats.filter((s) => s.total >= 3 && s.accuracy >= 0.6 && s.accuracy < 0.8);
  return { weak, strong, improving };
}

export function insightSentence(stats: TopicStat[]): string | null {
  const { weak, strong } = classifyTopics(stats);
  if (strong[0] && weak[0]) return `You're doing well in ${strong[0].topic}, but ${weak[0].topic} needs more practice.`;
  if (weak[0]) return `${weak[0].topic} is your weakest area right now (${Math.round(weak[0].accuracy * 100)}% correct).`;
  if (strong[0]) return `You're strong in ${strong[0].topic} — ${Math.round(strong[0].accuracy * 100)}% correct.`;
  return null;
}

/** Questions answered incorrectly at least twice. */
export function repeatedMistakes(attempts: Attempt[]) {
  const map = new Map<string, { prompt: string; misses: number; expected: string; topic: string }>();
  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      if (answer.correct) continue;
      const key = answer.prompt.toLowerCase();
      const entry = map.get(key) ?? { prompt: answer.prompt, misses: 0, expected: answer.expected, topic: answer.topic };
      entry.misses += 1;
      map.set(key, entry);
    }
  }
  return [...map.values()].filter((entry) => entry.misses >= 2).sort((a, b) => b.misses - a.misses);
}

export type Recommendation = {
  id: string;
  kind: "review" | "weak" | "continue" | "generate" | "revisit" | "plan" | "start";
  title: string;
  reason: string;
  to: string;
  cta: string;
};

export function recommendations(input: {
  cards: Flashcard[];
  attempts: Attempt[];
  documents: StudyDocument[];
  decks: SavedDeck[];
  tasks: PlanTask[];
  hasArtifacts: (docId: string) => boolean;
}): Recommendation[] {
  const out: Recommendation[] = [];
  const now = new Date();
  const due = input.cards.filter((card) => isDue(card.srs, now) && card.srs.state !== "new");
  const fresh = input.cards.filter((card) => card.srs.state === "new");
  if (due.length) {
    out.push({ id: "due", kind: "review", title: `Review ${due.length} due flashcard${due.length === 1 ? "" : "s"}`, reason: "Reviewing on schedule is what moves cards into long-term memory.", to: "/review", cta: "Start review" });
  }
  const today = dayKey();
  const openTasks = input.tasks.filter((task) => !task.done && task.date <= today);
  if (openTasks.length) {
    out.push({ id: "plan", kind: "plan", title: openTasks[0].title, reason: `From your study plan${openTasks.length > 1 ? ` · ${openTasks.length - 1} more today` : ""}.`, to: openTasks[0].link ?? "/planner", cta: "Open task" });
  }
  const { weak } = classifyTopics(topicStats(input.attempts));
  if (weak[0]) {
    const target = weak[0].docId ? `/study/${weak[0].docId}?tab=practice&topic=${encodeURIComponent(weak[0].topic)}` : weak[0].deckId ? `/decks/${weak[0].deckId}` : "/quiz";
    out.push({ id: `weak-${weak[0].topic}`, kind: "weak", title: `Practise ${weak[0].topic}`, reason: `You've answered ${Math.round(weak[0].accuracy * 100)}% correctly here across ${weak[0].total} questions.`, to: target, cta: "Practise" });
  }
  const reading = input.documents
    .filter((doc) => doc.status === "ready" && doc.lastOpenedAt && doc.pageCount > 1 && doc.lastPage < doc.pageCount)
    .sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))[0];
  if (reading) {
    out.push({ id: `continue-${reading.id}`, kind: "continue", title: `Continue ${reading.title}`, reason: `You stopped on page ${reading.lastPage} of ${reading.pageCount}.`, to: `/study/${reading.id}?tab=pdf`, cta: "Resume" });
  }
  const unprocessed = input.documents.find((doc) => doc.status === "ready" && doc.charCount > 200 && !input.hasArtifacts(doc.id));
  if (unprocessed) {
    out.push({ id: `gen-${unprocessed.id}`, kind: "generate", title: `Create study notes for ${unprocessed.title}`, reason: "You haven't generated a summary or notes for this document yet.", to: `/study/${unprocessed.id}?tab=summary`, cta: "Generate" });
  }
  if (!due.length && fresh.length) {
    out.push({ id: "new-cards", kind: "review", title: `Learn ${Math.min(fresh.length, 20)} new flashcards`, reason: `${fresh.length} card${fresh.length === 1 ? "" : "s"} haven't been studied yet.`, to: "/review", cta: "Start" });
  }
  const stale = input.decks
    .filter((deck) => deck.questions.length && (!deck.lastPlayedAt || now.getTime() - new Date(deck.lastPlayedAt).getTime() > 7 * 86_400_000))
    .sort((a, b) => (a.lastPlayedAt ?? a.createdAt).localeCompare(b.lastPlayedAt ?? b.createdAt))[0];
  if (stale) {
    out.push({ id: `deck-${stale.id}`, kind: "revisit", title: `Quiz yourself on ${stale.title}`, reason: stale.lastPlayedAt ? "It's been over a week since you practised this deck." : "You haven't practised this deck yet.", to: `/decks/${stale.id}`, cta: "Open deck" });
  }
  if (!out.length) {
    out.push(
      input.documents.length
        ? { id: "start-practice", kind: "start", title: "Take a practice quiz", reason: "Testing yourself is the fastest way to find what you don't know yet.", to: "/quiz", cta: "Start" }
        : { id: "start-upload", kind: "start", title: "Upload your first lecture PDF", reason: "Recall turns it into summaries, notes, flashcards and practice questions.", to: "/study?upload=1", cta: "Upload PDF" },
    );
  }
  return out;
}

export function cardBuckets(cards: Flashcard[]): Record<CardBucket, number> {
  const counts: Record<CardBucket, number> = { new: 0, learning: 0, review: 0, mastered: 0 };
  for (const card of cards) counts[bucketOf(card.srs)] += 1;
  return counts;
}

export function lastNDays(stats: DailyStat[], days: number): Array<DailyStat & { label: string }> {
  const byDay = new Map(stats.map((stat) => [stat.id, stat]));
  const out: Array<DailyStat & { label: string }> = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const id = dayKey(date);
    const stat = byDay.get(id);
    out.push({
      id,
      minutes: stat?.minutes ?? 0,
      questions: stat?.questions ?? 0,
      correct: stat?.correct ?? 0,
      cards: stat?.cards ?? 0,
      sessions: stat?.sessions ?? 0,
      topics: stat?.topics ?? 0,
      docsOpened: stat?.docsOpened ?? 0,
      aiMessages: stat?.aiMessages ?? 0,
      points: stat?.points ?? 0,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
    });
  }
  return out;
}
