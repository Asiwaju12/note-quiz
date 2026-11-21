/**
 * Background effects mounted once at the app root:
 * - StudyTimeTracker: counts active study minutes (tab visible + recent interaction).
 * - AchievementWatcher: unlocks achievements from real activity and celebrates them.
 * - ChallengeWatcher: completes today's daily challenges and awards points.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { dayKey, nowIso, useCollection } from "@/data/db";
import type { Attempt, ChallengeClaim, ChatMessage, DailyStat, Flashcard, ReviewLogEntry, SavedDeck, StudyDocument, TopicProgress, UnlockedAchievement } from "@/data/models";
import { addStudyMinutes, bumpToday, db, logActivity } from "@/data/repos";
import { ACHIEVEMENTS } from "@/lib/learning/achievements";
import { challengeProgress, challengesFor } from "@/lib/learning/challenges";
import { toast } from "@/components/ui/Toast";

const STUDY_ROUTES = ["/study/", "/review", "/quiz/", "/exam", "/ai", "/decks/"];

export function StudyTimeTracker() {
  const { pathname } = useLocation();
  const lastInteraction = useRef(Date.now());
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    const mark = () => (lastInteraction.current = Date.now());
    const events = ["pointerdown", "keydown", "scroll", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
    const timer = window.setInterval(() => {
      const studying = STUDY_ROUTES.some((route) => pathRef.current.startsWith(route));
      const active = document.visibilityState === "visible" && Date.now() - lastInteraction.current < 120_000;
      if (studying && active) addStudyMinutes(0.5);
    }, 30_000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, mark));
      window.clearInterval(timer);
    };
  }, []);
  return null;
}

export function AchievementWatcher() {
  const attempts = useCollection<Attempt>("attempts");
  const documents = useCollection<StudyDocument>("documents");
  const stats = useCollection<DailyStat>("dailyStats");
  const reviewLogs = useCollection<ReviewLogEntry>("reviewLogs");
  const decks = useCollection<SavedDeck>("decks");
  const cards = useCollection<Flashcard>("cards");
  const topicProgress = useCollection<TopicProgress>("topicProgress");
  const messages = useCollection<ChatMessage>("messages");
  const unlocked = useCollection<UnlockedAchievement>("achievements");

  useEffect(() => {
    const have = new Set(unlocked.map((item) => item.id));
    const ctx = { attempts, documents, stats, reviewLogs, decks, cards, topicProgress, messages };
    for (const def of ACHIEVEMENTS) {
      if (have.has(def.id)) continue;
      const [current, target] = def.progress(ctx);
      if (current >= target) {
        db.achievements.put({ id: def.id, unlockedAt: nowIso() });
        logActivity("achievement", `Unlocked “${def.title}”`, def.description, "/progress?tab=achievements");
        toast(`Achievement unlocked: ${def.title}`, { description: def.description, tone: "achievement" });
      }
    }
  }, [attempts, documents, stats, reviewLogs, decks, cards, topicProgress, messages, unlocked]);
  return null;
}

export function ChallengeWatcher() {
  const stats = useCollection<DailyStat>("dailyStats");
  const claims = useCollection<ChallengeClaim>("challengeClaims");
  useEffect(() => {
    const today = dayKey();
    const stat = stats.find((item) => item.id === today);
    if (!stat) return;
    for (const challenge of challengesFor(today)) {
      const id = `${today}:${challenge.id}`;
      if (claims.some((claim) => claim.id === id)) continue;
      if (challengeProgress(challenge, stat) >= 1) {
        db.challengeClaims.put({ id, date: today, challengeId: challenge.id, points: challenge.points, at: nowIso() });
        bumpToday({ points: challenge.points });
        logActivity("challenge_complete", `Daily challenge: ${challenge.title}`, `+${challenge.points} points`);
        toast("Daily challenge complete", { description: `${challenge.title} · +${challenge.points} points` });
      }
    }
  }, [stats, claims]);
  return null;
}

