/**
 * BASIC MODE (offline) study-material generators.
 *
 * These run entirely in the browser using extractive heuristics — sentence
 * scoring, definition patterns and heading detection. They are NOT AI: they
 * only rearrange text that is already in the document. The UI labels their
 * output "Basic mode" and offers AI generation when Recall AI is connected.
 */
import type { GeneratedCard, GeneratedQuestion, QuestionTypeOption } from "@/lib/ai/contract";
import type { GuideData, KeyTermsData, NotesData, SummaryData } from "@/data/models";
import { STOPWORDS, splitSentences, stem, tokenize, truncateWords, wordCount } from "./text";

type Sentence = { text: string; page: number; tokens: string[]; score: number; order: number };
type Definition = { term: string; definition: string; page: number };
type Section = { title: string; startPage: number; endPage: number; sentences: Sentence[]; detected: boolean };

export type Analysis = {
  sentences: Sentence[];
  keywords: Array<{ term: string; weight: number }>;
  definitions: Definition[];
  sections: Section[];
};

const PRONOUN_START = /^(it|this|that|these|those|they|he|she|we|you|there|here|which|what|its|their|our|such|one|each|all|some|another)\b/i;

function isHeading(line: string): boolean {
  const text = line.trim();
  if (text.length < 3 || text.length > 80) return false;
  if (/[.,;:]$/.test(text) || /[!?]$/.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length > 10) return false;
  if (!/[A-Za-z]{3}/.test(text)) return false;
  if (/^(\d+(\.\d+)*|[IVX]+\.|chapter|section|part|unit|lecture|module|topic)\b/i.test(text)) return true;
  if (text === text.toUpperCase() && /[A-Z]{3}/.test(text) && words.length <= 8) return true;
  const capitalised = words.filter((word) => /^[A-Z]/.test(word) || STOPWORDS.has(word.toLowerCase())).length;
  return words.length >= 2 && capitalised === words.length && words.filter((w) => /^[A-Z]/.test(w)).length >= 2;
}

function cleanHeading(text: string): string {
  const clean = text.replace(/^(\d+(\.\d+)*\.?|[IVX]+\.)\s*/, "").trim();
  if (clean === clean.toUpperCase()) return clean.charAt(0) + clean.slice(1).toLowerCase();
  return clean;
}

