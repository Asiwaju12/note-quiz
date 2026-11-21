import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import { questionType, type Question } from "@/lib/game/types";
import { estimateShort, expectedAnswer, grade, type Response } from "@/lib/learning/grading";
import { cn } from "@/lib/cn";
import { Badge, Textarea, Input } from "@/components/ui/primitives";

const TYPE_LABEL = { mcq: "Multiple choice", tf: "True or false", short: "Short answer", fill: "Fill in the blank" } as const;

export function QuestionMeta({ question, className }: { question: Question; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Badge tone="accent">{TYPE_LABEL[questionType(question)]}</Badge>
      {(question.topic || question.category) && <Badge tone="outline" className="max-w-[220px] truncate">{question.topic || question.category}</Badge>}
      {question.difficulty && <Badge tone="neutral" className="capitalize">{question.difficulty}</Badge>}
      {question.sourcePage && <Badge tone="neutral">p. {question.sourcePage}</Badge>}
    </div>
  );
}

/**
 * Renders one question and its answer control.
 * `reveal` shows correctness styling; when false the control is editable.
 */
export function QuestionView({
  question,
  response,
  onChange,
  reveal,
  onSubmit,
  autoFocus = true,
}: {
  question: Question;
  response: Response | undefined;
  onChange: (response: Response) => void;
  reveal: boolean;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const type = questionType(question);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (autoFocus && !reveal && (type === "fill" || type === "short")) inputRef.current?.focus();
  }, [question.id, autoFocus, reveal, type]);

  if (type === "mcq" || type === "tf") {
    return (
      <div className={cn("grid gap-2.5", type === "tf" && "sm:grid-cols-2")} role="radiogroup" aria-label="Answer options">
        {question.options.map((option, index) => {
          const selected = response?.choice === index;
          const isAnswer = reveal && index === question.answer;
          const wrongPick = reveal && selected && index !== question.answer;
          return (
            <motion.button
              key={`${question.id}-${index}`}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={reveal}
              onClick={() => onChange({ choice: index })}
              whileTap={reveal ? undefined : { scale: 0.985 }}
              animate={wrongPick ? { x: [0, -6, 6, -3, 0] } : isAnswer ? { scale: [1, 1.015, 1] } : {}}
              transition={{ duration: 0.35 }}
              className={cn(
                "group flex min-h-[56px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] leading-snug transition-colors",
                !reveal && (selected ? "border-accent bg-accent-softer ring-4 ring-[var(--ring)]/15" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2"),
                isAnswer && "border-success bg-success-soft",
                wrongPick && "border-danger bg-danger-soft",
                reveal && !isAnswer && !wrongPick && "border-border bg-surface opacity-60",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-mono text-[12px] font-medium transition-colors",
                  isAnswer ? "border-success bg-success text-white" : wrongPick ? "border-danger bg-danger text-white" : selected ? "border-accent bg-accent text-white" : "border-border-strong text-muted",
                )}
              >
                {isAnswer ? <Check className="h-4 w-4" /> : wrongPick ? <X className="h-4 w-4" /> : type === "tf" ? option[0] : String.fromCharCode(65 + index)}
              </span>
              <span className="flex-1">{option}</span>
            </motion.button>
          );
        })}
      </div>
    );
  }

  if (type === "fill") {
    const correct = reveal && grade(question, response);
    return (
      <div>
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={response?.text ?? ""}
          onChange={(event) => onChange({ text: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !reveal) {
              event.preventDefault();
              onSubmit?.();
            }
          }}
          disabled={reveal}
          placeholder="Type the missing word or phrase"
          aria-label="Your answer"
          className={cn("h-12 text-base", reveal && (correct ? "border-success bg-success-soft" : "border-danger bg-danger-soft"))}
        />
        {reveal && !correct && (
          <p className="mt-2 text-sm">
            Correct answer: <span className="font-semibold text-success">{expectedAnswer(question)}</span>
          </p>
        )}
      </div>
    );
  }

  // Short answer: student writes, then compares with the model answer and self-marks.
  const estimate = reveal ? estimateShort(response?.text ?? "", question.answerText ?? "") : null;
  return (
    <div className="space-y-3">
      <Textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={response?.text ?? ""}
        onChange={(event) => onChange({ ...response, text: event.target.value })}
        disabled={reveal}
        rows={4}
        placeholder="Write your answer in a sentence or two"
        aria-label="Your answer"
        className="text-base"
      />
      {reveal && (
        <div className="rounded-2xl border border-border bg-surface-2 p-4">
          <p className="eyebrow">Model answer</p>
          <p className="mt-1.5 text-[15px] leading-relaxed">{question.answerText}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">How did you do?</span>
            <button
              type="button"
              onClick={() => onChange({ ...response, selfMark: true })}
              aria-pressed={response?.selfMark === true}
              className={cn("rounded-full border px-3 py-1.5 text-[13px] font-medium", response?.selfMark === true ? "border-success bg-success text-white" : "border-border hover:border-success hover:text-success")}
            >
              I got it right
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...response, selfMark: false })}
              aria-pressed={response?.selfMark === false}
              className={cn("rounded-full border px-3 py-1.5 text-[13px] font-medium", response?.selfMark === false ? "border-danger bg-danger text-white" : "border-border hover:border-danger hover:text-danger")}
            >
              I missed it
            </button>
          </div>
          {response?.selfMark === undefined && estimate && (
            <p className="mt-2 text-xs text-subtle">
              Keyword match with the model answer: {Math.round(estimate.overlap * 100)}% — {estimate.likely ? "looks right" : "may be incomplete"}. Your own mark takes priority.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
