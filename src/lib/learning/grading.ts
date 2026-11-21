import { questionType, type Question } from "@/lib/game/types";
import { tokenize } from "@/lib/study/text";

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = temp;
    }
  }
  return row[b.length];
}

/** Fill-in-the-blank: accepts small typos (about 1 edit per 6 characters). */
export function gradeFill(response: string, expected: string): boolean {
  const a = normalise(response);
  const b = normalise(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  return levenshtein(a, b) <= Math.max(1, Math.floor(b.length / 6));
}

/**
 * Short answers can't be marked exactly without AI. We estimate with keyword
 * overlap against the model answer and always let the student override.
 */
export function estimateShort(response: string, expected: string): { likely: boolean; overlap: number } {
  const want = new Set(tokenize(expected));
  const have = new Set(tokenize(response));
  if (!want.size || !have.size) return { likely: false, overlap: 0 };
  let hits = 0;
  for (const token of want) if (have.has(token)) hits += 1;
  const overlap = hits / want.size;
  return { likely: overlap >= 0.45, overlap };
}

export type Response = { choice?: number; text?: string; selfMark?: boolean };

export function isAnswered(question: Question, response: Response | undefined): boolean {
  if (!response) return false;
  const type = questionType(question);
  if (type === "mcq" || type === "tf") return response.choice !== undefined && response.choice >= 0;
  return Boolean(response.text?.trim());
}

/** Returns whether a response is correct. Short answers use selfMark when given, else the estimate. */
export function grade(question: Question, response: Response | undefined): boolean {
  if (!response) return false;
  const type = questionType(question);
  if (type === "mcq" || type === "tf") return response.choice === question.answer;
  const expected = question.answerText ?? "";
  if (type === "fill") return gradeFill(response.text ?? "", expected);
  if (response.selfMark !== undefined) return response.selfMark;
  return estimateShort(response.text ?? "", expected).likely;
}

export function expectedAnswer(question: Question): string {
  const type = questionType(question);
  if (type === "mcq" || type === "tf") return question.options[question.answer] ?? "";
  return question.answerText ?? "";
}

export function responseText(question: Question, response: Response | undefined): string {
  if (!response) return "";
  const type = questionType(question);
  if (type === "mcq" || type === "tf") return response.choice !== undefined ? (question.options[response.choice] ?? "") : "";
  return response.text ?? "";
}
