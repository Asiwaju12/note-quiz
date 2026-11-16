import { supabaseAuth, supabaseRest, isSupabaseConfigured, type SupabaseSession } from "./supabase";

export type PublicAccount = {
  id: string;
  name: string;
  email: string;
  handle: string;
  color: string;
  createdAt: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  handle: string;
  avatar_color: string;
  created_at: string;
};

const AVATAR_COLORS = ["#CBF54A", "#B9A6F2", "#FF8061", "#A6DCF2"];
export function initialsFor(account: PublicAccount | null): string {
  if (!account) return "YOU";
  return (account.handle || account.name || "YOU").slice(0, 3).toUpperCase();
}
export function deriveHandle(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\\s+/).filter(Boolean);
  if (!parts.length) return "YOU";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.slice(0, 3).toUpperCase();
}
export type AuthResult =
  | { ok: true; account: PublicAccount; created?: boolean }
  | { ok: false; error: string; field?: "name" | "email" | "handle" | "password" };
export type SignUpInput = { name: string; email: string; handle: string; password: string };
function validateEmail(email: string) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email); }

async function accountForSession(session: SupabaseSession): Promise<PublicAccount> {
  const rows = await supabaseRest<ProfileRow[]>(
    "profiles",
    `select=id,display_name,handle,avatar_color,created_at&id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
  );
  const profile = rows[0];
  if (!profile) throw new Error("Your account was created, but its profile is still being prepared. Please sign in again in a moment.");
  return {
    id: profile.id,
    name: profile.display_name || String(session.user.user_metadata?.display_name || "New player"),
    email: session.user.email || "",
    handle: profile.handle,
    color: profile.avatar_color || AVATAR_COLORS[0],
    createdAt: profile.created_at,
  };
}

export async function loadSession(): Promise<PublicAccount | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const session = await supabaseAuth.getSession();
    return session ? await accountForSession(session) : null;
  } catch {
    return null;
  }
}

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const handle = input.handle.trim().toUpperCase();
  if (name.length < 2 || name.length > 24) return { ok: false, error: "Use a display name between 2 and 24 characters.", field: "name" };
  if (!validateEmail(email)) return { ok: false, error: "That email doesn't look quite right.", field: "email" };
  if (!/^[A-Z0-9]{2,4}$/.test(handle)) return { ok: false, error: "Use 2–4 letters or numbers for your board tag.", field: "handle" };
  if (input.password.length < 8) return { ok: false, error: "Use at least 8 characters for your password.", field: "password" };
  try {
    const data = await supabaseAuth.signUp(email, input.password, { display_name: name, handle });
    if (!data.access_token || !data.refresh_token) {
      return { ok: false, error: "Check your email to confirm your account, then return here and sign in." };
    }
    const session: SupabaseSession = { ...data, expires_at: data.expires_in ? Date.now() / 1000 + data.expires_in : undefined } as SupabaseSession;
    return { ok: true, account: await accountForSession(session), created: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create your account." };
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  if (!validateEmail(normalized)) return { ok: false, error: "Enter a valid email address.", field: "email" };
  if (!password) return { ok: false, error: "Your password is required.", field: "password" };
  try {
    const session = await supabaseAuth.signIn(normalized, password);
    return { ok: true, account: await accountForSession(session) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Sign-in failed." };
  }
}

/** Demo profiles are intentionally disabled: demo credentials must never bypass real authentication. */
export async function signInDemo(): Promise<AuthResult> {
  return { ok: false, error: "Demo sign-in is unavailable. Create an account or sign in with your email." };
}
export async function signOut(): Promise<void> { await supabaseAuth.signOut(); }

export async function updateAccountName(id: string, name: string): Promise<PublicAccount | null> {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return null;
  try {
    const rows = await supabaseRest<ProfileRow[]>(
      "profiles",
      `id=eq.${encodeURIComponent(id)}&select=id,display_name,handle,avatar_color,created_at`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ display_name: trimmed }) },
    );
    const profile = rows[0];
    if (!profile) return null;
    const session = await supabaseAuth.getSession();
    return session ? { id: profile.id, name: profile.display_name, email: session.user.email || "", handle: profile.handle, color: profile.avatar_color, createdAt: profile.created_at } : null;
  } catch { return null; }
}
export async function deleteAccount(_id: string): Promise<void> {
  throw new Error("Account deletion must be requested through the secure account-deletion flow.");
}
