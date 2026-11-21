import type { IncomingMessage, ServerResponse } from "node:http";

type RouteHandler = (request: Request) => Promise<Response>;

/** Bridges a Web Request/Response route into Vercel's Node.js request lifecycle. */
export async function invokeVercelHandler(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  routeHandler: RouteHandler,
): Promise<void> {
  try {
    const method = (incoming.method ?? "GET").toUpperCase();
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
      else if (value !== undefined) headers.set(key, value);
    }

    const init: RequestInit = { method, headers };
    if (method !== "GET" && method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      init.body = Buffer.concat(chunks);
    }

    const url = new URL(incoming.url ?? "/", `https://${incoming.headers.host ?? "localhost"}`);
    const response = await routeHandler(new Request(url, init));
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));

    if (!response.body) {
      outgoing.end();
      return;
    }

    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!outgoing.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => outgoing.once("drain", resolve));
        }
      }
    } finally {
      reader.releaseLock();
    }
    outgoing.end();
  } catch (error) {
    console.error("[recall-api] request failed", error);
    if (!outgoing.headersSent) {
      outgoing.statusCode = 500;
      outgoing.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    outgoing.end(JSON.stringify({ error: "Internal server error" }));
  }
}
