import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Check, ChevronDown, Flag, RotateCcw, Sparkles, X } from "lucide-react";
import type { AnswerRecord } from "@/data/models";
import type { Question } from "@/lib/game/types";
import { cn } from "@/lib/cn";
import { formatMinutes } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { Card, ProgressRing } from "@/components/ui/primitives";
import { setPendingMistakes } from "@/components/ai/handoff";

export function QuizResults({
  title,
  questions,
  answers,
  durationSec,
  onRetry,
  onRetryIncorrect,
  onDone,
  docId,
  extra,
}: {
  title: string;
  questions: Question[];
  answers: AnswerRecord[];
  durationSec: number;
  onRetry?: () => void;
  onRetryIncorrect?: () => void;
  onDone: () => void;
  docId?: string;
  extra?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const correct = answers.filter((answer) => answer.correct).length;
  const pct = answers.length ? correct / answers.length : 0;
  const wrong = answers.filter((answer) => !answer.correct);
  const topicMap = new Map<string, { total: number; correct: number }>();
  for (const answer of answers) {
    const entry = topicMap.get(answer.topic) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (answer.correct) entry.correct += 1;
    topicMap.set(answer.topic, entry);
  }
  const weakTopics = [...topicMap.entries()].filter(([, v]) => v.correct / v.total < 0.6).map(([topic]) => topic);
  const message = pct === 1 ? "Perfect score — outstanding." : pct >= 0.8 ? "Excellent work." : pct >= 0.6 ? "Solid — a little more practice and you've got it." : "Good effort. Review the explanations below and try again.";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="hero-panel rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          <ProgressRing value={pct} size={112} stroke={9} tone="light">
            <div className="text-center">
              <span className="tabular block text-3xl font-semibold">{Math.round(pct * 100)}%</span>
            </div>
          </ProgressRing>
          <div className="min-w-0">
            <p className="text-[13px] text-white/70">{title}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{message}</h2>
            <p className="mt-2 text-sm text-white/80">
              {correct} correct · {answers.length - correct} incorrect · {formatMinutes(durationSec / 60)}
            </p>
            {weakTopics.length > 0 && <p className="mt-1 text-sm text-white/80">Focus next on: {weakTopics.slice(0, 3).join(", ")}</p>}
          </div>
        </div>
      </motion.div>

      {extra}

      <div className="flex flex-col gap-2 sm:flex-row">
        {wrong.length > 0 && onRetryIncorrect && (
          <Button variant="secondary" onClick={onRetryIncorrect} icon={<RotateCcw className="h-4 w-4" />}>
            Retry {wrong.length} incorrect
          </Button>
        )}
        {onRetry && (
          <Button variant="secondary" onClick={onRetry} icon={<RotateCcw className="h-4 w-4" />}>
            Retake quiz
          </Button>
        )}
        {wrong.length > 0 && (
          <Button
            variant="soft"
            icon={<Sparkles className="h-4 w-4" />}
            onClick={() => {
              setPendingMistakes({ docId, title, mistakes: wrong.map((w) => ({ prompt: w.prompt, response: w.response, expected: w.expected })) });
              navigate(docId ? `/study/${docId}?tab=tutor` : "/ai");
            }}
          >
            Explain my mistakes
          </Button>
        )}
        <Button onClick={onDone} className="sm:ml-auto">
          Done
        </Button>
      </div>

      <Card className="divide-y divide-border">
        <p className="px-5 py-4 text-sm font-semibold">Answer review</p>
        {answers.map((answer, index) => {
          const question = questions.find((q) => q.id === answer.questionId);
          const expanded = open === answer.questionId;
          return (
            <div key={answer.questionId}>
              <button type="button" onClick={() => setOpen(expanded ? null : answer.questionId)} aria-expanded={expanded} className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-surface-2">
                <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full", answer.correct ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                  {answer.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1 text-sm leading-snug">
                  <span className="text-subtle">{index + 1}. </span>
                  {answer.prompt}
                </span>
                {answer.flagged && <Flag className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="Flagged" />}
                <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-subtle transition-transform", expanded && "rotate-180")} />
              </button>
              {expanded && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                  <div className="space-y-2 px-5 pb-4 pl-14 text-sm">
                    <p>
                      <span className="text-muted">Your answer: </span>
                      <span className={answer.correct ? "text-success" : "text-danger"}>{answer.response || "No answer"}</span>
                    </p>
                    {!answer.correct && (
                      <p>
                        <span className="text-muted">Correct answer: </span>
                        <span className="font-medium">{answer.expected}</span>
                      </p>
                    )}
                    {question?.explanation && <p className="rounded-xl bg-surface-2 p-3 leading-relaxed text-muted">{question.explanation}</p>}
                  </div>
                </motion.div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
