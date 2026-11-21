import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, FileText, FolderInput, FolderPlus, Loader2, Pencil, Plus, Search, Trash2, UploadCloud } from "lucide-react";
import { useCollection } from "@/data/db";
import { useAccount } from "@/app/account";
import type { Folder, StudyDocument } from "@/data/models";
import { createFolder, deleteDocument, deleteFolder, renameFolder, updateDocument } from "@/data/repos";
import { ingestPdf, MAX_PDF_BYTES, titleFromFileName } from "@/lib/study/ingest";
import { validatePdfFile } from "@/lib/study/pdf";
import { formatBytes, formatRelative, useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, Field, Input, PageHeader, ProgressBar, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Overlay";
import { Menu } from "@/components/ui/Menu";
import { confirmAction } from "@/components/ui/Confirm";
import { NameDialog } from "@/components/ui/NameDialog";
import { toast } from "@/components/ui/Toast";

function UploadDialog({ open, onClose, folders, defaultFolder }: { open: boolean; onClose: () => void; folders: Folder[]; defaultFolder: string | null }) {
  const { account } = useAccount();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string>(defaultFolder ?? "");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) {
      setFiles([]);
      setTitle("");
      setError(null);
      setFolderId(defaultFolder ?? "");
    }
  }, [open, defaultFolder]);

  const choose = (list: FileList | null) => {
    if (!list?.length) return;
    const picked = Array.from(list).slice(0, 10);
    const problems = picked.map((file) => validatePdfFile(file, MAX_PDF_BYTES)).filter(Boolean);
    const valid = picked.filter((file) => !validatePdfFile(file, MAX_PDF_BYTES));
    setError(problems.length ? `${problems.length} file${problems.length > 1 ? "s were" : " was"} skipped: ${problems[0]}` : null);
    setFiles(valid);
    if (valid.length === 1) setTitle(titleFromFileName(valid[0].name));
  };

  const submit = async () => {
    if (!files.length) return;
    try {
      for (const file of files) await ingestPdf(file, { title: files.length === 1 ? title : undefined, folderId: folderId || null });
      toast(files.length === 1 ? "Uploading your PDF" : `Uploading ${files.length} PDFs`, { description: "Text extraction runs on this device. You can keep working." });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload study material"
      description="Lecture notes, textbook chapters or slides as PDF."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!files.length} icon={<UploadCloud className="h-4 w-4" />}>
            {files.length > 1 ? `Upload ${files.length} files` : "Upload"}
          </Button>
        </>
      }
    >
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => choose(e.target.files)} aria-label="Choose PDF files" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors",
          dragging ? "border-accent bg-accent-softer" : "border-border-strong hover:border-accent hover:bg-accent-softer",
        )}
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent-text">
          <UploadCloud className="h-6 w-6" />
        </span>
        {files.length ? (
          <span className="mt-3 text-sm font-medium">
            {files.length === 1 ? files[0].name : `${files.length} PDFs selected`}
            <span className="mt-0.5 block text-xs font-normal text-subtle">{formatBytes(files.reduce((sum, f) => sum + f.size, 0))} · tap to change</span>
          </span>
        ) : (
          <span className="mt-3 text-sm">
            <span className="font-medium text-accent-text">Choose PDFs</span> <span className="hidden sm:inline">or drag them here</span>
            <span className="mt-0.5 block text-xs text-subtle">Up to {MAX_PDF_BYTES / 1024 / 1024} MB each</span>
          </span>
        )}
      </button>
      <div className="mt-5 flex flex-col gap-4">
        {files.length === 1 && <Field label="Document name">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />}</Field>}
        <Field label="Subject">
          {(id) => (
            <Select id={id} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">No subject</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        <p className="text-xs leading-relaxed text-subtle">
          {account
            ? "Your PDF is saved on this device first. Recall Quiz will securely back it up to your private account storage so it can be restored on your other devices."
            : "Guest files and extracted text stay in this browser. Sign in to enable private cloud backup and access your study materials on other devices."}
        </p>
      </div>
    </Modal>
  );
}

