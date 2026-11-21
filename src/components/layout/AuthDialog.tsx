import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { deriveHandle, signIn, signUp } from "@/services/auth";
import { supabaseAuth } from "@/services/supabase";
import { useAccount } from "@/app/account";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/Tabs";

/** Sign in / create account using the existing Supabase auth service. Only rendered in cloud mode. */
export function AuthDialog() {
  const { authOpen, authMode, closeAuth, continueAsGuest, handleAuth, callbackError } = useAccount();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(authMode);
  const [form, setForm] = useState({ name: "", email: "", handle: "", password: "" });
  const [handleEdited, setHandleEdited] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!authOpen) return;
    setMode(authMode);
    setError(callbackError);
    setInfo(null);
  }, [authOpen, authMode, callbackError]);

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "name" && !handleEdited ? { handle: deriveHandle(value) } : {}),
    }));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "reset") {
        await supabaseAuth.resetPassword(form.email.trim().toLowerCase());
        setInfo("If an account exists for that email, a reset link is on its way.");
        return;
      }
      const result =
        mode === "signin"
          ? await signIn(form.email, form.password)
          : await signUp({ name: form.name, email: form.email, handle: form.handle || deriveHandle(form.name), password: form.password });
      if (result.ok) handleAuth(result.account);
      else setError(result.error);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={authOpen}
      onClose={closeAuth}
      title={mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back"}
      description={mode === "reset" ? "We'll email you a secure link." : "Sync your decks, scores and documents across devices."}
      size="sm"
    >
      {mode !== "reset" && (
        <Segmented
          label="Account action"
          className="mb-5 flex w-full"
          value={mode}
          onChange={(value) => {
            setMode(value);
            setError(null);
          }}
          items={[
            { id: "signin", label: "Sign in" },
            { id: "signup", label: "Create account" },
          ]}
        />
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {mode === "signup" && (
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="Display name">{(id) => <Input id={id} value={form.name} onChange={(e) => update("name", e.target.value)} autoComplete="name" required />}</Field>
            <Field label="Board tag">
              {(id) => (
                <Input
                  id={id}
                  value={form.handle}
                  maxLength={4}
                  onChange={(e) => {
                    setHandleEdited(true);
                    update("handle", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                  }}
                  className="text-center font-mono uppercase"
                />
              )}
            </Field>
          </div>
        )}
        <Field label="Email">{(id) => <Input id={id} type="email" value={form.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" required />}</Field>
        {mode !== "reset" && (
          <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
            {(id) => (
              <div className="relative">
                <Input
                  id={id}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="pr-11"
                  required
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-lg text-subtle hover:text-text" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            )}
          </Field>
        )}
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">{error}</p>}
        {info && <p role="status" className="rounded-xl bg-success-soft px-3 py-2.5 text-sm text-success">{info}</p>}
        <Button type="submit" size="lg" loading={busy}>
          {mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
        </Button>
        <button type="button" onClick={() => setMode(mode === "reset" ? "signin" : "reset")} className="text-center text-[13px] text-muted hover:text-text">
          {mode === "reset" ? "Back to sign in" : "Forgot your password?"}
        </button>
        {mode !== "reset" && (
          <button type="button" onClick={continueAsGuest} className="text-center text-[13px] font-medium text-muted hover:text-text">
            Explore demo first — continue as guest
          </button>
        )}
      </form>
    </Modal>
  );
}
