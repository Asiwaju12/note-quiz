/**
 * Repositories: every read/write of study data goes through here.
 *
 * Currently backed by the local development store (./db.ts). When Supabase is
 * connected, these functions are the integration seam — keep signatures, swap
 * implementations (see docs/INTEGRATION.md).
 */
import type { Question } from "@/lib/game/types";
import { newSrsCard, review as reviewSrs, type RatingValue } from "@/lib/srs/fsrs";
import { collection, dayKey, deleteBlob, getBlob, newId, nowIso, putBlob } from "./db";
import type {
  ActivityEvent,
  ActivityType,
  Artifact,
  ArtifactDataMap,
  ArtifactKind,
  ArtifactSource,
  Attempt,
  Bookmark,
  ChallengeClaim,
  ChatMessage,
  ChatThread,
  DailyStat,
  DocNote,
  DocumentText,
  Flashcard,
  Folder,
  Goal,
  Highlight,
  PlanTask,
  ReviewLogEntry,
  SavedDeck,
  StudyDocument,
  TopicProgress,
  UnlockedAchievement,
} from "./models";

export const db = {
  folders: collection<Folder>("folders"),
  documents: collection<StudyDocument>("documents"),
  artifacts: collection<Artifact>("artifacts"),
  decks: collection<SavedDeck>("decks"),
  cards: collection<Flashcard>("cards"),
  reviewLogs: collection<ReviewLogEntry>("reviewLogs"),
  attempts: collection<Attempt>("attempts"),
  dailyStats: collection<DailyStat>("dailyStats"),
  activity: collection<ActivityEvent>("activity"),
  chats: collection<ChatThread>("chats"),
  messages: collection<ChatMessage>("messages"),
  goals: collection<Goal>("goals"),
  tasks: collection<PlanTask>("tasks"),
  achievements: collection<UnlockedAchievement>("achievements"),
  topicProgress: collection<TopicProgress>("topicProgress"),
  highlights: collection<Highlight>("highlights"),
  bookmarks: collection<Bookmark>("bookmarks"),
  docNotes: collection<DocNote>("docNotes"),
  challengeClaims: collection<ChallengeClaim>("challengeClaims"),
};

/* ───────────────────────── Stats & activity ───────────────────────── */

const emptyStat = (id: string): DailyStat => ({
  id,
  minutes: 0,
  questions: 0,
  correct: 0,
  cards: 0,
  sessions: 0,
  topics: 0,
  docsOpened: 0,
  aiMessages: 0,
  points: 0,
});

export function todayStat(): DailyStat {
  const id = dayKey();
  return db.dailyStats.get(id) ?? emptyStat(id);
}

export function bumpToday(changes: Partial<Omit<DailyStat, "id">>): void {
  const current = todayStat();
  const next = { ...current };
  for (const [key, value] of Object.entries(changes) as Array<[keyof Omit<DailyStat, "id">, number]>) {
    next[key] = Math.round(((current[key] ?? 0) + value) * 100) / 100;
  }
  db.dailyStats.put(next);
}

const MAX_ACTIVITY = 300;

export function logActivity(type: ActivityType, title: string, detail?: string, link?: string): void {
  db.activity.put({ id: newId("act"), type, title, detail, link, at: nowIso() });
  const all = db.activity.all();
  if (all.length > MAX_ACTIVITY) {
    const oldest = [...all].sort((a, b) => a.at.localeCompare(b.at)).slice(0, all.length - MAX_ACTIVITY);
    const ids = new Set(oldest.map((item) => item.id));
    db.activity.removeWhere((item) => ids.has(item.id));
  }
}

/* ───────────────────────── Folders ───────────────────────── */

const FOLDER_COLORS = ["#8B71EE", "#3FB8AF", "#F28C6B", "#E5B83C", "#5C9DF2", "#D16BA5"];

