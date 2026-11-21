/** Small helpers shared by the /api handlers. SERVER ONLY. */

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function errorResponse(status: number, message: string, code?: string): Response {
  return json({ error: message, code }, status);
}

/** Reads a JSON body with a hard size cap so a single request can't exhaust memory. */
export async function readJson<T>(request: Request, maxBytes = 1_500_000): Promise<T> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new HttpError(413, "Request is too large.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request is too large.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Optional request authentication.
 *
 * When AI_REQUIRE_AUTH=true, the request must carry a valid Supabase access
 * token (`Authorization: Bearer <token>`); it is verified against Supabase Auth.
 * Leave it off during local development. Turn it ON before deploying publicly,
 * otherwise anyone who finds the URL can spend your AI credits.
 */
export async function authorize(request: Request): Promise<{ userId: string | null }> {
  if ((process.env.AI_REQUIRE_AUTH ?? "").toLowerCase() !== "true") return { userId: null };
  // Prefer the exact Supabase project/key used by the browser sign-in flow.
  // Legacy server-side SUPABASE_* variables may belong to an older project.
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !key) throw new HttpError(500, "AI_REQUIRE_AUTH is on but Supabase is not configured on the server.");
  if (!token) throw new HttpError(401, "Please sign in to use Recall AI.");
  const response = await fetch(`${url.replace(/\\/$/, "")}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    // Log only the upstream status and safe error code; never log access tokens.
    const authError = await response.json().catch(() => null) as { code?: string; error?: string; msg?: string } | null;
    console.warn("[recall-api] Supabase token validation failed", {
      status: response.status,
      code: authError?.code ?? authError?.error ?? "unknown",
    });
    throw new HttpError(401, "Your session could not be verified. Please sign in again.");
  }
  const user = (await response.json()) as { id?: string };
  return { userId: user.id ?? null };
}

/**
 * Best-effort per-instance rate limiting. Serverless instances don't share
 * memory, so this only blunts bursts; use a shared store (e.g. Upstash/Redis
 * or a Supabase table) for real quotas in production.
 */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit = 30, windowMs = 60_000): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new HttpError(429, "Too many requests. Please slow down for a minute.");
}

export function clientKey(request: Request, userId: string | null): string {
  return userId ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** Newline-delimited JSON stream: one event object per line. */
export function ndjsonStream(
  run: (send: (event: Record<string, unknown>) => void, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await run(send, signal);
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
