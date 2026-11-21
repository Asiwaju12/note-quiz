/**
 * Account context.
 *
 * - Cloud mode: Supabase env vars are present → the existing Supabase auth
 *   (services/auth.ts) is used, unchanged from the original app.
 * - Local mode: Supabase isn't configured → the app runs fully on this device
 *   with a local profile name. This is clearly labelled in the UI.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { initialsFor, loadSession, signOut as supabaseSignOut, type PublicAccount } from "@/services/auth";
import { isSupabaseConfigured, restoreAuthSessionFromUrl } from "@/services/supabase";
import { saveInitials } from "@/lib/game/storage";
import { useSettings } from "@/data/settings";
import { flushCloudSync, startCloudSync } from "@/data/cloud-sync";

type AccountContextValue = {
  mode: "cloud" | "local";
  account: PublicAccount | null;
  loading: boolean;
  callbackError: string | null;
  displayName: string;
  initials: string;
  authOpen: boolean;
  authMode: "signin" | "signup";
  isGuest: boolean;
  continueAsGuest: () => void;
  openAuth: (mode?: "signin" | "signup") => void;
  closeAuth: () => void;
  handleAuth: (account: PublicAccount) => void;
  signOut: () => Promise<void>;
  setAccount: (account: PublicAccount) => void;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const settings = useSettings();
  const [account, setAccountState] = useState<PublicAccount | null>(null);
  const [loading, setLoading] = useState(configured);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [authPrompted, setAuthPrompted] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");

  useEffect(() => {
    if (!configured) return;
    let active = true;
    void (async () => {
      const callback = await restoreAuthSessionFromUrl();
      const session = await loadSession();
      if (!active) return;
      setCallbackError(callback.error);
      setAccountState(session);
      if (session) saveInitials(initialsFor(session));
      if (callback.error) {
        setAuthMode("signin");
        setAuthOpen(true);
      }
    })()
      .catch((error) => active && setCallbackError(error instanceof Error ? error.message : "Could not restore your session."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [configured]);

  // Keep the new study workspace backed up for signed-in accounts. Guest mode
  // remains local-only; the sync service never runs without a real account.
  useEffect(() => {
    if (!configured || !account?.id) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void startCloudSync(account.id)
      .then((cleanup) => {
        if (cancelled) cleanup();
        else stop = cleanup;
      })
      .catch((error) => console.error("Recall Quiz cloud sync is unavailable:", error));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [configured, account?.id]);

  // Prompt unauthenticated visitors to create an account after the welcome
  // onboarding has finished. Existing signed-in visitors are never interrupted.
  useEffect(() => {
    if (!configured || loading || account || callbackError || isGuest || authPrompted || !settings.onboarded) return;
    setAuthPrompted(true);
    setAuthMode("signup");
    setAuthOpen(true);
  }, [configured, loading, account, callbackError, isGuest, authPrompted, settings.onboarded]);

  const openAuth = useCallback((mode: "signin" | "signup" = "signin") => {
    setIsGuest(false);
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  const value = useMemo<AccountContextValue>(() => {
    const displayName = account?.name || settings.name || "Student";
    return {
      mode: configured ? "cloud" : "local",
      account,
      loading,
      callbackError,
      displayName,
      initials: account ? initialsFor(account) : (settings.name || "You").slice(0, 2).toUpperCase(),
      authOpen,
      authMode,
      isGuest,
      continueAsGuest: () => { setIsGuest(true); setAuthOpen(false); },
      openAuth,
      closeAuth: () => setAuthOpen(false),
      handleAuth: (next) => {
        setAccountState(next);
        saveInitials(initialsFor(next));
        setCallbackError(null);
        setAuthOpen(false);
      },
      signOut: async () => {
        // Give the last queued sync a short opportunity to finish, but never
        // let an offline or stalled request block signing out indefinitely.
        if (account?.id && configured) {
          try {
            await Promise.race([
              flushCloudSync(account.id),
              new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
            ]);
          } catch (error) {
            console.warn("Final cloud sync did not complete before sign-out:", error);
          }
        }
        setAccountState(null);
        await supabaseSignOut();
      },
      setAccount: setAccountState,
    };
  }, [account, loading, callbackError, authOpen, authMode, isGuest, configured, settings.name, openAuth]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider");
  return value;
}
