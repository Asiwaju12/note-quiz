import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Clock, FileText, Flag, GraduationCap, LibraryBig, TriangleAlert } from "lucide-react";
import { useCollection } from "@/data/db";
import type { AnswerRecord, Attempt, Folder, SavedDeck, StudyDocument } from "@/data/models";
import { getOrCreateDocDeck, recordAttempt, updateDeck } from "@/data/repos";
import { clearResumeRun, updateResume } from "@/data/settings";
import { shuffle } from "@/lib/game/deck";
import { questionType, type Question, type QuestionType } from "@/lib/game/types";
import { expectedAnswer, grade, isAnswered, responseText, type Response } from "@/lib/learning/grading";
import { generateQuestions } from "@/lib/study/generate";
import { useAiStatus } from "@/services/ai";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge, Card, Chips, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { QuestionMeta, QuestionView } from "@/components/quiz/QuestionView";
import { QuizResults } from "@/components/quiz/QuizResults";
import { confirmAction } from "@/components/ui/Confirm";

type ExamState = {
  title: string;
  questions: Question[];
  responses: Record<string, Response>;
  flags: string[];
  index: number;
  startedAt: string;
  durationSec: number | null;
  sources: { deckIds: string[]; docId?: string };
};

const KEY = "recall.exam.v1";
const loadExam = (): ExamState | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};
const saveExam = (state: ExamState | null) => {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

function Setup({ onStart }: { onStart: (exam: ExamState) => void }) {
  const [params] = useSearchParams();
  const decks = useCollection<SavedDeck>("decks").filter((d) => d.questions.length);
  const documents = useCollection<StudyDocument>("documents").filter((d) => d.status === "ready" && d.charCount > 200);
  const folders = useCollection<Folder>("folders");
  const attempts = useCollection<Attempt>("attempts").filter((a) => a.mode === "exam").sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const ai = useAiStatus();
  const [subject, setSubject] = useState("");
  const [selected, setSelected] = useState<string[]>(() => (params.get("deck") ? [params.get("deck")!] : []));
  const [docId, setDocId] = useState("");
  const [count, setCount] = useState(20);
  const [difficulty, setDifficulty] = useState<"mixed" | "easy" | "medium" | "hard">("mixed");
  const [types, setTypes] = useState<QuestionType[]>(["mcq", "tf", "fill", "short"]);
  const [minutes, setMinutes] = useState<number>(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleDecks = decks.filter((d) => !subject || d.folderId === subject);
  const visibleDocs = documents.filter((d) => !subject || d.folderId === subject);
  const pool = decks
    .filter((d) => selected.includes(d.id))
    .flatMap((d) => d.questions)
    .filter((q) => types.includes(questionType(q)))
    .filter((q) => difficulty === "mixed" || !q.difficulty || q.difficulty === difficulty);

  const start = async () => {
    setError(null);
    let questions = shuffle(pool).slice(0, count);
    const deckIds = [...selected];
    const doc = documents.find((d) => d.id === docId);
    if (doc && questions.length < count) {
      setBusy(true);
      try {
        const generated = await generateQuestions(doc, { count: count - questions.length, difficulty, types }, ai?.configured ? "ai" : "local");
        const deck = getOrCreateDocDeck(doc);
        updateDeck(deck.id, { questions: [...deck.questions, ...generated] });
        deckIds.push(deck.id);
        questions = shuffle([...questions, ...generated]).slice(0, count);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Couldn't generate questions.");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (!questions.length) {
      setError("Choose at least one deck or document with questions matching your filters.");
      return;
    }
    const titleParts = [...decks.filter((d) => selected.includes(d.id)).map((d) => d.title), ...(doc ? [doc.title] : [])];
    onStart({
      title: `Exam · ${titleParts.slice(0, 2).join(", ")}${titleParts.length > 2 ? ` +${titleParts.length - 2}` : ""}`,
      questions,
      responses: {},
      flags: [],
      index: 0,
      startedAt: new Date().toISOString(),
      durationSec: minutes ? minutes * 60 : null,
      sources: { deckIds, docId: doc?.id },
    });
  };

  if (!decks.length && !documents.length) {
    return <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="Nothing to examine yet" description="Create a quiz deck or upload a PDF first — exams draw questions from them." action={<ButtonLink to="/study">Upload a PDF</ButtonLink>} />;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {folders.length > 0 && (
          <Card className="p-5">
            <p className="mb-2 text-[13px] font-medium">Subject</p>
            <Chips label="Subject" value={subject} onChange={(v) => setSubject(v as string)} options={[{ value: "", label: "All" }, ...folders.map((f) => ({ value: f.id, label: f.name }))]} />
          </Card>
        )}
        <Card className="p-5">
          <p className="mb-3 text-[13px] font-medium">Question sources</p>
          <div className="space-y-2">
            {visibleDecks.map((deck) => {
              const on = selected.includes(deck.id);
              return (
                <button key={deck.id} type="button" aria-pressed={on} onClick={() => setSelected((list) => (on ? list.filter((x) => x !== deck.id) : [...list, deck.id]))} className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors", on ? "border-accent bg-accent-softer" : "border-border hover:bg-surface-2")}>
                  <LibraryBig className={cn("h-4 w-4 shrink-0", on ? "text-accent-text" : "text-subtle")} />
                  <span className="min-w-0 flex-1 truncate">{deck.title}</span>
                  <span className="text-xs text-subtle">{deck.questions.length} Qs</span>
                </button>
              );
            })}
          </div>
          {visibleDocs.length > 0 && (
            <div className="mt-4">
              <label htmlFor="exam-doc" className="mb-1.5 block text-[13px] font-medium">
                Generate fresh questions from a PDF <span className="font-normal text-subtle">(optional)</span>
              </label>
              <Select id="exam-doc" value={docId} onChange={(e) => setDocId(e.target.value)}>
                <option value="">None</option>
                {visibleDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </Select>
              {docId && <p className="mt-1.5 text-xs text-subtle">{ai?.configured ? "Recall AI writes new questions to fill the exam." : "Basic mode extracts questions from definitions and key sentences."}</p>}
            </div>
          )}
        </Card>
        <Card className="space-y-5 p-5">
          <div>
            <p className="mb-2 text-[13px] font-medium">Questions</p>
            <Chips label="Question count" value={count} onChange={(v) => setCount(v as number)} options={[10, 20, 30, 40].map((v) => ({ value: v, label: String(v) }))} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">Difficulty</p>
            <Chips label="Difficulty" value={difficulty} onChange={(v) => setDifficulty(v as typeof difficulty)} options={[{ value: "mixed", label: "Mixed" }, { value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">Question types</p>
            <Chips label="Question types" multiple value={types} onChange={(v) => setTypes(v as QuestionType[])} options={[{ value: "mcq", label: "Multiple choice" }, { value: "tf", label: "True/false" }, { value: "fill", label: "Fill blank" }, { value: "short", label: "Short answer" }]} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">Time limit</p>
            <Chips label="Time limit" value={minutes} onChange={(v) => setMinutes(v as number)} options={[0, 10, 20, 30, 45, 60].map((v) => ({ value: v, label: v ? `${v} min` : "No timer" }))} />
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="sticky top-6 p-5">
          <p className="text-sm font-semibold">Ready when you are</p>
          <p className="mt-1 text-sm text-muted">
            {pool.length} matching question{pool.length === 1 ? "" : "s"} selected{docId ? " + generated questions" : ""}. Answers are revealed only after you submit.
          </p>
          {error && (
            <p role="alert" className="mt-3 flex gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          <Button size="lg" className="mt-4 w-full" onClick={() => void start()} loading={busy} disabled={!pool.length && !docId} icon={<GraduationCap className="h-4 w-4" />}>
            {busy ? "Preparing questions…" : "Start exam"}
          </Button>
        </Card>
        {attempts.length > 0 && (
          <Card className="divide-y divide-border">
            <p className="px-5 py-3.5 text-sm font-semibold">Exam history</p>
            {attempts.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="min-w-0 truncate text-muted">{new Date(a.finishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <span className="tabular font-semibold">{a.scorePct}%</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

function Running({ exam, onChange, onSubmit, onQuit, onDiscard }: { exam: ExamState; onChange: (exam: ExamState) => void; onSubmit: () => void; onQuit: () => void; onDiscard: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [reviewing, setReviewing] = useState(false);
  const submitted = useRef(false);
  const elapsed = Math.floor((now - new Date(exam.startedAt).getTime()) / 1000);
  const remaining = exam.durationSec ? Math.max(0, exam.durationSec - elapsed) : null;
  const question = exam.questions[exam.index];
  const answeredCount = exam.questions.filter((q) => isAnswered(q, exam.responses[q.id])).length;
  const flagged = exam.flags.includes(question.id);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (remaining === 0 && !submitted.current) {
      submitted.current = true;
      onSubmit();
    }
  }, [remaining, onSubmit]);

  const go = (index: number) => {
    setReviewing(false);
    onChange({ ...exam, index: Math.max(0, Math.min(exam.questions.length - 1, index)) });
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Button variant="ghost" size="sm" onClick={onQuit}>
          Exit
        </Button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium">{exam.title}</p>
        <span className={cn("tabular inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold", remaining !== null && remaining < 60 ? "bg-danger-soft text-danger" : "bg-surface-3")} aria-live="off">
          <Clock className="h-4 w-4" />
          {remaining !== null ? fmt(remaining) : fmt(elapsed)}
        </span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-border p-4 md:block">
          <p className="mb-3 text-xs text-subtle">
            {answeredCount}/{exam.questions.length} answered · {exam.flags.length} flagged
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {exam.questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Question ${i + 1}${exam.flags.includes(q.id) ? ", flagged" : ""}${isAnswered(q, exam.responses[q.id]) ? ", answered" : ""}`}
                className={cn(
                  "tabular relative h-9 rounded-lg text-[13px] font-medium",
                  i === exam.index && !reviewing ? "bg-accent text-white" : isAnswered(q, exam.responses[q.id]) ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-muted",
                )}
              >
                {i + 1}
                {exam.flags.includes(q.id) && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-warning" />}
              </button>
            ))}
          </div>
          <Button variant="secondary" className="mt-5 w-full" onClick={() => setReviewing(true)}>
            Review & submit
          </Button>
        </aside>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-2xl">
            <AnimatePresence mode="wait">
              {reviewing ? (
                <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <h2 className="text-xl font-semibold">Review before submitting</h2>
                  <p className="mt-1 text-sm text-muted">
                    {answeredCount} of {exam.questions.length} answered{exam.flags.length ? ` · ${exam.flags.length} flagged` : ""}. Tap a question to revisit it.
                  </p>
                  <Card className="mt-5 divide-y divide-border">
                    {exam.questions.map((q, i) => (
                      <button key={q.id} type="button" onClick={() => go(i)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                        <span className="tabular w-6 text-sm text-subtle">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{q.prompt}</span>
                        {exam.flags.includes(q.id) && <Flag className="h-4 w-4 text-warning" />}
                        {isAnswered(q, exam.responses[q.id]) ? <Badge tone="accent">Answered</Badge> : <Badge tone="warning">Blank</Badge>}
                      </button>
                    ))}
                  </Card>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button variant="ghost" className="text-danger sm:mr-auto" onClick={onDiscard}>
                      Discard exam
                    </Button>
                    <Button variant="secondary" onClick={() => setReviewing(false)}>
                      Keep working
                    </Button>
                    <Button onClick={onSubmit}>Submit exam</Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key={question.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                  <div className="mb-4 flex items-center justify-between">
                    <span className="tabular text-sm text-subtle">
                      Question {exam.index + 1} of {exam.questions.length}
                    </span>
                    <Button variant={flagged ? "soft" : "ghost"} size="sm" icon={<Flag className="h-4 w-4" />} aria-pressed={flagged} onClick={() => onChange({ ...exam, flags: flagged ? exam.flags.filter((f) => f !== question.id) : [...exam.flags, question.id] })}>
                      {flagged ? "Flagged" : "Flag"}
                    </Button>
                  </div>
                  <Card className="p-5 sm:p-7">
                    <QuestionMeta question={{ ...question, sourcePage: undefined }} />
                    <h2 className="mb-6 mt-4 text-[19px] font-medium leading-snug">{question.prompt}</h2>
                    <QuestionView question={question} response={exam.responses[question.id]} reveal={false} onChange={(value) => onChange({ ...exam, responses: { ...exam.responses, [question.id]: value } })} />
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
      {!reviewing && (
        <footer className="safe-bottom flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" onClick={() => go(exam.index - 1)} disabled={exam.index === 0} icon={<ArrowLeft className="h-4 w-4" />}>
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <button type="button" onClick={() => setReviewing(true)} className="tabular text-sm text-muted md:hidden">
            {answeredCount}/{exam.questions.length} answered · Review
          </button>
          {exam.index + 1 < exam.questions.length ? (
            <Button onClick={() => go(exam.index + 1)}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => setReviewing(true)}>Review & submit</Button>
          )}
        </footer>
      )}
    </div>
  );
}

export default function Exam() {
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamState | null>(() => loadExam());
  const [result, setResult] = useState<{ exam: ExamState; answers: AnswerRecord[]; durationSec: number } | null>(null);

  useEffect(() => {
    saveExam(exam);
    if (exam) {
      const answered = exam.questions.filter((q) => isAnswered(q, exam.responses[q.id])).length;
      updateResume({ run: { kind: "exam", title: exam.title, path: "/exam", answered, total: exam.questions.length, updatedAt: new Date().toISOString() } });
    }
  }, [exam]);

  const submit = useMemo(
    () => () => {
      if (!exam) return;
      const answers: AnswerRecord[] = exam.questions.map((q) => ({
        questionId: q.id,
        prompt: q.prompt,
        type: questionType(q),
        topic: q.topic || q.category || "General",
        correct: grade(q, exam.responses[q.id]),
        response: responseText(q, exam.responses[q.id]),
        expected: expectedAnswer(q),
        flagged: exam.flags.includes(q.id),
      }));
      const durationSec = Math.round((Date.now() - new Date(exam.startedAt).getTime()) / 1000);
      const correct = answers.filter((a) => a.correct).length;
      recordAttempt({ mode: "exam", title: exam.title, deckId: exam.sources.deckIds[0], docId: exam.sources.docId, startedAt: exam.startedAt, finishedAt: new Date().toISOString(), durationSec, total: answers.length, correct, scorePct: Math.round((correct / answers.length) * 100), answers });
      clearResumeRun();
      setResult({ exam, answers, durationSec });
      setExam(null);
    },
    [exam],
  );

  if (result) {
    const hasShort = result.exam.questions.some((q) => questionType(q) === "short");
    return (
      <QuizResults
        title={result.exam.title}
        questions={result.exam.questions}
        answers={result.answers}
        durationSec={result.durationSec}
        docId={result.exam.sources.docId}
        onDone={() => setResult(null)}
        extra={
          hasShort ? (
            <p className="flex items-start gap-2 rounded-2xl bg-surface-2 p-4 text-sm text-muted">
              <FileText className="mt-0.5 h-4 w-4 shrink-0" /> Short answers were marked automatically by comparing key words with the model answer. Check them in the review below.
            </p>
          ) : undefined
        }
      />
    );
  }

  if (exam) {
    return (
      <Running
        exam={exam}
        onChange={setExam}
        onSubmit={submit}
        onQuit={async () => {
          if (await confirmAction({ title: "Leave the exam?", description: "Your answers are saved — resume from the dashboard or Exam Mode. The timer keeps running.", confirmLabel: "Save & leave" })) {
            navigate("/");
          }
        }}
        onDiscard={async () => {
          if (await confirmAction({ title: "Discard this exam?", description: "Your answers will be deleted and nothing is recorded.", confirmLabel: "Discard", danger: true })) {
            clearResumeRun();
            setExam(null);
          }
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader title="Exam Mode" description="Timed, exam-style practice. No feedback until you submit — just like the real thing." />
      <Setup onStart={setExam} />
    </div>
  );
}
