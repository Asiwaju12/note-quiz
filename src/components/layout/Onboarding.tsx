import { useState } from "react";
import { BookOpen, Sparkles, Target } from "lucide-react";
import { useAccount } from "@/app/account";
import { updateSettings, useSettings } from "@/data/settings";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Chips, Field, Input } from "@/components/ui/primitives";

/** One-time welcome: asks for a name and a daily goal. Skippable. */
export function Onboarding() {
  const settings = useSettings();
  const { account, mode, openAuth } = useAccount();
  const [name, setName] = useState(settings.name);
  const [minutes, setMinutes] = useState(settings.dailyGoalMinutes);
  const open = !settings.onboarded && !account;

  const finish = () => updateSettings({ onboarded: true, name: name.trim().slice(0, 40), dailyGoalMinutes: minutes });

  return (
    <Modal open={open} onClose={finish} size="sm">
      <div className="-mx-5 -mt-2 mb-5 sm:-mx-6">
        <div className="hero-panel px-6 pb-6 pt-7">
          <p className="text-[13px] font-medium text-white/70">Welcome to</p>
          <h2 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.03em]">Recall Quiz</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/80">Your study companion for lecture notes, flashcards, quizzes and exams.</p>
          <div className="mt-5 flex gap-2 text-[12px]">
            {[
              [BookOpen, "Study PDFs"],
              [Target, "Practise"],
              [Sparkles, "Ask AI"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof BookOpen;
              return (
                <span key={label as string} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1">
                  <I className="h-3.5 w-3.5" /> {label as string}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          finish();
        }}
      >
        <Field label="What should we call you?">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" autoComplete="given-name" data-autofocus />}</Field>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium">Daily study goal</p>
          <Chips
            label="Daily study goal"
            value={minutes}
            onChange={(value) => setMinutes(value as number)}
            options={[15, 30, 45, 60].map((value) => ({ value, label: `${value} min` }))}
          />
        </div>
        <Button type="submit" size="lg">
          Get started
        </Button>
        {mode === "cloud" && (
          <button
            type="button"
            onClick={() => {
              finish();
              openAuth("signin");
            }}
            className="text-center text-[13px] text-muted hover:text-text"
          >
            I already have an account
          </button>
        )}
        {mode === "local" && <p className="text-center text-xs text-subtle">You're in local mode — your data stays in this browser.</p>}
      </form>
    </Modal>
  );
}
