/**
 * PDF ingestion: validate → store the file → extract text page by page → mark ready.
 *
 * Every upload is first stored locally in IndexedDB so the Study Centre remains
 * usable offline. For signed-in accounts, the account-scoped cloud-sync service
 * uploads the original PDF to the private `study-documents` bucket and syncs
 * extracted page text to `recall_document_texts`. Guest files remain local.
 */
import type { StudyDocument } from "@/data/models";
import { createDocument, logActivity, saveDocumentFile, saveDocumentText, updateDocument } from "@/data/repos";
import { extractPages, validatePdfFile } from "./pdf";

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export function titleFromFileName(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled document";
}

export async function ingestPdf(file: File, options: { title?: string; folderId: string | null }): Promise<StudyDocument> {
  const problem = validatePdfFile(file, MAX_PDF_BYTES);
  if (problem) throw new Error(problem);
  const doc = createDocument({
    title: options.title?.trim() || titleFromFileName(file.name),
    fileName: file.name,
    sizeBytes: file.size,
    folderId: options.folderId,
  });
  void processDocument(doc.id, file);
  return doc;
}

async function processDocument(docId: string, file: File) {
  try {
    await saveDocumentFile(docId, file);
    const buffer = await file.arrayBuffer();
    let lastReported = -1;
    const { pages, pageCount } = await extractPages(buffer, (percent) => {
      if (percent - lastReported >= 5 || percent === 100) {
        lastReported = percent;
        updateDocument(docId, { progress: percent });
      }
    });
    await saveDocumentText(docId, pages);
    const charCount = pages.reduce((sum, page) => sum + page.length, 0);
    updateDocument(docId, { status: "ready", progress: 100, pageCount, charCount });
    logActivity("doc_upload", `Uploaded ${file.name}`, `${pageCount} pages`, `/study/${docId}`);
  } catch (error) {
    const message =
      error instanceof Error && /password/i.test(error.message)
        ? "This PDF is password-protected."
        : error instanceof Error && /quota|full/i.test(error.message)
          ? "Your browser storage is full. Delete some documents and try again."
          : "We couldn't read this PDF. It may be damaged.";
    updateDocument(docId, { status: "error", error: message });
  }
}
