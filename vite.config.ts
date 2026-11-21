import path from "path";
import { fileURLToPath } from "url";
import type { IncomingMessage, ServerResponse } from "http";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Serves the serverless handlers in /api during `npm run dev`, so the AI
 * features behave locally exactly as they will on a serverless host
 * (Vercel-style `export async function POST(request: Request)` handlers).
 * Server-only secrets (e.g. ANTHROPIC_API_KEY) are read from .env.local into
 * process.env here and are never exposed to the browser bundle.
 */
function localApi(): Plugin {
  return {
    name: "recall-local-api",
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith("VITE_") && process.env[key] === undefined) process.env[key] = value;
      }
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) return next();
        const route = url.pathname.replace(/^\/api\//, "").replace(/[^a-z0-9/_-]/gi, "");
        let mod: Record<string, unknown>;
        try {
          mod = await server.ssrLoadModule(`/api/${route}.ts`);
        } catch {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }
        const handler = mod[req.method ?? "GET"] as ((request: Request) => Promise<Response>) | undefined;
        if (typeof handler !== "function") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
        }
        const controller = new AbortController();
        res.on("close", () => controller.abort());
        const request = new Request(url, {
          method: req.method,
          headers,
          body: chunks.length && req.method !== "GET" ? Buffer.concat(chunks) : undefined,
          signal: controller.signal,
        });
        try {
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          if (!response.body) return void res.end();
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } catch (error) {
          console.error("[api]", error);
          if (!res.headersSent) res.statusCode = 500;
          res.end();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localApi()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
