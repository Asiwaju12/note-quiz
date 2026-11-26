/**
 * The contract between the browser and the /api/ai/* routes.
 * Pure types and constants only — safe to import from both client and server.
 */

export type TutorMode =
  | "explain"
  | "beginner"
  | "examples"
  | "test"
  | "summarise"
  | "harder"
  | "mistakes"
  | "notes";

export const TUTOR_MODES: Array<{ id: TutorMode; label: string; prompt: string }> = [
  { id: "explain", label: "Explain simply", prompt: "Explain this simply" },
  { id: "beginner", label: "I'm a beginner", prompt: "Explain this like I'm a complete beginner" },
  { id: "examples", label: "Real-world examples", prompt: "Give me real-world examples of this" },
  { id: "test", label: "Test me", prompt: "Test me on this topic" },
  { id: "summarise", label: "Summarise", prompt: "Summarise this topic" },
  { id: "harder", label: "Harder questions", prompt: "Give me harder questions on this" },
  { id: "mistakes", label: "Explain my mistakes", prompt: "Explain where I went wrong" },
  { id: "notes", label: "Revision notes", prompt: "Create revision notes on this" },
];

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ContextPassage = { page: number; text: string };

export type ChatRequest = {
  messages: ChatTurn[];
  mode?: TutorMode;
  document?: { title: string; passages: ContextPassage[] };
  /** Recent quiz mistakes, used by "Explain my mistakes". */
  mistakes?: Array<{ prompt: string; response: string; expected: string }>;
};

export type GenerateTask = "summary" | "notes" | "keyTerms" | "guide" | "flashcards" | "questions" | "plan";

export type QuestionTypeOption = "mcq" | "tf" | "short" | "fill";

export type GenerateRequest = {
  task: GenerateTask;
  document?: {
    title: string;
    /** Page-marked text: "[Page 3]\n…". */
    text: string;
    truncated: boolean;
  };
  options?: {
    count?: number;
    difficulty?: "easy" | "medium" | "hard" | "mixed";
    types?: QuestionTypeOption[];
    topics?: string[];
    /** Previously used prompts, so generated quizzes can avoid repeats. */
    excludePrompts?: string[];
    /** For task "plan". */
    plan?: {
      goal: string;
      subject: string;
      today: string;
      targetDate: string;
      dailyMinutes: number;
      topicsRemaining: string[];
      weakTopics: string[];
    };
  };
};

/** Events on the NDJSON stream returned by /api/ai/chat and /api/ai/generate. */
export type StreamEvent =
  | { t: "delta"; text: string }
  | { t: "ping" }
  | { t: "notice"; message: string }
  | { t: "result"; data: unknown }
  | { t: "done"; stop?: string }
  | { t: "error"; message: string; code?: string };

export type AiStatus = {
  configured: boolean;
  provider: string;
  model: string | null;
};

/** Max characters of document text sent for whole-document generation (~60k tokens). */
export const MAX_GENERATE_CHARS = 240_000;
/** Max characters of retrieved passages sent with a chat question. */
export const MAX_CHAT_CONTEXT_CHARS = 24_000;

export type GeneratedQuestion = {
  type: QuestionTypeOption;
  prompt: string;
  options: string[];
  answerIndex: number;
  answerText: string;
  explanation: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  page: number;
};

export type GeneratedCard = { front: string; back: string; topic: string; page: number };

export type GeneratedPlanTask = { date: string; title: string; minutes: number };
