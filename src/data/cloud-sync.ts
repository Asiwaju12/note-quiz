/**
 * Account-scoped cloud snapshot sync.
 * Local IndexedDB remains the working store. Cloud snapshots use tombstones
 * for deletions and conditional writes to avoid silently overwriting a newer
 * snapshot written by another browser.
 */
import {
  COLLECTIONS,
  collection,
  type CollectionName,
  getDeletionTombstones,
  setDeletionScope,
  acknowledgeDeletionTombstones,
  clearAllBlobs,
} from "./db";
import { getDocumentFile, getDocumentText, saveDocumentFile, saveDocumentText, clearDocumentTextCache } from "./repos";
import {
  getResume,
  getSettings,
  getSettingsUpdatedAt,
  getResumeUpdatedAt,
  subscribeSettings,
  replaceSettings,
  replaceResume,
  resetSettings,
  resetResume,
} from "./settings";
import { deletePrivateFile, downloadPrivateFile, supabaseRest, uploadPrivateFile } from "@/services/supabase";
import type { StudyDocument } from "./models";
import { mergeSnapshots, mergeTombstones } from "./cloud-sync-merge";

type Tombstones = Partial<Record<CollectionName, Record<string, string>>>;
type Snapshot = import("./cloud-sync-merge").SyncSnapshot;
type SnapshotRow = { user_id: string; data: Snapshot; updated_at: string };
type DocumentTextRow = { document_id: string; pages: string[] };
type SyncRun = { userId: string; generation: number; active: boolean; dirty: boolean; inheritedGuestTombstones: Tombstones };

const LOCAL_OWNER_KEY = "recall.cloud-owner.v1";
const GUEST_SCOPE = "guest";
const DEBOUNCE_MS = 900;
const MAX_CAS_ATTEMPTS = 5;
let generation = 0;
let currentRun: SyncRun | null = null;
let stopCurrent: (() => void) | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
const inFlight = new Map<string, Promise<void>>();

function isCurrent(run: SyncRun): boolean {
  return run.active && currentRun === run && run.generation === generation;
}

async function buildSnapshot(run: SyncRun): Promise<Snapshot> {
  const collections = Object.fromEntries(COLLECTIONS.map((name) => [name, collection(name).all()])) as Snapshot["collections"];
  const localTombstones = getDeletionTombstones(run.userId);
  return {
    version: 2,
    collections,
    tombstones: mergeTombstones(localTombstones, run.inheritedGuestTombstones),
    settings: getSettings(),
    resume: getResume(),
    settingsUpdatedAt: getSettingsUpdatedAt() ?? new Date().toISOString(),
    resumeUpdatedAt: getResumeUpdatedAt() ?? new Date().toISOString(),
  };
}

async function fetchSnapshot(userId: string): Promise<SnapshotRow | undefined> {
  const rows = await supabaseRest<SnapshotRow[]>(
    "recall_user_data",
    `select=user_id,data,updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  return rows[0];
}

/** Compare-and-swap the snapshot row; retry by merging if another client won. */
async function writeSnapshotCAS(run: SyncRun, initial: Snapshot): Promise<Snapshot> {
  let candidate = initial;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    if (!isCurrent(run)) throw new Error("Cloud sync was cancelled because the active account changed.");
    const latest = await fetchSnapshot(run.userId);
    if (!isCurrent(run)) throw new Error("Cloud sync was cancelled because the active account changed.");
    candidate = mergeSnapshots(latest?.data, candidate, run.inheritedGuestTombstones);
    const body = JSON.stringify({ user_id: run.userId, data: candidate, updated_at: new Date().toISOString() });

    if (!latest) {
      try {
        const inserted = await supabaseRest<SnapshotRow[]>("recall_user_data", "", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body,
        });
        if (Array.isArray(inserted) && inserted.length) return candidate;
      } catch (error) {
        // A competing first writer may have created the row. Re-read and merge.
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (!message.includes("duplicate") && !message.includes("unique") && !message.includes("409")) throw error;
      }
      continue;
    }

    const updated = await supabaseRest<SnapshotRow[]>(
      "recall_user_data",
      `user_id=eq.${encodeURIComponent(run.userId)}&updated_at=eq.${encodeURIComponent(latest.updated_at)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body,
      },
    );
    if (Array.isArray(updated) && updated.length) return candidate;
    // No row was changed: updated_at no longer matches, so retry against the winner.
  }
  throw new Error("Cloud sync could not settle because another device kept updating this account. Please try again.");
}

