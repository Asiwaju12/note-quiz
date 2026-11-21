import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const sourcePath = path.resolve("src/data/cloud-sync-merge.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const collectionNames = [
  "folders", "documents", "artifacts", "decks", "cards", "reviewLogs", "attempts",
  "dailyStats", "activity", "chats", "messages", "goals", "tasks", "achievements",
  "topicProgress", "highlights", "bookmarks", "docNotes", "challengeClaims",
];
const compiled = ts.transpileModule(source, {
  fileName: sourcePath,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(
  'import { COLLECTIONS } from "./db";',
  `const COLLECTIONS = ${JSON.stringify(collectionNames)};`,
);
const tempPath = path.join(os.tmpdir(), `recall-cloud-sync-merge-${process.pid}.mjs`);
fs.writeFileSync(tempPath, compiled);

try {
  const { mergeRows, mergeSnapshots, mergeTombstones } = await import(pathToFileURL(tempPath).href);
  const empty = { version: 2, collections: {}, tombstones: {}, settings: {}, resume: {} };
  const oldRow = { id: "doc-1", createdAt: "2026-11-20T10:00:00.000Z", updatedAt: "2026-11-20T10:00:00.000Z" };

  const deletion = mergeSnapshots(
    { ...empty, collections: { documents: [oldRow] } },
    { ...empty, collections: { documents: [] }, tombstones: { documents: { "doc-1": "2026-11-20T11:00:00.000Z" } } },
  );
  assert.equal(deletion.collections.documents.length, 0, "a deletion tombstone must suppress an older cloud row");

  const recreated = mergeSnapshots(
    { ...empty, tombstones: { documents: { "doc-1": "2026-11-20T11:00:00.000Z" } }, collections: { documents: [] } },
    { ...empty, collections: { documents: [{ ...oldRow, updatedAt: "2026-11-20T12:00:00.000Z" }] } },
  );
  assert.equal(recreated.collections.documents.length, 1, "a deliberate recreation newer than the tombstone must survive");

  const newest = mergeRows(
    [{ id: "card-1", updatedAt: "2026-11-20T10:00:00.000Z", front: "old" }],
    [{ id: "card-1", updatedAt: "2026-11-20T11:00:00.000Z", front: "new" }],
  );
  assert.equal(newest[0].front, "new", "the latest row version must win a concurrent merge");

  const tombstones = mergeTombstones(
    { documents: { "doc-1": "2026-11-20T10:00:00.000Z" } },
    { documents: { "doc-1": "2026-11-20T11:00:00.000Z" } },
  );
  assert.equal(tombstones.documents["doc-1"], "2026-11-20T11:00:00.000Z", "the newest tombstone must be retained");

  const settingsMerge = mergeSnapshots(
    { ...empty, settings: { name: "Remote" }, settingsUpdatedAt: "2026-11-20T10:00:00.000Z" },
    { ...empty, settings: { name: "Local" }, settingsUpdatedAt: "2026-11-20T11:00:00.000Z" },
  );
  assert.equal(settingsMerge.settings.name, "Local", "equal-version settings resolve consistently in favour of the current local snapshot");

  console.log("Recall cloud-sync merge tests: 5 passed.");
} finally {
  fs.rmSync(tempPath, { force: true });
}
