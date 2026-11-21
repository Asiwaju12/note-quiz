import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Brain, Layers } from "lucide-react";
import { useCollection } from "@/data/db";
import type { Flashcard, SavedDeck } from "@/data/models";
import { useSettings } from "@/data/settings";
import { isDue } from "@/lib/srs/fsrs";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader, Select, StatTile } from "@/components/ui/primitives";
import { BarChart } from "@/components/ui/BarChart";
import { FlashcardStudy } from "@/components/flashcards/FlashcardStudy";

export default function Review() {
  const cards = useCollection<Flashcard>("cards");
  const decks = useCollection<SavedDeck>("decks");
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const deckFilter = params.get("deck") ?? "";
  const [session, setSession] = useState<Flashcard[] | null>(null);
  const now = new Date();
  const scoped = cards.filter((c) => !deckFilter || c.deckId === deckFilter);
  const due = scoped.filter((c) => c.srs.state !== "new" && isDue(c.srs, now)).sort((a, b) => a.srs.due.localeCompare(b.srs.due));
  const fresh = scoped.filter((c) => c.srs.state === "new");
  const newToday = fresh.slice(0, settings.dailyGoalCards);
  const learning = scoped.filter((c) => c.srs.state === "learning" || c.srs.state === "relearning").length;

  const forecast = useMemo(() => {
    const out: Array<{ key: string; label: string; value: number }> = [];
    for (let i = 1; i <= 7; i += 1) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() + i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      out.push({ key: String(i), label: start.toLocaleDateString(undefined, { weekday: "short" }), value: scoped.filter((c) => c.srs.state !== "new" && new Date(c.srs.due) >= start && new Date(c.srs.due) < end).length });
    }
    return out;
  }, [scoped]);

  if (session) return <FlashcardStudy cards={session} mode="srs" title="Flashcard review" onExit={() => setSession(null)} />;

  const decksWithCards = decks.filter((d) => cards.some((c) => c.deckId === d.id));

  return (
    <div>
      <PageHeader
        title="Flashcard review"
        description="Spaced repetition schedules each card just before you'd forget it."
        actions={
          decksWithCards.length > 1 && (
            <Select value={deckFilter} onChange={(e) => setParams(e.target.value ? { deck: e.target.value } : {})} aria-label="Deck" className="w-56">
              <option value="">All decks</option>
              {decksWithCards.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          )
        }
      />
      {!cards.length ? (
        <EmptyState icon={<Layers className="h-6 w-6" />} title="No flashcards yet" description="Generate flashcards from a PDF in the Study Centre, or make them from a quiz deck." action={<ButtonLink to="/study">Go to Study Centre</ButtonLink>} />
      ) : (
        <div className="space-y-5">
          <div className="hero-panel flex flex-col gap-5 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="text-[13px] text-white/70">Today's review</p>
              <p className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
                {due.length + newToday.length} card{due.length + newToday.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-sm text-white/80">
                {due.length} due · {newToday.length} new (limit {settings.dailyGoalCards}/day)
              </p>
            </div>
            <Button variant="inverse" size="lg" disabled={!due.length && !newToday.length} onClick={() => setSession([...due, ...newToday])} icon={<Brain className="h-4 w-4" />}>
              {due.length || newToday.length ? "Start review" : "All caught up"}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="New" value={fresh.length} />
            <StatTile label="Learning" value={learning} />
            <StatTile label="Total" value={scoped.length} />
          </div>
          <Card className="p-5">
            <p className="text-sm font-semibold">Coming up</p>
            <p className="mb-4 text-xs text-subtle">Reviews due over the next 7 days</p>
            <BarChart label="Reviews due per day, next 7 days" data={forecast} format={(v) => `${v} cards`} height={110} />
          </Card>
        </div>
      )}
    </div>
  );
}
