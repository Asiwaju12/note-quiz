import { ensureBrandMigration } from "./storage";

export type Account = {
  id: string;
  name: string;
  email: string;
  handle: string;
  passwordHash: string;
  color: string;
  createdAt: string;
};

export type PublicAccount = Omit<Account, "passwordHash">;

const ACCOUNTS_KEY = "recall.accounts.v1";
const SESSION_KEY = "recall.session.v1";

const AVATAR_COLORS = ["#CBF54A", "#B9A6F2", "#FF8061", "#A6DCF2"];

function safeGet(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* local-only fallback: profiles won't persist, but the app keeps working */
  }
}

/** Lightweight local obfuscation. Profiles never leave this browser. */
export function hashPassword(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `rr_${(hash >>> 0).toString(16).padStart(8, "0")}_${value.length}`;
}

function createId(): string {
  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function toPublic(account: Account): PublicAccount {
  const { passwordHash: _passwordHash, ...rest } = account;
  return rest;
}

export function loadAccounts(): Account[] {
  ensureBrandMigration();
  try {
    const parsed = JSON.parse(safeGet(ACCOUNTS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.email === "string" &&
        typeof entry.passwordHash === "string" &&
        typeof entry.name === "string",
    ) as Account[];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: Account[]): void {
  safeSet(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function loadSession(): PublicAccount | null {
  const id = safeGet(SESSION_KEY);
  if (!id) return null;
  const account = loadAccounts().find((entry) => entry.id === id);
  return account ? toPublic(account) : null;
}

export function saveSession(account: PublicAccount | null): void {
  safeSet(SESSION_KEY, account ? account.id : "");
}

export function initialsFor(account: PublicAccount | null): string {
  if (!account) return "YOU";
  return (account.handle || account.name || "YOU").slice(0, 3).toUpperCase();
}

export function deriveHandle(name: string): string {
  const letters = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (letters.length === 0) return "YOU";
  if (letters.length === 1) return letters[0].slice(0, 3).toUpperCase();
  return `${letters[0][0]}${letters[letters.length - 1][0]}`.slice(0, 3).toUpperCase();
}

export type AuthResult =
  | { ok: true; account: PublicAccount; created?: boolean }
  | { ok: false; error: string; field?: "name" | "email" | "handle" | "password" };

export type SignUpInput = {
  name: string;
  email: string;
  handle: string;
  password: string;
};

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function signUp(input: SignUpInput): AuthResult {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const handle = input.handle.trim().toUpperCase();
  if (name.length < 2) return { ok: false, error: "Add a display name with at least 2 characters.", field: "name" };
  if (name.length > 24) return { ok: false, error: "Keep your display name to 24 characters.", field: "name" };
  if (!validateEmail(email)) return { ok: false, error: "That email doesn't look quite right.", field: "email" };
  if (!/^[A-Z0-9]{2,4}$/.test(handle)) {
    return { ok: false, error: "Use 2–4 letters or numbers for your board tag.", field: "handle" };
  }
  if (input.password.length < 6) {
    return { ok: false, error: "Use at least 6 characters for your password.", field: "password" };
  }

  const accounts = loadAccounts();
  if (accounts.some((entry) => entry.email.toLowerCase() === email)) {
    return { ok: false, error: "A profile with that email already exists on this device.", field: "email" };
  }
  if (accounts.some((entry) => entry.handle.toUpperCase() === handle)) {
    return { ok: false, error: "That board tag is already taken on this device.", field: "handle" };
  }

  const account: Account = {
    id: createId(),
    name,
    email,
    handle,
    passwordHash: hashPassword(input.password),
    color: AVATAR_COLORS[accounts.length % AVATAR_COLORS.length],
    createdAt: new Date().toISOString(),
  };
  saveAccounts([...accounts, account]);
  saveSession(toPublic(account));
  return { ok: true, account: toPublic(account), created: true };
}

export function signIn(email: string, password: string): AuthResult {
  const normalized = email.trim().toLowerCase();
  if (!validateEmail(normalized)) {
    return { ok: false, error: "Enter the email you signed up with.", field: "email" };
  }
  if (!password) {
    return { ok: false, error: "Your password is required.", field: "password" };
  }
  const account = loadAccounts().find((entry) => entry.email.toLowerCase() === normalized);
  if (!account || account.passwordHash !== hashPassword(password)) {
    return { ok: false, error: "That email and password don't match a profile on this device.", field: "password" };
  }
  saveSession(toPublic(account));
  return { ok: true, account: toPublic(account) };
}

export function signInDemo(): AuthResult {
  const accounts = loadAccounts();
  const existing = accounts.find(
    (entry) => entry.email === "demo@recall.app" || entry.email === "demo@mnemobop.app",
  );
  if (existing) {
    saveSession(toPublic(existing));
    return { ok: true, account: toPublic(existing) };
  }
  const account: Account = {
    id: createId(),
    name: "Demo Player",
    email: "demo@recall.app",
    handle: "DEM",
    passwordHash: hashPassword("demo1234"),
    color: "#CBF54A",
    createdAt: new Date().toISOString(),
  };
  saveAccounts([...accounts, account]);
  saveSession(toPublic(account));
  return { ok: true, account: toPublic(account), created: true };
}

export function signOut(): void {
  saveSession(null);
}

export function updateAccountName(id: string, name: string): PublicAccount | null {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return null;
  const accounts = loadAccounts().map((entry) => (entry.id === id ? { ...entry, name: trimmed } : entry));
  saveAccounts(accounts);
  const next = accounts.find((entry) => entry.id === id);
  if (!next) return null;
  saveSession(toPublic(next));
  return toPublic(next);
}

export function deleteAccount(id: string): void {
  saveAccounts(loadAccounts().filter((entry) => entry.id !== id));
  if (safeGet(SESSION_KEY) === id) saveSession(null);
}