export function createFolder(name: string): Folder {
  const folder: Folder = {
    id: newId("fld"),
    name: name.trim().slice(0, 60) || "Untitled subject",
    color: FOLDER_COLORS[db.folders.all().length % FOLDER_COLORS.length],
    createdAt: nowIso(),
  };
  return db.folders.put(folder);
}

export function renameFolder(id: string, name: string): void {
  db.folders.patch(id, { name: name.trim().slice(0, 60) || "Untitled subject" });
}

export function deleteFolder(id: string): void {
  for (const doc of db.documents.where((item) => item.folderId === id)) db.documents.patch(doc.id, { folderId: null });
  for (const deck of db.decks.where((item) => item.folderId === id)) db.decks.patch(deck.id, { folderId: null });
  db.folders.remove(id);
}

/* ───────────────────────── Documents ───────────────────────── */

export function createDocument(input: Pick<StudyDocument, "title" | "fileName" | "sizeBytes" | "folderId">): StudyDocument {
  const now = nowIso();
  return db.documents.put({
    id: newId("doc"),
    ...input,
    pageCount: 0,
    charCount: 0,
    status: "processing",
    progress: 0,
    createdAt: now,
    updatedAt: now,
    lastPage: 1,
  });
}

export function updateDocument(id: string, changes: Partial<StudyDocument>): void {
  db.documents.patch(id, { ...changes, updatedAt: nowIso() });
}

export async function saveDocumentFile(docId: string, file: Blob): Promise<void> {
  await putBlob(`file:${docId}`, file);
}

export function getDocumentFile(docId: string): Promise<Blob | undefined> {
  return getBlob<Blob>(`file:${docId}`);
}

const textCache = new Map<string, DocumentText>();

export async function saveDocumentText(docId: string, pages: string[]): Promise<void> {
  const value: DocumentText = { id: docId, pages };
  textCache.set(docId, value);
  await putBlob(`text:${docId}`, value);
}

export async function getDocumentText(docId: string): Promise<DocumentText | undefined> {
  const cached = textCache.get(docId);
  if (cached) return cached;
  const stored = await getBlob<DocumentText>(`text:${docId}`);
  if (stored) textCache.set(docId, stored);
  return stored;
}

/** Clear in-memory extracted-text cache when changing account workspaces. */
export function clearDocumentTextCache(): void { textCache.clear(); }

export async function deleteDocument(id: string): Promise<void> {
  db.artifacts.removeWhere((item) => item.docId === id);
  const deckIds = new Set(db.decks.where((deck) => deck.docId === id).map((deck) => deck.id));
  db.cards.removeWhere((card) => card.docId === id || deckIds.has(card.deckId));
  db.decks.removeWhere((deck) => deckIds.has(deck.id));
  db.highlights.removeWhere((item) => item.docId === id);
  db.bookmarks.removeWhere((item) => item.docId === id);
  db.docNotes.removeWhere((item) => item.docId === id);
  db.topicProgress.removeWhere((item) => item.docId === id);
  const chatIds = new Set(db.chats.where((chat) => chat.docId === id).map((chat) => chat.id));
  db.messages.removeWhere((message) => chatIds.has(message.chatId));
  db.chats.removeWhere((chat) => chatIds.has(chat.id));
  db.documents.remove(id);
  textCache.delete(id);
  await Promise.all([deleteBlob(`file:${id}`), deleteBlob(`text:${id}`)]);
}

export function markDocumentOpened(id: string): void {
  const doc = db.documents.get(id);
  if (!doc) return;
  const today = dayKey();
  const firstToday = !doc.lastOpenedAt || dayKey(new Date(doc.lastOpenedAt)) !== today;
  db.documents.patch(id, { lastOpenedAt: nowIso() });
  if (firstToday) {
    bumpToday({ docsOpened: 1 });
    logActivity("doc_open", `Opened ${doc.title}`, undefined, `/study/${id}`);
  }
}

/* ───────────────────────── Artifacts (AI / local generated study material) ───────────────────────── */