async function syncDocumentTexts(run: SyncRun): Promise<void> {
  for (const doc of collection<StudyDocument>("documents").all()) {
    if (!isCurrent(run)) return;
    const text = await getDocumentText(doc.id);
    if (!isCurrent(run)) return;
    if (!text?.pages?.length) continue;
    await supabaseRest<unknown>("recall_document_texts", "on_conflict=user_id,document_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: run.userId, document_id: doc.id, pages: text.pages, updated_at: new Date().toISOString() }),
    });
  }
}

async function uploadMissingPdfs(run: SyncRun): Promise<void> {
  for (const doc of collection<StudyDocument>("documents").all()) {
    if (!isCurrent(run)) return;
    const marker = `recall.cloud-file.${run.userId}.${doc.id}`;
    if (localStorage.getItem(marker) === "uploaded") continue;
    const blob = await getDocumentFile(doc.id);
    if (!isCurrent(run)) return;
    if (!blob) continue;
    const file = new File([blob], doc.fileName || `${doc.id}.pdf`, { type: "application/pdf" });
    try {
      await uploadPrivateFile("study-documents", `${run.userId}/${doc.id}.pdf`, file);
      if (isCurrent(run)) localStorage.setItem(marker, "uploaded");
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("already exists") || message.includes("duplicate") || message.includes("409")) {
        if (isCurrent(run)) localStorage.setItem(marker, "uploaded");
      } else {
        console.warn(`[cloud-sync] PDF upload deferred for ${doc.id}`, error);
      }
    }
  }
}

async function downloadMissingPdfs(run: SyncRun): Promise<void> {
  for (const doc of collection<StudyDocument>("documents").all()) {
    if (!isCurrent(run)) return;
    if (await getDocumentFile(doc.id)) continue;
    try {
      const blob = await downloadPrivateFile("study-documents", `${run.userId}/${doc.id}.pdf`);
      if (!isCurrent(run)) return;
      await saveDocumentFile(doc.id, blob);
    } catch (error) {
      console.warn(`[cloud-sync] PDF unavailable for ${doc.id}`, error);
    }
  }
}

