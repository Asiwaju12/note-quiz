/**
 * Data models for Recall Quiz.
 *
 * These mirror the proposed Supabase tables in docs/SUPABASE_SCHEMA.sql
 * (camelCase here, snake_case there). Today they are persisted locally by the
 * development data layer in ./db.ts; the repository functions in ./repos.ts are
 * the only place that touches storage, so swapping to Supabase later does not
 * require UI changes.
 */
import type { Difficulty, Question, QuestionType } from "@/lib/game/types";

export type ISODate = string;

export type Folder = {
  id: string;
  name: string;
  color: string;
  createdAt: ISODate;
};

export type DocumentStatus = "processing" | "ready" | "error";

export type StudyDocument = {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  pageCount: number;
  charCount: number;
  folderId: string | null;
  status: DocumentStatus;
  /** 0–100 while extracting text. */
  progress: number;
  error?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  lastOpenedAt?: ISODate;
  lastPage: number;
  lastTab?: string;
};

/** Extracted text, one string per page (1-based page = index + 1). Stored apart from metadata. */
export type DocumentText = { id: string; pages: string[] };

export type ArtifactKind = "summary" | "notes" | "keyTerms" | "guide";
export type ArtifactSource = "ai" | "local";

export type SummaryData = {
  short: string;
  detailed: string;
  mainIdeas: string[];
  keyConcepts: string[];
  definitions: Array<{ term: string; definition: string; page?: number }>;
  takeaways: string[];
};

/** Notes are stored as Markdown so they render nicely and export easily. */
export type NotesData = { markdown: string };

export type KeyTerm = { term: string; definition: string; example?: string; page?: number };
export type KeyTermsData = { terms: KeyTerm[] };

export type GuideTopic = {
  id: string;
  title: string;
  summary: string;
  pages: number[];
  estimatedMinutes: number;
  objectives: string[];
};
export type GuideData = { topics: GuideTopic[] };

export type ArtifactDataMap = {
  summary: SummaryData;
  notes: NotesData;
  keyTerms: KeyTermsData;
  guide: GuideData;
};

export type Artifact<K extends ArtifactKind = ArtifactKind> = {
  id: string; // `${docId}:${kind}`
  docId: string;
  kind: K;
  source: ArtifactSource;
  data: ArtifactDataMap[K];
  /** True when the document was longer than what the AI could read in one pass. */
  truncated?: boolean;
  createdAt: ISODate;
};

export type DeckKind = "sample" | "notes" | "manual" | "document";

export type SavedDeck = {
  id: string;
  title: string;
  kind: DeckKind;
  questions: Question[];
  folderId: string | null;
  docId?: string;
  subject?: string;
  source?: ArtifactSource;
  /** Supabase study_decks.id once synced. */
  cloudId?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  lastPlayedAt?: ISODate;
};

export type SrsState = "new" | "learning" | "review" | "relearning";

/** FSRS scheduling fields, serialised (dates as ISO strings). */
export type SrsCard = {
  due: ISODate;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: SrsState;
  lastReview?: ISODate;
};

export type Flashcard = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  docId?: string;
  sourcePage?: number;
  topic?: string;
  flag: "understood" | "revise" | null;
  srs: SrsCard;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type ReviewLogEntry = {
  id: string;
  cardId: string;
  deckId: string;
  rating: 1 | 2 | 3 | 4;
  stateBefore: SrsState;
  at: ISODate;
};

export type AttemptMode = "practice" | "exam" | "arcade" | "daily";

export type AnswerRecord = {
  questionId: string;
  prompt: string;
  type: QuestionType;
  topic: string;
  correct: boolean;
  response: string;
  expected: string;
  flagged?: boolean;
};

export type Attempt = {
  id: string;
  mode: AttemptMode;
  title: string;
  deckId?: string;
  docId?: string;
  startedAt: ISODate;
  finishedAt: ISODate;
  durationSec: number;
  total: number;
  correct: number;
  scorePct: number;
  /** Arcade points, when mode is arcade/daily. */
  points?: number;
  difficulty?: Difficulty | "mixed";
  answers: AnswerRecord[];
};

/** Aggregated per-day counters (id = YYYY-MM-DD local date). Drives streaks, goals, challenges, analytics. */
export type DailyStat = {
  id: string;
  /** Last local update; enables conflict-safe merging of per-day study totals. */
  updatedAt?: ISODate;
  minutes: number;
  questions: number;
  correct: number;
  cards: number;
  sessions: number;
  topics: number;
  docsOpened: number;
  aiMessages: number;
  points: number;
};

export type ActivityType =
  | "doc_upload"
  | "doc_open"
  | "quiz_complete"
  | "exam_complete"
  | "arcade_complete"
  | "cards_reviewed"
  | "deck_created"
  | "topic_complete"
  | "achievement"
  | "challenge_complete";

export type ActivityEvent = {
  id: string;
  type: ActivityType;
  at: ISODate;
  title: string;
  detail?: string;
  link?: string;
};

export type ChatThread = {
  id: string;
  title: string;
  docId?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type ChatSource = { page: number; excerpt: string };

export type ChatMessage = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  mode?: string;
  /** Passages retrieved from the document and sent to the AI as context. */
  sources?: ChatSource[];
  /** Whether the answer was grounded on retrieved document passages. */
  grounded?: boolean;
  error?: string;
  createdAt: ISODate;
};

export type Goal = {
  id: string;
  title: string;
  subject: string;
  targetDate: string; // YYYY-MM-DD
  dailyMinutes: number;
  docIds: string[];
  deckIds: string[];
  createdAt: ISODate;
  archived: boolean;
};

export type PlanTask = {
  id: string;
  goalId: string | null;
  title: string;
  date: string; // YYYY-MM-DD
  done: boolean;
  doneAt?: ISODate;
  link?: string;
  minutes?: number;
  createdAt: ISODate;
};

export type UnlockedAchievement = { id: string; unlockedAt: ISODate };

export type TopicProgress = { id: string; docId: string; topicId: string; completedAt: ISODate };

export type Highlight = {
  id: string;
  docId: string;
  page: number;
  text: string;
  color: "yellow" | "violet" | "green";
  note?: string;
  createdAt: ISODate;
};

export type Bookmark = { id: string; docId: string; page: number; label: string; createdAt: ISODate };

export type DocNote = { id: string; docId: string; page: number | null; text: string; createdAt: ISODate; updatedAt: ISODate };

export type ChallengeClaim = { id: string; date: string; challengeId: string; points: number; at: ISODate };
