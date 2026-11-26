import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, BrainCircuit, MessageCircle, Sparkles, Target, Trophy, Users } from "lucide-react";
import { useAccount } from "@/app/account";
import { updateSettings, useSettings } from "@/data/settings";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Chips, Field, Input } from "@/components/ui/primitives";

const steps = [
  { title: "Your study space", description: "Keep your learning organised in one place. Upload notes and documents, then return to them whenever you need.", icon: BookOpen, route: "/study", action: "Explore Study Centre" },
  { title: "Practise and remember", description: "Turn your materials into quizzes and flashcards. Review your saved decks and track what you have mastered.", icon: Target, route: "/quiz", action: "Explore quizzes" },
  { title: "Meet Recall AI", description: "Ask questions about what you are studying and get help when a topic needs a clearer explanation.", icon: Sparkles, route: "/ai", action: "Meet Recall AI" },
  { title: "Learn together", description: "Find classmates, send friend requests, chat, compete in live study rooms and follow your progress.", icon: Users, route: "/messages", action: "Find friends" },
];

/** First-visit welcome and short guided tour. Skippable at any point. */
export function Onboarding() {
  const settings = useSettings();
  const { account, mode, openAuth } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState(settings.name);
  const [minutes, setMinutes] = useState(settings.dailyGoalMinutes);
  const [step, setStep] = useState(-1);
  const open = !settings.onboarded;

  const finish = () => updateSettings({ onboarded: true, name: name.trim().slice(0, 40), dailyGoalMinutes: minutes });
  const current = steps[step];
  const Icon = current?.icon;

  return (
    <Modal open={open} onClose={finish} size="sm">
      {step < 0 ? (
        <>
          <div className="-mx-5 -mt-2 mb-5 sm:-mx-6">
            <div className="hero-panel px-6 pb-6 pt-7">
              <p className="text-[13px] font-medium text-white/70">Welcome to</p>
              <h2 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.03em]">Recall Quiz</h2>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/80">Your study companion for notes, flashcards, quizzes and collaborative learning.</p>
              <div className="mt-5 flex flex-wrap gap-2 text-[12px]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1"><BookOpen className="h-3.5 w-3.5"/> Study</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1"><BrainCircuit className="h-3.5 w-3.5"/> Recall AI</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1"><Trophy className="h-3.5 w-3.5"/> Challenges</span>
              </div>
            </div>
          </div>
          <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); setStep(0); }}>
            <Field label="What should we call you?">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" autoComplete="given-name" data-autofocus />}</Field>
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-medium">Daily study goal</p>
              <Chips label="Daily study goal" value={minutes} onChange={(value) => setMinutes(value as number)} options={[15, 30, 45, 60].map((value) => ({ value, label: `${value} min` }))}/>
            </div>
            <Button type="submit" size="lg">Take the quick tour <ArrowRight className="ml-2 h-4 w-4"/></Button>
            {mode === "cloud" && !account && <button type="button" onClick={() => { finish(); openAuth("signin"); }} className="text-center text-[13px] text-muted hover:text-text">I already have an account</button>}
            {mode === "local" && <p className="text-center text-xs text-subtle">You're in local mode — your data stays in this browser.</p>}
          </form>
        </>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Your quick tour</p>
            <p className="text-xs tabular text-muted">{step + 1} of {steps.length}</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent transition-all" style={{width: `${((step + 1) / steps.length) * 100}%`}}/></div>
          <div className="rounded-2xl bg-surface-2 p-5">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent-text"><Icon className="h-6 w-6"/></div>
            <h2 className="text-xl font-semibold tracking-tight">{current.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{current.description}</p>
          </div>
          <Button className="w-full" variant="secondary" onClick={() => navigate(current.route)}>{current.action} <ArrowRight className="ml-2 h-4 w-4"/></Button>
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}><ArrowLeft className="mr-1 h-4 w-4"/> Back</Button>
            <button type="button" onClick={finish} className="text-xs text-muted hover:text-text">Skip tour</button>
            <Button onClick={() => step === steps.length - 1 ? finish() : setStep((value) => value + 1)}>{step === steps.length - 1 ? "Finish" : "Next"} <ArrowRight className="ml-1 h-4 w-4"/></Button>
          </div>
          {step === steps.length - 1 && <p className="text-center text-xs text-muted"><MessageCircle className="mr-1 inline h-3.5 w-3.5"/>You can find friends and start a conversation from Friends & messages.</p>}
        </div>
      )}
    </Modal>
  );
}
