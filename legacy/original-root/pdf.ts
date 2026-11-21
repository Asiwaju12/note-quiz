export type PdfExtraction = {
  text: string;
  pages: number;
  filename: string;
};

/** High technical ceiling for browser memory safety — not a content limit. */
const MAX_BYTES = 200 * 1024 * 1024;

function tidyExtractedText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([a-z])-\n([a-z])/gi, "$1$2")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1].length > 0))
    .join("\n")
    .trim();
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 60 });
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

/**
 * Reads a PDF in the background, without user-facing technical steps.
 * Text is gathered page by page with yield points so large documents
 * never freeze the interface. Everything happens on this device.
 */
export async function extractPdfText(file: File): Promise<PdfExtraction> {
  if (file.size === 0) throw new Error("empty-file");
  if (file.size > MAX_BYTES) throw new Error("file-too-large");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) throw new Error("not-a-pdf");

  const [pdfjs, workerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw"),
  ]);

  const workerCode = (workerModule as unknown as { default: string }).default;
  const workerUrl = URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }));
  const worker = new Worker(workerUrl, { type: "module" });
  pdfjs.GlobalWorkerOptions.workerPort = worker;

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const document = await pdfjs.getDocument({
      data,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
    }).promise;

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = "";
      let previousY: number | null = null;
      content.items.forEach((item) => {
        if (!("str" in item)) return;
        const textItem = item as { str: string; transform?: number[]; hasEOL?: boolean };
        const y = textItem.transform?.[5];
        if (previousY !== null && typeof y === "number" && Math.abs(y - previousY) > 4) {
          pageText += "\n";
        } else if (pageText && !pageText.endsWith(" ") && !pageText.endsWith("\n")) {
          pageText += " ";
        }
        pageText += textItem.str;
        if (textItem.hasEOL) pageText += "\n";
        if (typeof y === "number") previousY = y;
      });
      pages.push(pageText);
      page.cleanup();
      if (pageNumber % 3 === 0) await yieldToBrowser();
    }

    await document.destroy();
    const full = tidyExtractedText(pages.join("\n\n"));
    if (full.replace(/\s/g, "").length < 12) throw new Error("no-readable-content");
    return {
      text: full,
      pages: document.numPages,
      filename: file.name.replace(/\.pdf$/i, "").trim(),
    };
  } finally {
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    pdfjs.GlobalWorkerOptions.workerPort = null;
  }
}

/** Message shown to the user contains no technical processing detail. */
export function friendlyUploadError(error: unknown): string {
  if (error instanceof Error && error.message === "file-too-large") {
    return "That file is too large to open right now. Try a smaller file or paste the text.";
  }
  if (error instanceof Error && error.message === "empty-file") {
    return "That file is empty. Try another file or paste the text.";
  }
  return "That file couldn't be read. Try another file or paste the text.";
}
