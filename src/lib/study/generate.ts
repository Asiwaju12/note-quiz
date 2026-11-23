/**
 * Study-material generation orchestrator. Chooses Recall AI (server) when it is
 * connected, or the offline basic-mode generators otherwise, and normalises
 * results into app models.
 */
import { generateWithAi } from "@/services/ai";
import { MAX_GENERATE_CHARS, type GeneratedCard, type GeneratedQuestion, type QuestionTypeOption } from "@/lib/ai/contract";
import type { Question } from "@/lib/game/types";
import type { ArtifactDataMap, ArtifactKind, ArtifactSource, GuideData, StudyDocument } from "@/data/models";
import { getDocumentText, saveArtifact } from "@/data/repos";
import { analyse, localFlashcards, localGuide, localKeyTerms, localNotes, localQuestions, localSummary, type Analysis } from "./local";
import { pageMarkedText } from "./text";

const analysisCache = new Map<string, Analysis>();

async function pagesFor(docId: string): Promise<string[]> {
  const text = await getDocumentText(docId);
  if (!text || !text.pages.some((page) => page.trim())) {
    throw new Error("This document has no readable text. If it's a scanned PDF, it needs OCR before it can be studied.");
  }
  return text.pages;
}

async function analysisFor(docId: string): Promise<Analysis> {
  const cached = analysisCache.get(docId);
  if (cached) return cached;
  const result = analyse(await pagesFor(docId));
  analysisCache.set(docId, result);
  return result;
}

async function aiDocument(doc: StudyDocument, pageFilter?: Set<number>) {
  const pages = await pagesFor(doc.id);
  const { text, truncated } = pageMarkedText(pages, MAX_GENERATE_CHARS, pageFilter);
  return { title: doc.title, text, truncated };
}

function clampPage(page: number | undefined, pageCount: number): number | undefined {
  return page && page >= 1 && page <= pageCount ? page : undefined;
}

export async function generateArtifact<K extends ArtifactKind>(
  doc: StudyDocument,
  kind: K,
  source: ArtifactSource,
  signal?: AbortSignal,
): Promise<ArtifactDataMap[K]> {
  let data: ArtifactDataMap[K];
  let truncated = false;
  if (source === "ai") {
    const document = await aiDocument(doc);
    truncated = document.truncated;
    const raw = await generateWithAi<ArtifactDataMap[K]>({ task: kind, document }, signal);
    data = sanitize(kind, raw, doc.pageCount);
  } else {
    const analysis = await analysisFor(doc.id);
    const builders = { summary: localSummary, notes: localNotes, keyTerms: localKeyTerms, guide: localGuide };
    data = builders[kind](analysis) as ArtifactDataMap[K];
  }
  saveArtifact(doc.id, kind, data, source, truncated);
  return data;
}

function sanitize<K extends ArtifactKind>(kind: K, raw: ArtifactDataMap[K], pageCount: number): ArtifactDataMap[K] {
  if (kind === "guide") {
    const guide = raw as GuideData;
    return {
      topics: guide.topics.map((topic, index) => ({
        ...topic,
        id: `t${index + 1}`,
        pages: topic.pages.filter((page) => page >= 1 && page <= pageCount),
        estimatedMinutes: Math.max(5, Math.min(120, topic.estimatedMinutes || 15)),
      })),
    } as ArtifactDataMap[K];
  }
  if (kind === "summary") {
    const summary = raw as ArtifactDataMap["summary"];
    return { ...summary, definitions: summary.definitions.map((d) => ({ ...d, page: clampPage(d.page, pageCount) })) } as ArtifactDataMap[K];
  }
  if (kind === "keyTerms") {
    const terms = raw as ArtifactDataMap["keyTerms"];
    return { terms: terms.terms.map((t) => ({ ...t, page: clampPage(t.page, pageCount), example: t.example || undefined })) } as ArtifactDataMap[K];
  }
  return raw;
}

export type QuestionOptions = {
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  types: QuestionTypeOption[];
  topics?: string[];
  /** Restrict to these pages (e.g. a study-guide topic). */
  pages?: number[];
  /** Prompts the learner has already practised; prefer unseen questions. */
  excludePrompts?: string[];
};

