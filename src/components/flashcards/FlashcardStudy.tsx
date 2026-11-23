import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, RotateCcw, Shuffle } from "lucide-react";
import type { Flashcard } from "@/data/models";
import { reviewCard } from "@/data/repos";
import { previewIntervals, RATINGS, type RatingValue } from "@/lib/srs/fsrs";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Badge, Kbd, ProgressBar } from "@/components/ui/primitives";

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const RATING_STYLES: Record<RatingValue, string> = {
  1: "border-danger/30 text-danger hover:bg-danger-soft",
  2: "border-warning/30 text-warning hover:bg-warning-soft",
  3: "border-success/30 text-success hover:bg-success-soft",
  4: "border-accent/30 text-accent-text hover:bg-accent-soft",
};

/**
 * Flashcard study session.
 * - "srs": spaced-repetition review with Again/Hard/Good/Easy (FSRS scheduling).
 * - "browse": study every card; "Still learning" / "Got it" (also recorded as reviews).
 */
export function FlashcardStudy({
  cards: initialCards,
  mode,
  onExit,
  title,
}: {
  cards: Flashcard[];
  mode: "srs" | "browse";
  onExit: () => void;
  title?: string;
}) {
  const [shuffled, setShuffled] = useState(false);
  const [queue, setQueue] = useState<Flashcard[]>(initialCards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; rating: RatingValue }>>([]);
  const card = queue[index];
  const done = index >= queue.length;

  const intervals = useMemo(() => (card && mode === "srs" ? previewIntervals(card.srs) : null), [card, mode]);

  const rate = useCallback(
    (rating: RatingValue) => {
      if (!card) return;
      reviewCard(card.id, rating);
      setResults((current) => [...current, { id: card.id, rating }]);
      setFlipped(false);
      // In SRS mode a failed card comes back later in the same session.
      if (mode === "srs" && rating === 1) setQueue((current) => [...current, card]);
      setIndex((value) => value + 1);
    },
    [card, mode],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (done) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((value) => !value);
      } else if (flipped && mode === "srs" && ["1", "2", "3", "4"].includes(event.key)) rate(Number(event.key) as RatingValue);
      else if (flipped && mode === "browse" && (event.key === "ArrowRight" || event.key === "ArrowLeft")) rate(event.key === "ArrowRight" ? 3 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, mode, rate, done]);

  if (!initialCards.length) return null;

  if (done) {
    const known = results.filter((r) => r.rating >= 3).length;
    const unique = new Set(results.map((r) => r.id)).size;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-md py-8 text-center">
        <motion.span initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", damping: 12 }} className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-success-soft text-success">
          <CheckCircle2 className="h-8 w-8" />
        </motion.span>
        <h3 className="mt-5 text-xl font-semibold">Session complete</h3>
        <p className="mt-1.5 text-sm text-muted">
          You reviewed {unique} card{unique === 1 ? "" : "s"} · {known} recalled well{mode === "srs" ? " · reviews are scheduled automatically" : ""}.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button
            variant="secondary"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              setQueue(shuffled ? shuffle(initialCards) : initialCards);
              setIndex(0);
              setResults([]);
            }}
          >
            Study again
          </Button>
          <Button onClick={onExit}>Done</Button>
        </div>
      </motion.div>
    );
  }

  const total = queue.length;
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {title && <p className="truncate text-sm font-medium">{title}</p>}
          <p className="tabular text-xs text-subtle">
            Card {index + 1} of {total} · {total - index - 1} remaining
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={shuffled ? "soft" : "ghost"}
            size="icon-sm"
            aria-pressed={shuffled}
            aria-label="Shuffle remaining cards"
            onClick={() => {
              const next = !shuffled;
              setShuffled(next);
              setQueue((current) => [...current.slice(0, index + 1), ...(next ? shuffle(current.slice(index + 1)) : current.slice(index + 1))]);
            }}
          >
            <Shuffle className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onExit}>
            End
          </Button>
        </div>
      </div>
      <ProgressBar value={index / total} className="mb-6" label="Session progress" />

      <div className="perspective relative h-[min(52vh,360px)] select-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${card.id}-${index}`}
            className="absolute inset-0"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <motion.button
              type="button"
              onClick={() => setFlipped((value) => !value)}
              aria-label={flipped ? "Show question" : "Reveal answer"}
              className="preserve-3d relative h-full w-full cursor-pointer text-left"
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 180 }}
            >
              <div className="backface-hidden card absolute inset-0 flex flex-col p-6 shadow-md sm:p-8">
                <div className="flex items-center justify-between">
                  <Badge tone="accent">Question</Badge>
                  {card.topic && <span className="max-w-[55%] truncate text-xs text-subtle">{card.topic}</span>}
                </div>
                <div className="flex flex-1 items-center justify-center overflow-y-auto py-4">
                  <p className="text-center text-xl font-medium leading-snug tracking-[-0.01em] sm:text-2xl">{card.front}</p>
                </div>
                <p className="text-center text-xs text-subtle">
                  Tap to reveal <span className="hidden sm:inline">· <Kbd>Space</Kbd></span>
                </p>
              </div>
              <div className="backface-hidden absolute inset-0 flex flex-col rounded-[18px] border border-accent/30 bg-accent-softer p-6 shadow-md [transform:rotateY(180deg)] sm:p-8">
                <div className="flex items-center justify-between">
                  <Badge tone="success">Answer</Badge>
                  {card.sourcePage && <span className="text-xs text-subtle">Page {card.sourcePage}</span>}
                </div>
                <div className="flex flex-1 items-center justify-center overflow-y-auto py-4">
                  <p className="text-center text-lg leading-relaxed sm:text-xl">{card.back}</p>
                </div>
                <p className="text-center text-xs text-subtle">Choose how well you remembered using the buttons below.</p>
              </div>
            </motion.button>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 min-h-[64px]">
        <AnimatePresence mode="wait">
          {!flipped ? (
            <motion.div key="reveal" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-center">
              <Button size="lg" variant="secondary" onClick={() => setFlipped(true)} className="w-full sm:w-auto">
                Show answer
              </Button>
            </motion.div>
          ) : mode === "srs" ? (
            <motion.div key="rate" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-4 gap-2">
              {RATINGS.map((rating) => (
                <button
                  key={rating.value}
                  type="button"
                  onClick={() => rate(rating.value)}
                  className={cn("flex flex-col items-center rounded-xl border bg-surface py-2.5 text-sm font-semibold transition-colors", RATING_STYLES[rating.value])}
                >
                  {rating.label}
                  <span className="tabular mt-0.5 text-[11px] font-normal text-subtle">{intervals?.[rating.value]}</span>
                </button>
              ))}
            </motion.div>
          ) : (
            <motion.div key="browse" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" onClick={() => rate(1)} className="text-danger">
                Still learning
              </Button>
              <Button size="lg" onClick={() => rate(3)}>
                Got it
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        {flipped && mode === "srs" && <p className="mt-3 hidden text-center text-xs text-subtle sm:block">Keys 1–4 to rate · ratings schedule the next review with FSRS</p>}
      </div>
    </div>
  );
}
