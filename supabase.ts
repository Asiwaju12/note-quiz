const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SupabaseUser;
};

const SESSION_KEY = "note-quiz.supabase.session.v1";

function configured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function readSession(): SupabaseSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SupabaseSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: SupabaseSession | null): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  if (!configured()) throw new Error("Supabase is not configured. Add the project URL and publishable key to the deployment environment.");
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY!,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.msg ?? payload?.message ?? payload?.error_description ?? payload?.error ?? "Supabase request failed.";
    throw new Error(String(message));
  }
  return payload as T;
}

export const supabaseAuth = {
  async signUp(email: string, password: string, metadata: Record<string, unknown>) {
    const data = await request<{ user: SupabaseUser; access_token?: string; refresh_token?: string; expires_in?: number }>("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data: metadata }),
    });
    if (data.access_token && data.refresh_token) {
      writeSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_in ? Date.now() / 1000 + data.expires_in : undefined, user: data.user });
    }
    return data;
  },
  async signIn(email: string, password: string) {
    const data = await request<SupabaseSession>("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    writeSession({ ...data, expires_at: data.expires_in ? Date.now() / 1000 + data.expires_in : undefined });
    return data;
  },
  async refresh() {
    const current = readSession();
    if (!current?.refresh_token) return null;
    const data = await request<SupabaseSession>("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
    writeSession({ ...data, expires_at: data.expires_in ? Date.now() / 1000 + data.expires_in : undefined });
    return data;
  },
  async getSession() {
    const current = readSession();
    if (!current) return null;
    if (current.expires_at && current.expires_at < Date.now() / 1000 + 30) return this.refresh();
    return current;
  },
  async signOut() {
    const current = readSession();
    if (current) {
      try { await request("/auth/v1/logout", { method: "POST" }, current.access_token); } catch { /* local session is always cleared */ }
    }
    writeSession(null);
  },
  async resetPassword(email: string, redirectTo = window.location.origin) {
    return request("/auth/v1/recover", { method: "POST", body: JSON.stringify({ email, redirect_to: redirectTo }) });
  },
};

export async function supabaseRest<T>(table: string, query: string, init: RequestInit = {}): Promise<T> {
  const session = await supabaseAuth.getSession();
  if (!session) throw new Error("Please sign in to continue.");
  return request<T>(`/rest/v1/${table}?${query}`, init, session.access_token);
}

export async function uploadPrivateFile(bucket: string, objectPath: string, file: File): Promise<void> {
  const session = await supabaseAuth.getSession();
  if (!session) throw new Error("Please sign in to upload files.");
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase is not configured.");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
    body: file,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(String(detail?.message ?? detail?.error ?? "The file could not be uploaded."));
  }
}

export function onSupabaseSessionChange(callback: (session: SupabaseSession | null) => void): () => void {
  const listener = () => callback(readSession());
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

export function isSupabaseConfigured(): boolean {
  return configured();
}
