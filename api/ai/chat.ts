import { friendlyAiError, isAiConfigured } from "../../server/ai/provider.js";
import { streamGeminiText } from "../../server/ai/gemini.js";
import { TUTOR_SYSTEM, buildChatUserContent } from "../../server/ai/prompts.js";
import { authorize, clientKey, errorResponse, HttpError, ndjsonStream, rateLimit, readJson } from "../../server/http.js";
import { MAX_CHAT_CONTEXT_CHARS, TUTOR_MODES, type ChatRequest } from "../../src/lib/ai/contract.js";

const MAX_TURNS = 30;
const MAX_MESSAGE_CHARS = 12_000;
function validate(body: ChatRequest): ChatRequest {
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) throw new HttpError(400, "No messages provided.");
  const messages = body.messages.slice(-MAX_TURNS)
    .filter(turn => (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string" && turn.content.trim())
    .map(turn => ({ role: turn.role, content: turn.content.slice(0, MAX_MESSAGE_CHARS) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") throw new HttpError(400, "The last message must be from the student.");
  const mode = TUTOR_MODES.some(item => item.id === body.mode) ? body.mode : undefined;
  let budget = MAX_CHAT_CONTEXT_CHARS;
  const passages = (body.document?.passages ?? [])
    .filter(passage => typeof passage.text === "string" && Number.isFinite(passage.page))
    .filter(passage => { budget -= passage.text.length; return budget >= 0; }).slice(0, 12);
  return { messages, mode, document: body.document ? { title: String(body.document.title ?? "Document").slice(0, 200), passages } : undefined, mistakes: Array.isArray(body.mistakes) ? body.mistakes.slice(0, 10) : undefined };
}
/** POST /api/ai/chat — streams Recall AI tutor replies as NDJSON events. */
export async function POST(request: Request): Promise<Response> {
  if (!isAiConfigured()) return errorResponse(503, "Recall AI isn't connected yet. Add GEMINI_API_KEY to the server environment.", "not_configured");
  let body: ChatRequest;
  try {
    const { userId } = await authorize(request);
    rateLimit(clientKey(request, userId), 30);
    body = validate(await readJson<ChatRequest>(request));
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error.status, error.message);
    return errorResponse(400, "Invalid request.");
  }
  const contents = body.messages.slice(0, -1).map(turn => ({ role: turn.role === "assistant" ? "model" as const : "user" as const, parts: [{ text: turn.content }] }));
  contents.push({ role: "user", parts: [{ text: buildChatUserContent(body) }] });
  return ndjsonStream(async (send, signal) => {
    try {
      await streamGeminiText({ system: TUTOR_SYSTEM, contents, maxOutputTokens: 8192, signal, onText: text => send({ t: "delta", text }) });
      send({ t: "done", stop: "STOP" });
    } catch (error) {
      if (signal.aborted) return;
      console.error("[api/ai/chat]", error);
      send({ t: "error", message: friendlyAiError(error).message });
    }
  }, request.signal);
}
import type { IncomingMessage, ServerResponse } from "node:http";
import { invokeVercelHandler } from "../../server/vercel-adapter.js";
export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await invokeVercelHandler(request, response, POST);
}
