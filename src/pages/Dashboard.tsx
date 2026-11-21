import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, BookOpen, CheckCircle2, Circle, FileUp, Flame, Layers, Sparkles, Target } from "lucide-react";
import { useAccount } from "@/app/account";
import { dayKey, useCollection } from "@/data/db";
import type { ActivityEvent, Artifact, Attempt, ChallengeClaim, DailyStat, Flashcard, PlanTask, SavedDeck, StudyDocument } from "@/data/models";
import { useResume, useSettings } from "@/data/settings";
import { challengeProgress, challengesFor } from "@/lib/learning/challenges";
import { computeStreak, lastNDays, recommendations } from "@/lib/learning/insights";
import { formatMinutes, formatRelative, greeting } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui/Button";
import { Card, ProgressBar, ProgressRing } from "@/components/ui/primitives";
import { isDue } from "@/lib/srs/fsrs";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const rise = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } };

function ContinueCard() {
  const resume = useResume();
  const documents = useCollection<StudyDocument>("documents");
  const decks = useCollection<SavedDeck>("decks");
  const doc = documents.find((item) => item.id === resume.docId && item.status === "ready");
  const lastDoc = doc ?? [...documents].filter((item) => item.status === "ready" && item.lastOpenedAt).sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))[0];
  const deck = decks.find((item) => item.id === resume.deckId);

  let title = "Upload your first lecture PDF";
  let detail = "Recall turns it into a summary, revision notes, flashcards and practice questions.";
  let to = "/study?upload=1";
  let cta = "Upload a PDF";
  let progress: number | null = null;
  let eyebrow = "Get started";

  if (resume.run) {
    eyebrow = "Unfinished session";
    title = resume.run.title;
    detail = `${resume.run.answered} of ${resume.run.total} questions answered · ${formatRelative(resume.run.updatedAt)}`;
    to = resume.run.path;
    cta = "Resume";
    progress = resume.run.total ? resume.run.answered / resume.run.total : 0;
  } else if (lastDoc) {
    eyebrow = "Continue studying";
    title = lastDoc.title;
    detail = lastDoc.pageCount ? `Page ${lastDoc.lastPage} of ${lastDoc.pageCount} · opened ${formatRelative(lastDoc.lastOpenedAt)}` : "Ready to study";
    to = `/study/${lastDoc.id}${resume.docId === lastDoc.id && resume.docTab ? `?tab=${resume.docTab}` : ""}`;
    cta = "Continue";
    progress = lastDoc.pageCount ? lastDoc.lastPage / lastDoc.pageCount : null;
  } else if (deck) {
    eyebrow = "Continue studying";
    title = deck.title;
    detail = `${deck.questions.length} questions`;
    to = `/decks/${deck.id}`;
    cta = "Open deck";
  }

  return (
    <motion.div variants={rise} className="hero-panel rounded-3xl p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-white/70">{eyebrow}</p>
          <h2 className="mt-1.5 truncate text-[22px] font-semibold leading-tight tracking-[-0.03em] sm:text-[28px]">{title}</h2>
          <p className="mt-1.5 text-sm text-white/75">{detail}</p>
          {progress !== null && <ProgressBar value={progress} tone="light" className="mt-4 max-w-xs" label="Progress" />}
        </div>
        <ButtonLink to={to} variant="inverse" size="lg" className="shrink-0" icon={lastDoc || resume.run || deck ? <ArrowRight className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}>
          {cta}
        </ButtonLink>
      </div>
    </motion.div>
  );
}

