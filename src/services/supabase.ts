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
  expires_in?: number;
  token_type?: string;
  user: SupabaseUser;
};

const SESSION_KEY = "note-quiz.supabase.session.v1";
const SESSION_EVENT = "note-quiz:auth-change";
function configured(): boolean { return Boolean(SUPABASE_URL && SUPABASE_KEY); }
function readSession(): SupabaseSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as SupabaseSession : null;
  } catch { return null; }
}
function writeSession(session: SupabaseSession | null): void {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    if (session) throw new Error("Your browser could not save the sign-in session. Check browser storage settings.");
  }
}
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  if (!configured()) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your environment.");
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY!);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.msg ?? payload?.message ?? payload?.error_description ?? payload?.error ?? "Supabase request failed.";
    throw new Error(String(message));
  }
  return payload as T;
}
function withExpiry<T extends SupabaseSession>(data: T): T {
  return { ...data, expires_at: data.expires_at ?? (data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined) };
}
export const supabaseAuth = {
  async signUp(email: string, password: string, metadata: Record<string, unknown>) {
    // Always return confirmation links to the site where signup began.
    // Otherwise Supabase falls back to its Site URL, which may still be the old deployment.
    const redirectTo = `${window.location.origin}/`;
    const data = await request<SupabaseSession>(
      `/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: "POST",
        body: JSON.stringify({ email, password, data: metadata }),
      },
    );
    if (data.access_token && data.refresh_token) writeSession(withExpiry(data));
    return data;
  },
  async signIn(email: string, password: string) {
    const data = await request<SupabaseSession>("/auth/v1/token?grant_type=password", {
      method: "POST", body: JSON.stringify({ email, password }),
    });
    writeSession(withExpiry(data));
    return data;
  },
  async refresh() {
    const current = readSession();
    if (!current?.refresh_token) return null;
    try {
      const data = await request<SupabaseSession>("/auth/v1/token?grant_type=refresh_token", {
        method: "POST", body: JSON.stringify({ refresh_token: current.refresh_token }),
      });
      const next = withExpiry(data);
      writeSession(next);
      return next;
    } catch (error) {
      writeSession(null);
      throw error;
    }
  },
  async getSession() {
    const current = readSession();
    if (!current) return null;
    if (current.expires_at && current.expires_at < Date.now() / 1000 + 60) return this.refresh();
    return current;
  },
  async signOut() {
    const current = readSession();
    // End the browser session immediately. A slow/offline Auth request must
    // never leave the user appearing signed in.
    writeSession(null);
    if (!current) return;
    try {
      await request("/auth/v1/logout", {
        method: "POST",
        signal: AbortSignal.timeout(4000),
      }, current.access_token);
    } catch {
      // Local sign-out is complete; remote revocation is best-effort.
    }
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

/** Public SELECT access governed by the table's anon RLS policies. */
export async function supabasePublicRest<T>(table: string, query: string, init: RequestInit = {}): Promise<T> {
  return request<T>(`/rest/v1/${table}?${query}`, init);
}
export async function downloadPrivateFile(bucket: string, objectPath: string): Promise<Blob> {
  const session = await supabaseAuth.getSession();
  if (!session) throw new Error("Please sign in to download your files.");
  const path = objectPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${path}`, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(String(detail?.message ?? detail?.error ?? "The file could not be downloaded."));
  }
  return response.blob();
}
export async function uploadPrivateFile(bucket: string, objectPath: string, file: File): Promise<void> {
  const session = await supabaseAuth.getSession();
  if (!session) throw new Error("Please sign in to upload files.");
  const path = objectPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${session.access_token}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
    body: file,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(String(detail?.message ?? detail?.error ?? "The file could not be uploaded."));
  }
}

export async function deletePrivateFile(bucket: string, objectPath: string): Promise<void> {
  const session = await supabaseAuth.getSession();
  if (!session) throw new Error("Please sign in to delete files.");
  const path = objectPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "DELETE",
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok && response.status !== 404) {
    const detail = await response.json().catch(() => null);
    throw new Error(String(detail?.message ?? detail?.error ?? "The file could not be deleted."));
  }
}
/**
 * Consume Supabase's browser implicit-flow callback after email verification.
 * Validate the access token with Auth before persisting the returned session.
 */
export async function restoreAuthSessionFromUrl(): Promise<{ type: string | null; error: string | null }> {
  const fragment = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');
  const callbackError = params.get('error_description') || params.get('error');

  if (!accessToken && !refreshToken && !callbackError) return { type: null, error: null };

  const cleanCallbackUrl = () => {
    window.history.replaceState(window.history.state, document.title, `${window.location.pathname}${window.location.search}`);
  };

  if (callbackError) {
    cleanCallbackUrl();
    return { type, error: callbackError };
  }
  if (!accessToken || !refreshToken) {
    cleanCallbackUrl();
    return { type, error: 'This confirmation link is incomplete. Please request a new email.' };
  }

  try {
    const user = await request<SupabaseUser>('/auth/v1/user', {}, accessToken);
    const expiresIn = Number(params.get('expires_in')) || 3600;
    const expiresAt = Number(params.get('expires_at')) || Math.floor(Date.now() / 1000) + expiresIn;
    writeSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      expires_at: expiresAt,
      token_type: params.get('token_type') || 'bearer',
      user,
    });
    cleanCallbackUrl();
    return { type, error: null };
  } catch (error) {
    cleanCallbackUrl();
    return {
      type,
      error: error instanceof Error ? error.message : 'We could not complete the confirmation link. Please sign in again.',
    };
  }
}
export function onSupabaseSessionChange(callback: (session: SupabaseSession | null) => void): () => void {
  const listener = () => callback(readSession());
  window.addEventListener(SESSION_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(SESSION_EVENT, listener); window.removeEventListener("storage", listener); };
}
export function isSupabaseConfigured(): boolean { return configured(); }
