/**
 * pdf.js helpers for the Study Centre: page-by-page text extraction (with
 * progress) and rendering a page to canvas + selectable text layer.
 * Everything runs in the browser; documents never leave the device in local mode.
 */
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loads pdf.js once and points it at its worker (served as a separate cached asset). */
export function getPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
      ([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
        return pdfjs;
      },
    );
  }
  return pdfjsPromise;
}

export async function openPdf(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }).promise;
}

function tidy(raw: string): string {
  return raw
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/([a-z])-\n([a-z])/gi, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  let text = "";
  let previousY: number | null = null;
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const y = item.transform?.[5];
    if (previousY !== null && typeof y === "number" && Math.abs(y - previousY) > 4) text += "\n";
    else if (text && !text.endsWith(" ") && !text.endsWith("\n")) text += " ";
    text += item.str;
    if (item.hasEOL) text += "\n";
    if (typeof y === "number") previousY = y;
  }
  return tidy(text);
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Extracts text page by page, reporting progress (0–100). */
export async function extractPages(
  data: ArrayBuffer,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ pages: string[]; pageCount: number }> {
  const doc = await openPdf(data);
  try {
    const pages: string[] = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const page = await doc.getPage(number);
      pages.push(await pageText(page));
      page.cleanup();
      onProgress?.(Math.round((number / doc.numPages) * 100));
      if (number % 4 === 0) await yieldToBrowser();
    }
    return { pages, pageCount: doc.numPages };
  } finally {
    await doc.destroy();
  }
}

export type RenderedPage = { width: number; height: number; cancel: () => void; done: Promise<void> };

/** Renders one page at the given CSS width into a canvas and a selectable text layer. */
export async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  textLayerEl: HTMLDivElement,
  cssWidth: number,
  zoom: number,
): Promise<RenderedPage> {
  const pdfjs = await getPdfjs();
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = (cssWidth / base.width) * zoom;
  const viewport = page.getViewport({ scale });
  const ratio = Math.min(window.devicePixelRatio || 1, 2.5);

  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const context = canvas.getContext("2d")!;
  const task = page.render({
    canvasContext: context,
    viewport,
    transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
  });

  textLayerEl.replaceChildren();
  textLayerEl.style.setProperty("--scale-factor", String(scale));
  const textLayer = new pdfjs.TextLayer({
    textContentSource: page.streamTextContent(),
    container: textLayerEl,
    viewport,
  });

  const done = Promise.all([task.promise, textLayer.render()]).then(() => undefined);
  return {
    width: viewport.width,
    height: viewport.height,
    cancel: () => {
      task.cancel();
      textLayer.cancel();
    },
    done,
  };
}

export function validatePdfFile(file: File, maxBytes = 50 * 1024 * 1024): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Only PDF files can be added to the Study Centre.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > maxBytes) return `That PDF is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  return null;
}
