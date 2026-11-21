import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Highlighter, Loader2, NotebookPen, PanelRight, Search, StickyNote, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCollection } from "@/data/db";
import type { Bookmark as BookmarkModel, DocNote, Highlight, StudyDocument } from "@/data/models";
import { addHighlight, db, getDocumentFile, getDocumentText, saveDocNote, toggleBookmark, updateDocument } from "@/data/repos";
import { openPdf, renderPage, type RenderedPage } from "@/lib/study/pdf";
import { useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/Overlay";
import { Segmented } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/Toast";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];
const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

type SidePanel = "bookmarks" | "highlights" | "notes";

function Annotations({ doc, page, goTo }: { doc: StudyDocument; page: number; goTo: (page: number) => void }) {
  const [tab, setTab] = useState<SidePanel>("notes");
  const bookmarks = useCollection<BookmarkModel>("bookmarks").filter((b) => b.docId === doc.id).sort((a, b) => a.page - b.page);
  const highlights = useCollection<Highlight>("highlights").filter((h) => h.docId === doc.id).sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
  const notes = useCollection<DocNote>("docNotes").filter((n) => n.docId === doc.id).sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || b.updatedAt.localeCompare(a.updatedAt));
  const [draft, setDraft] = useState("");
  return (
    <div className="flex h-full flex-col">
      <Segmented
        label="Annotations"
        value={tab}
        onChange={setTab}
        className="m-3 flex"
        items={[
          { id: "notes", label: `Notes${notes.length ? ` ${notes.length}` : ""}` },
          { id: "highlights", label: `Highlights${highlights.length ? ` ${highlights.length}` : ""}` },
          { id: "bookmarks", label: "Pages" },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {tab === "notes" && (
          <div className="space-y-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.trim()) return;
                saveDocNote(doc.id, page, draft.trim());
                setDraft("");
              }}
              className="space-y-2"
            >
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder={`Note for page ${page}…`} aria-label="New note" className="text-sm" />
              <Button type="submit" size="sm" disabled={!draft.trim()} className="w-full">
                Add note to page {page}
              </Button>
            </form>
            {notes.length === 0 && <p className="text-center text-xs text-subtle">Personal notes are saved with the page they belong to.</p>}
            {notes.map((note) => (
              <div key={note.id} className="group rounded-xl border border-border bg-surface p-3">
                <div className="mb-1 flex items-center justify-between">
                  {note.page ? (
                    <button type="button" onClick={() => goTo(note.page!)} className="font-mono text-[11px] text-accent-text hover:underline">
                      Page {note.page}
                    </button>
                  ) : (
                    <span className="text-[11px] text-subtle">General</span>
                  )}
                  <button type="button" onClick={() => db.docNotes.remove(note.id)} className="rounded p-1 text-subtle opacity-60 hover:text-danger group-hover:opacity-100" aria-label="Delete note">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.text}</p>
              </div>
            ))}
          </div>
        )}
        {tab === "highlights" && (
          <div className="space-y-2">
            {highlights.length === 0 && <p className="py-4 text-center text-xs leading-relaxed text-subtle">Select text on the page, then tap Highlight. Highlights keep their page reference.</p>}
            {highlights.map((highlight) => (
              <div key={highlight.id} className="group rounded-xl border border-border bg-surface p-3">
                <div className="mb-1 flex items-center justify-between">
                  <button type="button" onClick={() => goTo(highlight.page)} className="font-mono text-[11px] text-accent-text hover:underline">
                    Page {highlight.page}
                  </button>
                  <button type="button" onClick={() => db.highlights.remove(highlight.id)} className="rounded p-1 text-subtle opacity-60 hover:text-danger group-hover:opacity-100" aria-label="Delete highlight">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="border-l-2 border-[#f5c84c] pl-2 text-sm leading-relaxed">{highlight.text}</p>
                {highlight.note && <p className="mt-1.5 text-xs text-muted">{highlight.note}</p>}
              </div>
            ))}
          </div>
        )}
        {tab === "bookmarks" && (
          <div className="space-y-1">
            {bookmarks.length === 0 && <p className="py-4 text-center text-xs text-subtle">Bookmark pages with the bookmark button in the toolbar.</p>}
            {bookmarks.map((bookmark) => (
              <div key={bookmark.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-3">
                <BookmarkCheck className="h-4 w-4 text-accent-text" />
                <button type="button" onClick={() => goTo(bookmark.page)} className="flex-1 text-left text-sm">
                  {bookmark.label}
                </button>
                <button type="button" onClick={() => db.bookmarks.remove(bookmark.id)} className="rounded p-1 text-subtle hover:text-danger" aria-label={`Remove bookmark for page ${bookmark.page}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PdfViewer({ doc, initialPage }: { doc: StudyDocument; initialPage?: number }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(() => Math.min(Math.max(1, initialPage ?? doc.lastPage ?? 1), Math.max(1, doc.pageCount)));
  const [pageInput, setPageInput] = useState(String(page));
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [width, setWidth] = useState(0);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [pagesText, setPagesText] = useState<string[]>([]);
  const [selection, setSelection] = useState<string>("");
  const [panelOpen, setPanelOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 1280px)");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const renderRef = useRef<RenderedPage | null>(null);
  const bookmarks = useCollection<BookmarkModel>("bookmarks");
  const highlights = useCollection<Highlight>("highlights");
  const isBookmarked = bookmarks.some((b) => b.docId === doc.id && b.page === page);
  const pageHighlights = useMemo(() => highlights.filter((h) => h.docId === doc.id && h.page === page), [highlights, doc.id, page]);

  useEffect(() => {
    if (initialPage) setPage(Math.min(Math.max(1, initialPage), Math.max(1, doc.pageCount)));
  }, [initialPage, doc.pageCount]);

  // Load the PDF from local storage.
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        const file = await getDocumentFile(doc.id);
        if (!file) throw new Error("missing");
        loaded = await openPdf(await file.arrayBuffer());
        if (cancelled) return void loaded.destroy();
        setPdf(loaded);
        const text = await getDocumentText(doc.id);
        if (!cancelled) setPagesText(text?.pages ?? []);
      } catch {
        if (!cancelled) setLoadError("The original PDF isn't available in this browser. It may have been uploaded on another device.");
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [doc.id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const decorate = useCallback(() => {
    const layer = textLayerRef.current;
    if (!layer) return;
    const marks = pageHighlights.map((h) => norm(h.text));
    const q = norm(query);
    layer.querySelectorAll("span").forEach((span) => {
      const text = norm(span.textContent ?? "");
      span.classList.toggle("rq-hl", Boolean(text.length > 1 && marks.some((mark) => mark.includes(text))));
      span.classList.toggle("rq-search", Boolean(q.length > 1 && text.includes(q)));
    });
  }, [pageHighlights, query]);

  // Render the current page.
  useEffect(() => {
    if (!pdf || !width || !canvasRef.current || !textLayerRef.current) return;
    let cancelled = false;
    renderRef.current?.cancel();
    setRendering(true);
    void renderPage(pdf, page, canvasRef.current, textLayerRef.current, Math.min(width, 900), zoom)
      .then(async (rendered) => {
        renderRef.current = rendered;
        await rendered.done.catch(() => undefined);
        if (!cancelled) {
          setRendering(false);
          decorate();
        }
      })
      .catch(() => !cancelled && setRendering(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, page, width, zoom]);

  useEffect(() => decorate(), [decorate]);

  // Save reading position.
  useEffect(() => {
    setPageInput(String(page));
    const timer = window.setTimeout(() => updateDocument(doc.id, { lastPage: page }), 400);
    return () => window.clearTimeout(timer);
  }, [page, doc.id]);

  // Track text selection inside the text layer.
  useEffect(() => {
    const onSelect = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      const inside = sel?.anchorNode && textLayerRef.current?.contains(sel.anchorNode);
      setSelection(inside && text.length > 2 ? text.slice(0, 1200) : "");
    };
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, []);

  const goTo = useCallback((target: number) => setPage(Math.min(Math.max(1, target), pdf?.numPages ?? doc.pageCount)), [pdf, doc.pageCount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowRight") goTo(page + 1);
      if (event.key === "ArrowLeft") goTo(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, goTo]);

  const results = useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    const out: Array<{ page: number; snippet: string }> = [];
    pagesText.forEach((text, index) => {
      const flat = text.replace(/\s+/g, " ");
      const at = flat.toLowerCase().indexOf(q);
      if (at >= 0) out.push({ page: index + 1, snippet: `${at > 40 ? "…" : ""}${flat.slice(Math.max(0, at - 40), at + q.length + 60)}…` });
    });
    return out;
  }, [query, pagesText]);

  const total = pdf?.numPages ?? doc.pageCount;
  const zoomIndex = ZOOMS.indexOf(zoom);

  const panel = <Annotations doc={doc} page={page} goTo={goTo} />;

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1">
        <div className="sticky top-14 z-20 -mx-4 mb-3 flex flex-wrap items-center gap-1 border-b border-border bg-bg/90 px-4 py-2 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-2 md:top-2">
          <Button variant="ghost" size="icon-sm" onClick={() => goTo(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = Number(pageInput);
              if (Number.isFinite(value)) goTo(value);
            }}
            className="flex items-center gap-1 text-sm"
          >
            <input value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))} onBlur={() => setPageInput(String(page))} inputMode="numeric" aria-label="Page number" className="tabular h-8 w-11 rounded-lg border border-border bg-surface text-center text-sm focus:border-accent focus:outline-none" />
            <span className="tabular text-subtle">/ {total}</span>
          </form>
          <Button variant="ghost" size="icon-sm" onClick={() => goTo(page + 1)} disabled={page >= total} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)])} disabled={zoomIndex <= 0} aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button type="button" onClick={() => setZoom(1)} className="tabular hidden h-8 rounded-lg px-1.5 text-xs text-muted hover:bg-surface-3 sm:block" aria-label="Reset zoom to fit width">
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)])} disabled={zoomIndex >= ZOOMS.length - 1} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button variant={searchOpen ? "soft" : "ghost"} size="icon-sm" onClick={() => setSearchOpen((v) => !v)} aria-label="Search in document" aria-pressed={searchOpen}>
              <Search className="h-4 w-4" />
            </Button>
            <Button variant={isBookmarked ? "soft" : "ghost"} size="icon-sm" onClick={() => toggleBookmark(doc.id, page)} aria-label={isBookmarked ? "Remove bookmark" : "Bookmark this page"} aria-pressed={isBookmarked}>
              {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            </Button>
            <Button variant={panelOpen && !wide ? "soft" : "ghost"} size="icon-sm" onClick={() => setPanelOpen((v) => !v)} aria-label="Notes, highlights and bookmarks" className="xl:hidden">
              <PanelRight className="h-4 w-4" />
            </Button>
          </div>
          <AnimatePresence>
            {searchOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="w-full overflow-hidden">
                <div className="pt-2">
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search text in this PDF" aria-label="Search text" className="h-10" autoFocus />
                  {query.trim().length > 1 && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-surface">
                      {results.length === 0 ? (
                        <p className="px-3 py-2.5 text-sm text-subtle">No matches{pagesText.length === 0 ? " (no extractable text)" : ""}.</p>
                      ) : (
                        results.slice(0, 50).map((result) => (
                          <button key={result.page} type="button" onClick={() => goTo(result.page)} className={cn("block w-full px-3 py-2 text-left text-sm hover:bg-surface-2", result.page === page && "bg-accent-softer")}>
                            <span className="font-mono text-[11px] text-accent-text">p. {result.page}</span> <span className="text-muted">{result.snippet}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div ref={containerRef} className="relative w-full overflow-x-auto rounded-2xl bg-surface-3/60 p-0 sm:p-4">
          {loadError ? (
            <p className="p-8 text-center text-sm text-muted">{loadError}</p>
          ) : (
            <div className="relative mx-auto w-fit bg-white shadow-md">
              <canvas ref={canvasRef} className="block" />
              <div ref={textLayerRef} className="pdf-text-layer" />
              {(!pdf || rendering) && (
                <div className="absolute inset-0 grid min-h-[300px] place-items-center bg-white/60">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
              )}
            </div>
          )}
        </div>

        <AnimatePresence>
          {selection && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="fixed inset-x-0 bottom-20 z-50 mx-auto flex w-fit items-center gap-1 rounded-2xl border border-border bg-surface p-1.5 shadow-lg md:bottom-8">
              <Button
                size="sm"
                variant="ghost"
                icon={<Highlighter className="h-4 w-4 text-[#d9a300]" />}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  addHighlight({ docId: doc.id, page, text: selection, color: "yellow" });
                  window.getSelection()?.removeAllRanges();
                  setSelection("");
                  toast("Highlight saved", { description: `Page ${page}` });
                }}
              >
                Highlight
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<NotebookPen className="h-4 w-4" />}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  saveDocNote(doc.id, page, `“${selection}”`);
                  window.getSelection()?.removeAllRanges();
                  setSelection("");
                  setPanelOpen(true);
                  toast("Quote added to your notes", { description: `Page ${page}` });
                }}
              >
                Quote to notes
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-subtle">
          <StickyNote className="h-3.5 w-3.5" /> Select text to highlight it · your page is saved automatically
        </p>
      </div>

      {wide ? (
        <aside className="card sticky top-4 hidden h-[calc(100dvh-8rem)] w-72 shrink-0 overflow-hidden xl:block">{panel}</aside>
      ) : (
        <Drawer open={panelOpen} onClose={() => setPanelOpen(false)} title="Notes & highlights">
          {panel}
        </Drawer>
      )}
    </div>
  );
}
