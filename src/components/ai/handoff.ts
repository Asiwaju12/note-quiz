/** Hands quiz mistakes to Recall AI ("Explain my mistakes") across a navigation. */
export type PendingMistakes = {
  docId?: string;
  title: string;
  mistakes: Array<{ prompt: string; response: string; expected: string }>;
};

const KEY = "recall.pending-mistakes";

export function setPendingMistakes(value: PendingMistakes): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function takePendingMistakes(docId?: string): PendingMistakes | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingMistakes;
    if ((value.docId ?? undefined) !== (docId ?? undefined)) return null;
    sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}
