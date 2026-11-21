import { useEffect } from "react";
import { Icon, type IconName } from "./Icons";
import { Fernandez } from "./Fernandez";

const RULES: Array<{ icon: IconName; title: string; body: string; color: string }> = [
  {
    icon: "note",
    title: "Bring the notes",
    body: "Paste facts, definitions, or Q&A lines — or upload PDFs, DOCX, text files and photos. Fernandez turns it all into multiple-choice questions, with your original line as the explanation.",
    color: "bg-lilac",
  },
  {
    icon: "clock",
    title: "Set your clock",
    body: "Choose Relaxed (25s), Standard (18s) or Rush (12s) before a run. Fast answers bank more points, and every answer in a row grows your streak.",
    color: "bg-lime",
  },
  {
    icon: "bolt",
    title: "Climb the levels",
    body: "Three correct answers clear a level and pay a bonus. Every level gets faster. A perfect level restores one heart.",
    color: "bg-sky",
  },
  {
    icon: "heart",
    title: "Protect the hearts",
    body: "Wrong answers and timeouts cost a heart. Lose all three and the run ends. Your score is saved locally the moment you finish.",
    color: "bg-coral",
  },
];

export function HowToPlay({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-night/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-title"
        className="relative my-auto w-full max-w-[540px] animate-scale-in overflow-hidden rounded-[22px] border-2 border-ink bg-card text-ink shadow-[8px_8px_0_#CBF54A]"
      >
        <div className="relative border-b-2 border-ink bg-lime px-5 py-4">
          <div className="pointer-events-none absolute inset-0 bg-dotgrid opacity-20" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Fernandez size={56} mood="happy" bob={false} className="-my-2 shrink-0" />
              <div>
                <p className="mb-1 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-ink/60">
                  Recall · with Fernandez
                </p>
                <h2 id="how-to-title" className="font-display text-[30px] font-extrabold leading-none tracking-[-0.045em]">
                  How to <span className="font-serif font-normal italic">play.</span>
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close rules"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-card transition-transform hover:rotate-90"
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {RULES.map((rule) => (
              <div key={rule.title} className="rounded-xl border border-ink/15 bg-paper/60 p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={`grid h-7 w-7 place-items-center rounded-md border border-ink ${rule.color}`}>
                    <Icon name={rule.icon} size={13} />
                  </span>
                  <h3 className="font-display text-[13px] font-bold">{rule.title}</h3>
                </div>
                <p className="text-[11px] leading-relaxed text-muted">{rule.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-ink/15 bg-paper/60 p-3">
              <p className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                <Icon name="keyboard" size={12} /> Keyboard
              </p>
              <div className="space-y-1 font-mono text-[10px]">
                {[
                  ["1 – 4 / A – D", "pick an answer"],
                  ["Enter / Space", "next question"],
                  ["P / Esc", "pause & resume"],
                  ["R", "restart run"],
                ].map(([keys, action]) => (
                  <div key={keys} className="flex items-center justify-between gap-2">
                    <span className="rounded border border-ink/25 bg-card px-1.5 py-0.5 text-[9px]">{keys}</span>
                    <span className="text-muted">{action}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-ink/15 bg-paper/60 p-3">
              <p className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                <Icon name="sparkle" size={12} /> Points
              </p>
              <ul className="space-y-1 text-[10px] leading-snug text-muted">
                <li><span className="font-semibold text-ink">100 + 20 × level</span> per correct answer</li>
                <li><span className="font-semibold text-ink">Up to +80</span> for a fast answer</li>
                <li><span className="font-semibold text-ink">+15</span> for every streak step</li>
                <li><span className="font-semibold text-ink">+150 × level</span> when you clear a level</li>
              </ul>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p className="rounded-lg border border-dashed border-ink/20 bg-lime/20 px-3 py-2 text-[10px] leading-snug text-ink/70">
              <span className="font-semibold">Best note format:</span> one fact per line. “Term: meaning” pairs and “Question?” followed by “Answer” make clean questions.
            </p>
            <p className="rounded-lg border border-dashed border-ink/20 bg-lilac/20 px-3 py-2 text-[10px] leading-snug text-ink/70">
              <span className="font-semibold">Uploading files:</span> PDFs, Word documents, text files and photos are all welcome. Fernandez takes care of the rest.
            </p>
          </div>
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-ink/15 bg-night px-3 py-2 text-[10px] leading-snug text-cream/65">
            <Icon name="calendar" size={12} className="mt-0.5 shrink-0 text-lime" />
            <span>
              <span className="font-semibold text-cream">The Daily Drop</span> is the same eight questions for everyone, with a live shared leaderboard. Only your board tag, score, accuracy and streak are posted.
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t-2 border-ink bg-paper px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted">No sign-up · local scores · three hearts</p>
          <button
            type="button"
            onClick={onStart}
            className="press inline-flex items-center justify-between gap-3 rounded-lg border-2 border-ink bg-ink px-3.5 py-2 font-display text-[13px] font-bold text-cream shadow-[2px_2px_0_#CBF54A]"
          >
            I&apos;m ready <Icon name="play" size={12} className="text-lime" />
          </button>
        </div>
      </div>
    </div>
  );
}
