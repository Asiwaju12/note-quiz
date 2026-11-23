import { COLLECTIONS, type CollectionName } from "./db";
import type { Settings, ResumeState } from "./settings";

type Row = { id: string; [key: string]: unknown };
type Tombstones = Partial<Record<CollectionName, Record<string, string>>>;
export type SyncSnapshot = {
  version: 2;
  collections: Partial<Record<CollectionName, Row[]>>;
  tombstones: Tombstones;
  settings: Settings;
  resume: ResumeState;
  settingsUpdatedAt?: string;
  resumeUpdatedAt?: string;
};

export function timestampOf(value: Record<string, unknown>): number {
  for (const key of ["updatedAt", "at", "finishedAt", "createdAt", "unlockedAt"]) {
    const raw = value[key];
    if (typeof raw === "string") {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

export function mergeTombstones(...sets: Tombstones[]): Tombstones {
  const result: Tombstones = {};
  for (const set of sets) {
    for (const name of COLLECTIONS) {
      const source = set[name] ?? {};
      const target = result[name] ?? (result[name] = {});
      for (const [id, at] of Object.entries(source)) {
        if (!target[id] || Date.parse(at) > Date.parse(target[id])) target[id] = at;
      }
    }
  }
  return result;
}

export function mergeRows(remote: Row[], local: Row[]): Row[] {
  const rows = new Map<string, Row>();
  for (const row of remote) rows.set(row.id, row);
  for (const row of local) {
    const previous = rows.get(row.id);
    // Prefer the local copy on equal timestamps. DailyStat records created by
    // older app versions had no updatedAt field, so both copies otherwise
    // compared as timestamp 0 and cloud values could never receive new minutes.
    if (!previous || timestampOf(row) >= timestampOf(previous)) rows.set(row.id, row);
  }
  return [...rows.values()];
}

export function applyTombstones(collections: SyncSnapshot["collections"], tombstones: Tombstones): void {
  for (const name of COLLECTIONS) {
    const deleted = tombstones[name] ?? {};
    if (!Object.keys(deleted).length) continue;
    collections[name] = (collections[name] ?? []).filter((row) => {
      const deletedAt = Date.parse(deleted[row.id] ?? "");
      return !Number.isFinite(deletedAt) || timestampOf(row) > deletedAt;
    });
  }
}

export function mergeSnapshots(remote: SyncSnapshot | undefined, local: SyncSnapshot, extraTombstones: Tombstones = {}): SyncSnapshot {
  const tombstones = mergeTombstones(remote?.tombstones ?? {}, local.tombstones ?? {}, extraTombstones);
  const collections = {} as SyncSnapshot["collections"];
  for (const name of COLLECTIONS) {
    collections[name] = mergeRows(remote?.collections?.[name] ?? [], local.collections?.[name] ?? []);
  }
  applyTombstones(collections, tombstones);

  const localSettingsWins = !remote?.settings || Date.parse(local.settingsUpdatedAt ?? "") >= Date.parse(remote.settingsUpdatedAt ?? "");
  const localResumeWins = !remote?.resume || Date.parse(local.resumeUpdatedAt ?? "") >= Date.parse(remote.resumeUpdatedAt ?? "");
  return {
    version: 2,
    collections,
    tombstones,
    settings: localSettingsWins ? local.settings : remote.settings,
    resume: localResumeWins ? local.resume : remote.resume,
    settingsUpdatedAt: localSettingsWins ? local.settingsUpdatedAt : remote.settingsUpdatedAt,
    resumeUpdatedAt: localResumeWins ? local.resumeUpdatedAt : remote.resumeUpdatedAt,
  };
}

