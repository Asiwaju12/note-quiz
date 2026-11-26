import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, Gamepad2, GraduationCap, Layers, Pencil, Target, Trash2, Users } from "lucide-react";
import { useCollection } from "@/data/db";
import type { Attempt, Flashcard, SavedDeck } from "@/data/models";
import { createCards, deleteDeck, updateDeck } from "@/data/repos";
import { expectedAnswer } from "@/lib/learning/grading";
import { isChoiceQuestion, questionType } from "@/lib/game/types";
import { deleteCloudDeck } from "@/services/cloud";
import { updateResume } from "@/data/settings";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge, Card, EmptyState, StatTile } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { NameDialog } from "@/components/ui/NameDialog";
import { confirmAction } from "@/components/ui/Confirm";
import { toast } from "@/components/ui/Toast";
import { CardManager } from "@/components/flashcards/CardManager";
import { useEffect } from "react";

export default function DeckDetail() {
  const { deckId = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const decks = useCollection<SavedDeck>("decks");
  const allCards = useCollection<Flashcard>("cards");
  const attempts = useCollection<Attempt>("attempts");
  const deck = decks.find((d) => d.id === deckId);
  const cards = useMemo(() => allCards.filter((c) => c.deckId === deckId), [allCards, deckId]);
  const history = attempts.filter((a) => a.deckId === deckId).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const [renaming, setRenaming] = useState(false);
  const tab = params.get("tab") === "cards" ? "cards" : "questions";

  useEffect(() => {
    if (deck) updateResume({ deckId: deck.id });
  }, [deck?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!deck) return <EmptyState icon={<Layers className="h-6 w-6" />} title="Deck not found" action={<ButtonLink to="/decks">My Decks</ButtonLink>} />;

  const playable = deck.questions.filter(isChoiceQuestion).length >= 3;
  const best = history.length ? Math.max(...history.filter((h) => h.mode !== "arcade" && h.mode !== "daily").map((h) => h.scorePct), 0) : null;

  const makeCards = () => {
    const existing = new Set(cards.map((c) => c.front.toLowerCase()));
    const made = createCards(
      deck.id,
      deck.questions.filter((q) => !existing.has(q.prompt.toLowerCase())).map((q) => ({ front: q.prompt, back: expectedAnswer(q) + (q.explanation ? ` — ${q.explanation}` : ""), sourcePage: q.sourcePage, topic: q.topic, docId: deck.docId })),
    );
    toast(`${made.length} flashcards created`);
    setParams({ tab: "cards" });
  };

  return (
    <div>
      <Link to="/decks" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> My Decks
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.03em] sm:text-[28px]">{deck.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-subtle">
            {deck.questions.length} questions · {cards.length} flashcards
            {deck.docId && (
              <Link to={`/study/${deck.docId}`} className="inline-flex items-center gap-1 text-accent-text hover:underline">
                <FileText className="h-3.5 w-3.5" /> Source document
              </Link>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="icon" onClick={() => setRenaming(true)} aria-label="Rename deck">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete deck"
            onClick={async () => {
              if (!(await confirmAction({ title: `Delete “${deck.title}”?`, confirmLabel: "Delete deck", danger: true }))) return;
              if (deck.cloudId) await deleteCloudDeck(deck.cloudId).catch(() => undefined);
              deleteDeck(deck.id);
              navigate("/decks");
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link to={`/quiz/practice/${deck.id}`} className={cn("card card-interactive flex flex-col gap-2 p-4", !deck.questions.length && "pointer-events-none opacity-50")}>
          <Target className="h-5 w-5 text-accent-text" />
          <span className="text-sm font-semibold">Practice quiz</span>
        </Link>
        <Link to={`/exam?deck=${deck.id}`} className={cn("card card-interactive flex flex-col gap-2 p-4", !deck.questions.length && "pointer-events-none opacity-50")}>
          <GraduationCap className="h-5 w-5 text-accent-text" />
          <span className="text-sm font-semibold">Exam mode</span>
        </Link>
        <Link to={`/quiz/arcade?deck=${deck.id}`} className={cn("card card-interactive flex flex-col gap-2 p-4", !playable && "pointer-events-none opacity-50")} aria-disabled={!playable}>
          <Gamepad2 className="h-5 w-5 text-accent-text" />
          <span className="text-sm font-semibold">Arcade</span>
        </Link>
        <button type="button" onClick={() => setParams({ tab: "cards" })} className="card card-interactive flex flex-col gap-2 p-4 text-left">
          <Layers className="h-5 w-5 text-accent-text" />
          <span className="text-sm font-semibold">Flashcards</span>
        </button>        <Link to={`/multiplayer?deck=${deck.id}`} className={cn("card card-interactive flex flex-col gap-2 p-4", !deck.questions.length && "pointer-events-none opacity-50")}>
          <Users className="h-5 w-5 text-accent-text" />
          <span className="text-sm font-semibold">Study together</span>
        </Link>
      </div>

      {history.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-2">
          <StatTile label="Sessions" value={history.length} />
          <StatTile label="Best score" value={best !== null ? `${best}%` : "—"} />
          <StatTile label="Last played" value={new Date(history[0].finishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
        </div>
      )}

      <Tabs label="Deck content" value={tab} onChange={(value) => setParams(value === "cards" ? { tab: "cards" } : {})} items={[{ id: "questions", label: `Questions (${deck.questions.length})` }, { id: "cards", label: `Flashcards (${cards.length})` }]} className="mb-5" />

      {tab === "questions" ? (
        deck.questions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">This deck has no questions yet.</p>
        ) : (
          <Card className="divide-y divide-border">
            {deck.questions.map((q, index) => (
              <div key={q.id} className="group flex gap-3 px-5 py-4">
                <span className="tabular w-6 shrink-0 text-sm text-subtle">{index + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{q.prompt}</p>
                  <p className="mt-1 text-sm text-success">{expectedAnswer(q)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge tone="neutral">{questionType(q).toUpperCase()}</Badge>
                    {(q.topic || q.category) && <Badge tone="outline">{q.topic || q.category}</Badge>}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Delete question ${index + 1}`}
                  onClick={async () => {
                    if (await confirmAction({ title: "Delete this question?", confirmLabel: "Delete", danger: true })) updateDeck(deck.id, { questions: deck.questions.filter((x) => x.id !== q.id) });
                  }}
                  className="h-8 w-8 shrink-0 rounded-lg text-subtle opacity-60 hover:bg-surface-3 hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="mx-auto h-4 w-4" />
                </button>
              </div>
            ))}
          </Card>
        )
      ) : (
        <CardManager
          deckId={deck.id}
          cards={cards}
          docId={deck.docId}
          title={deck.title}
          emptyAction={
            deck.questions.length > 0 && (
              <Button variant="secondary" onClick={makeCards} icon={<Layers className="h-4 w-4" />}>
                Make flashcards from {deck.questions.length} questions
              </Button>
            )
          }
        />
      )}
      <NameDialog open={renaming} title="Rename deck" label="Deck name" initial={deck.title} onClose={() => setRenaming(false)} onSave={(value) => updateDeck(deck.id, { title: value })} />
    </div>
  );
}