export function getArtifact<K extends ArtifactKind>(docId: string, kind: K): Artifact<K> | undefined {
  return db.artifacts.get(`${docId}:${kind}`) as Artifact<K> | undefined;
}

export function saveArtifact<K extends ArtifactKind>(
  docId: string,
  kind: K,
  data: ArtifactDataMap[K],
  source: ArtifactSource,
  truncated = false,
): Artifact<K> {
  const artifact: Artifact<K> = { id: `${docId}:${kind}`, docId, kind, data, source, truncated, createdAt: nowIso() };
  db.artifacts.put(artifact as unknown as Artifact);
  return artifact;
}

/* ───────────────────────── Decks & questions ───────────────────────── */

export function createDeck(input: {
  title: string;
  kind: SavedDeck["kind"];
  questions: Question[];
  docId?: string;
  folderId?: string | null;
  source?: ArtifactSource;
}): SavedDeck {
  const now = nowIso();
  const deck = db.decks.put({
    id: newId("deck"),
    title: input.title.trim().slice(0, 140) || "Untitled deck",
    kind: input.kind,
    questions: input.questions,
    docId: input.docId,
    folderId: input.folderId ?? null,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  });
  logActivity("deck_created", `Created deck “${deck.title}”`, `${deck.questions.length} questions`, `/decks/${deck.id}`);
  return deck;
}

export function updateDeck(id: string, changes: Partial<SavedDeck>): void {
  db.decks.patch(id, { ...changes, updatedAt: nowIso() });
}

export function deleteDeck(id: string): void {
  db.cards.removeWhere((card) => card.deckId === id);
  db.decks.remove(id);
}

/* ───────────────────────── Flashcards ───────────────────────── */

export function createCards(
  deckId: string,
  cards: Array<{ front: string; back: string; sourcePage?: number; topic?: string; docId?: string }>,
): Flashcard[] {
  const now = nowIso();
  const rows: Flashcard[] = cards
    .filter((card) => card.front.trim() && card.back.trim())
    .map((card) => ({
      id: newId("card"),
      deckId,
      front: card.front.trim(),
      back: card.back.trim(),
      docId: card.docId,
      sourcePage: card.sourcePage,
      topic: card.topic,
      flag: null,
      srs: newSrsCard(),
      createdAt: now,
      updatedAt: now,
    }));
  db.cards.putMany(rows);
  return rows;
}

export function updateCard(id: string, changes: Partial<Pick<Flashcard, "front" | "back" | "flag" | "topic">>): void {
  db.cards.patch(id, { ...changes, updatedAt: nowIso() });
}

export function deleteCard(id: string): void {
  db.cards.remove(id);
}

export function reviewCard(id: string, rating: RatingValue): void {
  const card = db.cards.get(id);
  if (!card) return;
  const srs = reviewSrs(card.srs, rating);
  db.cards.patch(id, {
    srs,
    updatedAt: nowIso(),
    // Rating a card "Again" puts it on the revise list; "Easy" marks it understood.
    flag: rating === 1 ? "revise" : rating === 4 ? "understood" : card.flag,
  });
  db.reviewLogs.put({ id: newId("rev"), cardId: id, deckId: card.deckId, rating, stateBefore: card.srs.state, at: nowIso() });
  bumpToday({ cards: 1, points: 2 });
}

/* ───────────────────────── Attempts ───────────────────────── */

export function recordAttempt(attempt: Omit<Attempt, "id">): Attempt {
  const saved = db.attempts.put({ ...attempt, id: newId("att") });
  const correct = attempt.answers.filter((answer) => answer.correct).length;
  bumpToday({
    questions: attempt.answers.length,
    correct,
    sessions: 1,
    points: correct * 10 + (attempt.mode === "exam" ? 25 : 0),
  });
  const type: ActivityType =
    attempt.mode === "exam" ? "exam_complete" : attempt.mode === "practice" ? "quiz_complete" : "arcade_complete";
  logActivity(type, attempt.title, `${attempt.correct}/${attempt.total} correct · ${attempt.scorePct}%`, `/progress`);
  if (attempt.deckId) updateDeck(attempt.deckId, { lastPlayedAt: nowIso() });
  return saved;
}

