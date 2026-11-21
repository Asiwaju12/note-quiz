/** Minimal server-only Google Gemini REST client. */
import { AI_CONFIG, getApiKey } from "./provider.js";

type GeminiPart = { text?: string };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type GeminiResponse = { candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>; error?: { message?: string } };

function schemaForGemini(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaForGemini);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (key === "type" && typeof child === "string") result[key] = child.toUpperCase();
    else if (key !== "additionalProperties") result[key] = schemaForGemini(child);
  }
  return result;
}

async function requestGemini(method: "generateContent" | "streamGenerateContent", body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const model = encodeURIComponent(AI_CONFIG.model);
  const stream = method === "streamGenerateContent";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}${stream ? "?alt=sse" : ""}`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": getApiKey() }, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini HTTP ${response.status}: ${detail.slice(0, 1200)}`);
  }
  return response;
}

export async function streamGeminiText(args: { system: string; contents: GeminiContent[]; maxOutputTokens: number; signal: AbortSignal; onText: (text: string) => void }): Promise<string> {
  const response = await requestGemini("streamGenerateContent", {
    systemInstruction: { parts: [{ text: args.system }] }, contents: args.contents,
    generationConfig: { maxOutputTokens: args.maxOutputTokens, temperature: 0.4 },
  }, args.signal);
  if (!response.body) throw new Error("Gemini returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", combined = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        const parsed = JSON.parse(payload) as GeminiResponse;
        const text = parsed.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("") ?? "";
        if (text) { combined += text; args.onText(text); }
      }
    }
  } finally { reader.releaseLock(); }
  return combined;
}

export async function generateGeminiJson(args: { system: string; prompt: string; schema: Record<string, unknown>; maxOutputTokens: number; signal: AbortSignal }): Promise<{ text: string; finishReason?: string }> {
  const response = await requestGemini("generateContent", {
    systemInstruction: { parts: [{ text: args.system }] },
    contents: [{ role: "user", parts: [{ text: args.prompt }] }],
    generationConfig: { maxOutputTokens: args.maxOutputTokens, responseMimeType: "application/json", responseSchema: schemaForGemini(args.schema), temperature: 0.2 },
  }, args.signal);
  const data = await response.json() as GeminiResponse;
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map(part => part.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned no structured content.");
  return { text, finishReason: candidate?.finishReason };
}
