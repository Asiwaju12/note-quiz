import { useState } from "react";
import { Target } from "lucide-react";
import { useCollection } from "@/data/db";
import type { ArtifactSource, Attempt, SavedDeck, StudyDocument } from "@/data/models";
import { getOrCreateDocDeck, updateDeck } from "@/data/repos";
import type { QuestionTypeOption } from "@/lib/ai/contract";
import type { Question } from "@/lib/game/types";
import { generateQuestions } from "@/lib/study/generate";
import { shuffle } from "@/lib/game/deck";
import { Button } from "@/components/ui/Button";
import { Card, Chips } from "@/components/ui/primitives";
import { QuizRunner, hasSavedRun } from "@/components/quiz/QuizRunner";
import { GenerateChoice, GeneratingState } from "./GeneratePanel";
import { runJob, useJob } from "./jobs";
import { useArtifact, PracticeHistory } from "./panels";

const TYPE_OPTIONS: Array<{ value: QuestionTypeOption; label: string }> = [
  { value: "mcq", label: "Multiple choice" },
  { value: "tf", label: "True / false" },
  { value: "short", label: "Short answer" },
  { value: "fill", label: "Fill the blank" },
];

export function PracticePanel({
  doc,
  initialTopic,
  initialPages,
  runParam,
  onRun,
}: {
  doc: StudyDocument;
  initialTopic?: string;
  initialPages?: number[];
  runParam?: string | null;
  onRun: (runKey: string | null) => void;
}) {
  const guide = useArtifact(doc.id, "guide");
  const decks = useCollection<SavedDeck>("decks");
  const attempts = useCollection<Attempt>("attempts");
  const deck = decks.find((d) => d.docId === doc.id && d.kind === "document");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<"mixed" | "easy" | "medium" | "hard">("mixed");
  const [types, setTypes] = useState<QuestionTypeOption[]>(["mcq", "tf", "fill", "short"]);
  const [topic, setTopic] = useState<string>(initialTopic ?? "");
  const [run, setRun] = useState<{ key: string; questions: Question[]; title: string } | null>(() =>
    runParam && hasSavedRun(runParam) ? { key: runParam, questions: [], title: `${doc.title} · Practice` } : null,
  );
  const jobKey = `${doc.id}:practice`;
  const job = useJob(jobKey);
  const topicPages = topic ? (guide?.data.topics.find((t) => t.title === topic)?.pages ?? (topic === initialTopic ? initialPages : undefined)) : undefined;

  const start = (questions: Question[], title: string) => {
    const key = `doc-${doc.id}-${Date.now().toString(36)}`;
    setRun({ key, questions, title });
    onRun(key);
  };

  const generate = (source: ArtifactSource) => {
    void runJob(jobKey, async (signal) => {
      const target = getOrCreateDocDeck(doc);
      const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/gi, " ").trim();
      const seen = new Set([
        ...target.questions.map((q) => normalise(q.prompt)),
        ...attempts.filter((a) => a.docId === doc.id).flatMap((a) => a.answers.map((answer) => normalise(answer.prompt))),
      ]);
      let questions: Question[] = [];
      try {
        questions = await generateQuestions(doc, { count, difficulty, types, topics: topic ? [topic] : undefined, pages: topicPages?.length ? topicPages : undefined, excludePrompts: [...seen] }, source, signal);
      } catch (error) {
        // An empty result means the available source material has all been seen.
        // Other generation failures should still be surfaced to the normal job UI.
        if (!(error instanceof Error) || !/no usable questions|couldn't build questions/i.test(error.message)) throw error;
      }
      // If the source has no unseen questions left, begin a fresh shuffled review cycle.
      if (!questions.length) questions = await generateQuestions(doc, { count, difficulty, types, topics: topic ? [topic] : undefined, pages: topicPages?.length ? topicPages : undefined }, source, signal);
      questions = shuffle(questions);
      const known = new Set(target.questions.map((q) => normalise(q.prompt)));
      const fresh = questions.filter((q) => !known.has(normalise(q.prompt)));
      if (fresh.length) updateDeck(target.id, { questions: [...target.questions, ...fresh], source });
      start(questions, `${doc.title} · ${topic || "Practice"}`);
      return questions;
    });
  };

  if (run) {
    return (
      <QuizRunner
        questions={run.questions}
        title={run.title}
        runKey={run.key}
        resumePath={`/study/${doc.id}?tab=practice&run=${run.key}`}
        deckId={deck?.id}
        docId={doc.id}
        onExit={() => {
          setRun(null);
          onRun(null);
        }}
      />
    );
  }
  if (job.running) return <GeneratingState jobKey={jobKey} label="Writing practice questions" />;

  const saved = deck?.questions ?? [];
  const topicOptions = guide?.data.topics.map((t) => t.title) ?? (initialTopic ? [initialTopic] : []);

  return (
    <div>
      {saved.length > 0 && (
        <Card className="mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">{saved.length} saved questions</p>
            <p className="text-xs text-subtle">Questions you've generated for this document are kept in its deck.</p>
          </div>
          <Button variant="secondary" icon={<Target className="h-4 w-4" />} onClick={() => start(shuffle(saved).slice(0, count), `${doc.title} · Review`)}>
            Practise {Math.min(count, saved.length)} saved
          </Button>
        </Card>
      )}
      <GenerateChoice jobKey={jobKey} title="Generate practice questions" description="Choose what you want to practise. Every question includes an explanation, and page references where possible." icon={<Target className="h-6 w-6" />} onGenerate={generate}>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[13px] font-medium">Number of questions</p>
            <Chips label="Number of questions" value={count} onChange={(v) => setCount(v as number)} options={[5, 10, 15, 20].map((v) => ({ value: v, label: String(v) }))} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">Difficulty</p>
            <Chips label="Difficulty" value={difficulty} onChange={(v) => setDifficulty(v as typeof difficulty)} options={[{ value: "mixed", label: "Mixed" }, { value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">Question types</p>
            <Chips label="Question types" multiple value={types} onChange={(v) => setTypes(v as QuestionTypeOption[])} options={TYPE_OPTIONS} />
          </div>
          {topicOptions.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] font-medium">Topic</p>
              <Chips label="Topic" value={topic} onChange={(v) => setTopic(v as string)} options={[{ value: "", label: "Whole document" }, ...topicOptions.map((t) => ({ value: t, label: t.length > 40 ? `${t.slice(0, 40)}…` : t }))]} />
            </div>
          )}
        </div>
      </GenerateChoice>
      <PracticeHistory docId={doc.id} />
    </div>
  );
}
