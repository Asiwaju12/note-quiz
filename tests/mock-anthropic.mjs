// Local mock of the Anthropic Messages API (streaming) for testing the AI pipeline without a key. Test-only.
// Minimal mock of POST /v1/messages (streaming) for local pipeline testing only.
import http from "node:http";

const json = {
  summary: { short: "Mock summary of the CIA triad and network defences.", detailed: "Paragraph one (p. 1).\n\nParagraph two (p. 2).", mainIdeas: ["CIA triad"], keyConcepts: ["Confidentiality", "Firewall"], definitions: [{ term: "Firewall", definition: "Filters traffic.", page: 2 }], takeaways: ["Use MFA"] },
  questions: { questions: [
    { type: "mcq", prompt: "Mock: what does a firewall do?", options: ["Filters traffic", "Encrypts disks", "Scans ports", "Signs emails"], answerIndex: 0, answerText: "Filters traffic", explanation: "Firewalls filter traffic (p. 2).", topic: "Network Security", difficulty: "easy", page: 2 },
    { type: "tf", prompt: "Mock: AES is symmetric.", options: ["True", "False"], answerIndex: 0, answerText: "True", explanation: "Same key both ways.", topic: "Cryptography", difficulty: "medium", page: 3 },
    { type: "fill", prompt: "Mock: _____ requires two or more verification factors.", options: [], answerIndex: -1, answerText: "Multi-factor authentication", explanation: "MFA.", topic: "Social Engineering", difficulty: "easy", page: 4 },
  ] },
};

function pickTask(body) {
  const text = JSON.stringify(body.messages);
  if (body.output_config?.format) {
    if (text.includes("Summarise this document")) return JSON.stringify(json.summary);
    if (text.includes("practice questions")) return JSON.stringify(json.questions);
    return JSON.stringify({ markdown: "## Mock notes\n\n- point (p. 1)" });
  }
  const pages = [...text.matchAll(/page=\\"(\d+)\\"/g)].map((m) => m[1]);
  return `**Mock tutor answer.** A firewall filters traffic (p. ${pages[0] ?? 1}). Passages received: ${pages.length}.`;
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      console.log("[mock]", req.method, req.url, "model=", body.model, "effort=", body.output_config?.effort, "fallbacks=", body.fallbacks, "beta=", req.headers["anthropic-beta"]);
      const text = pickTask(body);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send("message_start", { type: "message_start", message: { id: "msg_mock", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
      send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      const chunks = text.match(/.{1,12}/gs) ?? [];
      let i = 0;
      const tick = () => {
        if (i < chunks.length) {
          send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: chunks[i++] } });
          setTimeout(tick, 15);
          return;
        }
        send("content_block_stop", { type: "content_block_stop", index: 0 });
        send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } });
        send("message_stop", { type: "message_stop" });
        res.end();
      };
      tick();
    });
  })
  .listen(4010, () => console.log("mock on 4010"));
