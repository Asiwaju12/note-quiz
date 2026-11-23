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
import { useAccount } from "./account";
import { flushCloudSync } from "@/data/cloud-sync";

const STUDY_ROUTES = ["/study/", "/review", "/quiz/", "/exam", "/ai", "/decks/"];

export function StudyTimeTracker() {
  const { pathname } = useLocation();
  const { account, mode } = useAccount();
  const lastInteraction = useRef(Date.now());
  const lastCheckpoint = useRef(Date.now());
  const pathRef = useRef(pathname);
  const accountRef = useRef(account?.id);
  pathRef.current = pathname;
  accountRef.current = account?.id;

  useEffect(() => {
    const events = ["pointerdown", "keydown", "scroll", "wheel", "touchstart"] as const;
    const mark = () => { lastInteraction.current = Date.now(); };
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));

    const isStudyRoute = (path: string) => STUDY_ROUTES.some((route) => path.startsWith(route));
    const recordElapsed = (force = false) => {
      const now = Date.now();
      const previous = lastCheckpoint.current;
      lastCheckpoint.current = now;
      const visible = force || document.visibilityState === "visible";
      const recentlyActive = now - lastInteraction.current < 120_000;
      if (!visible || !recentlyActive || !isStudyRoute(pathRef.current)) return;
      // Cap a delayed browser timer so sleeping/suspended tabs are never
      // mistaken for active study time. Frequent checkpoints limit lost time.
      // Count the full checkpoint interval when the learner was recently
      // active. Using lastInteraction as the interval start discarded nearly
      // all time for users who interacted repeatedly during a study session.
      const elapsedMs = Math.min(15_000, Math.max(0, now - previous));
      if (elapsedMs >= 1_000) addStudyMinutes(elapsedMs / 60_000);
    };

    const flush = () => {
      recordElapsed(true);
      const userId = accountRef.current;
      if (mode === "cloud" && userId) {
        void flushCloudSync(userId).catch((error) =>
          console.warn("Could not save the latest study-time checkpoint:", error),
        );
      }
    };

    const timer = window.setInterval(() => recordElapsed(), 10_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
      else lastCheckpoint.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, mark));
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
    };
  }, [mode]);

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

