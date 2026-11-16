import { supabaseRest } from "./supabase";

export type CloudNote = { id: string; title: string; content: string; source_files: unknown[] };

export async function loadCloudNote(): Promise<CloudNote | null> {
  const rows = await supabaseRest<CloudNote[]>(
    "study_notes",
    "select=id,title,content,source_files&order=updated_at.desc&limit=1",
  );
  return rows[0] ?? null;
}

export async function saveCloudNote(userId: string, title: string, content: string): Promise<void> {
  const existing = await loadCloudNote();
  const values = { title: title.trim().slice(0, 160) || "Untitled notes", content };
  if (existing) {
    await supabaseRest<unknown>(
      "study_notes",
      `id=eq.${encodeURIComponent(existing.id)}`,
      { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(values) },
    );
    return;
  }
  await supabaseRest<unknown>(
    "study_notes",
    "select=id",
    { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...values, user_id: userId }) },
  );
}
