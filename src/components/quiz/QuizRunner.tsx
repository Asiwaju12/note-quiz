import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BookOpen, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { AnswerRecord } from "@/data/models";
import { recordAttempt } from "@/data/repos";
import { clearResumeRun, updateResume } from "@/data/settings";
import { questionType, type Question } from "@/lib/game/types";
import { expectedAnswer, grade, isAnswered, responseText, type Response } from "@/lib/learning/grading";
import { sfx } from "@/lib/game/sound";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Card, Kbd, ProgressBar } from "@/components/ui/primitives";
import { QuestionMeta, QuestionView } from "./QuestionView";
import { QuizResults } from "./QuizResults";

type SavedRun = {
  runKey: string;
  questions: Question[];
  index: number;
  responses: Record<string, Response>;
  revealed: Record<string, boolean>;
  startedAt: string;
};

const RUN_KEY = "recall.run.practice.v1";

function loadRun(runKey: string): SavedRun | null {
  try {
    const saved = JSON.parse(localStorage.getItem(RUN_KEY) ?? "null") as SavedRun | null;
    return saved && saved.runKey === runKey ? saved : null;
  } catch {
    return null;
  }
}

function saveRun(run: SavedRun | null) {
  try {
    if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function hasSavedRun(runKey: string): boolean {
  return Boolean(loadRun(runKey));
}

/**
 * Practice quiz: one question at a time with instant feedback and explanations.
 * Progress is saved so the student can leave and resume ("Continue studying").
 */
export function QuizRunner({
  questions: initialQuestions,
  title,
  runKey,
  resumePath,
  deckId,
  docId,
  onExit,
}: {
  questions: Question[];
  title: string;
  runKey: string;
  resumePath: string;
  deckId?: string;
  docId?: string;
  onExit: () => void;
}) {
  const restored = useMemo(() => loadRun(runKey), [runKey]);
  const [questions, setQuestions] = useState<Question[]>(restored?.questions ?? initialQuestions);
  const [index, setIndex] = useState(restored?.index ?? 0);
  const [responses, setResponses] = useState<Record<string, Response>>(restored?.responses ?? {});
  const [revealed, setRevealed] = useState<Record<string, boolean>>(restored?.revealed ?? {});
  const [startedAt, setStartedAt] = useState(restored?.startedAt ?? new Date().toISOString());
  const [finished, setFinished] = useState<{ answers: AnswerRecord[]; durationSec: number } | null>(null);
  const savedRef = useRef(false);

  const question = questions[index];
  const response = question ? responses[question.id] : undefined;
  const isRevealed = question ? Boolean(revealed[question.id]) : false;
  const type = question ? questionType(question) : "mcq";
  const needsSelfMark = type === "short" && isRevealed && response?.selfMark === undefined;

  useEffect(() => {
    if (finished) return;
    const answered = Object.keys(revealed).length;
    saveRun({ runKey, questions, index, responses, revealed, startedAt });
    if (answered > 0) updateResume({ run: { kind: "practice", title, path: resumePath, answered, total: questions.length, updatedAt: new Date().toISOString() } });
  }, [runKey, questions, index, responses, revealed, startedAt, title, resumePath, finished]);

  const check = () => {
    if (!question || !isAnswered(question, response)) return;
    setRevealed((current) => ({ ...current, [question.id]: true }));
    if (type !== "short") {
      if (grade(question, response)) sfx.correct(1);
      else sfx.wrong();
    }
  };

  const finish = () => {
    const answers: AnswerRecord[] = questions.map((q) => ({
      questionId: q.id,
      prompt: q.prompt,
      type: questionType(q),
      topic: q.topic || q.category || "General",
      correct: grade(q, responses[q.id]),
      response: responseText(q, responses[q.id]),
      expected: expectedAnswer(q),
    }));
    const durationSec = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
    if (!savedRef.current) {
      savedRef.current = true;
      const correct = answers.filter((a) => a.correct).length;
      recordAttempt({
        mode: "practice",
        title,
        deckId,
        docId,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationSec,
        total: answers.length,
        correct,
        scorePct: Math.round((correct / Math.max(1, answers.length)) * 100),
        answers,
      });
    }
    saveRun(null);
    clearResumeRun();
    sfx.levelUp();
    setFinished({ answers, durationSec });
  };

  const next = () => {
    if (index + 1 >= questions.length) finish();
    else setIndex((value) => value + 1);
  };

  const restart = (subset?: Question[]) => {
    savedRef.current = false;
    setQuestions(subset ?? initialQuestions);
    setIndex(0);
    setResponses({});
    setRevealed({});
    setStartedAt(new Date().toISOString());
    setFinished(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (finished || !question) return;
      const typing = target && ["INPUT", "TEXTAREA"].includes(target.tagName);
      if (!isRevealed && (type === "mcq" || type === "tf") && !typing) {
        const n = Number(event.key);
        if (n >= 1 && n <= question.options.length) {
          setResponses((current) => ({ ...current, [question.id]: { choice: n - 1 } }));
          return;
        }
      }
      if (event.key === "Enter" && !typing) {
        event.preventDefault();
        if (!isRevealed) check();
        else if (!needsSelfMark) next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (finished) {
    return (
      <QuizResults
        title={title}
        questions={questions}
        answers={finished.answers}
        durationSec={finished.durationSec}
        docId={docId}
        onRetry={() => restart()}
        onRetryIncorrect={() => restart(questions.filter((q) => !finished.answers.find((a) => a.questionId === q.id)?.correct))}
        onDone={onExit}
      />
    );
  }
  if (!question) return null;

  const correct = isRevealed && type !== "short" ? grade(question, response) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="tabular shrink-0 text-xs text-subtle">
              {index + 1} / {questions.length}
            </p>
          </div>
          <ProgressBar value={(index + (isRevealed ? 1 : 0)) / questions.length} label="Quiz progress" />
        </div>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Save & exit
        </Button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={question.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
          <Card className="p-5 sm:p-7">
            <QuestionMeta question={question} />
            <h2 className="mt-4 text-[19px] font-medium leading-snug tracking-[-0.01em] sm:text-[21px]">{question.prompt}</h2>
            <div className="mt-6">
              <QuestionView question={question} response={response} onChange={(value) => setResponses((current) => ({ ...current, [question.id]: value }))} reveal={isRevealed} onSubmit={check} />
            </div>

            <AnimatePresence>
              {isRevealed && type !== "short" && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-5 rounded-2xl p-4", correct ? "bg-success-soft" : "bg-danger-soft")} role="status">
                  <p className={cn("flex items-center gap-2 font-semibold", correct ? "text-success" : "text-danger")}>
                    {correct ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                    {correct ? "Correct" : "Not quite"}
                  </p>
                  {question.explanation && <p className="mt-1.5 text-sm leading-relaxed text-text/85">{question.explanation}</p>}
                  {docId && question.sourcePage && (
                    <Link to={`/study/${docId}?tab=pdf&page=${question.sourcePage}`} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline">
                      <BookOpen className="h-3.5 w-3.5" /> See page {question.sourcePage}
                    </Link>
                  )}
                </motion.div>
              )}
              {isRevealed && type === "short" && question.explanation && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-sm leading-relaxed text-muted">
                  {question.explanation}
                </motion.p>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="hidden text-xs text-subtle sm:block">
          {type === "mcq" || type === "tf" ? (
            <>
              <Kbd>1</Kbd>–<Kbd>{question.options.length}</Kbd> to choose · <Kbd>Enter</Kbd> to {isRevealed ? "continue" : "check"}
            </>
          ) : (
            <>
              <Kbd>Enter</Kbd> to {isRevealed ? "continue" : "check"}
            </>
          )}
        </p>
        {!isRevealed ? (
          <Button size="lg" onClick={check} disabled={!isAnswered(question, response)} className="w-full sm:w-auto">
            {type === "short" ? "Show model answer" : "Check answer"}
          </Button>
        ) : (
          <Button size="lg" onClick={next} disabled={needsSelfMark} className="w-full sm:w-auto">
            {index + 1 >= questions.length ? "See results" : "Next question"} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
