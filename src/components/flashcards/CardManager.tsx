import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpenCheck, Brain, Check, Flag, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Flashcard } from "@/data/models";
import { createCards, deleteCard, updateCard } from "@/data/repos";
import { bucketOf, isDue } from "@/lib/srs/fsrs";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Badge, Field, Input, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Overlay";
import { confirmAction } from "@/components/ui/Confirm";
import { FlashcardStudy } from "./FlashcardStudy";

function CardEditor({ open, card, onClose, onSave }: { open: boolean; card: Flashcard | null; onClose: () => void; onSave: (front: string, back: string) => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [seen, setSeen] = useState<string | null>(null);
  const key = card?.id ?? (open ? "new" : null);
  if (key !== seen) {
    setSeen(key);
    setFront(card?.front ?? "");
    setBack(card?.back ?? "");
  }
  const save = () => {
    if (!front.trim() || !back.trim()) return;
    onSave(front.trim(), back.trim());
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={card ? "Edit flashcard" : "New flashcard"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!front.trim() || !back.trim()}>
            Save card
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Front (question or term)">{(id) => <Textarea id={id} value={front} onChange={(e) => setFront(e.target.value)} rows={3} data-autofocus />}</Field>
        <Field label="Back (answer)">{(id) => <Textarea id={id} value={back} onChange={(e) => setBack(e.target.value)} rows={4} />}</Field>
      </div>
    </Modal>
  );
}

const BUCKET_TONE = { new: "neutral", learning: "warning", review: "accent", mastered: "success" } as const;

export function CardManager({ deckId, cards, docId, title, emptyAction }: { deckId: string; cards: Flashcard[]; docId?: string; title: string; emptyAction?: React.ReactNode }) {
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [creating, setCreating] = useState(false);
  const [studying, setStudying] = useState<{ cards: Flashcard[]; mode: "srs" | "browse"; label: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "revise" | "understood">("all");
  const now = new Date();
  const sorted = useMemo(() => [...cards].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [cards]);
  const due = sorted.filter((card) => isDue(card.srs, now));
  const difficult = sorted.filter((card) => card.flag === "revise" || card.srs.lapses > 0);
  const visible = sorted
    .filter((card) => filter === "all" || card.flag === filter)
    .filter((card) => !query.trim() || `${card.front} ${card.back}`.toLowerCase().includes(query.trim().toLowerCase()));

  if (studying) {
    return <FlashcardStudy cards={studying.cards} mode={studying.mode} title={`${title} · ${studying.label}`} onExit={() => setStudying(null)} />;
  }

  return (
    <div>
      {cards.length > 0 && (
        <div className="mb-5 grid gap-2 sm:grid-cols-3">
          <button type="button" disabled={!due.length} onClick={() => setStudying({ cards: due, mode: "srs", label: "Spaced review" })} className="card card-interactive flex items-center gap-3 p-4 text-left disabled:opacity-50">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
              <Brain className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Review due</span>
              <span className="text-xs text-subtle">{due.length ? `${due.length} card${due.length === 1 ? "" : "s"} · spaced repetition` : "Nothing due right now"}</span>
            </span>
          </button>
          <button type="button" onClick={() => setStudying({ cards: sorted, mode: "browse", label: "All cards" })} className="card card-interactive flex items-center gap-3 p-4 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-3 text-text">
              <BookOpenCheck className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Study all</span>
              <span className="text-xs text-subtle">{cards.length} cards</span>
            </span>
          </button>
          <button type="button" disabled={!difficult.length} onClick={() => setStudying({ cards: difficult, mode: "browse", label: "Difficult cards" })} className="card card-interactive flex items-center gap-3 p-4 text-left disabled:opacity-50">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-danger-soft text-danger">
              <Flag className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Difficult cards</span>
              <span className="text-xs text-subtle">{difficult.length ? `${difficult.length} to revise` : "None marked yet"}</span>
            </span>
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {cards.length > 0 && (
          <>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards" aria-label="Search cards" className="h-10 pl-10" />
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Filter cards">
              {(["all", "revise", "understood"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn("h-9 rounded-full border px-3 text-[13px] font-medium capitalize", filter === value ? "border-accent bg-accent-soft text-accent-text" : "border-border text-muted")}>
                  {value === "revise" ? "To revise" : value}
                </button>
              ))}
            </div>
          </>
        )}
        <Button variant="secondary" size="md" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)} className="sm:ml-auto">
          Add card
        </Button>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border-strong px-6 py-10 text-center">
          <p className="text-sm text-muted">No flashcards yet.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">{emptyAction}</div>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {visible.map((card) => {
              const bucket = bucketOf(card.srs);
              return (
                <motion.li key={card.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="card group flex items-start gap-3 p-4">
                  <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2 sm:gap-4">
                    <p className="text-sm font-medium leading-snug">{card.front}</p>
                    <p className="text-sm leading-snug text-muted">{card.back}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex items-center gap-1">
                      {card.flag === "understood" && <Check className="h-4 w-4 text-success" aria-label="Understood" />}
                      {card.flag === "revise" && <Flag className="h-4 w-4 text-danger" aria-label="Marked for revision" />}
                      <Badge tone={BUCKET_TONE[bucket]} className="capitalize">
                        {bucket}
                      </Badge>
                    </div>
                    <div className="flex items-center opacity-70 transition-opacity group-hover:opacity-100">
                      <button type="button" onClick={() => updateCard(card.id, { flag: card.flag === "understood" ? null : "understood" })} className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-success" aria-label="Mark as understood" aria-pressed={card.flag === "understood"}>
                        <Check className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => updateCard(card.id, { flag: card.flag === "revise" ? null : "revise" })} className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-danger" aria-label="Mark for revision" aria-pressed={card.flag === "revise"}>
                        <Flag className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setEditing(card)} className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-text" aria-label="Edit card">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (await confirmAction({ title: "Delete this flashcard?", confirmLabel: "Delete", danger: true })) deleteCard(card.id);
                        }}
                        className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-danger"
                        aria-label="Delete card"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {visible.length === 0 && <p className="py-6 text-center text-sm text-subtle">No cards match.</p>}
        </ul>
      )}

      <CardEditor open={creating || Boolean(editing)} card={editing} onClose={() => { setCreating(false); setEditing(null); }} onSave={(front, back) => (editing ? updateCard(editing.id, { front, back }) : createCards(deckId, [{ front, back, docId }]))} />
    </div>
  );
}
