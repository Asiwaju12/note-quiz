import type { LucideIcon } from "lucide-react";
import { Award, BookOpenCheck, Brain, CalendarCheck, FileUp, Flame, GraduationCap, Layers, MessageCircleQuestion, Sparkles, Target, Trophy } from "lucide-react";
import type { Attempt, DailyStat, Flashcard, ReviewLogEntry, SavedDeck, StudyDocument, TopicProgress, ChatMessage } from "@/data/models";
import { computeStreak } from "./insights";

export type AchievementContext = {
  attempts: Attempt[];
  documents: StudyDocument[];
  stats: DailyStat[];
  reviewLogs: ReviewLogEntry[];
  decks: SavedDeck[];
  cards: Flashcard[];
  topicProgress: TopicProgress[];
  messages: ChatMessage[];
};

export type AchievementDef = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Returns [current, target]. Unlocked when current >= target. */
  progress: (ctx: AchievementContext) => [number, number];
};

const sessions = (ctx: AchievementContext) => ctx.stats.reduce((sum, stat) => sum + stat.sessions, 0);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_quiz", title: "First quiz", description: "Complete your first practice quiz.", icon: Target, progress: (c) => [c.attempts.filter((a) => a.mode === "practice").length, 1] },
  { id: "first_pdf", title: "First upload", description: "Add your first PDF to the Study Centre.", icon: FileUp, progress: (c) => [c.documents.length, 1] },
  { id: "first_ai", title: "Curious mind", description: "Ask Recall AI your first question.", icon: MessageCircleQuestion, progress: (c) => [c.messages.filter((m) => m.role === "user").length, 1] },
  { id: "streak_7", title: "Seven-day streak", description: "Study seven days in a row.", icon: Flame, progress: (c) => [computeStreak(c.stats).best, 7] },
  { id: "cards_100", title: "Card century", description: "Review 100 flashcards.", icon: Layers, progress: (c) => [c.reviewLogs.length, 100] },
  { id: "perfect", title: "Flawless", description: "Score 100% on a quiz of five or more questions.", icon: Sparkles, progress: (c) => [c.attempts.some((a) => a.mode !== "arcade" && a.total >= 5 && a.correct === a.total) ? 1 : 0, 1] },
  { id: "sessions_10", title: "Ten sessions", description: "Complete ten study sessions.", icon: CalendarCheck, progress: (c) => [sessions(c), 10] },
  { id: "first_exam", title: "Exam ready", description: "Complete your first exam.", icon: GraduationCap, progress: (c) => [c.attempts.filter((a) => a.mode === "exam").length, 1] },
  { id: "deck_builder", title: "Deck builder", description: "Create five decks.", icon: BookOpenCheck, progress: (c) => [c.decks.length, 5] },
  { id: "topics_10", title: "Topic tamer", description: "Complete ten study-guide topics.", icon: Brain, progress: (c) => [c.topicProgress.length, 10] },
  { id: "mastered_50", title: "Long-term memory", description: "Get 50 flashcards to mastered.", icon: Award, progress: (c) => [c.cards.filter((card) => card.srs.state === "review" && card.srs.stability >= 21).length, 50] },
  { id: "questions_500", title: "Five hundred", description: "Answer 500 questions.", icon: Trophy, progress: (c) => [c.stats.reduce((sum, s) => sum + s.questions, 0), 500] },
];