function detectDefinitions(sentences: Sentence[], pages: string[]): Definition[] {
  const found = new Map<string, Definition>();
  const add = (term: string, definition: string, page: number) => {
    const cleanTerm = term.replace(/^[“"'(]+|[”"')]+$/g, "").replace(/^(the|a|an)\s+/i, "").trim();
    const cleanDef = definition.replace(/\s+/g, " ").trim().replace(/^[,:\-–—]\s*/, "");
    if (cleanTerm.length < 2 || cleanTerm.length > 60 || wordCount(cleanTerm) > 6) return;
    if (PRONOUN_START.test(cleanTerm) || /\d{3,}/.test(cleanTerm)) return;
    if (cleanDef.length < 15 || cleanDef.length > 400) return;
    const key = cleanTerm.toLowerCase();
    if (!found.has(key)) found.set(key, { term: cleanTerm.charAt(0).toUpperCase() + cleanTerm.slice(1), definition: cleanDef.charAt(0).toUpperCase() + cleanDef.slice(1), page });
  };
  // "Term: definition" or "Term – definition" lines.
  pages.forEach((page, index) => {
    for (const line of page.split("\n")) {
      const match = line.trim().match(/^[•\-*·]?\s*([A-Za-z][^:–—]{1,58}?)\s*(?::|–|—|\s-\s)\s*(.{15,400})$/);
      if (match && !/^https?$/i.test(match[1])) add(match[1], match[2], index + 1);
    }
  });
  // "X is/are/refers to/means … " sentences.
  for (const sentence of sentences) {
    const match = sentence.text.match(
      /^([A-Z][A-Za-z0-9’'()\- ]{1,58}?)\s+(?:can be defined as|is defined as|are defined as|is known as|are known as|refers to|is called|are called|consists of|consist of|is made up of|are made up of|includes|include|means|describes|is|are)\s+(?:a|an|the)?\s*(.{12,380})$/,
    );    if (match) add(match[1], `${match[2].replace(/[.;]$/, "")}.`, sentence.page);
  }
  return [...found.values()];
}

/** Analyses a document once; every basic-mode generator builds on this. */
export function analyse(pages: string[]): Analysis {
  const sentences: Sentence[] = [];
  const headingLines: Array<{ text: string; page: number; order: number }> = [];
  let order = 0;
  pages.forEach((pageText, index) => {
    const page = index + 1;
    const bodyLines: string[] = [];
    for (const line of pageText.split("\n")) {
      if (isHeading(line)) {
        headingLines.push({ text: cleanHeading(line), page, order });
        bodyLines.push("\n\n");
      } else bodyLines.push(line);
    }
    for (const text of splitSentences(bodyLines.join("\n"))) {
      const words = wordCount(text);
      if (words < 4 || words > 100 || !/[a-z]/.test(text)) continue;
      sentences.push({ text, page, tokens: tokenize(text), score: 0, order: order++ });
    }
  });

  // TF-IDF across pages for keyword weights.
  const pageTokens = pages.map((page) => tokenize(page));
  const df = new Map<string, number>();
  const tf = new Map<string, number>();
  const surface = new Map<string, Map<string, number>>();
  pageTokens.forEach((tokens) => {
    for (const token of new Set(tokens)) df.set(token, (df.get(token) ?? 0) + 1);
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  });
  for (const raw of pages.join(" ").match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? []) {
    const key = stem(raw.toLowerCase());
    if (!tf.has(key)) continue;
    const forms = surface.get(key) ?? new Map<string, number>();
    forms.set(raw, (forms.get(raw) ?? 0) + 1);
    surface.set(key, forms);
  }
  const N = Math.max(1, pages.length);
  const weight = new Map<string, number>();
  for (const [token, count] of tf) {
    const idf = Math.log(1 + N / (df.get(token) ?? 1));
    weight.set(token, (1 + Math.log(count)) * (N > 1 ? idf : 1));
  }

  for (const sentence of sentences) {
    const unique = new Set(sentence.tokens);
    let sum = 0;
    for (const token of unique) sum += weight.get(token) ?? 0;
    const lengthPenalty = Math.max(1, Math.sqrt(sentence.tokens.length) / 2.2);
    const cue = /\b(important|key|significant|main|therefore|thus|in summary|in conclusion|because|defined|called|known as|results? in|leads? to)\b/i.test(sentence.text) ? 1.25 : 1;
    sentence.score = (sum / lengthPenalty) * cue;
  }

  const definitions = detectDefinitions(sentences, pages);
  const definedStems = new Set(definitions.flatMap((d) => tokenize(d.term)));
  for (const token of definedStems) if (weight.has(token)) weight.set(token, (weight.get(token) ?? 0) * 1.6);
  const keywords = [...weight.entries()]
    .filter(([token]) => token.length > 3 && !/^\d+$/.test(token) && !/(ly|ing)$/.test(token) && (tf.get(token) ?? 0) >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([token, value]) => {
      const forms = surface.get(token);
      const best = forms ? [...forms.entries()].sort((a, b) => b[1] - a[1])[0][0] : token;
      return { term: best, weight: value };
    });


  // Sections: detected headings when there are enough of them, otherwise page groups.
  let sections: Section[] = [];
  const usableHeadings = headingLines.filter((heading, index, all) => index === 0 || heading.text.toLowerCase() !== all[index - 1].text.toLowerCase());
  if (usableHeadings.length >= 2) {
    usableHeadings.forEach((heading, index) => {
      const next = usableHeadings[index + 1];
      const own = sentences.filter((s) => s.order >= heading.order && (!next || s.order < next.order));
      sections.push({
        title: heading.text,
        startPage: heading.page,
        endPage: own.length ? own[own.length - 1].page : heading.page,
        sentences: own,
        detected: true,
      });
    });
    const before = sentences.filter((s) => s.order < usableHeadings[0].order);
    if (before.length >= 3) sections.unshift({ title: "Introduction", startPage: 1, endPage: before[before.length - 1].page, sentences: before, detected: true });
    sections = mergeSmallSections(sections.filter((section) => section.sentences.length > 0));
  }
  if (sections.length < 2) {
    const perGroup = Math.max(1, Math.ceil(pages.length / Math.min(8, Math.max(1, Math.ceil(pages.length / 3)))));
    sections = [];
    for (let start = 1; start <= pages.length; start += perGroup) {
      const end = Math.min(pages.length, start + perGroup - 1);
      const own = sentences.filter((s) => s.page >= start && s.page <= end);
      if (!own.length) continue;
      sections.push({ title: topicTitle(own, start, end), startPage: start, endPage: end, sentences: own, detected: false });
    }
  }
  return { sentences, keywords, definitions, sections: sections.slice(0, 14) };
}

function mergeSmallSections(sections: Section[]): Section[] {
  const out: Section[] = [];
  for (const section of sections) {
    const previous = out[out.length - 1];
    if (previous && (section.sentences.length < 3 || out.length >= 12)) {
      previous.sentences.push(...section.sentences);
      previous.endPage = Math.max(previous.endPage, section.endPage);
    } else out.push({ ...section, sentences: [...section.sentences] });
  }
  return out;
}

function topicTitle(sentences: Sentence[], start: number, end: number): string {
  const counts = new Map<string, number>();
  for (const sentence of sentences) for (const token of sentence.tokens) if (token.length > 4) counts.set(token, (counts.get(token) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([token]) => token);
  const range = start === end ? `Page ${start}` : `Pages ${start}–${end}`;
  return top.length ? `${range}: ${top.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" & ")}` : range;
}

function topSentences(sentences: Sentence[], count: number): Sentence[] {
  const picked: Sentence[] = [];
  for (const sentence of [...sentences].sort((a, b) => b.score - a.score)) {
    if (picked.length >= count) break;
    // Avoid near-duplicates.
    const overlap = picked.some((other) => jaccard(other.tokens, sentence.tokens) > 0.6);
    if (!overlap) picked.push(sentence);
  }
  return picked.sort((a, b) => a.order - b.order);
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const token of setA) if (setB.has(token)) inter += 1;
  return inter / Math.max(1, setA.size + setB.size - inter);
}

export function localSummary(analysis: Analysis): SummaryData {
  const short = topSentences(analysis.sentences, 3).map((s) => s.text).join(" ");
  const detailedSentences = topSentences(analysis.sentences, 12);
  const paragraphs: string[] = [];
  for (let index = 0; index < detailedSentences.length; index += 3) {
    paragraphs.push(detailedSentences.slice(index, index + 3).map((s) => s.text).join(" "));
  }
  const mainIdeas = analysis.sections
    .map((section) => topSentences(section.sentences, 1)[0]?.text)
    .filter((text): text is string => Boolean(text))
    .slice(0, 8)
    .map((text) => truncateWords(text, 40));
  const takeawayPool = analysis.sentences.filter((s) => /\b(important|key|must|should|therefore|thus|in summary|in conclusion|remember|essential)\b/i.test(s.text));
  const takeaways = topSentences(takeawayPool.length >= 3 ? takeawayPool : analysis.sentences, 5).map((s) => truncateWords(s.text, 40));
  return {
    short: short || "This document didn't contain enough readable sentences to summarise.",
    detailed: paragraphs.join("\n\n"),
    mainIdeas,
    keyConcepts: analysis.keywords.slice(0, 12).map((k) => k.term),
    definitions: analysis.definitions.slice(0, 15),
    takeaways,
  };
}

export function localNotes(analysis: Analysis): NotesData {
  const lines: string[] = [];
  for (const section of analysis.sections) {
    lines.push(`## ${section.title}`);
    const sectionDefs = analysis.definitions.filter((d) => d.page >= section.startPage && d.page <= section.endPage).slice(0, 6);
    if (sectionDefs.length) {
      lines.push("", "**Key definitions**", "");
      for (const def of sectionDefs) lines.push(`- **${def.term}** — ${def.definition}`);
    }
    const points = topSentences(section.sentences, Math.min(6, Math.max(2, Math.round(section.sentences.length / 4))));
    if (points.length) {
      lines.push("", "**Key points**", "");
      for (const point of points) lines.push(`- ${point.text}`);
    }
    const range = section.startPage === section.endPage ? `p. ${section.startPage}` : `pp. ${section.startPage}–${section.endPage}`;
    lines.push("", `> Page reference: ${range}`, "");
  }
  return { markdown: lines.join("\n").trim() };
}

export function localKeyTerms(analysis: Analysis): KeyTermsData {
  const terms = analysis.definitions.slice(0, 24).map((def) => {
    const example = analysis.sentences.find(
      (s) => s.text !== def.definition && s.text.toLowerCase().includes(def.term.toLowerCase()) && !s.text.startsWith(def.term),
    );
    return { term: def.term, definition: def.definition, example: example ? truncateWords(example.text, 45) : undefined, page: def.page };
  });
  if (terms.length < 8) {
    const known = new Set(terms.map((t) => t.term.toLowerCase()));
    for (const keyword of analysis.keywords) {
      if (terms.length >= 16) break;
      if (known.has(keyword.term.toLowerCase())) continue;
      const mentions = analysis.sentences.filter((s) => s.text.toLowerCase().includes(keyword.term.toLowerCase()));
      if (!mentions.length) continue;
      const best = [...mentions].sort((a, b) => b.score - a.score)[0];
      terms.push({ term: keyword.term.charAt(0).toUpperCase() + keyword.term.slice(1), definition: truncateWords(best.text, 50), example: undefined, page: best.page });
      known.add(keyword.term.toLowerCase());
    }
  }
  return { terms };
}

export function localGuide(analysis: Analysis): GuideData {
  return {
    topics: analysis.sections.map((section, index) => {
      const words = section.sentences.reduce((sum, s) => sum + wordCount(s.text), 0);
      const pages: number[] = [];
      for (let page = section.startPage; page <= section.endPage; page += 1) pages.push(page);
      const defs = analysis.definitions.filter((d) => d.page >= section.startPage && d.page <= section.endPage).slice(0, 2);
      const objectives = [
        ...defs.map((d) => `Define ${d.term}`),
        ...topSentences(section.sentences, 2 - Math.min(defs.length, 1)).map((s) => `Explain: ${truncateWords(s.text, 14)}`),
      ].slice(0, 3);
      return {
        id: `t${index + 1}`,
        title: section.title,
        summary: truncateWords(topSentences(section.sentences, 1)[0]?.text ?? "", 40),
        pages,
        estimatedMinutes: Math.max(10, Math.min(60, Math.round((words / 120) * 1.5 / 5) * 5 || 10)),
        objectives,
      };
    }),
  };
}

function keywordIn(sentence: Sentence, pool: string[]): string | null {
  const lowered = sentence.text.toLowerCase();
  const candidates = pool.filter((term) => term.length > 3 && new RegExp(`\\b${escapeRe(term.toLowerCase())}\\b`).test(lowered));
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blank(text: string, term: string): string {
  return text.replace(new RegExp(`\\b${escapeRe(term)}\\b`, "i"), "_____");
}

function sectionOf(analysis: Analysis, page: number): string {
  return analysis.sections.find((s) => page >= s.startPage && page <= s.endPage)?.title ?? "General";
}

function shuffled<T>(items: T[], seed = Math.random()): T[] {
  const out = [...items];
  let state = Math.floor(seed * 2 ** 31) || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 48271) % 2147483647;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function localFlashcards(analysis: Analysis, count: number): GeneratedCard[] {
  const cards: GeneratedCard[] = [];
  const seen = new Set<string>();
  const add = (card: GeneratedCard) => {
    const frontKey = card.front.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!frontKey || seen.has(frontKey) || card.front.length > 120 || card.back.length > 350) return;
    seen.add(frontKey);
    cards.push(card);
  };

  // Definition cards use only definition patterns explicitly found in the notes.
  for (const def of analysis.definitions) {
    if (cards.length >= count) break;
    if (!def.term || !def.definition || wordCount(def.definition) < 4) continue;
    add({
      front: `What does ${def.term} mean?`,
      back: def.definition,
      topic: sectionOf(analysis, def.page),
      page: def.page,
    });
  }

  // Fill-in cards are made only from complete source sentences. The chosen
  // term must occur exactly once, otherwise the answer could be visible.
  const terms = analysis.keywords.map((k) => k.term);
  for (const sentence of topSentences(analysis.sentences, count * 5)) {
    if (cards.length >= count) break;
    if (wordCount(sentence.text) < 8 || wordCount(sentence.text) > 45 || /[?？]/.test(sentence.text)) continue;
    const term = keywordIn(sentence, terms);
    if (!term) continue;
    const escaped = escapeRe(term);
    const occurrences = sentence.text.match(new RegExp(`\\\\b${escaped}\\\\b`, "gi")) ?? [];
    if (occurrences.length !== 1) continue;
    const prompt = blank(sentence.text, term);
    if (prompt === sentence.text || prompt.length > 120) continue;
    add({
      front: `Complete the statement: ${prompt}`,
      back: term,
      topic: sectionOf(analysis, sentence.page),
      page: sentence.page,
    });
  }
  return cards.slice(0, count);
}

export function localQuestions(
  analysis: Analysis,
  options: { count: number; types: QuestionTypeOption[]; difficulty: "easy" | "medium" | "hard" | "mixed"; topics?: string[]; excludePrompts?: string[] },
): GeneratedQuestion[] {
  const requestedTypes = options.types.length ? options.types : (["mcq", "tf", "fill", "short"] as QuestionTypeOption[]);
  const types = [...new Set(requestedTypes)];
  const allowFill = types.includes("fill");
  const inTopic = (page: number) => !options.topics?.length || options.topics.includes(sectionOf(analysis, page));
  const defs = shuffled(analysis.definitions.filter((d) => inTopic(d.page)));
  const allTerms = [...new Set([...defs.map((d) => d.term), ...analysis.keywords.map((k) => k.term)])]
    .filter((term) => term.trim().length > 2);
  // Question prompts, headings, labels and fragments are not facts.
  // In particular, never turn "What is X?" into a True/False statement.
  const factualSentences = analysis.sentences.filter((sentence) => {
    const text = sentence.text.trim().replace(/\s+([?!.,;:])/g, "$1");
    const lower = text.toLowerCase();
    if (!inTopic(sentence.page)) return false;
    // Filter questions even when OCR leaves spaces before punctuation or
    // sentence splitting has removed the final question mark.
    if (/[?？]/.test(text) || /^(what|who|when|where|why|how|which|whose|whom|define|list|state|explain|discuss|describe|mention|identify)\b/i.test(text)) return false;
    // Reject question stems even when PDF extraction dropped the question mark.
    if (/^(what|who|when|where|why|how|which|whose|whom)\\s+(?:is|are|was|were|do|does|did|can|could|would|should|will|has|have)\\b/i.test(text)) return false;
    if (/^(?:true\\s+or\\s+false|multiple\\s+choice|question\\s*\\d*)\\b/i.test(text)) return false;
    if (/^(chapter|section|unit|topic|types? of|advantages? of|disadvantages? of|characteristics? of|contents|learning objectives?)\b/i.test(text)) return false;
    if (wordCount(text) < 7 || !/[.!]$/.test(text)) return false;
    // A useful factual statement needs a subject and a predicate; reject
    // fragments, labels and bare headings that OCR sometimes turns into lines.
    if (/^(the following|below are|above are|examples? of|such as|including|and then|or the)\b/i.test(lower)) return false;
    if (!/\b(is|are|was|were|has|have|had|can|could|will|would|should|must|does|do|did|means?|refers?|involves?|includes?|consists?|provides?|produces?|creates?|requires?|allows?|enables?|helps?|uses?|used|known|defined|called|formed|made|found|occurs?|takes?|plays?)\b/i.test(lower)) return false;
    return true;
  });
  const facts = shuffled(topSentences(factualSentences, Math.max(options.count * 16, 60)))
    .map((sentence) => {
      const matching = allTerms
        .filter((term) => new RegExp("\\b" + escapeRe(term.trim()) + "\\b", "i").test(sentence.text))
        .sort((a, b) => {
          const aDefined = defs.some((d) => d.term.toLowerCase() === a.toLowerCase());
          const bDefined = defs.some((d) => d.term.toLowerCase() === b.toLowerCase());
          return Number(bDefined) - Number(aDefined) || b.length - a.length;
        });
      const term = matching[0];
      return term ? { sentence, term } : null;
    })
    .filter((item): item is { sentence: Sentence; term: string } => Boolean(item));
  const difficultyOf = (text: string): "easy" | "medium" | "hard" => {
    const words = wordCount(text);
    return words < 16 ? "easy" : words < 30 ? "medium" : "hard";
  };
  const distractors = (answer: string, pool: string[]) =>
    shuffled([...new Set(pool.filter((item) =>
      item.trim().toLowerCase() !== answer.trim().toLowerCase() &&
      !item.toLowerCase().includes(answer.toLowerCase()) &&
      !answer.toLowerCase().includes(item.toLowerCase()) &&
      tokenize(item).some((token) => token.length > 2),
    ))]).slice(0, 3);

  // Prefer alternatives defined in the same detected section. If that
  // section is too small, fall back to the document's definitions only;
  // unrelated high-frequency keywords make poor answer choices.
  const definitionDistractors = (answer: string, page: number) => {
    const section = sectionOf(analysis, page);
    const sameSection = defs.filter((item) => sectionOf(analysis, item.page) === section).map((item) => item.term);
    const pool = sameSection.length >= 4 ? sameSection : defs.map((item) => item.term);
    return distractors(answer, pool);
  };

  // Balance True/False items: true statements are source-backed, while
  // false ones are created only by swapping clearly distinct definitions.
  const trueStatements = [
    ...facts.map((fact) => ({
      statement: fact.sentence.text,
      explanation: "This statement is taken from the uploaded document.",
      page: fact.sentence.page,
      isTrue: true,
    })),
    ...defs.map((def) => ({
      statement: `${def.term} is defined as ${def.definition}`,
      explanation: `The document defines ${def.term} as ${def.definition}`,
      page: def.page,
      isTrue: true,
    })),
  ];
  const falseStatements: Array<{ statement: string; explanation: string; page: number; isTrue: boolean }> = [];
  for (const left of defs) {
    const right = defs.find((candidate) => {
      if (candidate.term.toLowerCase() === left.term.toLowerCase()) return false;
      const leftTerm = new Set(tokenize(left.term));
      const rightTerm = new Set(tokenize(candidate.term));
      const termOverlap = [...leftTerm].filter((token) => rightTerm.has(token)).length /
        Math.max(1, new Set([...leftTerm, ...rightTerm]).size);
      const leftMeaning = new Set(tokenize(left.definition));
      const rightMeaning = new Set(tokenize(candidate.definition));
      const meaningOverlap = [...leftMeaning].filter((token) => rightMeaning.has(token)).length /
        Math.max(1, new Set([...leftMeaning, ...rightMeaning]).size);
      return termOverlap < 0.25 && meaningOverlap < 0.35 &&
        !candidate.definition.toLowerCase().includes(left.term.toLowerCase()) &&
        !left.definition.toLowerCase().includes(candidate.term.toLowerCase());
    });
    if (right) falseStatements.push({
      statement: `${left.term} is defined as ${right.definition}`,
      explanation: `False. ${left.term} is defined as ${left.definition}`,
      page: left.page,
      isTrue: false,
    });
  }
  const shuffledTrueStatements = shuffled(trueStatements);
  const shuffledFalseStatements = shuffled(falseStatements);
  let trueTfIndex = 0;
  let falseTfIndex = 0;

  const out: GeneratedQuestion[] = [];
  const seen = new Set<string>();
  let defIndex = 0;
  let factIndex = 0;
  let guard = 0;
  while (out.length < options.count && guard < options.count * 20) {
    guard += 1;
    // Advance the type cursor on every attempt, not only when a question is added.
    // Otherwise one unavailable type (e.g. MCQ with too few distractors) blocks all other types.
    const type = types[(guard - 1) % types.length];
    let question: GeneratedQuestion | undefined;

    if (type === "mcq") {
      while (defIndex < defs.length && !question) {
        const def = defs[defIndex++];
        const wrong = definitionDistractors(def.term, def.page);
        if (wrong.length < 3) continue;
        const choices = shuffled([def.term, ...wrong]);
        question = {
          type, prompt: "Which term matches this description? “" + def.definition + "”",
          options: choices, answerIndex: choices.indexOf(def.term), answerText: def.term,
          explanation: def.term + " — " + def.definition, topic: sectionOf(analysis, def.page),
          difficulty: difficultyOf(def.definition), page: def.page,
        };
      }
      // If definition-based choices are unavailable, build a second kind of
      // MCQ from a factual sentence, using only other terms found in this same
      // document. This keeps the requested MCQ format without inventing answers.
      while (!question && factIndex < facts.length) {
        const fact = facts[factIndex++];
        const wrong = definitionDistractors(fact.term, fact.sentence.page);
        if (wrong.length < 3) continue;
        const choices = shuffled([fact.term, ...wrong]);
        question = {
          type, prompt: "According to the document, which term completes this statement? " + blank(fact.sentence.text, fact.term),
          options: choices, answerIndex: choices.indexOf(fact.term), answerText: fact.term,
          explanation: fact.sentence.text, topic: sectionOf(analysis, fact.sentence.page),
          difficulty: difficultyOf(fact.sentence.text), page: fact.sentence.page,
        };
      }
      if (!question && allowFill) {
        const fact = facts[factIndex++];
        if (fact) question = {
          type: "fill", prompt: "Complete the statement from the document: " + blank(fact.sentence.text, fact.term),
          options: [], answerIndex: -1, answerText: fact.term, explanation: fact.sentence.text,
          topic: sectionOf(analysis, fact.sentence.page), difficulty: difficultyOf(fact.sentence.text), page: fact.sentence.page,
        };
      }
    } else if (type === "tf") {
      const falseDue = falseTfIndex < shuffledFalseStatements.length &&
        (falseTfIndex <= trueTfIndex || trueTfIndex >= shuffledTrueStatements.length);
      const candidate = falseDue
        ? shuffledFalseStatements[falseTfIndex++]
        : shuffledTrueStatements[trueTfIndex++];
      const item = candidate ?? (falseTfIndex < shuffledFalseStatements.length
        ? shuffledFalseStatements[falseTfIndex++]
        : shuffledTrueStatements[trueTfIndex++]);
      if (item) {
        const statement = item.statement.trim();
        if (statement && !/[?？]/.test(statement) && wordCount(statement) >= 7) {
          question = {
            type, prompt: "True or false: " + statement, options: ["True", "False"],
            answerIndex: item.isTrue ? 0 : 1, answerText: item.isTrue ? "True" : "False",
            explanation: (item.isTrue ? "True. " : "False. ") + item.explanation,
            topic: sectionOf(analysis, item.page), difficulty: difficultyOf(statement), page: item.page,
          };
        }
      }
    } else if (type === "fill") {
      const fact = facts[factIndex++];
      if (fact) question = {
        type, prompt: "Complete the statement from the document: " + blank(fact.sentence.text, fact.term),
        options: [], answerIndex: -1, answerText: fact.term, explanation: fact.sentence.text,
        topic: sectionOf(analysis, fact.sentence.page), difficulty: difficultyOf(fact.sentence.text), page: fact.sentence.page,
      };
    } else {
      const def = defs[defIndex++];
      if (def) question = {
        type, prompt: "In your own words, what is " + def.term + "?", options: [], answerIndex: -1,
        answerText: def.definition, explanation: "Model answer from page " + def.page + ": " + def.definition,
        topic: sectionOf(analysis, def.page), difficulty: "medium", page: def.page,
      };
      else {
        const fact = facts[factIndex++];
        if (fact) question = {
          type, prompt: "Explain the role of “" + fact.term + "” as described in the document.",
          options: [], answerIndex: -1, answerText: fact.sentence.text,
          explanation: "The document says: " + fact.sentence.text, topic: sectionOf(analysis, fact.sentence.page),
          difficulty: "hard", page: fact.sentence.page,
        };
      }
    }

    if (!question) {
      if (defIndex >= defs.length && factIndex >= facts.length) break;
      continue;
    }
    const key = question.prompt.toLowerCase().replace(/\s+/g, " ").trim();
    const normalisedKey = question.prompt.toLowerCase().replace(/[^a-z0-9]+/gi, " ").trim();
    if ((options.excludePrompts ?? []).some((prompt) => prompt.toLowerCase().replace(/[^a-z0-9]+/gi, " ").trim() === normalisedKey)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(question);
  }

  if (options.difficulty !== "mixed") {
    const matching = out.filter((q) => q.difficulty === options.difficulty);
    const other = out.filter((q) => q.difficulty !== options.difficulty);
    // Prefer the requested level, but do not silently return a tiny quiz when
    // the source text contains only a few questions at that estimated level.
    return [...matching, ...other].slice(0, options.count);
  }
  return out.slice(0, options.count);
}
