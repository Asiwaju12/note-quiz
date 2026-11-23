import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Play } from "lucide-react";
import { useCollection } from "@/data/db";
import type { Attempt, SavedDeck } from "@/data/models";
import { updateResume } from "@/data/settings";
import { shuffle } from "@/lib/game/deck";
import { questionType, type QuestionType } from "@/lib/game/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, Chips, EmptyState } from "@/components/ui/primitives";
import { QuizRunner, hasSavedRun } from "@/components/quiz/QuizRunner";
import { Target } from "lucide-react";

const TYPE_LABEL: Record<QuestionType, string> = { mcq: "Multiple choice", tf: "True/false", short: "Short answer", fill: "Fill blank" };

export default function Practice() {
  const { deckId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const decks = useCollection<SavedDeck>("decks");
  const attempts = useCollection<Attempt>("attempts");
  const deck = decks.find((d) => d.id === deckId);
  const runParam = params.get("run");
  const [run, setRun] = useState<{ key: string; ids: string[] } | null>(() => (runParam && hasSavedRun(runParam) ? { key: runParam, ids: [] } : null));
  const topics = useMemo(() => [...new Set((deck?.questions ?? []).map((q) => q.topic || q.category).filter(Boolean))], [deck]);
  const types = useMemo(() => [...new Set((deck?.questions ?? []).map(questionType))], [deck]);
  const [count, setCount] = useState<number>(10);
  const [topic, setTopic] = useState("");
  const [typeFilter, setTypeFilter] = useState<QuestionType[]>([]);

  if (!deck) return <EmptyState icon={<Target className="h-6 w-6" />} title="Deck not found" action={<ButtonLink to="/decks">My Decks</ButtonLink>} />;

  const pool = deck.questions.filter((q) => (!topic || (q.topic || q.category) === topic) && (!typeFilter.length || typeFilter.includes(questionType(q))));

  if (run) {
    const chosen = run.ids.map((id) => deck.questions.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => Boolean(q));
    return (
      <QuizRunner
        questions={chosen}
        title={deck.title}
        runKey={run.key}
        resumePath={`/quiz/practice/${deck.id}?run=${run.key}`}
        deckId={deck.id}
        docId={deck.docId}
        onExit={() => navigate(`/decks/${deck.id}`)}
      />
    );
  }

  const start = () => {
    const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/gi, " ").trim();
    const history = attempts.filter((attempt) => attempt.deckId === deck.id && attempt.answers.length > 0)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
    const seen = new Set(history.flatMap((attempt) => attempt.answers.map((answer) => normalise(answer.prompt))));
    const unseen = pool.filter((question) => !seen.has(normalise(question.prompt)));
    const available = unseen.length ? unseen : pool;
    let shuffled = shuffle(available);
    const previousFirst = history[0]?.answers[0]?.prompt;
    if (shuffled.length > 1 && previousFirst && normalise(shuffled[0].prompt) === normalise(previousFirst)) {
      shuffled.push(shuffled.shift()!);
    }
    const picked = shuffled.slice(0, count === 0 ? shuffled.length : count);
    const key = `deck-${deck.id}-${Date.now().toString(36)}`;
    updateResume({ deckId: deck.id });
    setRun({ key, ids: picked.map((q) => q.id) });
    setParams({ run: key }, { replace: true });
  };

  return (
    <div className="mx-auto max-w-xl">
      <Link to={`/decks/${deck.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> {deck.title}
      </Link>
      <h1 className="text-[26px] font-semibold tracking-[-0.03em]">Practice quiz</h1>
      <p className="mt-1 text-sm text-muted">Instant feedback and explanations after every question.</p>
      <Card className="mt-6 space-y-5 p-5 sm:p-6">
        <div>
          <p className="mb-2 text-[13px] font-medium">Number of questions</p>
          <Chips label="Number of questions" value={count} onChange={(v) => setCount(v as number)} options={[5, 10, 20, 0].map((v) => ({ value: v, label: v === 0 ? `All (${pool.length})` : String(v) }))} />
        </div>
        {topics.length > 1 && (
          <div>
            <p className="mb-2 text-[13px] font-medium">Topic</p>
            <Chips label="Topic" value={topic} onChange={(v) => setTopic(v as string)} options={[{ value: "", label: "All topics" }, ...topics.slice(0, 12).map((t) => ({ value: t, label: t.length > 32 ? `${t.slice(0, 32)}…` : t }))]} />
          </div>
        )}
        {types.length > 1 && (
          <div>
            <p className="mb-2 text-[13px] font-medium">Question types</p>
            <Chips label="Question types" multiple value={typeFilter.length ? typeFilter : types} onChange={(v) => setTypeFilter(v as QuestionType[])} options={types.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
          </div>
        )}
        <Button size="lg" className="w-full" onClick={start} disabled={!pool.length} icon={<Play className="h-4 w-4" />}>
          Start {Math.min(count === 0 ? pool.length : count, pool.length)} questions
        </Button>
      </Card>
    </div>
  );
}
