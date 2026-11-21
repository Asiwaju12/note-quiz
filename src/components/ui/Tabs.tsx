import { useEffect, useId, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";

export type TabItem<T extends string> = { id: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode };

/** Underline tabs that scroll horizontally on small screens; the active tab scrolls into view. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  label: string;
}) {
  const layoutId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [value]);
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn("no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0", className)}
      onKeyDown={(event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        const index = items.findIndex((item) => item.id === value);
        const next = items[(index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
        onChange(next.id);
        window.setTimeout(() => listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(), 0);
      }}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative flex h-11 shrink-0 items-center gap-1.5 rounded-t-lg px-3 text-sm font-medium transition-colors",
              active ? "text-text" : "text-muted hover:text-text",
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
            {active && <motion.span layoutId={layoutId} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
          </button>
        );
      })}
    </div>
  );
}

/** Pill segmented control for 2–4 options. */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: Array<{ id: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  label: string;
}) {
  const layoutId = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-xl bg-surface-3 p-1", className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.id)}
            className={cn("relative h-8 flex-1 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors", active ? "text-text" : "text-muted hover:text-text")}
          >
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg bg-surface shadow-sm" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
            <span className="relative">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
