import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";

type RequestWithBody = IncomingMessage & { body?: unknown };
type Limit = { count: number; expiresAt: number };

// Best-effort per-instance throttling; the endpoint also checks same-origin requests.
const attempts = new Map<string, Limit>();
const LIMIT = 8;
const WINDOW_MS = 10 * 60 * 1000;

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

export default async function handler(request: RequestWithBody, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    send(response, 405, { error: "Method not allowed." });
    return;
  }

  const host = request.headers["x-forwarded-host"] || request.headers.host;
  const origin = request.headers.origin;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== String(host).split(",")[0].trim()) {
        send(response, 403, { error: "Request origin not allowed." });
        return;
      }
    } catch {
      send(response, 403, { error: "Invalid request origin." });
      return;
    }
  }

  const forwarded = request.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim()
    || request.socket.remoteAddress
    || "unknown";
  const now = Date.now();
  const limit = attempts.get(ip);
  if (limit && limit.expiresAt > now && limit.count >= LIMIT) {
    send(response, 429, { error: "Too many checks. Please wait a few minutes and try again." });
    return;
  }
  attempts.set(ip, limit && limit.expiresAt > now
    ? { count: limit.count + 1, expiresAt: limit.expiresAt }
    : { count: 1, expiresAt: now + WINDOW_MS });

  const body = request.body as { email?: unknown } | undefined;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    send(response, 400, { error: "Enter a valid email address." });
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    send(response, 503, { error: "Email availability check is not configured." });
    return;
  }

  try {
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const perPage = 1000;
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        send(response, 503, { error: "Could not check this email right now." });
        return;
      }
      const users = data.users || [];
      if (users.some((user) => user.email?.toLowerCase() === email)) {
        send(response, 200, { exists: true });
        return;
      }
      if (users.length < perPage) {
        send(response, 200, { exists: false });
        return;
      }
    }
    send(response, 503, { error: "Email lookup reached its safety limit." });
  } catch {
    send(response, 503, { error: "Could not check this email right now." });
  }
}
