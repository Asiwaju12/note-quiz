import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { Icon } from "./Icons";
import { Fernandez } from "./Fernandez";

export const GAME_NAME = "Recall";
export const HOST_NAME = "Fernandez";

export function Logo({
  onClick,
  dark = false,
  compact = false,
  className,
}: {
  onClick?: () => void;
  dark?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const content = (
    <>
      <span className="relative grid h-10 w-10 shrink-0 rotate-[-4deg] place-items-center rounded-[12px] border-2 border-ink bg-lime text-ink shadow-[3px_3px_0_#1B1A14] transition-transform duration-200 group-hover:rotate-[3deg]">
        <Fernandez size={30} bob={false} mood="happy" className="translate-y-[2px]" />
      </span>
      <span className={cn("flex items-baseline", compact && "hidden sm:flex")}>
        <span
          className={cn(
            "font-display text-[27px] font-extrabold leading-none tracking-[-0.055em]",
            dark ? "text-cream" : "text-ink",
          )}
        >
          recall
        </span>
        <span
          aria-hidden="true"
          className="mb-[3px] ml-1 h-[7px] w-[7px] rotate-[8deg] rounded-[1px] border border-ink bg-coral"
        />

      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Recall home"
        className={cn("group flex items-center gap-2.5", className)}
      >
        {content}
      </button>
    );
  }
  return <div className={cn("group flex items-center gap-2.5", className)}>{content}</div>;
}

export function Keycap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-[5px] border border-current/30 bg-current/10 px-1 font-mono text-[10px] leading-none",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function SoundToggle({
  muted,
  onToggle,
  dark = false,
}: {
  muted: boolean;
  onToggle: () => void;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={muted ? "Turn sound on" : "Mute sound"}
      aria-pressed={muted}
      title={muted ? "Sound off" : "Sound on"}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full border-2 transition-colors",
        dark
          ? "border-cream/25 text-cream/80 hover:border-cream/60 hover:bg-cream/10 hover:text-cream"
          : "border-ink/20 text-ink/70 hover:border-ink hover:bg-ink/5 hover:text-ink",
      )}
    >
      <Icon name={muted ? "mute" : "sound"} size={17} />
    </button>
  );
}

export function Hearts({
  lives,
  max = 3,
  className,
}: {
  lives: number;
  max?: number;
  animateKey?: number;
  className?: string;
}) {
  const previousLives = useRef(lives);
  const [lossKey, setLossKey] = useState(0);

  useEffect(() => {
    if (lives < previousLives.current) setLossKey((key) => key + 1);
    previousLives.current = lives;
  }, [lives]);

  return (
    <div
      key={lossKey}
      className={cn("flex items-center gap-1", lossKey > 0 && "animate-heart-loss", className)}
      aria-label={`${lives} of ${max} lives left`}
    >
      {Array.from({ length: max }).map((_, index) => (
        <Icon
          key={index}
          name="heart"
          size={17}
          className={cn(
            "transition-all duration-300",
            index < lives ? "text-coral drop-shadow-[0_1px_0_rgba(27,26,20,1)]" : "scale-90 text-ink/20",
          )}
        />
      ))}
    </div>
  );
}

export function AnimatedNumber({
  value,
  className,
  suffix = "",
}: {
  value: number;
  className?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const displayedRef = useRef(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = displayedRef.current;
    const to = value;
    displayedRef.current = value;
    if (from === to) return;
    if (to < from) {
      node.textContent = `${to.toLocaleString()}${suffix}`;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 520;
    const frame = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      node.textContent = `${current.toLocaleString()}${suffix}`;
      if (progress < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, suffix]);

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString()}
      {suffix}
    </span>
  );
}

export function MarqueeStrip() {
  const items = [
    "Notes in",
    "Questions out",
    "Combo chains",
    "Beat your best",
    "Made to remember",
    "No cloud required",
  ];
  return (
    <div className="relative -rotate-[0.8deg] border-y-2 border-ink bg-lime py-2.5">
      <div className="marquee-track flex w-max items-center">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {items.map((item) => (
              <span
                key={`${copy}-${item}`}
                className="flex items-center gap-5 whitespace-nowrap px-5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink"
              >
                {item}
                <Icon name="sparkle" size={12} className="text-ink/70" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-ink/15 bg-card/60 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-ink/70",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink" />
      {children}
    </span>
  );
}
