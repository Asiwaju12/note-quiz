import { supabaseAuth, supabaseRest, uploadPrivateFile } from "./supabase";
import type { ScoreEntry } from "./types";
import { loadScores } from "./storage";

export type CloudNote = { id: string; title: string; content: string; source_files: unknown[] };
export async function loadCloudNote(): Promise<CloudNote | null> {
  const rows = await supabaseRest<CloudNote[]>("study_notes", "select=id,title,content,source_files&order=updated_at.desc&limit=1");
  return rows[0] ?? null;
}
export async function saveCloudNote(userId: string, title: string, content: string): Promise<void> {
  const existing = await loadCloudNote();
  const values = { title: title.trim().slice(0, 160) || "Untitled notes", content };
  if (existing) {
    await supabaseRest<unknown>("study_notes", `id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(values),
    });
  } else {
    await supabaseRest<unknown>("study_notes", "select=id", {
      method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...values, user_id: userId }),
    });
  }
}
type ScoreRow = { id: string; handle: string; score: number; level: number; streak: number; accuracy: number; created_at: string };
export async function loadCloudScores(): Promise<ScoreEntry[]> {
  const rows = await supabaseRest<ScoreRow[]>("quiz_scores", "select=id,handle,score,level,streak,accuracy,created_at&mode=eq.classic&order=score.desc&limit=8");
  return rows.map((row) => ({ id: row.id, name: row.handle, score: row.score, level: row.level, streak: row.streak, accuracy: row.accuracy, date: row.created_at }));
}
export async function saveCloudScore(userId: string, handle: string, entry: ScoreEntry): Promise<ScoreEntry[]> {
  await supabaseRest<unknown>("quiz_scores", "select=id", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, handle, score: entry.score, level: entry.level, streak: entry.streak, accuracy: entry.accuracy, mode: "classic" }),
  });
  return loadCloudScores();
}
export async function clearCloudScores(): Promise<void> {
  const session = await supabaseAuth.getSession();
  if (!session) throw new Error("Please sign in to clear cloud scores.");
  await supabaseRest<unknown>("quiz_scores", `user_id=eq.${encodeURIComponent(session.user.id)}&mode=eq.classic`, { method: "DELETE" });
}

export async function uploadStudyFiles(userId: string, files: File[]): Promise<void> {
  for (const file of files) {
    const objectPath = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    await uploadPrivateFile("study-documents", objectPath, file);
    await supabaseRest<unknown>("study_documents", "select=id", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: userId,
        bucket_id: "study-documents",
        object_path: objectPath,
        original_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      }),
    });
  }
}

export async function migrateLocalScores(userId: string, handle: string): Promise<ScoreEntry[]> {
  const marker = `note-quiz.cloud-scores-migrated.${userId}`;
  try {
    if (window.localStorage.getItem(marker) === "true") return loadCloudScores();
    const legacy = loadScores();
    for (const entry of legacy) await saveCloudScore(userId, handle, entry);
    window.localStorage.setItem(marker, "true");
    return loadCloudScores();
  } catch (error) {
    console.error("Could not migrate local scores to Supabase:", error);
    throw error;
  }
}
