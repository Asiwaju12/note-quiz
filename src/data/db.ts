/**
 * DEVELOPMENT DATA LAYER — local persistence only.
 *
 * Records live in this browser's IndexedDB (falling back to memory when
 * IndexedDB is unavailable, e.g. some private windows). Nothing here is synced
 * to a server. Every collection is fully cached in memory after `initDb()` so
 * reads are synchronous and React components can subscribe to changes.
 *
 * To move to Supabase, re-implement the functions in ./repos.ts against the
 * tables in docs/SUPABASE_SCHEMA.sql — UI code only calls the repos.
 */
import { useSyncExternalStore } from "react";

const DB_NAME = "recall-quiz";
const DB_VERSION = 1;

export const COLLECTIONS = [
  "folders",
  "documents",
  "artifacts",
  "decks",
  "cards",
  "reviewLogs",
  "attempts",
  "dailyStats",
  "activity",
  "chats",
  "messages",
  "goals",
  "tasks",
  "achievements",
  "topicProgress",
  "highlights",
  "bookmarks",
  "docNotes",
  "challengeClaims",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

/** Large values (PDF files, extracted page text) stored outside the in-memory cache. */
const BLOB_STORE = "blobs";

type DeletionMap = Partial<Record<CollectionName, Record<string, string>>>;
let deletionScope = "guest";
const DELETION_KEY = "recall.cloud-deletions.v1.";

function readDeletions(scope: string): DeletionMap {
  try {
    const raw = localStorage.getItem(`${DELETION_KEY}${encodeURIComponent(scope)}`);
    return raw ? JSON.parse(raw) as DeletionMap : {};
  } catch { return {}; }
}

function writeDeletions(scope: string, value: DeletionMap): void {
  try { localStorage.setItem(`${DELETION_KEY}${encodeURIComponent(scope)}`, JSON.stringify(value)); }
  catch (error) { console.warn("[db] could not persist deletion markers", error); }
}

function recordDeletions(name: CollectionName, ids: string[]): void {
  if (!ids.length || typeof localStorage === "undefined") return;
  const all = readDeletions(deletionScope);
  const rows = all[name] ?? {};
  const deletedAt = new Date().toISOString();
  for (const id of ids) rows[id] = deletedAt;
  all[name] = rows;
  writeDeletions(deletionScope, all);
}

/** Set the account namespace used for future local deletion markers. */
export function setDeletionScope(scope: string): void { deletionScope = scope || "guest"; }

/** Read deletion markers without exposing or mutating the internal store. */
export function getDeletionTombstones(scope = deletionScope): DeletionMap { return readDeletions(scope); }

/** Clear only markers included in a successfully acknowledged cloud snapshot. */
export function acknowledgeDeletionTombstones(scope: string, acknowledged: DeletionMap): void {
  const current = readDeletions(scope);
  for (const name of COLLECTIONS) {
    const accepted = acknowledged[name] ?? {};
    const pending = current[name] ?? {};
    for (const [id, at] of Object.entries(accepted)) {
      if (pending[id] && pending[id] <= at) delete pending[id];
    }
    if (Object.keys(pending).length) current[name] = pending;
    else delete current[name];
  }
  writeDeletions(scope, current);
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
let persistent = false;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of COLLECTIONS) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

type Entity = { id: string };

export class Collection<T extends Entity> {
  private items = new Map<string, T>();
  private snapshot: T[] = [];
  private listeners = new Set<() => void>();
  readonly name: CollectionName;

  constructor(name: CollectionName) {
    this.name = name;
  }

  /** @internal */
  hydrate(rows: T[], persist = false) {
    this.items = new Map(rows.map((row) => [row.id, row]));
    this.emit();
    // Cloud hydration must also replace the IndexedDB copy. Otherwise a reload
    // would resurrect stale local rows or lose rows restored from another device.
    if (persist) void replaceRecords(this.name, rows);
  }

  all(): T[] {
    return this.snapshot;
  }

  get(id: string | undefined | null): T | undefined {
    return id ? this.items.get(id) : undefined;
  }

  where(predicate: (item: T) => boolean): T[] {
    return this.snapshot.filter(predicate);
  }

  put(item: T): T {
    this.items.set(item.id, item);
    this.emit();
    void writeRecords(this.name, [item]);
    return item;
  }

  putMany(items: T[]): void {
    if (!items.length) return;
    for (const item of items) this.items.set(item.id, item);
    this.emit();
    void writeRecords(this.name, items);
  }

  patch(id: string, changes: Partial<T>): T | undefined {
    const current = this.items.get(id);
    if (!current) return undefined;
    return this.put({ ...current, ...changes });
  }

  remove(id: string): void {
    if (!this.items.delete(id)) return;
    this.emit();
    recordDeletions(this.name, [id]);
    void deleteRecords(this.name, [id]);
  }

  removeWhere(predicate: (item: T) => boolean): number {
    const ids = this.snapshot.filter(predicate).map((item) => item.id);
    if (!ids.length) return 0;
    for (const id of ids) this.items.delete(id);
    this.emit();
    recordDeletions(this.name, ids);
    void deleteRecords(this.name, ids);
    return ids.length;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): T[] => this.snapshot;

  private emit() {
    this.snapshot = [...this.items.values()];
    for (const listener of this.listeners) listener();
  }
}

const registry = new Map<CollectionName, Collection<Entity>>();

export function collection<T extends Entity>(name: CollectionName): Collection<T> {
  let existing = registry.get(name);
  if (!existing) {
    existing = new Collection<Entity>(name);
    registry.set(name, existing);
  }
  return existing as unknown as Collection<T>;
}

async function writeRecords(name: CollectionName, rows: Entity[]) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(name, "readwrite");
      const store = tx.objectStore(name);
      // structuredClone strips React/proxy oddities and guarantees cloneability.
      for (const row of rows) store.put(structuredClone(row));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch (error) {
      console.warn(`[db] could not write ${name}`, error);
      resolve();
    }
  });
}


