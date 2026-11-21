import { useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { Lock, TrendingDown, TrendingUp } from "lucide-react";
import { useCollection } from "@/data/db";
import type { Artifact, Attempt, ChatMessage, DailyStat, Flashcard, Folder, GuideData, ReviewLogEntry, SavedDeck, StudyDocument, TopicProgress, UnlockedAchievement } from "@/data/models";
import { ACHIEVEMENTS } from "@/lib/learning/achievements";
import { cardBuckets, classifyTopics, computeStreak, insightSentence, lastNDays, repeatedMistakes, topicStats } from "@/lib/learning/insights";
import { formatMinutes } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { BarChart } from "@/components/ui/BarChart";
import { ButtonLink } from "@/components/ui/Button";
import { BarChart3 } from "lucide-react";

const BUCKET_STYLE = [
  { key: "new", label: "New", cls: "bg-accent/20" },
  { key: "learning", label: "Learning", cls: "bg-accent/45" },
  { key: "review", label: "Reviewing", cls: "bg-accent/70" },
  { key: "mastered", label: "Mastered", cls: "bg-accent" },
] as const;

function Overview() {
  const stats = useCollection<DailyStat>("dailyStats");
  const attempts = useCollection<Attempt>("attempts");
  const cards = useCollection<Flashcard>("cards");
  const folders = useCollection<Folder>("folders");
  const documents = useCollection<StudyDocument>("documents");
  const artifacts = useCollection<Artifact>("artifacts");
  const topicProgress = useCollection<TopicProgress>("topicProgress");
  const streak = computeStreak(stats);
  const answered = stats.reduce((s, d) => s + d.questions, 0);
  const correct = stats.reduce((s, d) => s + d.correct, 0);
  const minutes = stats.reduce((s, d) => s + d.minutes, 0);
  const quizzes = attempts.filter((a) => a.mode === "practice" || a.mode === "exam").length;
  const buckets = cardBuckets(cards);
  const days = lastNDays(stats, 14);
  const recent = [...attempts].filter((a) => a.mode !== "arcade" && a.mode !== "daily").sort((a, b) => a.finishedAt.localeCompare(b.finishedAt)).slice(-12);

  const bySubject = folders.map((folder) => {
    const docs = documents.filter((d) => d.folderId === folder.id);
    const docIds = new Set(docs.map((d) => d.id));
    const topics = docs.flatMap((d) => ((artifacts.find((a) => a.id === `${d.id}:guide`)?.data as GuideData | undefined)?.topics ?? []).map((t) => `${d.id}:${t.id}`));
    const done = topics.filter((id) => topicProgress.some((p) => p.id === id)).length;
    const subjectAnswers = attempts.filter((a) => a.docId && docIds.has(a.docId)).flatMap((a) => a.answers);
    return { folder, docs: docs.length, topics: topics.length, done, accuracy: subjectAnswers.length ? subjectAnswers.filter((x) => x.correct).length / subjectAnswers.length : null, answered: subjectAnswers.length };
  });

  if (!answered && !cards.length && !minutes && !attempts.length) {
    return <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Your progress will appear here" description="Study a document, take a quiz or review flashcards. Everything shown here comes from your real activity." action={<ButtonLink to="/quiz">Take a quiz</ButtonLink>} />;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Study time" value={formatMinutes(minutes)} sub="Active time on study pages" />
        <StatTile label="Quizzes & exams" value={quizzes} sub={`${answered} questions answered`} />
        <StatTile label="Average accuracy" value={answered ? `${Math.round((correct / answered) * 100)}%` : "—"} sub={answered ? `${correct} correct` : undefined} />
        <StatTile label="Study streak" value={`${streak.current} day${streak.current === 1 ? "" : "s"}`} sub={`Best: ${streak.best}`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-semibold">Study minutes</p>
          <p className="mb-4 text-xs text-subtle">Last 14 days</p>
          <BarChart label="Study minutes per day, last 14 days" data={days.map((d) => ({ key: d.id, label: d.label, value: Math.round(d.minutes) }))} format={(v) => formatMinutes(v)} highlightLast />
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold">Quiz scores</p>
          <p className="mb-4 text-xs text-subtle">Your last {recent.length || ""} practice quizzes and exams</p>
          {recent.length ? (
            <BarChart label="Score per quiz" data={recent.map((a, i) => ({ key: a.id, label: `#${i + 1}`, value: a.scorePct }))} format={(v) => `${v}%`} highlightLast />
          ) : (
            <p className="py-10 text-center text-sm text-subtle">Complete a practice quiz to see your scores.</p>
          )}
        </Card>
      </div>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Flashcards</p>
          <p className="text-xs text-subtle">{cards.length} total</p>
        </div>
        {cards.length ? (
          <>
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={BUCKET_STYLE.map((b) => `${b.label} ${buckets[b.key]}`).join(", ")}>
              {BUCKET_STYLE.map((b) => buckets[b.key] > 0 && <motion.div key={b.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", b.cls)} initial={{ width: 0 }} animate={{ width: `${(buckets[b.key] / cards.length) * 100}%` }} transition={{ duration: 0.7 }} />)}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {BUCKET_STYLE.map((b) => (
                <span key={b.key} className="inline-flex items-center gap-2 text-sm">
                  <span className={cn("h-2.5 w-2.5 rounded-sm", b.cls)} />
                  <span className="text-muted">{b.label}</span> <span className="tabular font-semibold">{buckets[b.key]}</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-subtle">No flashcards yet.</p>
        )}
      </Card>
      {bySubject.length > 0 && (
        <Card className="divide-y divide-border">
          <p className="px-5 py-4 text-sm font-semibold">Progress by subject</p>
          {bySubject.map(({ folder, docs, topics, done, accuracy, answered: n }) => (
            <div key={folder.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex min-w-0 items-center gap-2 sm:w-48">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: folder.color }} />
                <span className="truncate text-sm font-medium">{folder.name}</span>
              </div>
              <div className="flex-1">
                <div className="mb-1 flex justify-between text-xs text-subtle">
                  <span>{topics ? `${done}/${topics} topics` : `${docs} document${docs === 1 ? "" : "s"} · no study guide yet`}</span>
                  <span>{accuracy !== null ? `${Math.round(accuracy * 100)}% accuracy (${n})` : "No questions yet"}</span>
                </div>
                <ProgressBar value={topics ? done / topics : 0} />
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Topics() {
  const attempts = useCollection<Attempt>("attempts");
  const stats = topicStats(attempts);
  const { weak, strong, improving } = classifyTopics(stats);
  const insight = insightSentence(stats);
  const mistakes = repeatedMistakes(attempts).slice(0, 8);
  if (!stats.length) return <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="Not enough data yet" description="Answer at least three questions on a topic and Recall will start identifying your strengths and weak spots." />;
  const Row = ({ s }: { s: (typeof stats)[number] }) => (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="min-w-0 flex-1 truncate text-sm">{s.topic}</span>
      <span className="tabular w-24 text-right text-xs text-subtle">{s.correct}/{s.total} correct</span>
      <span className={cn("tabular w-12 text-right text-sm font-semibold", s.accuracy >= 0.8 ? "text-success" : s.accuracy < 0.6 ? "text-danger" : "text-warning")}>{Math.round(s.accuracy * 100)}%</span>
    </div>
  );
  return (
    <div className="space-y-5">
      {insight && <Card className="hero-panel border-0 p-5 text-[15px] font-medium">{insight}</Card>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="divide-y divide-border">
          <p className="flex items-center gap-2 px-5 py-4 text-sm font-semibold">
            <TrendingDown className="h-4 w-4 text-danger" /> Needs practice
          </p>
          {weak.length ? weak.map((s) => <Row key={s.topic} s={s} />) : <p className="px-5 py-4 text-sm text-subtle">No weak topics detected.</p>}
        </Card>
        <Card className="divide-y divide-border">
          <p className="flex items-center gap-2 px-5 py-4 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-success" /> Strong topics
          </p>
          {strong.length ? strong.map((s) => <Row key={s.topic} s={s} />) : <p className="px-5 py-4 text-sm text-subtle">Keep practising — strong topics need 80%+ over four or more questions.</p>}
        </Card>
      </div>
      {improving.length > 0 && (
        <Card className="divide-y divide-border">
          <p className="px-5 py-4 text-sm font-semibold">Improving</p>
          {improving.map((s) => <Row key={s.topic} s={s} />)}
        </Card>
      )}
      {mistakes.length > 0 && (
        <Card className="divide-y divide-border">
          <p className="px-5 py-4 text-sm font-semibold">Repeated mistakes</p>
          {mistakes.map((m) => (
            <div key={m.prompt} className="px-5 py-3.5">
              <p className="text-sm">{m.prompt}</p>
              <p className="mt-1 text-xs text-subtle">
                Missed {m.misses}× · correct answer: <span className="text-success">{m.expected}</span>
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Achievements() {
  const unlocked = useCollection<UnlockedAchievement>("achievements");
  const ctx = {
    attempts: useCollection<Attempt>("attempts"),
    documents: useCollection<StudyDocument>("documents"),
    stats: useCollection<DailyStat>("dailyStats"),
    reviewLogs: useCollection<ReviewLogEntry>("reviewLogs"),
    decks: useCollection<SavedDeck>("decks"),
    cards: useCollection<Flashcard>("cards"),
    topicProgress: useCollection<TopicProgress>("topicProgress"),
    messages: useCollection<ChatMessage>("messages"),
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ACHIEVEMENTS.map((def, index) => {
        const got = unlocked.find((u) => u.id === def.id);
        const [current, target] = def.progress(ctx);
        return (
          <motion.div key={def.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
            <Card className={cn("h-full p-5", got && "border-accent/40")}>
              <div className="flex items-start gap-3">
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", got ? "hero-panel" : "bg-surface-3 text-subtle")}>{got ? <def.icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}</span>
                <div className="min-w-0">
                  <p className={cn("font-semibold", !got && "text-muted")}>{def.title}</p>
                  <p className="mt-0.5 text-[13px] text-subtle">{def.description}</p>
                </div>
              </div>
              {got ? (
                <Badge tone="accent" className="mt-4">
                  Unlocked {new Date(got.unlockedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Badge>
              ) : (
                <div className="mt-4">
                  <ProgressBar value={current / target} />
                  <p className="tabular mt-1.5 text-xs text-subtle">
                    {Math.min(current, target)} / {target}
                  </p>
                </div>
              )}
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

function History() {
  const attempts = [...useCollection<Attempt>("attempts")].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)).slice(0, 50);
  if (!attempts.length) return <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No sessions yet" />;
  const label = { practice: "Practice", exam: "Exam", arcade: "Arcade", daily: "Daily Drop" };
  return (
    <Card className="divide-y divide-border">
      {attempts.map((a) => (
        <div key={a.id} className="flex items-center gap-3 px-5 py-3.5">
          <Badge tone={a.mode === "exam" ? "accent" : "neutral"}>{label[a.mode]}</Badge>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{a.title}</span>
            <span className="text-xs text-subtle">{new Date(a.finishedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{a.points !== undefined ? ` · ${a.points.toLocaleString()} pts` : ""}</span>
          </span>
          <span className="tabular text-sm font-semibold">{a.correct}/{a.total}</span>
        </div>
      ))}
    </Card>
  );
}

export default function Progress() {
  const [params, setParams] = useSearchParams();
  const tab = (["overview", "topics", "achievements", "history"].includes(params.get("tab") ?? "") ? params.get("tab") : "overview") as string;
  return (
    <div>
      <PageHeader title="Progress" description="Your learning, measured from real activity — nothing estimated or invented." />
      <Tabs label="Progress sections" value={tab} onChange={(t) => setParams(t === "overview" ? {} : { tab: t }, { replace: true })} className="mb-6" items={[{ id: "overview", label: "Overview" }, { id: "topics", label: "Topics" }, { id: "achievements", label: "Achievements" }, { id: "history", label: "History" }]} />
      {tab === "overview" && <Overview />}
      {tab === "topics" && <Topics />}
      {tab === "achievements" && <Achievements />}
      {tab === "history" && <History />}
    </div>
  );
}