/* ───────────────────────── Chat ───────────────────────── */

export function createChat(title: string, docId?: string): ChatThread {
  const now = nowIso();
  return db.chats.put({ id: newId("chat"), title: title.slice(0, 80) || "New conversation", docId, createdAt: now, updatedAt: now });
}

export function addMessage(message: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
  const saved = db.messages.put({ ...message, id: newId("msg"), createdAt: nowIso() });
  db.chats.patch(message.chatId, { updatedAt: nowIso() });
  return saved;
}

export function updateMessage(id: string, changes: Partial<ChatMessage>): void {
  db.messages.patch(id, changes);
}

export function deleteChat(id: string): void {
  db.messages.removeWhere((message) => message.chatId === id);
  db.chats.remove(id);
}

export function chatMessages(chatId: string): ChatMessage[] {
  return db.messages.where((message) => message.chatId === chatId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/* ───────────────────────── Planner ───────────────────────── */

export function createGoal(input: Omit<Goal, "id" | "createdAt" | "archived">): Goal {
  return db.goals.put({ ...input, id: newId("goal"), createdAt: nowIso(), archived: false });
}

export function createTask(input: Omit<PlanTask, "id" | "createdAt" | "done">): PlanTask {
  return db.tasks.put({ ...input, id: newId("task"), done: false, createdAt: nowIso() });
}

export function toggleTask(id: string): void {
  const task = db.tasks.get(id);
  if (!task) return;
  db.tasks.patch(id, { done: !task.done, doneAt: task.done ? undefined : nowIso() });
  if (!task.done) bumpToday({ points: 5 });
}

/* ───────────────────────── Document study tools ───────────────────────── */

export function completeTopic(docId: string, topicId: string, title: string): void {
  const id = `${docId}:${topicId}`;
  if (db.topicProgress.get(id)) {
    db.topicProgress.remove(id);
    return;
  }
  db.topicProgress.put({ id, docId, topicId, completedAt: nowIso() });
  bumpToday({ topics: 1, points: 15 });
  logActivity("topic_complete", `Completed “${title}”`, undefined, `/study/${docId}?tab=guide`);
}

export function addHighlight(input: Omit<Highlight, "id" | "createdAt">): Highlight {
  return db.highlights.put({ ...input, id: newId("hl"), createdAt: nowIso() });
}

export function toggleBookmark(docId: string, page: number): void {
  const existing = db.bookmarks.where((item) => item.docId === docId && item.page === page)[0];
  if (existing) db.bookmarks.remove(existing.id);
  else db.bookmarks.put({ id: newId("bm"), docId, page, label: `Page ${page}`, createdAt: nowIso() });
}

export function saveDocNote(docId: string, page: number | null, text: string, id?: string): void {
  const now = nowIso();
  if (id) db.docNotes.patch(id, { text, updatedAt: now });
  else db.docNotes.put({ id: newId("note"), docId, page, text, createdAt: now, updatedAt: now });
}

/* ───────────────────────── Study time ───────────────────────── */

/** Adds active study time. Called by the activity tracker in small increments. */
export function addStudyMinutes(minutes: number): void {
  if (minutes > 0) bumpToday({ minutes });
}

/** Each document has one deck holding its generated questions and flashcards. */
export function getOrCreateDocDeck(doc: StudyDocument): SavedDeck {
  const existing = db.decks.where((deck) => deck.docId === doc.id && deck.kind === "document")[0];
  if (existing) return existing;
  const now = nowIso();
  return db.decks.put({
    id: newId("deck"),
    title: doc.title,
    kind: "document",
    questions: [],
    docId: doc.id,
    folderId: doc.folderId,
    createdAt: now,
    updatedAt: now,
  });
}
