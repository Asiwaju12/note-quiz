import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CloudDownload, FileText, FolderInput, LibraryBig, NotebookPen, PenLine, Plus, Search, Shuffle, Trash2 } from "lucide-react";
import { useAccount } from "@/app/account";
import { useCollection } from "@/data/db";
import type { Flashcard, Folder, SavedDeck } from "@/data/models";
import { db, deleteDeck, updateDeck } from "@/data/repos";
import { deleteCloudDeck, loadCloudDecks } from "@/services/cloud";
import { formatRelative, useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui/Button";
import { Badge, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Menu } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Overlay";
import { confirmAction } from "@/components/ui/Confirm";
import { toast } from "@/components/ui/Toast";

const KIND = {
  notes: { label: "From notes", icon: NotebookPen },
  manual: { label: "Handwritten", icon: PenLine },
  document: { label: "From PDF", icon: FileText },
  sample: { label: "Sample", icon: Shuffle },
} as const;

/** Imports decks saved in the cloud by the original app (Supabase study_decks) into the local library. */
function useCloudDeckImport() {
  const { account } = useAccount();
  useEffect(() => {
    if (!account) return;
    let active = true;
    void loadCloudDecks()
      .then((rows) => {
        if (!active) return;
        const known = new Set(db.decks.all().map((d) => d.cloudId).filter(Boolean));
        const fresh = rows.filter((row) => !known.has(row.id));
        for (const row of fresh) {
          db.decks.put({ id: `cloud_${row.id}`, cloudId: row.id, title: row.title, kind: row.kind, questions: row.questions, folderId: null, createdAt: row.created_at, updatedAt: row.updated_at });
        }
        if (fresh.length) toast(`Synced ${fresh.length} deck${fresh.length === 1 ? "" : "s"} from your account`);
      })
      .catch((e) => console.error("Could not load deck history:", e));
    return () => {
      active = false;
    };
  }, [account]);
}

export default function Decks() {
  useCloudDeckImport();
  const decks = useCollection<SavedDeck>("decks");
  const cards = useCollection<Flashcard>("cards");
  const folders = useCollection<Folder>("folders");
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 150);
  const [kind, setKind] = useState<string>("all");
  const [sort, setSort] = useState<"recent" | "name" | "size">("recent");
  const [moving, setMoving] = useState<SavedDeck | null>(null);

  const visible = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    const list = decks
      .filter((d) => d.questions.length || cards.some((c) => c.deckId === d.id))
      .filter((d) => kind === "all" || d.kind === kind || d.folderId === kind)
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.questions.some((x) => x.prompt.toLowerCase().includes(q)));
    return list.sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : sort === "size" ? b.questions.length - a.questions.length : (b.lastPlayedAt ?? b.updatedAt).localeCompare(a.lastPlayedAt ?? a.updatedAt)));
  }, [decks, cards, debounced, kind, sort]);

  const remove = async (deck: SavedDeck) => {
    if (!(await confirmAction({ title: `Delete “${deck.title}”?`, description: "Its questions and flashcards will be removed. Practice history is kept.", confirmLabel: "Delete deck", danger: true }))) return;
    if (deck.cloudId) await deleteCloudDeck(deck.cloudId).catch((e) => console.error("Could not delete cloud deck:", e));
    deleteDeck(deck.id);
    toast("Deck deleted");
  };

  const hasAny = decks.some((d) => d.questions.length || cards.some((c) => c.deckId === d.id));

  return (
    <div>
      <PageHeader
        title="My Decks"
        description="Every quiz and flashcard set you've created, in one library."
        actions={
          <ButtonLink to="/quiz/create" icon={<Plus className="h-4 w-4" />}>
            New deck
          </ButtonLink>
        }
      />
      {!hasAny ? (
        <EmptyState
          icon={<LibraryBig className="h-6 w-6" />}
          title="No decks yet"
          description="Create a quiz from your notes, write your own questions, or generate practice from a PDF."
          action={
            <>
              <ButtonLink to="/quiz/create">Create from notes</ButtonLink>
              <ButtonLink to="/study" variant="secondary">
                Use a PDF
              </ButtonLink>
            </>
          }
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search decks and questions" className="pl-10" aria-label="Search decks" />
            </div>
            <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter decks" className="sm:w-48">
              <option value="all">All decks</option>
              <option value="notes">From notes</option>
              <option value="manual">Handwritten</option>
              <option value="document">From PDFs</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  Subject: {f.name}
                </option>
              ))}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort decks" className="sm:w-44">
              <option value="recent">Recently used</option>
              <option value="name">Name</option>
              <option value="size">Most questions</option>
            </Select>
          </div>
          {visible.length === 0 ? (
            <EmptyState icon={<Search className="h-6 w-6" />} title="No decks match" />
          ) : (
            <motion.ul layout className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence initial={false}>
                {visible.map((deck) => {
                  const meta = KIND[deck.kind];
                  const cardCount = cards.filter((c) => c.deckId === deck.id).length;
                  const folder = folders.find((f) => f.id === deck.folderId);
                  return (
                    <motion.li key={deck.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="relative">
                      <Link to={`/decks/${deck.id}`} className="card card-interactive flex h-full flex-col p-4 hover:-translate-y-0.5">
                        <span className={cn("mb-3 grid h-10 w-10 place-items-center rounded-xl", deck.kind === "document" ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-text")}>
                          <meta.icon className="h-5 w-5" />
                        </span>
                        <span className="line-clamp-2 pr-8 font-medium leading-snug">{deck.title}</span>
                        <span className="mt-1 text-xs text-subtle">
                          {deck.questions.length} questions{cardCount ? ` · ${cardCount} cards` : ""}
                        </span>
                        <span className="mt-auto flex items-center justify-between gap-2 pt-4">
                          <span className="flex min-w-0 gap-1">
                            <Badge tone="neutral">{meta.label}</Badge>
                            {folder && <Badge tone="outline" className="truncate">{folder.name}</Badge>}
                            {deck.cloudId && (
                              <Badge tone="accent">
                                <CloudDownload className="h-3 w-3" />
                              </Badge>
                            )}
                          </span>
                          <span className="shrink-0 text-xs text-subtle">{formatRelative(deck.lastPlayedAt ?? deck.updatedAt)}</span>
                        </span>
                      </Link>
                      <Menu
                        className="absolute right-2.5 top-2.5"
                        label={`Actions for ${deck.title}`}
                        items={[
                          { label: "Move to subject", icon: <FolderInput className="h-4 w-4" />, onSelect: () => setMoving(deck) },
                          { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onSelect: () => void remove(deck), danger: true },
                        ]}
                      />
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          )}
        </>
      )}
      <Modal open={Boolean(moving)} onClose={() => setMoving(null)} title="Move to subject" size="sm">
        <div className="flex flex-col gap-1.5">
          {[{ id: "", name: "No subject" }, ...folders].map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => {
                if (moving) updateDeck(moving.id, { folderId: folder.id || null });
                setMoving(null);
              }}
              className={cn("rounded-xl border px-3 py-3 text-left text-sm hover:bg-surface-2", (moving?.folderId ?? "") === folder.id ? "border-accent" : "border-border")}
            >
              {folder.name}
            </button>
          ))}
          {folders.length === 0 && <p className="text-xs text-subtle">Create subjects in the Study Centre.</p>}
        </div>
      </Modal>
    </div>
  );
}
