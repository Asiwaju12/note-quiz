import type Anthropic from "@anthropic-ai/sdk";
import { AI_CONFIG, FALLBACK_BETA, friendlyAiError, getClient, isAiConfigured } from "../../server/ai/provider";
import { TUTOR_SYSTEM, buildChatUserContent } from "../../server/ai/prompts";
import { authorize, clientKey, errorResponse, HttpError, ndjsonStream, rateLimit, readJson } from "../../server/http";
import { MAX_CHAT_CONTEXT_CHARS, TUTOR_MODES, type ChatRequest } from "../../src/lib/ai/contract";

const MAX_TURNS = 30;
const MAX_MESSAGE_CHARS = 12_000;

function validate(body: ChatRequest): ChatRequest {
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) throw new HttpError(400, "No messages provided.");
  const messages = body.messages
    .slice(-MAX_TURNS)
    .filter((turn) => (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string" && turn.content.trim())
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_MESSAGE_CHARS) }));
  // The API requires the conversation to start with a user turn.
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") throw new HttpError(400, "The last message must be from the student.");
  const mode = TUTOR_MODES.some((item) => item.id === body.mode) ? body.mode : undefined;
  let budget = MAX_CHAT_CONTEXT_CHARS;
  const passages = (body.document?.passages ?? [])
    .filter((passage) => typeof passage.text === "string" && Number.isFinite(passage.page))
    .filter((passage) => {
      budget -= passage.text.length;
      return budget >= 0;
    })
    .slice(0, 12);
  return {
    messages,
    mode,
    document: body.document ? { title: String(body.document.title ?? "Document").slice(0, 200), passages } : undefined,
    mistakes: Array.isArray(body.mistakes) ? body.mistakes.slice(0, 10) : undefined,
  };
}

/**
 * POST /api/ai/chat — streams a Recall AI tutor reply as NDJSON events.
 * Body: ChatRequest (see src/lib/ai/contract.ts).
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAiConfigured()) {
    return errorResponse(503, "Recall AI isn't connected yet. Add ANTHROPIC_API_KEY on the server to enable it.", "not_configured");
  }
  let body: ChatRequest;
  try {
    const { userId } = await authorize(request);
    rateLimit(clientKey(request, userId), 30);
    body = validate(await readJson<ChatRequest>(request));
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error.status, error.message);
    return errorResponse(400, "Invalid request.");
  }

  const history: Anthropic.Beta.BetaMessageParam[] = body.messages.slice(0, -1).map((turn) => ({ role: turn.role, content: turn.content }));
  history.push({ role: "user", content: buildChatUserContent(body) });

  return ndjsonStream(async (send, signal) => {
    try {
      const stream = getClient().beta.messages.stream(
        {
          model: AI_CONFIG.model,
          max_tokens: 16000,
          system: TUTOR_SYSTEM,
          messages: history,
          output_config: { effort: AI_CONFIG.chatEffort },
          cache_control: { type: "ephemeral" },
          ...(AI_CONFIG.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          send({ t: "delta", text: event.delta.text });
        }
      }
      const final = await stream.finalMessage();
      if (final.content.some((block) => block.type === "fallback")) {
        send({ t: "notice", message: "Answered by a fallback model." });
      }
      if (final.stop_reason === "refusal") {
        send({ t: "error", code: "refusal", message: "Recall AI can't help with that request. Try rephrasing it as a study question." });
        return;
      }
      send({ t: "done", stop: final.stop_reason ?? undefined });
    } catch (error) {
      if (signal.aborted) return;
      console.error("[api/ai/chat]", error);
      const { message } = friendlyAiError(error);
      send({ t: "error", message });
    }
  }, request.signal);
}

import { createVercelHandler } from "../../server/vercel-adapter";

export default createVercelHandler({ POST });
