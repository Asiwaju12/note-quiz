/** Prompts and output schemas for Recall AI. SERVER ONLY. */
import type { ChatRequest, GenerateRequest, GenerateTask, TutorMode } from "../../src/lib/ai/contract.js";

export const TUTOR_SYSTEM = `You are Recall AI, a patient, encouraging study tutor inside the Recall Quiz study app. Students use you to understand their course material and prepare for exams.

How you teach:
- Be accurate first. If you are not sure, say so rather than guessing.
- Match the student's level. Prefer short paragraphs, concrete examples and plain language; define jargon the first time you use it.
- Use Markdown: short headings or bold lead-ins when helpful, bullet lists for steps or comparisons, and LaTeX-free maths written in plain text.
- When you quiz the student, ask one question at a time unless they ask for a set, and wait for their answer before revealing solutions.
- End substantial explanations with one short follow-up suggestion (e.g. a check-your-understanding question).

Working with the student's documents:
- Sometimes the user turn includes <document_context> with numbered passages from the student's uploaded document, each tagged with its page.
- When the passages answer the question, base your answer on them and cite pages inline like (p. 12). Never cite a page you were not given.
- If the passages do not contain the answer, say clearly "Your document doesn't seem to cover this" before answering from general knowledge, and label that part **General knowledge**.
- Never claim something is in the document when it is not, and never invent quotes.

Keep answers focused: usually under 350 words unless the student asks for depth or full notes.`;

const MODE_INSTRUCTIONS: Record<TutorMode, string> = {
  explain: "Explain the topic simply and clearly, with one concrete example.",
  beginner: "Explain as if to a complete beginner: no assumed background, everyday analogies, build up step by step.",
  examples: "Focus on 2–4 real-world examples or applications, each explained briefly.",
  test: "Act as an examiner: ask the student ONE question on this topic and wait for their answer. Do not give the answer yet.",
  summarise: "Give a concise summary: a one-sentence overview, then the key points as bullets.",
  harder: "Give 3 challenging, exam-style questions that require reasoning or application, not recall. Put the answers under a final 'Answers' heading.",
  mistakes:
    "Look at the student's incorrect answers below. For each one, explain the misconception, why the correct answer is right, and a tip to remember it.",
  notes: "Write well-structured revision notes in Markdown with headings, definitions, key points and a short 'Remember' list.",
};

export function buildChatUserContent(request: ChatRequest): string {
  const last = request.messages[request.messages.length - 1]?.content ?? "";
  const parts: string[] = [];
  if (request.document && request.document.passages.length) {
    const passages = request.document.passages
      .map((passage, index) => `<passage index="${index + 1}" page="${passage.page}">\n${passage.text}\n</passage>`)
      .join("\n");
    parts.push(`<document_context title="${escapeAttr(request.document.title)}">\n${passages}\n</document_context>`);
  } else if (request.document) {
    parts.push(
      `<document_context title="${escapeAttr(request.document.title)}">No passages matched this question.</document_context>`,
    );
  }
  if (request.mode === "mistakes" && request.mistakes?.length) {
    const mistakes = request.mistakes
      .slice(0, 10)
      .map((item, index) => `${index + 1}. Q: ${item.prompt}\n   Student answered: ${item.response || "(no answer)"}\n   Correct: ${item.expected}`)
      .join("\n");
    parts.push(`<incorrect_answers>\n${mistakes}\n</incorrect_answers>`);
  }
  if (request.mode) parts.push(`<tutor_mode>${MODE_INSTRUCTIONS[request.mode]}</tutor_mode>`);
  parts.push(last);
  return parts.join("\n\n");
}

