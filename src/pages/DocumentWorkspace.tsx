import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, BookMarked, FileText, Layers, LayoutGrid, Map as MapIcon, NotebookText, Sparkles, Target, FileSearch } from "lucide-react";
import { useCollection } from "@/data/db";
import type { StudyDocument } from "@/data/models";
import { markDocumentOpened } from "@/data/repos";
import { updateResume } from "@/data/settings";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";
import { PdfViewer } from "@/components/study/PdfViewer";
import { StudyFileViewer } from "@/components/study/StudyFileViewer";
import { FlashcardsPanel, GuidePanel, KeyTermsPanel, NotesPanel, OverviewPanel, SummaryPanel } from "@/components/study/panels";
import { PracticePanel } from "@/components/study/PracticePanel";
import { ChatView } from "@/components/ai/ChatView";

const TABS = [
  { id: "overview", label: "Overview", icon: <LayoutGrid className="h-4 w-4" /> },
  { id: "pdf", label: "File", icon: <FileSearch className="h-4 w-4" /> },
  { id: "summary", label: "Summary", icon: <FileText className="h-4 w-4" /> },
  { id: "notes", label: "Notes", icon: <NotebookText className="h-4 w-4" /> },
  { id: "flashcards", label: "Flashcards", icon: <Layers className="h-4 w-4" /> },
  { id: "practice", label: "Practice", icon: <Target className="h-4 w-4" /> },
  { id: "terms", label: "Key terms", icon: <BookMarked className="h-4 w-4" /> },
  { id: "guide", label: "Study guide", icon: <MapIcon className="h-4 w-4" /> },
  { id: "tutor", label: "AI tutor", icon: <Sparkles className="h-4 w-4" /> },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function DocumentWorkspace() {
  const { docId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const documents = useCollection<StudyDocument>("documents");
  const doc = documents.find((d) => d.id === docId);
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "overview") as TabId;
  const pageParam = Number(params.get("page")) || undefined;

  const setTab = (next: string, extra: Record<string, string> = {}) => {
    setParams({ tab: next, ...extra }, { replace: false });
  };
  const openPage = (page: number) => setTab("pdf", { page: String(page) });

  useEffect(() => {
    if (doc?.status === "ready") markDocumentOpened(doc.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.status]);

  useEffect(() => {
    if (doc) updateResume({ docId: doc.id, docTab: tab });
  }, [doc, tab]);

  if (!doc) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" />}
        title="Document not found"
        description="It may have been deleted, or it was uploaded in a different browser."
        action={<ButtonLink to="/study">Back to Study Centre</ButtonLink>}
      />
    );
  }

  if (doc.status !== "ready") {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" />}
        title={doc.status === "processing" ? "Still processing…" : "This document couldn't be processed"}
        description={doc.status === "processing" ? `Extracting text: ${doc.progress}%` : doc.error}
        action={<ButtonLink to="/study" variant="secondary">Back to Study Centre</ButtonLink>}
      />
    );
  }

  return (
    <div>
      <div className="mb-5">
        <Link to="/study" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" /> Study Centre
        </Link>
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.03em] sm:text-[28px]">{doc.title}</h1>
        <p className="mt-1 text-sm text-subtle">
          {doc.fileName.toLowerCase().endsWith(".pdf") ? `${doc.pageCount} pages · last read page ${doc.lastPage}` : `${doc.pageCount} sections · ${doc.fileName}`}
        </p>
      </div>

      <Tabs label="Workspace sections" items={TABS.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))} value={tab} onChange={(next) => setTab(next)} className="mb-6" />

      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === "overview" && <OverviewPanel doc={doc} onTab={setTab} />}
        {tab === "pdf" && (doc.fileName.toLowerCase().endsWith(".pdf") ? <PdfViewer doc={doc} initialPage={pageParam} /> : <StudyFileViewer doc={doc} />)}
        {tab === "summary" && <SummaryPanel doc={doc} onPage={openPage} />}
        {tab === "notes" && <NotesPanel doc={doc} onPage={openPage} />}
        {tab === "flashcards" && <FlashcardsPanel doc={doc} />}
        {tab === "practice" && (
          <PracticePanel
            doc={doc}
            initialTopic={params.get("topic") ?? undefined}
            initialPages={params.get("pages")?.split(",").map(Number).filter(Boolean)}
            runParam={params.get("run")}
            onRun={(key) => setParams(key ? { tab: "practice", run: key } : { tab: "practice" }, { replace: true })}
          />
        )}
        {tab === "terms" && <KeyTermsPanel doc={doc} onPage={openPage} />}
        {tab === "guide" && <GuidePanel doc={doc} onPage={openPage} onPractiseTopic={(topic, pages) => setTab("practice", { topic, pages: pages.join(",") })} />}
        {tab === "tutor" && (
          <div className="card flex h-[calc(100dvh-15rem)] min-h-[480px] flex-col p-4 sm:p-5">
            <ChatView docId={doc.id} onPage={openPage} currentPage={doc.lastPage} className="min-h-0 flex-1" />
          </div>
        )}
      </motion.div>
    </div>
  );
}
