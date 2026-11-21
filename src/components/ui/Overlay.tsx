import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/hooks";

let openCount = 0;

function useOverlayBehaviour(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    openCount += 1;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select, button:not([data-close])");
      (target ?? panelRef.current)?.focus();
    }, 60);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      openCount -= 1;
      if (openCount <= 0) document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, panelRef]);
}

/**
 * Dialog that is a centred modal on desktop and a bottom sheet on mobile,
 * so it always fits the screen.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const desktop = useMediaQuery("(min-width: 640px)");
  useOverlayBehaviour(open, onClose, panelRef);
  const width = size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg";
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            tabIndex={-1}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-surface shadow-lg outline-none",
              "rounded-t-3xl sm:rounded-3xl",
              width,
              className,
            )}
            initial={desktop ? { opacity: 0, scale: 0.96, y: 8 } : { y: "100%" }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.97, y: 4 } : { y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 380 }}
          >
            {!desktop && <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border-strong" aria-hidden />}
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
                <div className="min-w-0">
                  {title && <h2 className="text-lg font-semibold tracking-tight text-text">{title}</h2>}
                  {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
                </div>
                <button
                  type="button"
                  data-close
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-3 hover:text-text"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2 sm:px-6 sm:pb-6">{children}</div>
            {footer && <div className="safe-bottom flex flex-col-reverse gap-2 border-t border-border bg-surface-2/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Side panel on desktop (right), bottom sheet on mobile. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const desktop = useMediaQuery("(min-width: 768px)");
  useOverlayBehaviour(open, onClose, panelRef);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]">
          <motion.div className="absolute inset-0 bg-[var(--overlay)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={cn(
              "absolute flex flex-col border-border bg-surface shadow-lg outline-none",
              desktop ? "inset-y-0 right-0 w-[420px] border-l" : "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl border-t",
            )}
            initial={desktop ? { x: "100%" } : { y: "100%" }}
            animate={desktop ? { x: 0 } : { y: 0 }}
            exit={desktop ? { x: "100%" } : { y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 360 }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-text">{title}</h2>
              <button type="button" data-close onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-text">
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="safe-bottom min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
