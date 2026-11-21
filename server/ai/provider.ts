/** Server-only Google Gemini provider configuration. Never import from src/. */
export const AI_CONFIG = {
  get model(): string { return process.env.AI_MODEL?.trim() || "gemini-3.8-flash"; },
  get chatEffort(): string { return process.env.AI_CHAT_EFFORT?.trim() || "medium"; },
  get generateEffort(): string { return process.env.AI_GENERATE_EFFORT?.trim() || "high"; },
};
export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}
export function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  return key;
}
export function friendlyAiError(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : "";
  if (/API key not valid|invalid api key|unauthenticated/i.test(message)) return { status: 502, message: "Google Gemini rejected the server API key. Check GEMINI_API_KEY." };
  if (/permission|not found|unsupported model/i.test(message)) return { status: 502, message: "The configured Gemini model is unavailable to this API key. Check AI_MODEL." };
  if (/quota|resource exhausted|rate limit|429/i.test(message)) return { status: 429, message: "Recall AI is busy right now. Please try again in a moment." };
  if (/too large|token limit|maximum.*token/i.test(message)) return { status: 413, message: "This request is too large for the AI. Try a shorter question or document section." };
  if (/fetch failed|network|timeout/i.test(message)) return { status: 503, message: "Couldn't reach Google Gemini. Please try again." };
  return { status: 502, message: "Google Gemini returned an error. Please try again." };
}