function MoveDialog({ doc, folders, onClose }: { doc: StudyDocument | null; folders: Folder[]; onClose: () => void }) {
  return (
    <Modal open={Boolean(doc)} onClose={onClose} title="Move to subject" size="sm">
      <div className="flex flex-col gap-1.5">
        {[{ id: "", name: "No subject", color: "var(--border-strong)" }, ...folders].map((folder) => (
          <button
            key={folder.id}
            type="button"
            onClick={() => {
              if (doc) updateDocument(doc.id, { folderId: folder.id || null });
              onClose();
            }}
            className={cn("flex items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors hover:bg-surface-2", (doc?.folderId ?? "") === folder.id ? "border-accent" : "border-border")}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: folder.color }} />
            {folder.name}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function DocumentCard({ doc, folder, onRename, onMove }: { doc: StudyDocument; folder?: Folder; onRename: () => void; onMove: () => void }) {
  const remove = async () => {
    const ok = await confirmAction({ title: `Delete “${doc.title}”?`, description: "This removes the PDF, its generated notes, flashcards, highlights and AI chats. This can't be undone.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await deleteDocument(doc.id);
    toast("Document deleted");
  };
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", doc.status === "error" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-text")}>
          {doc.status === "processing" ? <Loader2 className="h-5 w-5 animate-spin" /> : doc.status === "error" ? <AlertCircle className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1 pr-8">
          <h3 className="line-clamp-2 font-medium leading-snug text-text">{doc.title}</h3>
          <p className="mt-1 text-xs text-subtle">
            {doc.status === "ready" ? `${doc.pageCount} pages · ${formatBytes(doc.sizeBytes)}` : doc.status === "processing" ? `Extracting text… ${doc.progress}%` : doc.error}
          </p>
        </div>
      </div>
      {doc.status === "processing" && <ProgressBar value={doc.progress / 100} className="mt-4" label="Processing" />}
      {doc.status === "ready" && (
        <div className="mt-4 flex items-center justify-between gap-2">
          {folder ? (
            <Badge tone="outline" className="max-w-[60%] truncate">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: folder.color }} />
              <span className="truncate">{folder.name}</span>
            </Badge>
          ) : (
            <span />
          )}
          <span className="text-xs text-subtle">{doc.lastOpenedAt ? `Opened ${formatRelative(doc.lastOpenedAt)}` : "Not opened yet"}</span>
        </div>
      )}
      {doc.status === "ready" && doc.charCount < 100 && <p className="mt-3 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning">No selectable text found — this looks like a scanned PDF.</p>}
    </>
  );
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25 }} className="relative">
      {doc.status === "ready" ? (
        <Link to={`/study/${doc.id}`} className="card card-interactive block h-full p-4 hover:-translate-y-0.5">
          {body}
        </Link>
      ) : (
        <div className="card h-full p-4">{body}</div>
      )}
      <Menu
        className="absolute right-2.5 top-2.5"
        label={`Actions for ${doc.title}`}
        items={[
          { label: "Rename", icon: <Pencil className="h-4 w-4" />, onSelect: onRename, disabled: doc.status === "processing" },
          { label: "Move to subject", icon: <FolderInput className="h-4 w-4" />, onSelect: onMove },
          { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onSelect: remove, danger: true },
        ]}
      />
    </motion.div>
  );
}

