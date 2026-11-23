/**
 * Multi-format study-material ingestion.
 * Files are stored in IndexedDB first; extracted text is shared by AI and Basic Mode.
 */
import type { StudyDocument } from "@/data/models";
import { createDocument, logActivity, saveDocumentFile, saveDocumentText, updateDocument } from "@/data/repos";
import { extractPages } from "./pdf";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Backwards-compatible export for older PDF-only call sites. */
export const MAX_PDF_BYTES = MAX_FILE_BYTES;

const EXTENSION = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"]);
const SUPPORTED_EXTENSIONS = new Set([
  "pdf", "docx", "pptx", "xlsx", "txt", "md", "csv", "rtf", "json", "html", "htm",
  ...IMAGE_EXTENSIONS,
]);

export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled document";
}

export function validateStudyFile(file: File, maxBytes = MAX_FILE_BYTES): string | null {
  const extension = EXTENSION(file.name);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return "This file type isn't supported yet. Upload PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), text, CSV, or an image.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > maxBytes) return `That file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  return null;
}

function splitLongText(text: string, target = 6500): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/);
  const pages: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current.length && current.length + paragraph.length > target) {
      pages.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + paragraph;
  }
  if (current.trim()) pages.push(current.trim());
  return pages;
}

function xmlText(xml: string): string {
  return xml
    .replace(/<a:br\b[^>]*\/?\s*>/gi, "\n")
    .replace(/<\/a:p\s*>/gi, "\n")
    .replace(/<\/w:p\s*>/gi, "\n")
    .replace(/<\/w:tr\s*>/gi, "\n")
    .replace(/<\/w:tc\s*>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractDocument(file: File, onProgress: (percent: number) => void): Promise<string[]> {
  const ext = EXTENSION(file.name);
  if (ext === "pdf") {
    const result = await extractPages(await file.arrayBuffer(), onProgress);
    return result.pages;
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    onProgress(100);
    return splitLongText(result.value);
  }
  if (ext === "pptx") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)/i)?.[1] ?? 0));
    const slides: string[] = [];
    for (let index = 0; index < slideFiles.length; index += 1) {
      const entry = zip.file(slideFiles[index]);
      if (entry) slides.push(xmlText(await entry.async("text")));
      onProgress(Math.round(((index + 1) / Math.max(1, slideFiles.length)) * 100));
    }
    return slides.filter(Boolean);
  }
  if (ext === "xlsx") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheets = workbook.SheetNames.map((name) => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false });
      return `Sheet: ${name}\n${csv}`.trim();
    });
    onProgress(100);
    return sheets.filter((sheet) => sheet.length > 8);
  }
  if (ext === "txt" || ext === "md" || ext === "csv") {
    onProgress(100);
    return splitLongText(await file.text());
  }
  if (ext === "json") {
    const parsed = JSON.parse(await file.text()) as unknown;
    onProgress(100);
    return splitLongText(JSON.stringify(parsed, null, 2));
  }
  if (ext === "html" || ext === "htm") {
    const html = await file.text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    parsed.querySelectorAll("script,style,noscript,svg").forEach((node) => node.remove());
    onProgress(100);
    return splitLongText(parsed.body.innerText || parsed.body.textContent || "");
  }
  if (ext === "rtf") {
    const raw = await file.text();
    const plain = raw.replace(/\\'[\da-f]{2}/gi, " ").replace(/\\[a-z]+-?\d* ?/gi, " ").replace(/[{}]/g, "").replace(/\\\\/g, "\\");
    onProgress(100);
    return splitLongText(plain);
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const result = await worker.recognize(file);
      onProgress(100);
      return splitLongText(result.data.text);
    } finally {
      await worker.terminate();
    }
  }
  throw new Error("This file type isn't supported.");
}

export async function ingestStudyFile(file: File, options: { title?: string; folderId: string | null }): Promise<StudyDocument> {
  const problem = validateStudyFile(file);
  if (problem) throw new Error(problem);
  const doc = createDocument({
    title: options.title?.trim() || titleFromFileName(file.name),
    fileName: file.name,
    mimeType: file.type || undefined,
    sizeBytes: file.size,
    folderId: options.folderId,
  });
  void processDocument(doc.id, file);
  return doc;
}

/** Compatibility wrapper for existing PDF call sites. */
export const ingestPdf = ingestStudyFile;

async function processDocument(docId: string, file: File) {
  try {
    await saveDocumentFile(docId, file);
    const pages = await extractDocument(file, (percent) => updateDocument(docId, { progress: percent }));
    if (!pages.length || pages.every((page) => page.trim().length < 8)) {
      throw new Error("No readable text was found. For scanned PDFs or unclear images, try a sharper scan or a text-based copy.");
    }
    await saveDocumentText(docId, pages);
    const charCount = pages.reduce((sum, page) => sum + page.length, 0);
    updateDocument(docId, { status: "ready", progress: 100, pageCount: pages.length, charCount });
    logActivity("doc_upload", `Uploaded ${file.name}`, `${pages.length} sections`, `/study/${docId}`);
  } catch (error) {
    const message = error instanceof Error && /password/i.test(error.message)
      ? "This PDF is password-protected."
      : error instanceof Error && /quota|full/i.test(error.message)
        ? "Your browser storage is full. Delete some documents and try again."
        : error instanceof Error && error.message.includes("No readable text")
          ? error.message
          : error instanceof Error && /network|fetch/i.test(error.message)
            ? "We couldn't load the file-reading tools. Check your connection and try again."
            : "We couldn't read this file. It may be damaged or use an unsupported format.";
    updateDocument(docId, { status: "error", error: message });
  }
}