function escapeAttr(value: string): string {
  return value.replace(/[<>"&]/g, " ").slice(0, 200);
}

/* ───────────── Generation ───────────── */

export const GENERATE_SYSTEM = `You turn students' course documents into accurate study material for the Recall Quiz app.

Rules:
- Use only information that is in the provided document. Do not add facts from outside it, except to explain a term the document uses without defining it (keep that minimal).
- The document text is marked with [Page N] headers. Where an item comes from a specific page, set its "page" field to that page number; use 0 when unsure. Never guess page numbers.
- Write for a university student revising for an exam: clear, precise, no filler.
- If the document text is marked as truncated, cover what you were given and do not speculate about the rest.`;

const str = { type: "string" };
const int = { type: "integer" };
const strArr = { type: "array", items: str };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const SCHEMAS: Record<GenerateTask, Record<string, unknown>> = {
  summary: obj({
    short: str,
    detailed: str,
    mainIdeas: strArr,
    keyConcepts: strArr,
    definitions: { type: "array", items: obj({ term: str, definition: str, page: int }) },
    takeaways: strArr,
  }),
  notes: obj({ markdown: str }),
  keyTerms: obj({ terms: { type: "array", items: obj({ term: str, definition: str, example: str, page: int }) } }),
  guide: obj({
    topics: {
      type: "array",
      items: obj({ title: str, summary: str, pages: { type: "array", items: int }, estimatedMinutes: int, objectives: strArr }),
    },
  }),
  flashcards: obj({ cards: { type: "array", items: obj({ front: str, back: str, topic: str, page: int }) } }),
  questions: obj({
    questions: {
      type: "array",
      items: obj({
        type: { type: "string", enum: ["mcq", "tf", "short", "fill"] },
        prompt: str,
        options: strArr,
        answerIndex: int,
        answerText: str,
        explanation: str,
        topic: str,
        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
        page: int,
      }),
    },
  }),
  plan: obj({
    tasks: { type: "array", items: obj({ date: str, title: str, minutes: int }) },
    rationale: str,
  }),
};

export function buildGenerateUserContent(request: GenerateRequest): string {
  const doc = request.document;
  const options = request.options ?? {};
  const header = doc
    ? `<document title="${escapeAttr(doc.title)}"${doc.truncated ? ' truncated="true"' : ""}>\n${doc.text}\n</document>\n\n`
    : "";
  const count = Math.max(1, Math.min(60, options.count ?? 15));
  const topicLine = options.topics?.length ? `Focus only on these topics: ${options.topics.join("; ")}.` : "";
  switch (request.task) {
    case "summary":
      return `${header}Summarise this document. "short" is 2–3 sentences. "detailed" is 3–6 paragraphs separated by blank lines. Give 4–8 main ideas, 6–12 key concepts (short noun phrases), the important definitions (term + definition, with page), and 4–7 takeaways.`;
    case "notes":
      return `${header}Write structured revision notes as Markdown in "markdown". Use ## for main sections that follow the document's structure and ### for subsections. Under each, include concise explanations, **bold** key terms with their definitions, examples from the document, and bullet-point key facts. Make difficult ideas easier to grasp without dropping important details. End each main section with a "> Page reference: p. N" line when known.`;
    case "keyTerms":
      return `${header}Extract the 10–30 most important terms. For each: a simple one- or two-sentence definition, a short concrete example (from the document when possible, otherwise a simple illustrative one), and the page.`;
    case "guide":
      return `${header}Break this document into 3–12 study topics in the order a student should learn them. For each: a clear title, a 1–2 sentence summary, the page numbers it covers, a realistic study time in minutes (10–60), and 2–4 learning objectives starting with a verb.`;
    case "flashcards":
      return `${header}Create ${count} high-quality flashcards. Fronts are specific questions or terms; backs are concise, complete answers (one to three sentences). Cover the most testable ideas, avoid duplicates and trivia. ${topicLine}`;
    case "questions": {
      const types = options.types?.length ? options.types : ["mcq", "tf", "short", "fill"];
      const difficulty = options.difficulty ?? "mixed";
      return `${header}Write exactly ${count} practice questions. Allowed types: ${types.join(", ")} (spread them evenly). Difficulty: ${difficulty === "mixed" ? "a mix of easy, medium and hard" : difficulty}. ${topicLine}
Format rules:
- mcq: 4 plausible options, exactly one correct; answerIndex is its 0-based index; answerText repeats the correct option.
- tf: options must be ["True","False"]; answerIndex 0 or 1; answerText "True" or "False".
- short: options []; answerIndex -1; answerText is a model answer of 1–3 sentences.
- fill: prompt contains "_____" for the missing word or phrase; options []; answerIndex -1; answerText is the missing text only (1–4 words).
Every question needs an explanation that teaches why the answer is correct, a short topic label, and the page.`;
    }
    case "plan": {
      const plan = options.plan;
      if (!plan) return "No plan details were provided.";
      return `Create a realistic, editable revision schedule.
Goal: ${plan.goal}
Subject: ${plan.subject}
Today: ${plan.today}
Target date: ${plan.targetDate}
Available time per day: ${plan.dailyMinutes} minutes
Topics not yet completed: ${plan.topicsRemaining.join("; ") || "none listed"}
Weak topics from quiz results: ${plan.weakTopics.join("; ") || "none detected yet"}

Return tasks with dates (YYYY-MM-DD) from today up to the target date. Never exceed the daily minutes on any date. Prioritise weak topics early, interleave review of earlier topics, leave the last day or two for full practice tests, and include rest days if the window is long. Keep each title short and actionable. "rationale" is 2–3 sentences explaining the plan.`;
    }
  }
}
