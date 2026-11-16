import type { Deck, Question } from "./types";
import { shuffle } from "./deck";

export type ParseResult = { ok: true; deck: Deck } | { ok: false; error: string };

const STOPWORDS = new Set(
  `about above after again against almost along already also although always among another answer around because been before being below between both brain called could does doing done down during each even ever every first from further have having here into itself just know last like long made make many more most much must need never next only other once onto over own part same should since some such than that their them then there these they thing think this those through time under until very want were what when where which while who will with within without would your yours learning memory notes remember`.split(
    /\s+/,
  ),
);

const FALLBACK_WORDS = [
  "Hippocampus",
  "Consolidation",
  "Retrieval",
  "Synapse",
  "Myelin",
  "Cortex",
  "Encoding",
  "Neuron",
];

function normalize(line: string): string {
  return line
    .replace(/^\s*(?:[-*•·>]+|\d+[.)])\s*/, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalises display text without imposing a length cap. */
function shorten(text: string): string {
  return text.trim().replace(/^["“”']|["“”']$/g, "");
}

function hashPrompt(prompt: string): string {
  let hash = 0;
  for (let index = 0; index < prompt.length; index += 1) {
    hash = (hash * 31 + prompt.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

function uniquePool(pool: string[], answer: string, limit = 24): string[] {
  const answerKey = answer.trim().toLowerCase();
  const seen = new Set<string>([answerKey]);
  const result: string[] = [];
  for (const item of pool) {
    const value = item.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function makeQuestion(
  prompt: string,
  answer: string,
  distractorPool: string[],
  explanation: string,
  pool: string[],
): Question | null {
  const cleanAnswer = answer.trim();
  if (!cleanAnswer || prompt.length < 8) return null;
  const distractors = uniquePool([...distractorPool, ...pool, ...FALLBACK_WORDS], cleanAnswer);
  if (distractors.length < 3) return null;
  const chosen = distractors.slice(0, 3);
  const options = shuffle([cleanAnswer, ...chosen]);
  return {
    id: `note-${hashPrompt(prompt)}-${Math.random().toString(36).slice(2, 6)}`,
    prompt,
    options,
    answer: options.indexOf(cleanAnswer),
    explanation: shorten(explanation),
    category: "Your notes",
  };
}

type Pair = { term: string; definition: string };

function extractPairs(lines: string[]): { pairs: Pair[]; leftover: string[] } {
  const pairs: Pair[] = [];
  const leftover: string[] = [];
  lines.forEach((raw) => {
    const line = normalize(raw);
    if (!line) return;
    if (line.endsWith("?")) {
      leftover.push(line);
      return;
    }
    const match = line.match(/^([^:—–]{2,400}?)\s*(?::|—|–|\s-\s)\s*(.{6,100000})$/);
    if (match) {
      const term = match[1].replace(/[.\s]+$/, "").trim();
      const definition = match[2].trim();
      if (term.length >= 2 && definition.length >= 6) {
        pairs.push({ term, definition });
        return;
      }
    }
    leftover.push(line);
  });
  return { pairs, leftover };
}

type Fact = { sentence: string; keyword: string; position: number };

function extractFacts(lines: string[]): Fact[] {
  const facts: Fact[] = [];
  lines.forEach((raw) => {
    const line = normalize(raw);
    if (!line) return;
    const sentences = line
      .split(/(?<=[.!?;])\s+/)
      .flatMap((part) => part.split(/\s*;\s*/))
      .map((part) => part.trim())
      .filter(Boolean);
    sentences.forEach((sentence) => {
      const words = sentence.split(/\s+/);
      if (words.length < 5 || sentence.length < 28) return;

      let bestIndex = -1;
      let bestScore = 0;
      words.forEach((word, index) => {
        const token = word.replace(/^[("'“]+|[),.;:!?"'”]+$/g, "");
        if (token.length < 4 || token.length > 24) return;
        if (!/^[A-Za-z0-9][A-Za-z0-9'’-]*$/.test(token)) return;
        if (STOPWORDS.has(token.toLowerCase())) return;
        if (/^\d{1,3}$/.test(token)) return;
        const capitalBonus = index > 0 && /^[A-Z]/.test(token) ? 7 : 0;
        const numberBonus = /\d/.test(token) ? 5 : 0;
        const score = token.length + capitalBonus + numberBonus;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });

      if (bestIndex < 0) return;
      const keyword = words[bestIndex].replace(/^[("'“]+|[),.;:!?"'”]+$/g, "");
      if (!keyword) return;
      facts.push({
        sentence,
        keyword,
        position: bestIndex,
      });
    });
  });
  return facts;
}

/**
 * Turns messy pasted notes into multiple-choice recall questions.
 * Understands explicit Q/A lines, "term: meaning" pairs, and plain factual sentences.
 */
export function parseNotes(raw: string, rawTitle: string): ParseResult {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length < 24) {
    return { ok: false, error: "Add a few more notes first — even one good fact per line is enough." };
  }

  const lines = text.split("\n").map(normalize).filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, error: "I couldn't find any notes in there. Try pasting a few facts." };
  }

  const questions: Question[] = [];
  const usedLines = new Set<number>();
  const answers: string[] = [];
  const pairs: Pair[] = [];

  // Explicit Q + A pairs
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];
    const isQuestion = line.endsWith("?") || /^q(?:uestion)?\s*[:\-]\s*/i.test(line);
    if (!isQuestion || !next) continue;
    if (next.endsWith("?") || /^q(?:uestion)?\s*[:\-]\s*/i.test(next)) continue;
    const answer = next.replace(/^(?:a(?:nswer)?\s*[:\-]\s*)/i, "").trim();
    const prompt = line.replace(/^q(?:uestion)?\s*[:\-]\s*/i, "").trim();
    if (!prompt.endsWith("?")) continue;
    if (answer.length < 1 || answer.length > 120) continue;
    answers.push(shorten(answer));
    usedLines.add(index);
    usedLines.add(index + 1);
    index += 1;
  }

  const remainingForPairs = lines.filter((_, index) => !usedLines.has(index));
  const pairResult = extractPairs(remainingForPairs);
  pairs.push(...pairResult.pairs);
  const factResult = extractFacts(pairResult.leftover);

  const termPool = uniquePool(pairs.map((pair) => shorten(pair.term)), "", 30);
  const definitionPool = uniquePool(pairs.map((pair) => shorten(pair.definition)), "", 30);
  const keywordPool = uniquePool(factResult.map((fact) => fact.keyword), "", 30);
  const genericPool = [...termPool, ...keywordPool, ...answers, ...FALLBACK_WORDS];
  const termOnlyPool = uniquePool([...termPool, ...keywordPool, ...FALLBACK_WORDS], "", 30);
  const keywordPoolForFacts = uniquePool(
    [
      ...factResult.map((fact) => fact.keyword),
      ...definitionPool.slice(0, 10),
      ...termPool.slice(0, 4),
      ...FALLBACK_WORDS,
    ],
    "",
    30,
  );

  // Questions built from explicit Q/A notes
  if (answers.length > 0) {
    const prompts: Array<{ prompt: string; answer: string; explanation: string }> = [];
    lines.forEach((line, index) => {
      if (!usedLines.has(index)) return;
      if (!line.endsWith("?") && !/^q(?:uestion)?\s*[:\-]/i.test(line)) return;
      const prompt = line.replace(/^q(?:uestion)?\s*[:\-]\s*/i, "").trim();
      if (!prompt.endsWith("?")) return;
      const answer = lines[index + 1]?.replace(/^(?:a(?:nswer)?\s*[:\-]\s*)/i, "").trim();
      if (!answer) return;
      prompts.push({
        prompt,
        answer: shorten(answer),
        explanation: `${prompt.replace(/\?$/, "")} — ${answer}`,
      });
    });
    prompts.forEach((item) => {
      const question = makeQuestion(
        item.prompt,
        item.answer,
        answers,
        item.explanation,
        genericPool,
      );
      if (question) questions.push(question);
    });
  }

  // "Term: meaning" pairs become two recall directions
  pairs.forEach((pair) => {
    const term = shorten(pair.term);
    const definition = shorten(pair.definition);
    const toTerm = makeQuestion(
      `Which term matches this note? “${definition}”`,
      term,
      termPool,
      `${pair.term} — ${pair.definition}`,
      genericPool,
    );
    if (toTerm) questions.push(toTerm);
    const toDefinition = makeQuestion(
      `What does “${shorten(pair.term)}” mean in your notes?`,
      definition,
      definitionPool,
      `${pair.term} — ${pair.definition}`,
      [...termOnlyPool, ...FALLBACK_WORDS],
    );
    if (toDefinition) questions.push(toDefinition);
  });

  // Plain facts become fill-in-the-blank recall prompts
  factResult.forEach((fact) => {
    const words = fact.sentence.split(/\s+/);
    const blanked = words
      .map((word, index) => (index === fact.position ? "______" : word))
      .join(" ");
    const question = makeQuestion(
      `Fill the blank: ${blanked}`,
      fact.keyword,
      keywordPoolForFacts,
      fact.sentence,
      genericPool,
    );
    if (question) questions.push(question);
  });

  if (questions.length < 3) {
    return {
      ok: false,
      error:
        "I need a little more to work with. Add at least 3 facts — or write “Term: meaning” pairs, one per line.",
    };
  }

  const seen = new Set<string>();
  const deduped = questions.filter((question) => {
    const key = question.prompt.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length < 3) {
    return {
      ok: false,
      error:
        "Those notes didn't produce enough distinct facts yet. Add a few more lines — or write definitions as “Term: meaning”.",
    };
  }

  const title = rawTitle.trim() || "My notes";
  return {
    ok: true,
    deck: {
      title,
      kind: "notes",
      questions: deduped.map((question, index) => ({
        ...question,
        id: `note-${index}-${hashPrompt(question.prompt)}`,
      })),
    },
  };
}