export default function StudyCentre() {
  const documents = useCollection<StudyDocument>("documents");
  const folders = useCollection<Folder>("folders");
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 150);
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(params.get("upload") === "1");
  const [renaming, setRenaming] = useState<StudyDocument | null>(null);
  const [moving, setMoving] = useState<StudyDocument | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ mode: "new" | "rename"; folder?: Folder } | null>(null);

  useEffect(() => {
    if (params.get("upload") === "1") {
      setUploadOpen(true);
      params.delete("upload");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const visible = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return [...documents]
      .filter((doc) => folderFilter === "all" || (folderFilter === "none" ? !doc.folderId : doc.folderId === folderFilter))
      .filter((doc) => !q || doc.title.toLowerCase().includes(q) || doc.fileName.toLowerCase().includes(q))
      .sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt));
  }, [documents, folderFilter, debounced]);

  const activeFolder = folders.find((folder) => folder.id === folderFilter);
  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader
        title="Study Centre"
        description="Upload a PDF and turn it into summaries, notes, flashcards and practice questions."
        actions={
          <Button onClick={() => setUploadOpen(true)} icon={<Plus className="h-4 w-4" />}>
            Upload PDF
          </Button>
        }
      />

      {documents.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents" className="pl-10" aria-label="Search documents" />
          </div>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by subject">
            {[{ id: "all", name: "All" }, ...sortedFolders, ...(documents.some((d) => !d.folderId) && folders.length ? [{ id: "none", name: "No subject" }] : [])].map((folder) => (
              <button
                key={folder.id}
                type="button"
                aria-pressed={folderFilter === folder.id}
                onClick={() => setFolderFilter(folder.id)}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                  folderFilter === folder.id ? "border-text bg-text text-bg" : "border-border bg-surface text-muted hover:text-text",
                )}
              >
                {folder.name}
              </button>
            ))}
            <button type="button" onClick={() => setFolderDialog({ mode: "new" })} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3.5 text-[13px] font-medium text-muted hover:text-text">
              <FolderPlus className="h-3.5 w-3.5" /> Subject
            </button>
          </div>
          {activeFolder && (
            <Menu
              className="sm:ml-auto"
              label="Subject actions"
              items={[
                { label: "Rename subject", icon: <Pencil className="h-4 w-4" />, onSelect: () => setFolderDialog({ mode: "rename", folder: activeFolder }) },
                {
                  label: "Delete subject",
                  icon: <Trash2 className="h-4 w-4" />,
                  danger: true,
                  onSelect: async () => {
                    if (await confirmAction({ title: `Delete “${activeFolder.name}”?`, description: "Documents and decks inside it are kept and moved to No subject.", confirmLabel: "Delete subject", danger: true })) {
                      deleteFolder(activeFolder.id);
                      setFolderFilter("all");
                    }
                  },
                },
              ]}
            />
          )}
        </div>
      )}

      {documents.length === 0 ? (
        <EmptyState
          icon={<UploadCloud className="h-6 w-6" />}
          title="Your study library is empty"
          description="Upload lecture notes, a textbook chapter or slides as a PDF. Each document gets its own workspace with a reader, summary, notes, flashcards and practice."
          action={
            <Button onClick={() => setUploadOpen(true)} icon={<Plus className="h-4 w-4" />}>
              Upload your first PDF
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={<Search className="h-6 w-6" />} title="No matching documents" description="Try a different search or subject." />
      ) : (
        <motion.div layout className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {visible.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} folder={folders.find((f) => f.id === doc.folderId)} onRename={() => setRenaming(doc)} onMove={() => setMoving(doc)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} folders={sortedFolders} defaultFolder={activeFolder?.id ?? null} />
      <NameDialog open={Boolean(renaming)} title="Rename document" label="Name" initial={renaming?.title ?? ""} onClose={() => setRenaming(null)} onSave={(value) => renaming && updateDocument(renaming.id, { title: value })} />
      <MoveDialog doc={moving} folders={sortedFolders} onClose={() => setMoving(null)} />
      <NameDialog
        open={Boolean(folderDialog)}
        title={folderDialog?.mode === "rename" ? "Rename subject" : "New subject"}
        label="Subject name"
        initial={folderDialog?.folder?.name ?? ""}
        onClose={() => setFolderDialog(null)}
        onSave={(value) => {
          if (folderDialog?.mode === "rename" && folderDialog.folder) renameFolder(folderDialog.folder.id, value);
          else setFolderFilter(createFolder(value).id);
        }}
      />
    </div>
  );
}

