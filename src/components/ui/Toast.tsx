import { useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, TriangleAlert, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "info" | "error" | "achievement";
type ToastItem = { id: number; title: string; description?: string; tone: ToastTone; action?: { label: string; onClick: () => void } };

let items: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function toast(title: string, options: { description?: string; tone?: ToastTone; action?: ToastItem["action"]; duration?: number } = {}) {
  const id = ++counter;
  items = [...items, { id, title, description: options.description, tone: options.tone ?? "success", action: options.action }].slice(-4);
  emit();
  window.setTimeout(() => dismiss(id), options.duration ?? (options.tone === "achievement" ? 5200 : 3600));
}

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

const icons: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="h-[18px] w-[18px] text-success" />,
  info: <Info className="h-[18px] w-[18px] text-accent-text" />,
  error: <TriangleAlert className="h-[18px] w-[18px] text-danger" />,
  achievement: <Trophy className="h-[18px] w-[18px] text-white" />,
};

export function Toaster() {
  const list = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => items,
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-auto md:right-6 md:top-auto md:items-end" aria-live="polite">
      <AnimatePresence initial={false} mode="popLayout">
        {list.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-3.5 pr-4 shadow-lg",
              item.tone === "achievement" ? "hero-panel border-transparent" : "border-border bg-surface",
            )}
            role="status"
          >
            <span className={cn("mt-0.5 shrink-0", item.tone === "achievement" && "grid h-8 w-8 -mt-0.5 place-items-center rounded-xl bg-white/15")}>{icons[item.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold", item.tone === "achievement" ? "text-white" : "text-text")}>{item.title}</p>
              {item.description && <p className={cn("mt-0.5 text-[13px] leading-snug", item.tone === "achievement" ? "text-white/80" : "text-muted")}>{item.description}</p>}
            </div>
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-accent-text hover:bg-accent-soft"
              >
                {item.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
