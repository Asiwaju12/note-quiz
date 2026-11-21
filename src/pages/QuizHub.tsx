import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, CalendarDays, FileText, Gamepad2, NotebookPen, PenLine, Shuffle, Timer } from "lucide-react";
import { useCollection } from "@/data/db";
import type { SavedDeck } from "@/data/models";
import { updateSettings, useSettings } from "@/data/settings";
import { PACES, isChoiceQuestion } from "@/lib/game/types";
import { formatRelative } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui/Button";
import { Card, PageHeader, Select } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/Tabs";
import { useDailyBoard } from "@/components/quiz/Boards";

const CREATE = [
  { to: "/quiz/create?mode=notes", icon: NotebookPen, title: "From notes or files", body: "Paste notes, or upload PDF, Word, text or a photo." },
  { to: "/quiz/create?mode=manual", icon: PenLine, title: "Write your own", body: "Create questions by hand, any type." },
  { to: "/study", icon: FileText, title: "From a PDF", body: "Practice questions with page references." },
];

export default function QuizHub() {
  const decks = useCollection<SavedDeck>("decks");
  const settings = useSettings();
  const playable = decks.filter((d) => d.questions.filter(isChoiceQuestion).length >= 3).sort((a, b) => (b.lastPlayedAt ?? b.updatedAt).localeCompare(a.lastPlayedAt ?? a.updatedAt));
  const [arcadeDeck, setArcadeDeck] = useState("sample");
  const recent = [...decks].filter((d) => d.questions.length).sort((a, b) => (b.lastPlayedAt ?? b.updatedAt).localeCompare(a.lastPlayedAt ?? a.updatedAt)).slice(0, 4);
  const { board, reset } = useDailyBoard();

  return (
    <div className="space-y-8">
      <PageHeader title="Quiz" description="Create a quiz, practise a deck, or test your speed in arcade mode." />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">Create a quiz</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {CREATE.map((item, index) => (
            <motion.div key={item.to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
              <Link to={item.to} className="card card-interactive group flex h-full items-start gap-3 p-4 hover:-translate-y-0.5 sm:flex-col sm:p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                  <item.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{item.body}</span>
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="hero-panel rounded-3xl p-6">
          <div className="flex items-center gap-2 text-[13px] text-white/75">
            <Gamepad2 className="h-4 w-4" /> Arcade mode
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Beat the clock</h2>
          <p className="mt-1.5 max-w-sm text-sm text-white/80">Three lives, faster timers each level and streak bonuses. Your fastest recall wins.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="arcade-deck" className="mb-1.5 block text-xs text-white/70">
                Questions
              </label>
              <Select id="arcade-deck" value={arcadeDeck} onChange={(e) => setArcadeDeck(e.target.value)} className="border-white/20 bg-white/10 text-white [&>option]:text-black">
                <option value="sample">Random general knowledge</option>
                {playable.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.title}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-white/70">Pace · {PACES.find((p) => p.id === settings.pace)?.seconds}s per question</p>
              <Segmented
                label="Pace"
                value={settings.pace}
                onChange={(pace) => updateSettings({ pace })}
                className="flex w-full bg-white/10 [&_button]:text-white/80 [&_button[aria-checked=true]]:text-text"
                items={PACES.map((pace) => ({ id: pace.id, label: pace.label }))}
              />
            </div>
          </div>
          <ButtonLink to={`/quiz/arcade?deck=${arcadeDeck}`} variant="inverse" size="lg" className="mt-5 w-full sm:w-auto">
            Start run <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>

        <Card className="flex flex-col p-6">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[13px] text-muted">
              <CalendarDays className="h-4 w-4" /> Daily Drop
            </span>
            <span className="tabular inline-flex items-center gap-1 text-xs text-subtle">
              <Timer className="h-3.5 w-3.5" /> resets in {reset}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-semibold">Eight questions. One board.</h2>
          <p className="mt-1.5 text-sm text-muted">Everyone gets the same questions today. {board?.entries.length ? `${board.entries.length} score${board.entries.length === 1 ? "" : "s"} posted so far.` : "Be the first to post a score."}</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <ButtonLink to="/quiz/arcade?daily=1">Play today's drop</ButtonLink>
            <ButtonLink to="/leaderboard" variant="ghost">
              Leaderboard
            </ButtonLink>
          </div>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">Practise a deck</h2>
          <Link to="/decks" className="text-sm font-medium text-accent-text hover:underline">
            All decks
          </Link>
        </div>
        {recent.length === 0 ? (
          <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">Decks you create will appear here for quick practice.</p>
            <ButtonLink to="/quiz/create" variant="secondary" size="sm">
              Create your first deck
            </ButtonLink>
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {recent.map((deck) => (
              <Link key={deck.id} to={`/quiz/practice/${deck.id}`} className="card card-interactive flex items-center gap-3 p-4">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", deck.kind === "document" ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-text")}>
                  {deck.kind === "document" ? <FileText className="h-5 w-5" /> : <Shuffle className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{deck.title}</span>
                  <span className="text-xs text-subtle">
                    {deck.questions.length} questions · {deck.lastPlayedAt ? `played ${formatRelative(deck.lastPlayedAt)}` : "not played yet"}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-subtle" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
