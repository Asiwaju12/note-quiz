/** Text utilities shared by retrieval and the offline study generators. */

export const STOPWORDS = new Set(
  `a about above after again against all almost along already also although always am among an and another any are around as at be because been before being below between both but by can could did do does doing done down during each either else enough etc even ever every few for from further get gets got had has have having he her here hers him his how however i if in into is it its itself just least less like made make many may me might more most much must my neither never no nor not now of off often on once one only onto or other others our ours out over own per perhaps rather really same she should since so some such than that the their theirs them themselves then there therefore these they thing things this those though through thus to too toward towards under until up upon us use used uses using very via was we well were what whatever when where whether which while who whom whose why will with within without would yet you your yours also figure fig table page chapter section example examples e.g i.e cannot ensure ensuring ensures include includes including provide provides providing based called known allow allows across able various several within without another important usually often typically however therefore second third following`.split(
    /\s+/,
  ),
);

export function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Splits text into sentences, keeping reasonably sized ones. */
export function splitSentences(text: string): string[] {
  const flat = text
    .replace(/\n(?=[•\-*·]\s)/g, "\n")
    .split(/\n{2,}|\n(?=[•\-*·]\s)|(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((part) => normalizeSpace(part.replace(/^[•\-*·]\s*/, "")))
    .filter(Boolean);
  return flat;
}

/** Very light stemming so "networks"/"network" and "encrypting"/"encrypt" match. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) ?? [])
    .map((token) => token.replace(/['’]s$/, ""))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token))
    .map(stem);
}

export function wordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

/**
 * Joins pages into "[Page N]"-marked text, stopping at a character budget.
 * Used for whole-document AI generation.
 */
export function pageMarkedText(pages: string[], budget: number, pageFilter?: Set<number>): { text: string; truncated: boolean } {
  let text = "";
  let truncated = false;
  for (let index = 0; index < pages.length; index += 1) {
    const pageNumber = index + 1;
    if (pageFilter && !pageFilter.has(pageNumber)) continue;
    const content = pages[index]?.trim();
    if (!content) continue;
    const block = `[Page ${pageNumber}]\n${content}\n\n`;
    if (text.length + block.length > budget) {
      truncated = true;
      const remaining = budget - text.length;
      if (remaining > 400) text += block.slice(0, remaining);
      break;
    }
    text += block;
  }
  return { text: text.trim(), truncated };
}

export function truncateWords(text: string, max: number): string {
  const words = text.split(/\s+/);
  return words.length <= max ? text : `${words.slice(0, max).join(" ")}…`;
}

export function titleCase(text: string): string {
  return text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
