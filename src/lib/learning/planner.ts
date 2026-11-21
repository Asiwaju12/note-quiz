/**
 * Builds a realistic revision schedule without AI: remaining study-guide topics
 * are spread across the days before the target date, weak topics come first,
 * daily minutes are never exceeded, and the final day is a practice exam.
 */
import { dayKey } from "@/data/db";

export type PlanItem = { date: string; title: string; minutes: number; link?: string };

export function buildLocalPlan(input: {
  today: Date;
  targetDate: string;
  dailyMinutes: number;
  topics: Array<{ title: string; minutes: number; link?: string }>;
  weakTopics: Array<{ title: string; link?: string }>;
  hasFlashcards: boolean;
}): PlanItem[] {
  const [y, m, d] = input.targetDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const start = new Date(input.today.getFullYear(), input.today.getMonth(), input.today.getDate());
  const days: Date[] = [];
  for (const cursor = new Date(start); cursor <= target && days.length < 120; cursor.setDate(cursor.getDate() + 1)) days.push(new Date(cursor));
  if (!days.length) return [];

  const budget = Math.max(10, input.dailyMinutes);
  const studyDays = days.length > 1 ? days.slice(0, -1) : days;
  const used = new Map<string, number>();
  const plan: PlanItem[] = [];
  const add = (day: Date, item: Omit<PlanItem, "date">) => {
    const key = dayKey(day);
    plan.push({ ...item, date: key });
    used.set(key, (used.get(key) ?? 0) + item.minutes);
  };
  const free = (day: Date) => budget - (used.get(dayKey(day)) ?? 0);

  // Daily flashcard review keeps spaced repetition on track.
  if (input.hasFlashcards) for (const day of days) add(day, { title: "Review due flashcards", minutes: Math.min(10, Math.round(budget / 3)), link: "/review" });

  const queue = [
    ...input.weakTopics.map((t) => ({ title: `Practise weak topic: ${t.title}`, minutes: 20, link: t.link })),
    ...input.topics.map((t) => ({ title: `Study: ${t.title}`, minutes: Math.min(t.minutes, budget), link: t.link })),
  ];
  let dayIndex = 0;
  for (const item of queue) {
    let placed = false;
    for (let tries = 0; tries < studyDays.length; tries += 1) {
      const day = studyDays[(dayIndex + tries) % studyDays.length];
      if (free(day) >= Math.min(item.minutes, budget)) {
        add(day, { ...item, minutes: Math.min(item.minutes, free(day)) });
        dayIndex = (dayIndex + tries + 1) % studyDays.length;
        placed = true;
        break;
      }
    }
    if (!placed) break; // Not enough time before the target date; remaining topics are left for the student to fit in.
  }

  // Interleaved review of earlier topics on spare days (every third day).
  studyDays.forEach((day, index) => {
    if (index > 0 && index % 3 === 0 && free(day) >= 15) add(day, { title: "Practice quiz on recent topics", minutes: 15, link: "/quiz" });
  });

  const last = days[days.length - 1];
  if (free(last) >= 20) add(last, { title: "Full practice exam", minutes: Math.min(45, free(last)), link: "/exam" });
  return plan.sort((a, b) => a.date.localeCompare(b.date));
}
