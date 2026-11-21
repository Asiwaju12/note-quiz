import type { IncomingMessage, ServerResponse } from "node:http";
import type { AiStatus } from "../../src/lib/ai/contract.js";
import { AI_CONFIG, isAiConfigured } from "../../server/ai/provider.js";
/** GET /api/ai/status — reports Gemini configuration without exposing secrets. */
export async function GET(): Promise<Response> {
  const configured = isAiConfigured();
  const body: AiStatus = { configured, provider: "google-gemini", model: configured ? AI_CONFIG.model : null };
  return Response.json(body);
}
export default async function handler(_request: IncomingMessage, response: ServerResponse): Promise<void> {
  const configured = isAiConfigured();
  const body: AiStatus = { configured, provider: "google-gemini", model: configured ? AI_CONFIG.model : null };
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
