import type { Pace, ScoreEntry } from "./types";

const SCORES_KEY = "recall.scores.v1";
const INITIALS_KEY = "recall.initials.v1";
const NOTES_KEY = "recall.notes.v1";
const TITLE_KEY = "recall.note-title.v1";
const MUTED_KEY = "recall.muted.v1";
const PLAYED_KEY = "recall.played.v1";
const PACE_KEY = "recall.pace.v1";
const PLAYER_ID_KEY = "recall.player-id.v1";
const LAST_START_KEY = "recall.last-start.v1";

function canStore(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

const LEGACY_PREFIXES = ["mnemobop.", "recall-rush."];
let brandMigrated = false;

/**
 * Carries notes, profiles and scores over from earlier product names.
 * Runs once, silently, and only ever writes to the new namespace.
 */
export function ensureBrandMigration(): void {
  if (brandMigrated || !canStore()) return;
  brandMigrated = true;
  try {
    const storage = window.localStorage;
    const keys = Object.keys(storage);
    for (const key of keys) {
      const prefix = LEGACY_PREFIXES.find((candidate) => key.startsWith(candidate));
      if (!prefix) continue;
      const nextKey = `recall.${key.slice(prefix.length)}`;
      const value = storage.getItem(key);
      if (value !== null && storage.getItem(nextKey) === null) {
        storage.setItem(nextKey, value);
      }
      storage.removeItem(key);
    }
  } catch {
    /* migration is best-effort; the app still works without it */
  }
}

ensureBrandMigration();

export function loadString(key: string, fallback = ""): string {
  if (!canStore()) return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveString(key: string, value: string): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable — game still works */
  }
}

export function loadScores(): ScoreEntry[] {
  const raw = loadString(SCORES_KEY, "[]");
  try {
    const parsed = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.score === "number" && typeof entry.id === "string")
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function saveScore(entry: ScoreEntry): ScoreEntry[] {
  const entries = loadScores().filter((item) => item.id !== entry.id);
  const next = [...entries, entry].sort((a, b) => b.score - a.score).slice(0, 8);
  saveString(SCORES_KEY, JSON.stringify(next));
  return next;
}

export function renameScore(id: string, name: string): ScoreEntry[] {
  const next = loadScores().map((entry) => (entry.id === id ? { ...entry, name } : entry));
  saveString(SCORES_KEY, JSON.stringify(next));
  return next.sort((a, b) => b.score - a.score);
}

export function clearScores(): void {
  saveString(SCORES_KEY, "[]");
}

export function loadInitials(): string {
  return loadString(INITIALS_KEY, "YOU").slice(0, 3).toUpperCase() || "YOU";
}

export function saveInitials(initials: string): void {
  saveString(INITIALS_KEY, initials.slice(0, 3).toUpperCase() || "YOU");
}

const WORKSPACE_DB = "recall-workspace";
const LEGACY_WORKSPACE_DB = "mnemobop-workspace";
const LEGACY_NOTES_KEY = "mnemobop.notes.v1";
const WORKSPACE_STORE = "documents";
const LARGE_NOTE_THRESHOLD = 1_500_000;

function openWorkspace(dbName: string = WORKSPACE_DB): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(WORKSPACE_STORE)) {
          request.result.createObjectStore(WORKSPACE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function workspaceSet(key: string, value: string): Promise<void> {
  const db = await openWorkspace();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(WORKSPACE_STORE, "readwrite");
      transaction.objectStore(WORKSPACE_STORE).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    } finally {
      db.close();
    }
  });
}

async function workspaceGet(key: string, dbName: string = WORKSPACE_DB): Promise<string> {
  const db = await openWorkspace(dbName);
  if (!db) return "";
  const value = await new Promise<string>((resolve) => {
    try {
      const request = db.transaction(WORKSPACE_STORE, "readonly").objectStore(WORKSPACE_STORE).get(key);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : "");
      request.onerror = () => resolve("");
    } catch {
      resolve("");
    } finally {
      db.close();
    }
  });
  return value;
}

async function workspaceDelete(key: string): Promise<void> {
  const db = await openWorkspace();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(WORKSPACE_STORE, "readwrite");
      transaction.objectStore(WORKSPACE_STORE).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    } finally {
      db.close();
    }
  });
}

export function loadNotes(): string {
  return loadString(NOTES_KEY, "");
}

/** Restores very large note sets saved outside the small local-storage quota. */
export async function loadNotesAsync(): Promise<string> {
  const large = await workspaceGet(NOTES_KEY);
  if (large) return large;
  const legacyLarge = await workspaceGet(LEGACY_NOTES_KEY, LEGACY_WORKSPACE_DB);
  const stored = loadString(NOTES_KEY, "");
  return legacyLarge || stored;
}

export function saveNotes(value: string): void {
  if (value.length <= LARGE_NOTE_THRESHOLD) {
    saveString(NOTES_KEY, value);
    void workspaceDelete(NOTES_KEY);
    return;
  }
  if (canStore()) {
    try {
      window.localStorage.removeItem(NOTES_KEY);
    } catch {
      /* ignore */
    }
  }
  void workspaceSet(NOTES_KEY, value);
}

export function loadNoteTitle(): string {
  return loadString(TITLE_KEY, "");
}

export function saveNoteTitle(value: string): void {
  saveString(TITLE_KEY, value);
}

export function loadMuted(): boolean {
  return loadString(MUTED_KEY, "false") === "true";
}

export function saveMuted(value: boolean): void {
  saveString(MUTED_KEY, String(value));
}

export function loadPlayed(): number {
  const value = Number(loadString(PLAYED_KEY, "0"));
  return Number.isFinite(value) ? value : 0;
}

export function savePlayed(value: number): void {
  saveString(PLAYED_KEY, String(value));
}

export function loadPace(): Pace {
  const value = loadString(PACE_KEY, "standard");
  return value === "relaxed" || value === "rush" || value === "standard" ? value : "standard";
}

export function savePace(value: Pace): void {
  saveString(PACE_KEY, value);
}

/** Stable anonymous id used only to de-duplicate shared daily scores. */
export function getPlayerId(): string {
  const existing = loadString(PLAYER_ID_KEY, "");
  if (existing) return existing;
  const id = `rr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  saveString(PLAYER_ID_KEY, id);
  return id;
}

export function loadLastStartId(): string {
  return loadString(LAST_START_KEY, "");
}

export function saveLastStartId(id: string): void {
  saveString(LAST_START_KEY, id);
}
