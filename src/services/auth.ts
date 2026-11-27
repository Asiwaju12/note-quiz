import { supabaseAuth, supabaseRest, isSupabaseConfigured, type SupabaseSession } from "./supabase";

export type PublicAccount = { id: string; name: string; email: string; handle: string; color: string; createdAt: string };
type ProfileRow = { id: string; display_name: string; handle: string; avatar_color: string; created_at: string };
const AVATAR_COLORS = ["#CBF54A", "#B9A6F2", "#FF8061", "#A6DCF2"];
export function initialsFor(account: PublicAccount | null): string {
  if (!account) return "YOU";
  return (account.handle || account.name || "YOU").slice(0, 3).toUpperCase();
}
export function deriveHandle(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "YOU";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.slice(0, 3).toUpperCase();
}
export type AuthResult = { ok: true; account: PublicAccount; created?: boolean } | { ok: false; error: string; field?: "name" | "email" | "handle" | "password" };
const EXISTING_EMAIL_MESSAGE = "This email has already been used to create an account. Please switch to Sign in instead.";
export type SignUpInput = { name: string; email: string; handle: string; password: string };
function validateEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email); }
async function accountForSession(session: SupabaseSession): Promise<PublicAccount> {
  const rows = await supabaseRest<ProfileRow[]>("profiles", `select=id,display_name,handle,avatar_color,created_at&id=eq.${encodeURIComponent(session.user.id)}&limit=1`);
  const profile = rows[0];
  if (!profile) throw new Error("Your profile is still being prepared. Please sign in again in a moment.");
  return { id: profile.id, name: profile.display_name || String(session.user.user_metadata?.display_name || "New player"), email: session.user.email || "", handle: profile.handle, color: profile.avatar_color || AVATAR_COLORS[0], createdAt: profile.created_at };
}
export async function loadSession(): Promise<PublicAccount | null> {
  if (!isSupabaseConfigured()) return null;
  try { const session = await supabaseAuth.getSession(); return session ? await accountForSession(session) : null; } catch { return null; }
}
export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const name = input.name.trim(), email = input.email.trim().toLowerCase(), handle = input.handle.trim().toUpperCase();
  if (name.length < 2 || name.length > 24) return { ok: false, error: "Use a display name between 2 and 24 characters.", field: "name" };
  if (!validateEmail(email)) return { ok: false, error: "That email doesn't look quite right.", field: "email" };
  if (!/^[A-Z0-9]{2,4}$/.test(handle)) return { ok: false, error: "Use 2–4 letters or numbers for your board tag.", field: "handle" };
  if (input.password.length < 8) return { ok: false, error: "Use at least 8 characters for your password.", field: "password" };
  try {
    // Check existing accounts through the server-only Supabase Admin API.
    // Never ship the service-role key to the browser.
    const emailCheck = await fetch("/api/auth/email-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (emailCheck.ok) {
      const check = await emailCheck.json() as { exists?: boolean };
      if (check.exists) return { ok: false, error: EXISTING_EMAIL_MESSAGE, field: "email" };
    } else {
      const check = await emailCheck.json().catch(() => null) as { error?: string } | null;
      return { ok: false, error: check?.error || "We couldn't check this email right now. Please try again." };
    }
    const data = await supabaseAuth.signUp(email, input.password, { display_name: name, handle });
    // Supabase may mask duplicate signups with a successful-looking confirmation response.
    // Empty identities is its documented duplicate signal; an older created_at timestamp
    // also identifies an existing unconfirmed account when identities are included.
    const accountCreatedAt = data.user?.created_at ? Date.parse(data.user.created_at) : NaN;
    const accountAlreadyExisted = Number.isFinite(accountCreatedAt) && accountCreatedAt < Date.now() - 120_000;
    if ((Array.isArray(data.user?.identities) && data.user.identities.length === 0) || accountAlreadyExisted) {
      return { ok: false, error: EXISTING_EMAIL_MESSAGE, field: "email" };
    }
    if (!data.access_token || !data.refresh_token) return { ok: false, error: "Check your email to confirm your account, then return here and sign in." };
    return { ok: true, account: await accountForSession(data), created: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create your account.";
    if (/user_already_exists|email_exists|already registered|already been registered|email.{0,30}already exists|already exists/i.test(message)) {
      return { ok: false, error: EXISTING_EMAIL_MESSAGE, field: "email" };
    }
    return { ok: false, error: message };
  }
}
export async function signIn(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  if (!validateEmail(normalized)) return { ok: false, error: "Enter a valid email address.", field: "email" };
  if (!password) return { ok: false, error: "Your password is required.", field: "password" };
  try { const session = await supabaseAuth.signIn(normalized, password); return { ok: true, account: await accountForSession(session) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Sign-in failed." }; }
}
export async function signInDemo(): Promise<AuthResult> { return { ok: false, error: "Demo sign-in is unavailable. Create an account or sign in with your email." }; }
export async function signOut(): Promise<void> { await supabaseAuth.signOut(); }
export async function updateAccountName(id: string, name: string): Promise<PublicAccount | null> {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return null;
  try {
    const rows = await supabaseRest<ProfileRow[]>("profiles", `id=eq.${encodeURIComponent(id)}&select=id,display_name,handle,avatar_color,created_at`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ display_name: trimmed }) });
    const profile = rows[0], session = await supabaseAuth.getSession();
    return profile && session ? { id: profile.id, name: profile.display_name, email: session.user.email || "", handle: profile.handle, color: profile.avatar_color, createdAt: profile.created_at } : null;
  } catch { return null; }
}
export async function deleteAccount(_id: string): Promise<void> { throw new Error("Account deletion must be requested through the secure account-deletion flow."); }
