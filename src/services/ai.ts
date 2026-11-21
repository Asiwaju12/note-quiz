/**
 * Browser client for Recall AI. Talks only to our own /api/ai/* routes —
 * API keys stay on the server.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { AiStatus, ChatRequest, GenerateRequest, StreamEvent } from "@/lib/ai/contract";
import { supabaseAuth, isSupabaseConfigured } from "./supabase";

export class AiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

let status: AiStatus | null = null;
let statusPromise: Promise<AiStatus> | null = null;
const listeners = new Set<() => void>();

export async function fetchAiStatus(force = false): Promise<AiStatus> {
  if (statusPromise && !force) return statusPromise;
  statusPromise = fetch("/api/ai/status", { headers: { Accept: "application/json" } })
    .then(async (response) => {
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("json")) throw new Error("unavailable");
      return (await response.json()) as AiStatus;
    })
    .catch(() => ({ configured: false, provider: "anthropic", model: null }) as AiStatus)
    .then((next) => {
      status = next;
      listeners.forEach((listener) => listener());
      return next;
    });
  return statusPromise;
}

/** `null` while loading, then the server's AI status. */
export function useAiStatus(): AiStatus | null {
  useEffect(() => {
    void fetchAiStatus();
  }, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
    () => status,
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {};
  try {
    const session = await supabaseAuth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}

async function openStream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new AiError("Couldn't reach the Recall AI server. Check your connection.", "network");
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    let message = `Recall AI request failed (${response.status}).`;
    let code: string | undefined;
    if (type.includes("json")) {
      const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (payload?.error) message = payload.error;
      code = payload?.code;
    } else if (response.status === 404) {
      message = "The Recall AI server isn't running. Start the app with `npm run dev`, or deploy the /api functions.";
      code = "not_configured";
    }
    if (response.status === 503 && !code) code = "not_configured";
    throw new AiError(message, code);
  }
  if (!response.body) throw new AiError("Empty response from Recall AI.");
  return response;
}

async function* readEvents(response: Response): AsyncGenerator<StreamEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          yield JSON.parse(line) as StreamEvent;
        } catch {
          /* ignore malformed line */
        }
      }
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer) as StreamEvent;
    } catch {
      /* ignore */
    }
  }
}

/** Streams a tutor reply. Calls onDelta with each text chunk; resolves with the full text. */
export async function streamChat(
  request: ChatRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; notice?: string }> {
  const response = await openStream("/api/ai/chat", request, signal);
  let text = "";
  let notice: string | undefined;
  for await (const event of readEvents(response)) {
    if (event.t === "delta") {
      text += event.text;
      onDelta(event.text);
    } else if (event.t === "notice") notice = event.message;
    else if (event.t === "error") throw new AiError(event.message, event.code);
  }
  if (!text.trim()) throw new AiError("Recall AI returned an empty answer. Please try again.");
  return { text, notice };
}

/** Runs a structured generation task and resolves with the parsed JSON result. */
export async function generateWithAi<T>(request: GenerateRequest, signal?: AbortSignal): Promise<T> {
  const response = await openStream("/api/ai/generate", request, signal);
  for await (const event of readEvents(response)) {
    if (event.t === "result") return event.data as T;
    if (event.t === "error") throw new AiError(event.message, event.code);
  }
  throw new AiError("Recall AI didn't return a result. Please try again.");
}
