import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import {
  deriveHandle,
  signIn,
  signInDemo,
  signUp,
  type AuthResult,
  type PublicAccount,
} from "@/game/auth";
import { Icon } from "./Icons";
import { Fernandez } from "./Fernandez";

type Mode = "signin" | "signup";
type Field = "name" | "email" | "handle" | "password";

const emptySignUp = { name: "", email: "", handle: "", password: "" };
const emptySignIn = { email: "", password: "" };

export function AuthDialog({
  open,
  initialMode = "signin",
  required = false,
  initialError = null,
  onClose,
  onAuth,
}: {
  open: boolean;
  initialMode?: Mode;
  required?: boolean;
  initialError?: string | null;
  onClose: () => void;
  onAuth: (account: PublicAccount) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [signUpForm, setSignUpForm] = useState(emptySignUp);
  const [signInForm, setSignInForm] = useState(emptySignIn);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<Field | null>(null);
  const [handleEdited, setHandleEdited] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [successName, setSuccessName] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError(initialError);
    setErrorField(null);
    setBusy(false);
    setSuccessName(null);
    setShowPassword(false);
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 220);
    return () => window.clearTimeout(focusTimer);
  }, [open, initialMode, initialError]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !required) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, required]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!open) return null;

  const clearError = () => {
    if (error) setError(null);
    if (errorField) setErrorField(null);
  };

  const finish = (result: AuthResult) => {
    if (!result.ok) {
      setError(result.error);
      setErrorField(result.field ?? null);
      setBusy(false);
      return;
    }
    setSuccessName(result.account.name);
    setBusy(false);
    timerRef.current = window.setTimeout(() => {
      onAuth(result.account);
    }, 480);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setErrorField(null);
    setBusy(true);
    try {
      const result = mode === "signin"
        ? await signIn(signInForm.email, signInForm.password)
        : await signUp({
            name: signUpForm.name,
            email: signUpForm.email,
            handle: signUpForm.handle || deriveHandle(signUpForm.name),
            password: signUpForm.password,
          });
      finish(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setErrorField(null);
    setShowPassword(false);
  };

  const handleDemo = async () => {
    setBusy(true);
    setError(null);
    finish(await signInDemo());
  };

  const passwordStrength =
    signUpForm.password.length === 0
      ? 0
      : signUpForm.password.length >= 12
        ? 3
        : signUpForm.password.length >= 8
          ? 2
          : 1;
  const strengthLabels = ["", "a little short", "solid", "fort knox"];

  const fieldError = (field: Field) => (errorField === field ? error ?? undefined : undefined);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-night/75 p-3 backdrop-blur-[3px] sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (!required && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="relative my-auto max-h-[calc(100dvh-1rem)] w-full max-w-[850px] animate-scale-in overflow-y-auto rounded-[24px] border-2 border-ink bg-card pt-8 text-ink shadow-[8px_8px_0_#CBF54A] sm:pt-0 sm:shadow-[10px_10px_0_#CBF54A]"
      >
        {!required && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in"
            className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full border-2 border-ink bg-card shadow-[2px_2px_0_#1B1A14] transition-transform hover:rotate-90"
          >
            <Icon name="close" size={13} />
          </button>
        )}

        <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
          {/* Brand panel */}
          <div className="relative hidden overflow-hidden bg-night p-5 text-cream sm:p-6 lg:flex lg:flex-col lg:justify-between lg:p-7">
            <div className="pointer-events-none absolute inset-0 bg-dotgrid-light opacity-35" />
            <div className="pointer-events-none absolute -right-12 top-16 h-44 w-44 rounded-full bg-lilac/15 blur-3xl" />
            <svg className="pointer-events-none absolute -bottom-8 -left-8 h-44 w-44 text-lime/10" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 5" />
              <circle cx="50" cy="50" r="26" stroke="currentColor" strokeWidth="1.4" />
              <path d="m50 30 6 14 15 1-11 10 3 15-13-8-13 8 3-15-11-10 15-1 6-14Z" fill="currentColor" opacity="0.5" />
            </svg>

            <div className="relative">
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cream/25 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-cream/70">
                  <Icon name="user" size={11} className="text-lime" /> Recall profile
                </span>
                <Fernandez size={58} mood="happy" className="-mt-2" />
              </div>
              <h2 className="mt-3 max-w-[250px] font-display text-[28px] font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-[34px] lg:text-[38px]">
                Your notes. <span className="font-serif font-normal italic text-lime">Your name</span> on the board.
              </h2>
              <p className="mt-2 max-w-[260px] text-[12px] leading-relaxed text-cream/55 lg:text-[13px]">
                Sign in once and every run is stamped with your profile. Your profile follows you across devices, with secure cloud sign-in.
              </p>
            </div>

            <ul className="relative mt-4 grid gap-1.5 text-[11px] text-cream/65 sm:grid-cols-2 lg:mt-6 lg:grid-cols-1">
              {[
                ["save", "Scores tied to your profile"],
                ["shield", "Secure cloud profile"],
                ["bolt", "Start faster, no setup ritual"],
              ].map(([icon, text]) => (
                <li key={text} className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-cream/15 bg-cream/5 text-lime">
                    <Icon name={icon as "save"} size={11} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>

            <div className="relative mt-4 hidden rounded-xl border border-cream/12 bg-cream/[0.05] px-3 py-2 lg:block">
              <p className="font-serif text-[15px] italic leading-snug text-cream/70">
                “Made it through level 6. My notes have never felt so useful.”
              </p>
              <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-cream/35">— one very smug study group</p>
            </div>
          </div>

          {/* Form panel */}
          <div className="relative bg-card p-4 sm:p-6 lg:p-7">
            <div className="mb-4 flex items-center gap-2 lg:hidden">
              <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg border-2 border-ink bg-lime shadow-[2px_2px_0_#1B1A14]">
                <Fernandez size={28} mood="happy" bob={false} className="translate-y-[3px]" />
              </span>
              <span className="font-display text-[15px] font-extrabold tracking-[-0.03em]">recall <span className="font-serif text-[13px] font-normal italic text-muted">with Fernandez</span></span>
              <span className="ml-auto rounded-full border border-ink/15 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">cloud sync</span>
            </div>
            <div className="mb-4 flex items-center gap-1 rounded-full border border-ink/15 bg-paper/70 p-1" role="tablist" aria-label="Sign in or create a profile">
              {(
                [
                  ["signin", "Sign in"],
                  ["signup", "Create profile"],
                ] as Array<[Mode, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => switchMode(value)}
                  className={cn(
                    "flex-1 rounded-full px-3 py-2 font-display text-[12px] font-bold transition-all duration-150",
                    mode === value ? "border-2 border-ink bg-ink text-cream shadow-[2px_2px_0_#CBF54A]" : "text-muted hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {successName ? (
              <div className="flex min-h-[330px] flex-col items-center justify-center text-center">
                <span className="grid h-16 w-16 animate-pop place-items-center rounded-full border-2 border-ink bg-lime shadow-hard">
                  <Icon name="check" size={28} strokeWidth={3} />
                </span>
                <h3 id="auth-title" className="mt-4 font-display text-[26px] font-extrabold leading-none tracking-[-0.04em]">
                  You&apos;re in.
                </h3>
                <p className="mt-1.5 text-sm text-muted">Welcome, {successName}. Loading your board…</p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                  <Icon name="shield" size={11} /> cloud profile active
                </span>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <h3 id="auth-title" className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.035em]">
                    {mode === "signin" ? "Welcome back." : "Make it official."}
                  </h3>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    {mode === "signin"
                      ? "Pick up where your brain left off."
                      : "One secure cloud profile. Your name follows every score."}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-2.5" noValidate>
                  {mode === "signup" && (
                    <div className="grid gap-2.5 sm:grid-cols-[1.6fr_0.9fr]">
                      <label className="block">
                        <span className="mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-muted">Display name</span>
                        <span className="relative block">
                          <Icon name="user" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                          <input
                            ref={firstFieldRef}
                            value={signUpForm.name}
                            onChange={(event) => {
                              const name = event.target.value;
                              setSignUpForm((previous) => ({
                                ...previous,
                                name,
                                handle: handleEdited ? previous.handle : deriveHandle(name),
                              }));
                              clearError();
                            }}
                            placeholder="Alex Rivera"
                            autoComplete="name"
                            aria-invalid={Boolean(fieldError("name"))}
                            className={cn(
                              "w-full rounded-lg border-2 bg-paper/60 py-2.5 pl-8 pr-2.5 text-[13px] font-medium placeholder:text-muted/55 focus:outline-none focus:ring-2 focus:ring-lime",
                              fieldError("name") ? "border-coral" : "border-ink/15 focus:border-ink",
                            )}
                          />
                        </span>
                      </label>
                      <label className="block">
                        <span className="mb-1 flex items-center justify-between font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-muted">
                          Board tag <span className="normal-case tracking-normal text-muted/60">2–4 chars</span>
                        </span>
                        <input
                          value={signUpForm.handle}
                          onChange={(event) => {
                            setHandleEdited(true);
                            setSignUpForm((previous) => ({
                              ...previous,
                              handle: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4),
                            }));
                            clearError();
                          }}
                          placeholder="ALX"
                          maxLength={4}
                          autoComplete="off"
                          aria-invalid={Boolean(fieldError("handle"))}
                          className={cn(
                            "w-full rounded-lg border-2 bg-paper/60 px-2.5 py-2.5 text-center font-display text-[13px] font-extrabold uppercase tracking-[0.14em] placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-lime",
                            fieldError("handle") ? "border-coral" : "border-ink/15 focus:border-ink",
                          )}
                        />
                      </label>
                    </div>
                  )}

                  <label className="block">
                    <span className="mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-muted">Email</span>
                    <span className="relative block">
                      <Icon name="mail" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        ref={mode === "signin" ? firstFieldRef : undefined}
                        type="email"
                        value={mode === "signin" ? signInForm.email : signUpForm.email}
                        onChange={(event) => {
                          const email = event.target.value;
                          if (mode === "signin") setSignInForm((previous) => ({ ...previous, email }));
                          else setSignUpForm((previous) => ({ ...previous, email }));
                          clearError();
                        }}
                        placeholder="you@studybuddy.com"
                        autoComplete="email"
                        aria-invalid={Boolean(fieldError("email"))}
                        className={cn(
                          "w-full rounded-lg border-2 bg-paper/60 py-2.5 pl-8 pr-2.5 text-[13px] font-medium placeholder:text-muted/55 focus:outline-none focus:ring-2 focus:ring-lime",
                          fieldError("email") ? "border-coral" : "border-ink/15 focus:border-ink",
                        )}
                      />
                    </span>
                    {fieldError("email") && <span className="mt-1 block text-[10px] font-medium text-[#A93219]">{fieldError("email")}</span>}
                  </label>

                  <label className="block">
                    <span className="mb-1 flex items-center justify-between font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-muted">
                      Password{" "}
                      <span className="normal-case tracking-normal text-muted/60">
                        {mode === "signup" ? strengthLabels[passwordStrength] : "local account"}
                      </span>
                    </span>
                    <span className="relative block">
                      <Icon name="lock" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={mode === "signin" ? signInForm.password : signUpForm.password}
                        onChange={(event) => {
                          const password = event.target.value;
                          if (mode === "signin") setSignInForm((previous) => ({ ...previous, password }));
                          else setSignUpForm((previous) => ({ ...previous, password }));
                          clearError();
                        }}
                        placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                        aria-invalid={Boolean(fieldError("password"))}
                        className={cn(
                          "w-full rounded-lg border-2 bg-paper/60 py-2.5 pl-8 pr-10 text-[13px] font-medium placeholder:text-muted/55 focus:outline-none focus:ring-2 focus:ring-lime",
                          fieldError("password") ? "border-coral" : "border-ink/15 focus:border-ink",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:bg-ink/5 hover:text-ink"
                      >
                        <Icon name={showPassword ? "eye-off" : "eye"} size={14} />
                      </button>
                    </span>
                    {fieldError("password") && <span className="mt-1 block text-[10px] font-medium text-[#A93219]">{fieldError("password")}</span>}
                  </label>

                  {mode === "signup" && (
                    <div className="flex gap-1" aria-hidden="true">
                      {[1, 2, 3].map((step) => (
                        <span
                          key={step}
                          className={cn(
                            "h-1 flex-1 rounded-full transition-colors duration-300",
                            step <= passwordStrength
                              ? passwordStrength === 1
                                ? "bg-coral"
                                : passwordStrength === 2
                                  ? "bg-sky"
                                  : "bg-lime-deep"
                              : "bg-ink/10",
                          )}
                        />
                      ))}
                    </div>
                  )}

                  {error && (
                    <div className="flex animate-shake items-start gap-2 rounded-lg border border-coral bg-coral/20 px-2.5 py-2 text-[11px] leading-snug" role="alert">
                      <Icon name="close" size={12} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className="press group inline-flex w-full items-center justify-between gap-2 rounded-xl border-2 border-ink bg-ink px-3.5 py-3 font-display text-[14px] font-bold text-cream shadow-[3px_3px_0_#CBF54A] disabled:opacity-70"
                  >
                    <span className="inline-flex items-center gap-2">
                      {busy ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream/30 border-t-lime" />
                      ) : (
                        <Icon name={mode === "signin" ? "arrow" : "sparkle"} size={14} className="text-lime" />
                      )}
                      {busy ? "Opening your profile…" : mode === "signin" ? "Sign in and play" : "Create my profile"}
                    </span>
                    <Icon name="arrow" size={15} />
                  </button>
                </form>

{!required && (
                  <>
                <div className="my-3 flex items-center gap-2">
                  <span className="h-px flex-1 bg-ink/10" />
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">or</span>
                  <span className="h-px flex-1 bg-ink/10" />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleDemo}
                    disabled={busy}
                    className="press inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-ink/20 bg-paper/60 px-2.5 py-2 font-display text-[11px] font-bold hover:border-ink disabled:opacity-60"
                  >
                    <Icon name="bolt" size={12} /> Try demo profile
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="press inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-ink/20 bg-paper/60 px-2.5 py-2 font-display text-[11px] font-bold hover:border-ink"
                  >
                    <Icon name="play" size={11} /> Continue as guest
                  </button>
                </div>

                  </>
                )}

                <p className="mt-3 flex items-start gap-1.5 font-mono text-[8px] leading-relaxed text-muted/85">
                  <Icon name="shield" size={10} className="mt-0.5 shrink-0" />
                  Your account is secured by Supabase Auth. Sign in from any device to access your profile.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
