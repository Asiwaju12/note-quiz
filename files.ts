import { extractPdfText, friendlyUploadError } from "./pdf";

export type UploadKind = "pdf" | "docx" | "image" | "text";

export type UploadedFileMeta = {
  name: string;
  kind: UploadKind;
};

export type FileExtraction = {
  text: string;
  files: UploadedFileMeta[];
  title: string;
};

export type ExtractionProgress = {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  label: string;
  percent: number;
};

/** Safe upper ceilings to prevent a browser tab from running out of memory. */
const MAX_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 50;
const CDN = "https://cdn.jsdelivr.net/npm";

const scriptCache = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = scriptCache.get(src);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-rr-src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("loader-unavailable")), { once: true });
      if (existing.dataset.loaded === "true") resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.rrSrc = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("loader-unavailable"));
    document.head.appendChild(script);
  });
  scriptCache.set(src, promise);
  promise.catch(() => scriptCache.delete(src));
  return promise;
}

function extension(file: File): string {
  return (file.name.split(".").pop() || "").toLowerCase();
}

export function kindOfFile(file: File): UploadKind | null {
  const ext = extension(file);
  if (file.type === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || file.type.includes("wordprocessingml")) return "docx";
  if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp", "gif", "heic", "heif"].includes(ext)) return "image";
  if (
    ["txt", "md", "markdown", "csv", "tsv", "json", "rtf", "html", "htm", "xml", "yaml", "yml", "log"].includes(ext) ||
    file.type.startsWith("text/")
  ) {
    return "text";
  }
  return null;
}

function tidy(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1].length > 0))
    .join("\n")
    .trim();
}

type TesseractWorker = {
  recognize: (file: File) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
};

type TesseractGlobal = {
  createWorker: (
    language: string,
    oem?: number,
    options?: { logger?: (message: { status: string; progress: number }) => void },
  ) => Promise<TesseractWorker>;
};

type MammothGlobal = {
  extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
};

function webWindow(): Window & { Tesseract?: TesseractGlobal; mammoth?: MammothGlobal } {
  return window as Window & { Tesseract?: TesseractGlobal; mammoth?: MammothGlobal };
}

async function extractDocx(file: File): Promise<string> {
  await loadScript(`${CDN}/mammoth@1.13.0/mammoth.browser.min.js`);
  const mammoth = webWindow().mammoth;
  if (!mammoth) throw new Error("loader-unavailable");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return tidy(result.value);
}

async function extractImage(file: File): Promise<string> {
  await loadScript(`${CDN}/tesseract.js@7.0.0/dist/tesseract.min.js`);
  const tesseract = webWindow().Tesseract;
  if (!tesseract) throw new Error("loader-unavailable");
  const worker = await tesseract.createWorker("eng", 1);
  try {
    const { data } = await worker.recognize(file);
    return tidy(data.text);
  } finally {
    await worker.terminate();
  }
}

async function extractOne(file: File): Promise<string> {
  const kind = kindOfFile(file);
  if (!kind) throw new Error("unsupported-file");
  if (file.size === 0) throw new Error("empty-file");
  if (file.size > MAX_BYTES) throw new Error("file-too-large");

  if (kind === "pdf") {
    const result = await extractPdfText(file);
    return result.text;
  }
  if (kind === "docx") return extractDocx(file);
  if (kind === "image") return extractImage(file);
  return tidy(await file.text());
}

/**
 * Reads any combination of files quietly on this device.
 * Error details stay internal; the interface only reports upload status.
 */
export async function extractFiles(
  fileList: FileList | File[],
  onProgress?: (progress: ExtractionProgress) => void,
): Promise<FileExtraction> {
  const files = Array.from(fileList).slice(0, MAX_FILES);
  if (files.length === 0) throw new Error("no-files");

  const metas: UploadedFileMeta[] = [];
  const blocks: string[] = [];
  let lastError: unknown = null;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    onProgress?.({
      fileIndex: index + 1,
      fileCount: files.length,
      fileName: file.name,
      label: "Processing",
      percent: Math.round(((index + 0.5) / files.length) * 100),
    });
    try {
      const text = await extractOne(file);
      if (text.replace(/\s/g, "").length < 12) continue;
      blocks.push(text);
      metas.push({ name: file.name, kind: kindOfFile(file) ?? "text" });
    } catch (caught) {
      lastError = caught;
    }
  }

  if (metas.length === 0) {
    throw new Error(friendlyUploadError(lastError));
  }

  return {
    text: blocks.join("\n\n"),
    files: metas,
    title: metas[0].name.replace(/\.[^.]+$/, "").trim() || "Uploaded notes",
  };
}