async function replaceRecords(name: CollectionName, rows: Entity[]) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(name, "readwrite");
      const store = tx.objectStore(name);
      store.clear();
      for (const row of rows) store.put(structuredClone(row));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch (error) {
      console.warn(`[db] could not replace ${name}`, error);
      resolve();
    }
  });
}

async function deleteRecords(name: CollectionName, ids: string[]) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(name, "readwrite");
      for (const id of ids) tx.objectStore(name).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Loads every collection into memory. Call once before rendering the app. */
export async function initDb(): Promise<{ persistent: boolean }> {
  const db = await openDb();
  persistent = Boolean(db);
  if (!db) {
    for (const name of COLLECTIONS) collection(name).hydrate([]);
    return { persistent };
  }
  await Promise.all(
    COLLECTIONS.map(
      (name) =>
        new Promise<void>((resolve) => {
          try {
            const request = db.transaction(name, "readonly").objectStore(name).getAll();
            request.onsuccess = () => {
              collection(name).hydrate((request.result as Entity[]) ?? []);
              resolve();
            };
            request.onerror = () => {
              collection(name).hydrate([]);
              resolve();
            };
          } catch {
            collection(name).hydrate([]);
            resolve();
          }
        }),
    ),
  );
  return { persistent };
}

export function isPersistent(): boolean {
  return persistent;
}

const memoryBlobs = new Map<string, unknown>();

export async function putBlob(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) {
    memoryBlobs.set(key, value);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(BLOB_STORE, "readwrite");
      tx.objectStore(BLOB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save to browser storage."));
      tx.onabort = () => reject(tx.error ?? new Error("Browser storage is full."));
    } catch (error) {
      reject(error);
    }
  });
}

export async function getBlob<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return memoryBlobs.get(key) as T | undefined;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(BLOB_STORE, "readonly").objectStore(BLOB_STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function deleteBlob(key: string): Promise<void> {
  memoryBlobs.delete(key);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(BLOB_STORE, "readwrite");
      tx.objectStore(BLOB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}


/** Remove account-scoped document bytes before hydrating a different account. */
export async function clearAllBlobs(): Promise<void> {
  memoryBlobs.clear();
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(BLOB_STORE, "readwrite");
      tx.objectStore(BLOB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}

/** Subscribe a component to a collection. Returns the current array (stable until it changes). */
export function useCollection<T extends Entity>(name: CollectionName): T[] {
  const store = collection<T>(name);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function newId(prefix = ""): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return prefix ? `${prefix}_${random}` : random;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local calendar date key, YYYY-MM-DD. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function clearAllLocalData(): Promise<void> {
  const db = await openDb();
  db?.close();
  dbPromise = null;
  await new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
