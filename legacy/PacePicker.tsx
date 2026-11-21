import { cn } from "@/utils/cn";
import { PACES, type Pace } from "@/game/types";
import { Icon } from "./Icons";

export function PacePicker({
  pace,
  onChange,
  compact = false,
  dark = false,
}: {
  pace: Pace;
  onChange: (pace: Pace) => void;
  compact?: boolean;
  dark?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Question timer">
      <div className={cn("mb-1.5 flex items-center justify-between gap-2", compact && "mb-1")}>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.13em]",
            dark ? "text-cream/55" : "text-muted",
          )}
        >
          <Icon name="clock" size={11} /> Question clock
        </span>
        <span className={cn("font-mono text-[8px] uppercase tracking-[0.08em]", dark ? "text-cream/35" : "text-muted/70")}>
          {PACES.find((item) => item.id === pace)?.note}
        </span>
      </div>
      <div
        className={cn(
          "grid grid-cols-3 gap-1 rounded-xl border p-1",
          dark ? "border-cream/15 bg-cream/[0.05]" : "border-ink/15 bg-paper/55",
        )}
      >
        {PACES.map((item) => {
          const selected = pace === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(item.id)}
              className={cn(
                "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-all duration-150",
                selected
                  ? dark
                    ? "border-2 border-cream/20 bg-lime text-ink shadow-[2px_2px_0_rgba(0,0,0,0.35)]"
                    : "border-2 border-ink bg-ink text-cream shadow-[2px_2px_0_#CBF54A]"
                  : dark
                    ? "border-2 border-transparent text-cream/55 hover:bg-cream/10 hover:text-cream"
                    : "border-2 border-transparent text-muted hover:bg-card hover:text-ink",
              )}
            >
              <span className="font-display text-[11px] font-bold">{item.label}</span>
              <span
                className={cn(
                  "rounded px-1 py-0.5 font-mono text-[8px] font-medium",
                  selected ? (dark ? "bg-ink/15" : "bg-cream/15") : dark ? "bg-cream/10" : "bg-ink/10",
                )}
              >
                {item.short}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
