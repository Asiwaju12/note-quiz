import type { IncomingMessage, ServerResponse } from "node:http";
import type { AiStatus } from "../../src/lib/ai/contract.js";

/** GET /api/ai/status — reports AI configuration without exposing secrets. */
export async function GET(): Promise<Response> {
  const configured = Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
  const body: AiStatus = {
    configured,
    provider: "anthropic",
    model: configured ? process.env.AI_MODEL?.trim() || "claude-opus-5-5" : null,
  };
  return Response.json(body);
}

/** Vercel Node.js function entry point. */
export default async function handler(_request: IncomingMessage, response: ServerResponse): Promise<void> {
  const configured = Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
  const body: AiStatus = {
    configured,
    provider: "anthropic",
    model: configured ? process.env.AI_MODEL?.trim() || "claude-opus-5-5" : null,
  };
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
