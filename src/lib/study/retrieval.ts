/**
 * Retrieval for document-aware AI (the "R" in RAG).
 *
 * Today: chunks are scored in the browser with BM25 (lexical search), which
 * needs no API keys and works offline. The interface is deliberately the same
 * shape a vector search returns, so when Supabase + pgvector are connected the
 * `retrieve` implementation can call the `match_document_chunks` RPC
 * (docs/SUPABASE_SCHEMA.sql) with an embedding of the query instead.
 */
import type { ContextPassage } from "@/lib/ai/contract";
import { splitSentences, tokenize } from "./text";

export type Chunk = { id: string; page: number; text: string; tokens: string[] };

const TARGET_CHARS = 1100;

/** Splits pages into ~1,100-character chunks on sentence boundaries, with one sentence of overlap. */
export function chunkPages(pages: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  pages.forEach((pageText, index) => {
    const sentences = splitSentences(pageText);
    let current: string[] = [];
    let length = 0;
    const flush = () => {
      if (!current.length) return;
      const text = current.join(" ");
      chunks.push({ id: `p${index + 1}-c${chunks.length}`, page: index + 1, text, tokens: tokenize(text) });
    };
    for (const sentence of sentences) {
      if (length + sentence.length > TARGET_CHARS && current.length) {
        flush();
        const overlap = current[current.length - 1];
        current = overlap.length < 300 ? [overlap] : [];
        length = current.reduce((sum, item) => sum + item.length, 0);
      }
      current.push(sentence);
      length += sentence.length + 1;
    }
    flush();
  });
  return chunks;
}

type Index = { chunks: Chunk[]; df: Map<string, number>; avgLength: number };
const indexCache = new Map<string, Index>();

function buildIndex(chunks: Chunk[]): Index {
  const df = new Map<string, number>();
  let total = 0;
  for (const chunk of chunks) {
    total += chunk.tokens.length;
    for (const token of new Set(chunk.tokens)) df.set(token, (df.get(token) ?? 0) + 1);
  }
  return { chunks, df, avgLength: chunks.length ? total / chunks.length : 1 };
}

export function getIndex(docId: string, pages: string[]): Index {
  const cached = indexCache.get(docId);
  if (cached) return cached;
  const index = buildIndex(chunkPages(pages));
  indexCache.set(docId, index);
  return index;
}

export function forgetIndex(docId: string): void {
  indexCache.delete(docId);
}

/** BM25 scoring (k1 = 1.4, b = 0.75). */
export function search(index: Index, query: string, limit = 6): Array<Chunk & { score: number }> {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || !index.chunks.length) return [];
  const N = index.chunks.length;
  const k1 = 1.4;
  const b = 0.75;
  const scored = index.chunks.map((chunk) => {
    const tf = new Map<string, number>();
    for (const token of chunk.tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    let score = 0;
    for (const term of terms) {
      const f = tf.get(term);
      if (!f) continue;
      const n = index.df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * chunk.tokens.length) / index.avgLength)));
    }
    return { ...chunk, score };
  });
  return scored
    .filter((chunk) => chunk.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, limit);
}

/**
 * Retrieves passages for a question. The previous user turn is blended in so
 * follow-ups like "give me an example" still find the right section.
 * When `currentPage` is given, that page is included as weak context.
 */
export function retrieve(
  docId: string,
  pages: string[],
  query: string,
  options: { previousQuery?: string; currentPage?: number; limit?: number } = {},
): ContextPassage[] {
  const index = getIndex(docId, pages);
  const limit = options.limit ?? 6;
  let results = search(index, query, limit);
  if (results.length < 3 && options.previousQuery) {
    const extra = search(index, `${options.previousQuery} ${query}`, limit);
    const seen = new Set(results.map((item) => item.id));
    results = [...results, ...extra.filter((item) => !seen.has(item.id))].slice(0, limit);
  }
  const passages = results.map((chunk) => ({ page: chunk.page, text: chunk.text }));
  if (options.currentPage && !passages.some((passage) => passage.page === options.currentPage)) {
    const pageChunk = index.chunks.find((chunk) => chunk.page === options.currentPage);
    if (pageChunk && passages.length < limit + 1) passages.push({ page: pageChunk.page, text: pageChunk.text });
  }
  return passages.sort((a, b) => a.page - b.page);
}
