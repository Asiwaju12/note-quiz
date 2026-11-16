import { useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { extractFiles, type FileExtraction, type UploadKind } from "@/game/files";
import { sfx } from "@/game/sound";
import { Icon } from "./Icons";

const KIND_ICON: Record<UploadKind, "file" | "upload" | "note"> = {
  pdf: "file",
  docx: "file",
  image: "upload",
  text: "note",
};

const KIND_LABEL: Record<UploadKind, string> = {
  pdf: "PDF",
  docx: "Word",
  image: "Photos",
  text: "Text",
};

export function FileImporter({ onExtract }: { onExtract: (result: FileExtraction) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | File[] | null | undefined) => {
    if (!fileList || busy) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const result = await extractFiles(files);
      sfx.correct(3);
      onExtract(result);
    } catch {
      setError("That upload didn't finish. Try again, or paste your notes instead.");
      sfx.wrong();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.rtf,.html,.xml,.yaml,.yml,.log,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/json,image/*"
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
        aria-label="Upload PDFs, documents, or photos"
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "relative overflow-hidden rounded-xl border-2 border-dashed p-3.5 transition-colors sm:p-4",
          dragging ? "border-ink bg-lime/35" : "border-ink/25 bg-paper/45",
          busy && "border-ink/30 bg-paper/70",
        )}
      >
        {busy ? (
          <div className="flex min-h-[168px] flex-col items-center justify-center gap-3" aria-live="polite">
            <span className="relative grid h-11 w-11 place-items-center rounded-xl border-2 border-ink bg-sky text-ink shadow-[2px_2px_0_#1B1A14]">
              <Icon name="upload" size={18} />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full border border-ink bg-coral" />
            </span>
            <div className="text-center">
              <p className="font-display text-[14px] font-extrabold leading-tight">Uploading…</p>
              <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-muted">This can take a moment for bigger files.</p>
            </div>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-lime" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-ink bg-lilac shadow-[2px_2px_0_#1B1A14]">
                <Icon name="upload" size={17} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[14px] font-extrabold leading-tight">Drop files or photos here.</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">
                  Lecture slides, a reading, a photo of your notebook — whatever you&apos;ve got.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {(["pdf", "docx", "image", "text"] as UploadKind[]).map((kind) => (
                <span
                  key={kind}
                  className="inline-flex items-center gap-1 rounded-md border border-ink/15 bg-card px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-muted"
                >
                  <Icon name={KIND_ICON[kind]} size={9} /> {KIND_LABEL[kind]}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="press inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-ink bg-ink px-3 py-2 font-display text-[12px] font-bold text-cream shadow-[2px_2px_0_#CBF54A]"
              >
                <Icon name="file" size={12} className="text-lime" /> Choose files
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-left font-mono text-[9px] uppercase tracking-[0.08em] text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-ink"
              >
                or add a photo of your notes
              </button>
              <span className="ml-auto hidden items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em] text-muted sm:flex">
                <Icon name="lock" size={9} /> local only
              </span>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-coral bg-coral/15 px-2.5 py-2 text-[11px] leading-snug" role="alert">
                <Icon name="close" size={12} className="mt-0.5 shrink-0" />
                <span className="flex-1">{error}</span>
                <button type="button" onClick={() => setError(null)} className="shrink-0 font-mono text-[9px] uppercase underline underline-offset-2">
                  dismiss
                </button>
              </div>
            )}

            {dragging && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg bg-lime/85">
                <span className="inline-flex items-center gap-2 font-display text-sm font-extrabold">
                  <Icon name="upload" size={18} /> Drop them here
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function uploadSuccessLabel(files: FileExtraction["files"]): string {
  if (files.length === 1) {
    const kind = files[0].kind;
    if (kind === "pdf") return "PDF uploaded successfully.";
    if (kind === "image") return "Photo uploaded successfully.";
    if (kind === "docx") return "Document uploaded successfully.";
    return "File uploaded successfully.";
  }
  return `${files.length} files uploaded successfully.`;
}

