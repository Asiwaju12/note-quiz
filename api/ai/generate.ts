import { AI_CONFIG, FALLBACK_BETA, friendlyAiError, getClient, isAiConfigured } from "../../server/ai/provider";
import { GENERATE_SYSTEM, SCHEMAS, buildGenerateUserContent } from "../../server/ai/prompts";
import { authorize, clientKey, errorResponse, HttpError, ndjsonStream, rateLimit, readJson } from "../../server/http";
import { MAX_GENERATE_CHARS, type GenerateRequest, type GenerateTask } from "../../src/lib/ai/contract";

const TASKS: GenerateTask[] = ["summary", "notes", "keyTerms", "guide", "flashcards", "questions", "plan"];

function validate(body: GenerateRequest): GenerateRequest {
  if (!body || !TASKS.includes(body.task)) throw new HttpError(400, "Unknown generation task.");
  if (body.task !== "plan") {
    if (!body.document || typeof body.document.text !== "string" || body.document.text.trim().length < 40) {
      throw new HttpError(400, "There isn't enough document text to work with.");
    }
    if (body.document.text.length > MAX_GENERATE_CHARS) {
      // The client already trims to this budget; refuse rather than silently cut more.
      throw new HttpError(413, "This document section is too long to process in one request.");
    }
  } else if (!body.options?.plan) {
    throw new HttpError(400, "Plan details are missing.");
  }
  return body;
}

/**
 * POST /api/ai/generate — generates structured study material (JSON) from document text.
 * Streams NDJSON: periodic {t:"ping"} keep-alives, then {t:"result", data} or {t:"error"}.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAiConfigured()) {
    return errorResponse(503, "Recall AI isn't connected yet. Add ANTHROPIC_API_KEY on the server to enable it.", "not_configured");
  }
  let body: GenerateRequest;
  try {
    const { userId } = await authorize(request);
    rateLimit(clientKey(request, userId), 12);
    body = validate(await readJson<GenerateRequest>(request, 1_200_000));
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error.status, error.message);
    return errorResponse(400, "Invalid request.");
  }

  return ndjsonStream(async (send, signal) => {
    const keepAlive = setInterval(() => send({ t: "ping" }), 5000);
    try {
      const stream = getClient().beta.messages.stream(
        {
          model: AI_CONFIG.model,
          max_tokens: 64000,
          system: GENERATE_SYSTEM,
          messages: [{ role: "user", content: buildGenerateUserContent(body) }],
          output_config: { effort: AI_CONFIG.generateEffort, format: { type: "json_schema", schema: SCHEMAS[body.task] } },
          ...(AI_CONFIG.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
        },
        { signal },
      );
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        send({ t: "error", code: "refusal", message: "The AI declined to process this document." });
        return;
      }
      if (final.stop_reason === "max_tokens") {
        send({ t: "error", code: "too_long", message: "The output was too long. Try a smaller section or fewer items." });
        return;
      }
      const text = final.content.map((block) => (block.type === "text" ? block.text : "")).join("");
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        send({ t: "error", message: "The AI returned an unreadable result. Please try again." });
        return;
      }
      send({ t: "result", data });
      send({ t: "done", stop: final.stop_reason ?? undefined });
    } catch (error) {
      if (signal.aborted) return;
      console.error("[api/ai/generate]", error);
      send({ t: "error", message: friendlyAiError(error).message });
    } finally {
      clearInterval(keepAlive);
    }
  }, request.signal);
}
