import { useId } from "react";
import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  const gradient = `rq-logo-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8 shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#5B32C8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradient})`} />
      <path d="M20 44V20h13a9 9 0 0 1 2.6 17.6L44 44" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && (
        <span className="text-[17px] font-semibold tracking-[-0.03em] text-text">
          Recall<span className="text-subtle"> Quiz</span>
        </span>
      )}
    </span>
  );
}
