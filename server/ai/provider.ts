/** Server-only AI provider configuration. Never import from src/. */
export const AI_CONFIG = {
  get model(): string { return process.env.AI_MODEL?.trim() || "gemini-3.5-flash-lite"; },
  get claudeModel(): string { return process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-5"; },
  get chatEffort(): string { return process.env.AI_CHAT_EFFORT?.trim() || "medium"; },
  get generateEffort(): string { return process.env.AI_GENERATE_EFFORT?.trim() || "high"; },
};
export function hasGemini(): boolean { return Boolean(process.env.GEMINI_API_KEY?.trim()); }
export function hasClaude(): boolean { return Boolean(process.env.ANTHROPIC_API_KEY?.trim()); }
export function isAiConfigured(): boolean { return hasGemini(); }
export function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  return key;
}
export function friendlyAiError(error: unknown): { status: number; message: string; code: string } {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/GenerateRequestsPerDay|RequestsPerDay|free_tier_requests|daily.*quota|quota.*per day|per day.*limit/i.test(message)) {
    return { status: 429, code: "daily_quota", message: "Recall AI has reached Gemini's daily free-tier request limit. You can continue studying with Basic Mode. AI access should return after Google's daily quota resets." };
  }
  if (/GenerateRequestsPerMinute|RequestsPerMinute|requests per minute|per minute.*limit|rate limit|RESOURCE_EXHAUSTED|resource exhausted|429|quota/i.test(message)) {
    return { status: 429, code: "rate_limited", message: "Recall AI has reached Gemini's request limit. Please wait before trying AI again, or continue with Basic Mode." };
  }
  if (/API key not valid|invalid api key|unauthenticated/i.test(message)) return { status: 502, code: "invalid_api_key", message: "Recall AI is temporarily unavailable because its Gemini connection needs attention. Please use Basic Mode for now." };
  if (/permission|not found|unsupported model/i.test(message)) return { status: 502, code: "model_unavailable", message: "Recall AI is temporarily unavailable. Please use Basic Mode for now." };
  if (/too large|token limit|maximum.*token/i.test(message)) return { status: 413, code: "too_large", message: "This request is too large for the AI. Try a shorter question or document section." };
  if (/fetch failed|network|timeout/i.test(message)) return { status: 503, code: "network", message: "Recall AI couldn't connect. Please check your connection and try again, or use Basic Mode." };
  return { status: 502, code: "ai_unavailable", message: "Recall AI couldn't complete that response. Please try again or continue with Basic Mode." };
}