function DailyGoalCard() {
  const settings = useSettings();
  const stats = useCollection<DailyStat>("dailyStats");
  const today = stats.find((stat) => stat.id === dayKey());
  const minutes = today?.minutes ?? 0;
  const week = lastNDays(stats, 7);
  const maxMinutes = Math.max(settings.dailyGoalMinutes, ...week.map((day) => day.minutes));
  const weekMinutes = week.reduce((sum, day) => sum + day.minutes, 0);
  const weekQuestions = week.reduce((sum, day) => sum + day.questions, 0);
  return (
    <motion.div variants={rise}>
      <Card className="h-full p-5">
        <div className="flex items-center gap-4">
          <ProgressRing value={minutes / settings.dailyGoalMinutes} size={64} stroke={6}>
            <span className="tabular text-sm font-semibold">{Math.round(Math.min(100, (minutes / settings.dailyGoalMinutes) * 100))}%</span>
          </ProgressRing>
          <div className="min-w-0">
            <p className="text-[13px] text-muted">Daily goal</p>
            <p className="tabular text-lg font-semibold">
              {formatMinutes(minutes)} <span className="text-sm font-normal text-subtle">/ {settings.dailyGoalMinutes} min</span>
            </p>
            <p className="text-xs text-subtle">
              {today?.questions ?? 0} questions · {today?.cards ?? 0} cards today
            </p>
          </div>
        </div>
        <div className="mt-5">
          <div className="flex h-14 items-end gap-1.5" aria-label="Study minutes, last 7 days">
            {week.map((day) => (
              <div key={day.id} className="flex flex-1 flex-col items-center gap-1">
                <motion.div
                  className={cn("w-full rounded-md", day.id === dayKey() ? "bg-accent" : "bg-accent/30")}
                  initial={{ height: 2 }}
                  animate={{ height: Math.max(2, (day.minutes / maxMinutes) * 44) }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  title={`${day.label}: ${formatMinutes(day.minutes)}`}
                />
                <span className="text-[10px] text-subtle">{day.label.slice(0, 1)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            This week: <span className="font-medium text-text">{formatMinutes(weekMinutes)}</span> studied · <span className="font-medium text-text">{weekQuestions}</span> questions
          </p>
        </div>
      </Card>
    </motion.div>
  );
}

const REC_ICONS = { review: Layers, weak: Target, continue: BookOpen, generate: Sparkles, revisit: Target, plan: CheckCircle2, start: ArrowRight };

function NextActivityCard() {
  const cards = useCollection<Flashcard>("cards");
  const attempts = useCollection<Attempt>("attempts");
  const documents = useCollection<StudyDocument>("documents");
  const decks = useCollection<SavedDeck>("decks");
  const tasks = useCollection<PlanTask>("tasks");
  const artifacts = useCollection<Artifact>("artifacts");
  const resume = useResume();
  const recs = recommendations({ cards, attempts, documents, decks, tasks, hasArtifacts: (id) => artifacts.some((a) => a.docId === id) }).filter(
    (rec) => !(rec.kind === "continue" && rec.id === `continue-${resume.docId}`),
  );
  const rec = recs[0];
  const dueCount = cards.filter((card) => isDue(card.srs) && card.srs.state !== "new").length;
  if (!rec) return null;
  const Icon = REC_ICONS[rec.kind];
  return (
    <motion.div variants={rise}>
      <Card className="flex h-full flex-col p-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted">Recommended next</p>
          {dueCount > 0 && rec.kind !== "review" && (
            <Link to="/review" className="text-xs font-medium text-accent-text hover:underline">
              {dueCount} cards due
            </Link>
          )}
        </div>
        <div className="mt-3 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold leading-snug">{rec.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{rec.reason}</p>
          </div>
        </div>
        <div className="mt-auto pt-5">
          <ButtonLink to={rec.to} variant="secondary" className="w-full sm:w-auto">
            {rec.cta} <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </Card>
    </motion.div>
  );
}

function ChallengesCard() {
  const stats = useCollection<DailyStat>("dailyStats");
  const claims = useCollection<ChallengeClaim>("challengeClaims");
  const today = dayKey();
  const stat = stats.find((item) => item.id === today);
  const list = challengesFor(today);
  const done = list.filter((challenge) => claims.some((claim) => claim.id === `${today}:${challenge.id}`)).length;
  return (
    <motion.div variants={rise}>
      <Card className="h-full p-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted">Daily challenges</p>
          <span className="tabular text-xs font-medium text-subtle">
            {done}/{list.length} done
          </span>
        </div>
        <ul className="mt-3 space-y-1">
          {list.map((challenge) => {
            const complete = claims.some((claim) => claim.id === `${today}:${challenge.id}`);
            const progress = challengeProgress(challenge, stat);
            return (
              <li key={challenge.id}>
                <Link to={challenge.to} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
                  {complete ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <Circle className="h-5 w-5 shrink-0 text-border-strong" />}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", complete && "text-muted line-through decoration-border-strong")}>{challenge.title}</span>
                    {!complete && progress > 0 && <ProgressBar value={progress} className="mt-1.5 h-1" />}
                  </span>
                  <span className="tabular shrink-0 text-xs font-medium text-subtle">+{challenge.points}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </motion.div>
  );
}

function RecentActivity() {
  const activity = useCollection<ActivityEvent>("activity");
  const recent = [...activity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  return (
    <motion.div variants={rise}>
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted">Recent activity</p>
          {recent.length > 0 && (
            <Link to="/progress" className="text-xs font-medium text-accent-text hover:underline">
              View progress
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing yet — your uploads, quizzes and reviews will show up here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {recent.map((event) => {
              const inner = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{event.title}</span>
                    {event.detail && <span className="block truncate text-xs text-subtle">{event.detail}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-subtle">{formatRelative(event.at)}</span>
                </>
              );
              return (
                <li key={event.id}>
                  {event.link ? (
                    <Link to={event.link} className="flex items-center gap-3 py-2.5 hover:text-accent-text">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 py-2.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { displayName } = useAccount();
  const stats = useCollection<DailyStat>("dailyStats");
  const streak = computeStreak(stats);
  const first = displayName.split(" ")[0];
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      <motion.header variants={rise} className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.03em] sm:text-[32px]">
            {greeting()}, {first}
          </h1>
        </div>
        {streak.current > 0 && (
          <div className="hidden items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-2 sm:flex">
            <Flame className={cn("h-5 w-5", streak.activeToday ? "text-warning" : "text-subtle")} fill={streak.activeToday ? "currentColor" : "none"} />
            <span className="text-sm">
              <span className="tabular font-semibold">{streak.current}-day</span> <span className="text-muted">streak</span>
            </span>
          </div>
        )}
      </motion.header>
      <ContinueCard />
      <div className="grid gap-5 md:grid-cols-2">
        <DailyGoalCard />
        <NextActivityCard />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <ChallengesCard />
        <RecentActivity />
      </div>
    </motion.div>
  );
}