export function toQuestion(item: GeneratedQuestion, index: number, prefix: string, pageCount: number): Question | null {
  const type = item.type;
  const prompt = item.prompt?.trim();
  if (!prompt) return null;
  let options = (item.options ?? []).map((option) => String(option).trim()).filter(Boolean);
  let answer = Number.isInteger(item.answerIndex) ? item.answerIndex : -1;
  if (type === "tf") {
    options = ["True", "False"];
    if (answer !== 0 && answer !== 1) answer = /^t/i.test(item.answerText ?? "") ? 0 : 1;
  }
  if (type === "mcq" && (options.length < 2 || answer < 0 || answer >= options.length)) return null;
  if ((type === "short" || type === "fill") && !item.answerText?.trim()) return null;
  return {
    id: `${prefix}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    prompt,
    options: type === "short" || type === "fill" ? [] : options,
    answer: type === "short" || type === "fill" ? -1 : answer,
    answerText: item.answerText?.trim() || options[answer],
    explanation: item.explanation?.trim() || "",
    category: item.topic?.trim() || "General",
    topic: item.topic?.trim() || "General",
    difficulty: item.difficulty,
    sourcePage: clampPage(item.page, pageCount),
  };
}

export async function generateQuestions(
  doc: StudyDocument,
  options: QuestionOptions,
  source: ArtifactSource,
  signal?: AbortSignal,
): Promise<Question[]> {
  let items: GeneratedQuestion[];
  if (source === "ai") {
    const document = await aiDocument(doc, options.pages ? new Set(options.pages) : undefined);
    const result = await generateWithAi<{ questions: GeneratedQuestion[] }>(
      { task: "questions", document, options: { count: options.count, difficulty: options.difficulty, types: options.types, topics: options.topics, excludePrompts: options.excludePrompts } },
      signal,
    );
    items = result.questions;
  } else {
    let analysis = await analysisFor(doc.id);
    if (options.pages?.length) {
      const allowed = new Set(options.pages);
      const pages = (await pagesFor(doc.id)).map((page, index) => (allowed.has(index + 1) ? page : ""));
      analysis = analyse(pages);
    }
    items = localQuestions(analysis, options);
  }
  const excluded = new Set((options.excludePrompts ?? []).map((prompt) => prompt.toLowerCase().replace(/[^a-z0-9]+/gi, " ").trim()));
  const questions = items
    .map((item, index) => toQuestion(item, index, doc.id, doc.pageCount))
    .filter((q): q is Question => Boolean(q))
    .filter((q) => !excluded.has(q.prompt.toLowerCase().replace(/[^a-z0-9]+/gi, " ").trim()))
    .slice(0, options.count);
  if (!questions.length) {
    throw new Error(
      source === "local"
        ? "Basic mode couldn't build questions from the readable text in this document. Try selecting more pages, or check whether the PDF contains selectable text rather than scanned images."
        : "No usable questions were generated. Please try again.",
    );
  }
  return questions;
}

const FLASHCARD_STOP_WORDS = new Set(["the", "and", "for", "with", "from", "that", "this", "are", "was", "were", "has", "have", "had", "its", "their", "they", "them", "into", "than", "then", "when", "where", "what", "which", "who", "how", "why", "can", "may", "will", "would", "should", "could", "does", "did", "not", "but", "also", "such", "used", "use", "using", "more", "most", "some", "each", "other", "these", "those", "being", "been", "between", "through", "about", "over", "under", "within", "without", "because", "there", "therefore", "itself"]);

function contentTokens(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[a-z0-9]+(?:[.'-][a-z0-9]+)*/g) ?? [])
    .map((token) => token.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter((token) => token.length > 1 && !FLASHCARD_STOP_WORDS.has(token)))];
}

function sourceSupportsAnswer(answer: string, sourceText: string): boolean {
  const answerTokens = contentTokens(answer);
  if (!answerTokens.length || !sourceText.trim()) return false;
  const sourceTokens = new Set(contentTokens(sourceText));
  const matched = answerTokens.filter((token) => sourceTokens.has(token));
  const coverage = matched.length / answerTokens.length;
  // Very short answers must match exactly; longer paraphrases need strong
  // coverage of their meaningful terms rather than just two shared words.
  if (answerTokens.length <= 2) return matched.length === answerTokens.length;
  if (matched.length < 3 || coverage < 0.68) return false;
  // Preserve numbers, dates, measurements and formula values exactly.
  const numbers = answer.match(/\\b\\d+(?:[.,]\\d+)?%?\\b/g) ?? [];
  const sourceNumbers = new Set(sourceText.match(/\\b\\d+(?:[.,]\\d+)?%?\\b/g) ?? []);
  return numbers.every((number) => sourceNumbers.has(number));
}

function similarFront(a: string, b: string): boolean {
  const left = new Set(contentTokens(a));
  const right = new Set(contentTokens(b));
  if (!left.size || !right.size) return false;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection) >= 0.78;
}

function flashcardPageText(documentText: string, page: number): string {
  if (!page) return documentText;
  const marker = `[Page ${page}]`;
  const start = documentText.indexOf(marker);
  if (start < 0) return documentText;
  const contentStart = start + marker.length;
  const nextPage = documentText.indexOf("[Page ", contentStart);
  return documentText.slice(contentStart, nextPage < 0 ? undefined : nextPage);
}

export async function generateCards(doc: StudyDocument, count: number, source: ArtifactSource, signal?: AbortSignal): Promise<GeneratedCard[]> {
  if (source === "ai") {
    const document = await aiDocument(doc);
    const result = await generateWithAi<{ cards: GeneratedCard[] }>({ task: "flashcards", document, options: { count } }, signal);
    const seen = new Set<string>();
    const cards = (result.cards ?? []).filter((card) => {
      const front = card.front?.trim() ?? "";
      const back = card.back?.trim() ?? "";
      if (!front || !back || front.length > 120 || back.length > 350) return false;
      const key = front.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!key || seen.has(key)) return false;
      if ([...seen].some((existing) => similarFront(existing, key))) return false;
      const page = clampPage(card.page, doc.pageCount) ?? 0;
      const pageText = flashcardPageText(document.text, page);
      if (!sourceSupportsAnswer(back, pageText)) return false;
      // A claimed page must independently support the answer. Page 0 means
      // the model could not identify a page, so check the complete source.
      if (page > 0 && !sourceSupportsAnswer(back, pageText)) return false;
      seen.add(key);
      return true;
    }).slice(0, count).map((card) => ({ ...card, front: card.front.trim(), back: card.back.trim(), topic: card.topic?.trim() || "General", page: clampPage(card.page, doc.pageCount) ?? 0 }));
    if (!cards.length) throw new Error("Recall AI couldn't verify enough flashcard answers against the uploaded notes. Try Basic Mode or select a clearer section of the document.");
    return cards;
  }
  const cards = localFlashcards(await analysisFor(doc.id), count);
  if (!cards.length) throw new Error("Basic mode couldn't find enough readable text to create flashcards. Check whether the PDF contains selectable text rather than scanned images.");
  return cards;
}

export function forgetAnalysis(docId: string): void {
  analysisCache.delete(docId);
}
