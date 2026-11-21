/**
 * AI provider configuration — SERVER ONLY. Never import this from src/.
 *
 * The provider is Anthropic's Claude API via the official SDK. Credentials come
 * from environment variables on the server (`ANTHROPIC_API_KEY`); the browser
 * only ever talks to our own /api routes.
 */
import Anthropic from "@anthropic-ai/sdk";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const AI_CONFIG = {
  get model(): string {
    return process.env.AI_MODEL?.trim() || "claude-opus-5-5";
  },
  /** Effort for interactive tutoring (latency matters). */
  get chatEffort(): Effort {
    return (process.env.AI_CHAT_EFFORT?.trim() as Effort) || "medium";
  },
  /** Effort for study-material generation (quality matters). */
  get generateEffort(): Effort {
    return (process.env.AI_GENERATE_EFFORT?.trim() as Effort) || "high";
  },
  /**
   * Opt out of server-side refusal fallbacks by setting AI_FALLBACKS=off.
   * With fallbacks on, if the primary model declines a request the API retries
   * it on a fallback model inside the same call.
   */
  get fallbacks(): boolean {
    return (process.env.AI_FALLBACKS ?? "on").toLowerCase() !== "off";
  },
};

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
}

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    // Reads ANTHROPIC_API_KEY (and optional ANTHROPIC_BASE_URL) from the environment.
    client = new Anthropic({ maxRetries: 2 });
  }
  return client;
}

export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

/** Maps SDK errors to messages that are safe and useful to show students. */
export function friendlyAiError(error: unknown): { status: number; message: string } {
  if (error instanceof Anthropic.AuthenticationError) {
    return { status: 502, message: "The AI provider rejected the server's API key. Check ANTHROPIC_API_KEY." };
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return { status: 502, message: "This API key doesn't have access to the configured model." };
  }
  if (error instanceof Anthropic.NotFoundError) {
    return { status: 502, message: "The configured AI model was not found. Check AI_MODEL." };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Recall AI is busy right now. Please try again in a moment." };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { status: 400, message: "That request was too large or malformed for the AI. Try a shorter question or section." };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 503, message: "Couldn't reach the AI provider. Check the server's network connection." };
  }
  if (error instanceof Anthropic.APIError) {
    return { status: 502, message: "The AI provider returned an error. Please try again." };
  }
  return { status: 500, message: "Something went wrong while talking to the AI." };
}
