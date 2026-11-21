import { AI_CONFIG, isAiConfigured } from "../../server/ai/provider";
import { json } from "../../server/http";
import type { AiStatus } from "../../src/lib/ai/contract";

/** GET /api/ai/status — lets the UI show whether Recall AI is connected. Reveals no secrets. */
export async function GET(): Promise<Response> {
  const configured = isAiConfigured();
  const body: AiStatus = { configured, provider: "anthropic", model: configured ? AI_CONFIG.model : null };
  return json(body);
}

import { createVercelHandler } from "../../server/vercel-adapter";

export default createVercelHandler({ GET: () => GET() });
