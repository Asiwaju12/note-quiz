import { KeyRound, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { fetchAiStatus } from "@/services/ai";
import { Button } from "@/components/ui/Button";

/** Shown wherever AI is needed but no provider is configured on the server. Honest about what's missing. */
export function AiNotConnected({ className, doc, compact }: { className?: string; doc?: boolean; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-3xl border border-dashed border-border-strong px-6 text-center", compact ? "py-8" : "py-14", className)}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent-text">
        <Sparkles className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold">Recall AI isn't connected yet</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
        The tutor is fully built and needs an AI provider key on the server to answer. {doc ? "Your document is already indexed for document-aware answers." : ""} Nothing here is simulated — once connected, answers stream from the real model.
      </p>
      <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-surface-3 px-3 py-2 font-mono text-[12px] text-muted">
        <KeyRound className="h-3.5 w-3.5" /> ANTHROPIC_API_KEY in .env.local
      </div>
      <Button variant="ghost" size="sm" className="mt-3" onClick={() => void fetchAiStatus(true)}>
        Check again
      </Button>
    </div>
  );
}
