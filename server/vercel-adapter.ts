import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

type RouteHandler = (request: Request) => Promise<Response>;

/**
 * Adapts the Web Request/Response handlers used by the local Vite API shim
 * to Vercel's Node.js function entry point (default export).
 */
export function createVercelHandler(
  handlers: Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", RouteHandler>>,
) {
  return async (incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> => {
    try {
      const method = (incoming.method ?? "GET").toUpperCase() as keyof typeof handlers;
      const handler = handlers[method];
      if (!handler) {
        outgoing.statusCode = 405;
        outgoing.setHeader("Allow", Object.keys(handlers).join(", "));
        outgoing.end();
        return;
      }

      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
        else if (value !== undefined) headers.set(key, value);
      }

      const init: RequestInit & { duplex?: "half" } = { method, headers };
      if (method !== "GET" && method !== "HEAD") {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        init.body = Buffer.concat(chunks);
        init.duplex = "half";
      }

      const url = new URL(incoming.url ?? "/", `https://${incoming.headers.host ?? "localhost"}`);
      const response = await handler(new Request(url, init));
      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => outgoing.setHeader(key, value));
      if (!response.body) {
        outgoing.end();
        return;
      }
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(outgoing);
    } catch (error) {
      console.error("[recall-api] request failed", error);
      if (!outgoing.headersSent) {
        outgoing.statusCode = 500;
        outgoing.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      outgoing.end(JSON.stringify({ error: "Internal server error" }));
    }
  };
}
