import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { AccountProvider, useAccount } from "./account";
import { AchievementWatcher, ChallengeWatcher, StudyTimeTracker } from "./watchers";
import { AppShell } from "@/components/layout/AppShell";
import { AuthDialog } from "@/components/layout/AuthDialog";
import { Toaster, toast } from "@/components/ui/Toast";
import { ConfirmHost } from "@/components/ui/Confirm";
import { Skeleton } from "@/components/ui/primitives";
import { useSettings } from "@/data/settings";
import { armAudio, setMuted } from "@/lib/game/sound";
import { Onboarding } from "@/components/layout/Onboarding";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const StudyCentre = lazy(() => import("@/pages/StudyCentre"));
const DocumentWorkspace = lazy(() => import("@/pages/DocumentWorkspace"));
const RecallAi = lazy(() => import("@/pages/RecallAi"));
const QuizHub = lazy(() => import("@/pages/QuizHub"));
const CreateQuiz = lazy(() => import("@/pages/CreateQuiz"));
const Practice = lazy(() => import("@/pages/Practice"));
const Arcade = lazy(() => import("@/pages/Arcade"));
const Decks = lazy(() => import("@/pages/Decks"));
const DeckDetail = lazy(() => import("@/pages/DeckDetail"));
const Review = lazy(() => import("@/pages/Review"));
const Exam = lazy(() => import("@/pages/Exam"));
const Planner = lazy(() => import("@/pages/Planner"));
const Progress = lazy(() => import("@/pages/Progress"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const Profile = lazy(() => import("@/pages/Profile"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </AppShell>
  );
}

function Routed() {
  const { mode } = useAccount();
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Immersive, full-screen arcade game (original Recall game) */}
        <Route
          path="/quiz/arcade"
          element={
            <Suspense fallback={null}>
              <Arcade />
            </Suspense>
          }
        />
        <Route path="/" element={<Shell><Dashboard /></Shell>} />
        <Route path="/study" element={<Shell><StudyCentre /></Shell>} />
        <Route path="/study/:docId" element={<Shell><DocumentWorkspace /></Shell>} />
        <Route path="/ai" element={<Shell><RecallAi /></Shell>} />
        <Route path="/quiz" element={<Shell><QuizHub /></Shell>} />
        <Route path="/quiz/create" element={<Shell><CreateQuiz /></Shell>} />
        <Route path="/quiz/practice/:deckId" element={<Shell><Practice /></Shell>} />
        <Route path="/decks" element={<Shell><Decks /></Shell>} />
        <Route path="/decks/:deckId" element={<Shell><DeckDetail /></Shell>} />
        <Route path="/review" element={<Shell><Review /></Shell>} />
        <Route path="/exam" element={<Shell><Exam /></Shell>} />
        <Route path="/planner" element={<Shell><Planner /></Shell>} />
        <Route path="/progress" element={<Shell><Progress /></Shell>} />
        <Route path="/leaderboard" element={<Shell><Leaderboard /></Shell>} />
        <Route path="/profile" element={<Shell><Profile /></Shell>} />
        <Route path="*" element={<Shell><NotFound /></Shell>} />
      </Routes>
      {mode === "cloud" && <AuthDialog />}
      <Onboarding />
    </>
  );
}

export default function App({ persistent }: { persistent: boolean }) {
  const settings = useSettings();

  useEffect(() => {
    setMuted(settings.muted);
  }, [settings.muted]);

  useEffect(() => {
    const arm = () => armAudio();
    window.addEventListener("pointerdown", arm, { once: true });
    if (!persistent) {
      toast("Browser storage is unavailable", {
        tone: "error",
        description: "Your study data will only last for this session. Private windows can block storage.",
        duration: 8000,
      });
    }
    return () => window.removeEventListener("pointerdown", arm);
  }, [persistent]);

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? "always" : "user"}>
      <BrowserRouter>
        <AccountProvider>
          <Routed />
          <StudyTimeTracker />
          <AchievementWatcher />
          <ChallengeWatcher />
          <Toaster />
          <ConfirmHost />
        </AccountProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