async function purgeDeletedDocumentAssets(run: SyncRun, snapshot: Snapshot): Promise<void> {
  const deleted = snapshot.tombstones.documents ?? {};
  const active = new Set((snapshot.collections.documents ?? []).map((doc) => doc.id));
  for (const [documentId, deletedAt] of Object.entries(deleted)) {
    if (active.has(documentId) || !isCurrent(run)) continue;
    try {
      await supabaseRest<unknown>(
        "recall_document_texts",
        `user_id=eq.${encodeURIComponent(run.userId)}&document_id=eq.${encodeURIComponent(documentId)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
      await deletePrivateFile("study-documents", `${run.userId}/${documentId}.pdf`);
    } catch (error) {
      // The tombstone remains authoritative; cleanup can be retried next sync.
      console.warn(`[cloud-sync] deleted document asset cleanup deferred for ${documentId} (${deletedAt})`, error);
    }
  }
}

async function persistOnce(run: SyncRun): Promise<void> {
  if (!isCurrent(run)) return;
  await uploadMissingPdfs(run);
  if (!isCurrent(run)) return;
  await syncDocumentTexts(run);
  if (!isCurrent(run)) return;
  const local = await buildSnapshot(run);
  if (!isCurrent(run)) return;
  const acknowledged = await writeSnapshotCAS(run, local);
  if (!isCurrent(run)) return;
  await purgeDeletedDocumentAssets(run, acknowledged);
  if (!isCurrent(run)) return;
  acknowledgeDeletionTombstones(run.userId, acknowledged.tombstones);
  if (Object.keys(run.inheritedGuestTombstones).length) {
    acknowledgeDeletionTombstones(GUEST_SCOPE, run.inheritedGuestTombstones);
    run.inheritedGuestTombstones = {};
  }
}

function persist(run: SyncRun): Promise<void> {
  if (!isCurrent(run)) return Promise.resolve();
  const flightKey = `${run.userId}:${run.generation}`;
  const existing = inFlight.get(flightKey);
  if (existing) {
    run.dirty = true;
    return existing;
  }
  const task = (async () => {
    do {
      run.dirty = false;
      await persistOnce(run);
    } while (isCurrent(run) && run.dirty);
  })().finally(() => {
    if (inFlight.get(flightKey) === task) inFlight.delete(flightKey);
  });
  inFlight.set(flightKey, task);
  return task;
}

function schedulePersist(run: SyncRun): void {
  if (!isCurrent(run)) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void persist(run).catch((error) => console.error("Recall Quiz cloud sync failed:", error));
  }, DEBOUNCE_MS);
}

export async function startCloudSync(userId: string): Promise<() => void> {
  stopCurrent?.();
  generation += 1;
  const run: SyncRun = {
    userId,
    generation,
    active: true,
    dirty: false,
    inheritedGuestTombstones: {},
  };
  currentRun = run;
  const previousOwner = localStorage.getItem(LOCAL_OWNER_KEY);
  const sameOwner = previousOwner === userId;
  const firstAccountOnThisBrowser = !previousOwner;
  if (firstAccountOnThisBrowser) run.inheritedGuestTombstones = getDeletionTombstones(GUEST_SCOPE);
  setDeletionScope(userId);
  let unsubscribers: Array<() => void> = [];

  try {
    if (previousOwner && !sameOwner) {
      // Blob keys and small preferences are local-only and not account namespaced.
      // Clear them before loading the new owner's data to prevent account bleed.
      await clearAllBlobs();
      clearDocumentTextCache();
      resetSettings();
      resetResume();
    }
    const remoteRow = await fetchSnapshot(userId);
    if (!isCurrent(run)) return () => undefined;
    const remote = remoteRow?.data;

    if (remote && [1, 2].includes(Number(remote.version))) {
      const localCollections = (!previousOwner || sameOwner)
        ? Object.fromEntries(COLLECTIONS.map((name) => [name, collection(name).all()])) as Snapshot["collections"]
        : {};
      const migrationTimestamp = !previousOwner ? new Date().toISOString() : undefined;
      const localSnapshot: Snapshot = {
        version: 2,
        collections: localCollections,
        tombstones: mergeTombstones(getDeletionTombstones(userId), run.inheritedGuestTombstones),
        settings: getSettings(),
        resume: getResume(),
        settingsUpdatedAt: getSettingsUpdatedAt() ?? migrationTimestamp,
        resumeUpdatedAt: getResumeUpdatedAt() ?? migrationTimestamp,
      };
      const merged = mergeSnapshots(remote, localSnapshot, run.inheritedGuestTombstones);
      for (const name of COLLECTIONS) {
        collection(name).hydrate(merged.collections[name] ?? [], true);
      }
      if (merged.settings) replaceSettings(merged.settings, merged.settingsUpdatedAt);
      if (merged.resume) replaceResume(merged.resume, merged.resumeUpdatedAt);
      const textRows = await supabaseRest<DocumentTextRow[]>(
        "recall_document_texts",
        `select=document_id,pages&user_id=eq.${encodeURIComponent(userId)}&limit=500`,
      );
      if (!isCurrent(run)) return () => undefined;
      const activeDocumentIds = new Set(collection<StudyDocument>("documents").all().map((doc) => doc.id));
      for (const row of textRows) {
        if (activeDocumentIds.has(row.document_id) && Array.isArray(row.pages)) {
          await saveDocumentText(row.document_id, row.pages);
        }
      }
      await downloadMissingPdfs(run);
    } else if (previousOwner && !sameOwner) {
      // Switching to a different account must never merge the previous owner's cache.
      for (const name of COLLECTIONS) collection(name).hydrate([], true);
      resetSettings();
      resetResume();
    }


    if (!isCurrent(run)) return () => undefined;
    // Subscribe before the first write so edits made while hydration/CAS is in
    // progress are queued and cannot be lost between the initial snapshot and
    // subscription setup.
    unsubscribers = COLLECTIONS.map((name) => collection(name).subscribe(() => schedulePersist(run)));
    unsubscribers.push(subscribeSettings(() => schedulePersist(run)));
    // Mark this browser as belonging to the account only after its first
    // snapshot is safely acknowledged. If the initial write fails, a retry
    // must still recognize and migrate the guest cache and guest tombstones.
    await persist(run);
    if (!isCurrent(run)) return () => undefined;
    localStorage.setItem(LOCAL_OWNER_KEY, userId);
  } catch (error) {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    run.active = false;
    if (currentRun === run) currentRun = null;
    throw error;
  }

  if (!isCurrent(run)) return () => undefined;
  const stop = () => {
    run.active = false;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    if (currentRun === run) {
      currentRun = null;
      generation += 1;
    }
    if (debounce) clearTimeout(debounce);
    debounce = null;
    if (stopCurrent === stop) stopCurrent = null;
  };
  stopCurrent = stop;
  return stop;
}

export async function flushCloudSync(userId: string): Promise<void> {
  const run = currentRun;
  if (!run || run.userId !== userId || !isCurrent(run)) return;
  if (debounce) clearTimeout(debounce);
  debounce = null;
  await persist(run);
}
