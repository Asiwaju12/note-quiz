import { useEffect, useState } from "react";
import { Bell, Cloud, Database, KeyRound, LogOut, Moon, Sparkles, Trash2, Volume2 } from "lucide-react";
import { useAccount } from "@/app/account";
import { updateAccountName } from "@/services/auth";
import { useAiStatus } from "@/services/ai";
import { clearAllLocalData, isPersistent } from "@/data/db";
import { updateSettings, useSettings, type ThemePref } from "@/data/settings";
import { PACES, type Pace } from "@/lib/game/types";
import { Avatar } from "@/components/layout/Avatar";
import { Button } from "@/components/ui/Button";
import { Badge, Card, Chips, Field, Input, PageHeader } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/Tabs";
import { confirmAction } from "@/components/ui/Confirm";
import { toast } from "@/components/ui/Toast";
import { disablePushNotifications, enablePushNotifications, pushEnabled } from "@/services/push-notifications";

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-0.5 text-xs text-subtle">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full transition-colors ${checked ? "bg-accent" : "bg-surface-3"}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export default function Profile() {
  const { mode, account, displayName, openAuth, signOut, setAccount } = useAccount();
  const settings = useSettings();
  const ai = useAiStatus();
  const [name, setName] = useState(account?.name ?? settings.name);
  const [signingOut, setSigningOut] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => { let active = true; void pushEnabled().then(value => active && setPushOn(value)).catch(() => undefined); return () => { active = false; }; }, [account?.id]);
  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) await disablePushNotifications(); else await enablePushNotifications();
      const enabled = await pushEnabled(); setPushOn(enabled);
      toast(enabled ? "Message notifications enabled" : "Message notifications disabled");
    } catch (error) { toast("Notification setting not changed", { tone: "error", description: error instanceof Error ? error.message : "Please try again." }); }
    finally { setPushBusy(false); }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      toast("You've been signed out");
    } catch (error) {
      toast("Sign-out could not be completed", {
        tone: "error",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSigningOut(false);
    }
  };

  const saveName = async () => {
    const clean = name.trim().slice(0, 40);
    if (!clean) return;
    if (account) {
      const updated = await updateAccountName(account.id, clean);
      if (updated) setAccount(updated);
      else return toast("Couldn't update your name", { tone: "error" });
    } else updateSettings({ name: clean });
    toast("Profile updated");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile & settings" />
      <Card className="mb-5 p-5">
        <div className="flex items-center gap-4">
          <Avatar name={displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{displayName}</p>
            <p className="truncate text-sm text-subtle">{account ? `${account.email} · board tag ${account.handle}` : "Local profile on this device"}</p>
          </div>
          {mode === "cloud" && (account ? <Button variant="secondary" size="sm" loading={signingOut} icon={<LogOut className="h-4 w-4" />} onClick={() => void handleSignOut()}>{signingOut ? "Signing out…" : "Sign out"}</Button> : <Button size="sm" onClick={() => openAuth("signin")}>Sign in</Button>)}
        </div>
        <form
          className="mt-5 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveName();
          }}
        >
          <Field label="Display name" className="flex-1">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />}</Field>
          <Button type="submit" variant="secondary" disabled={!name.trim()}>
            Save
          </Button>
        </form>
      </Card>

      <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Study preferences</h2>
      <Card className="mb-5 divide-y divide-border">
        <Row title="Daily study goal" description="Minutes of active study per day">
          <Chips label="Daily goal" value={settings.dailyGoalMinutes} onChange={(v) => updateSettings({ dailyGoalMinutes: v as number })} options={[15, 30, 45, 60, 90].map((v) => ({ value: v, label: `${v}m` }))} />
        </Row>
        <Row title="New flashcards per day" description="Limits how many unseen cards enter review each day">
          <Chips label="New cards per day" value={settings.dailyGoalCards} onChange={(v) => updateSettings({ dailyGoalCards: v as number })} options={[10, 20, 30, 50].map((v) => ({ value: v, label: String(v) }))} />
        </Row>
        <Row title="Arcade pace" description="Seconds per question at level 1">
          <Segmented label="Arcade pace" value={settings.pace} onChange={(v) => updateSettings({ pace: v as Pace })} items={PACES.map((p) => ({ id: p.id, label: p.label }))} />
        </Row>
      </Card>

      <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Appearance & sound</h2>
      <Card className="mb-5 divide-y divide-border">
        <Row title="Theme">
          <Segmented label="Theme" value={settings.theme} onChange={(v) => updateSettings({ theme: v as ThemePref })} items={[{ id: "system", label: "System" }, { id: "light", label: "Light" }, { id: "dark", label: <span className="inline-flex items-center gap-1"><Moon className="h-3.5 w-3.5" />Dark</span> }]} />
        </Row>
        <Row title="Reduce motion" description="Minimises animations. Your system setting is always respected.">
          <Toggle label="Reduce motion" checked={settings.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
        </Row>
        <Row title="Sound effects" description="Quiz and arcade sounds">
          <span className="inline-flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-subtle" />
            <Toggle label="Sound effects" checked={!settings.muted} onChange={(v) => updateSettings({ muted: !v })} />
          </span>
        </Row>
      </Card>

      <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Notifications</h2>
      <Card className="mb-5 divide-y divide-border">
        <Row title="Message & friend request alerts" description={account ? "Receive browser notifications when someone messages or sends you a friend request, even when Recall Quiz is not open." : "Sign in to turn on push notifications for messages and friend requests."}>
          {account ? <span className="inline-flex items-center gap-2"><Bell className="h-4 w-4 text-subtle" /><Toggle label="Message notifications" checked={pushOn} onChange={() => void togglePush()} /></span> : <Button size="sm" variant="secondary" onClick={() => openAuth("signin")}>Sign in</Button>}
        </Row>
        {account && <Row title="Notification status" description={pushOn ? "This browser is subscribed to push alerts." : "Alerts are off for this browser. Enable them and allow the browser permission prompt."}><Badge tone={pushOn ? "success" : "neutral"}>{pushBusy ? "Updating…" : pushOn ? "Enabled" : "Off"}</Badge></Row>}
      </Card>

      <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Connections</h2>
      <Card className="mb-5 divide-y divide-border">
        <Row title="Account & sync" description={mode === "cloud" ? "Supabase is configured. Signed-in decks, scores and notes sync." : "Not connected. Everything is stored in this browser only."}>
          <Badge tone={mode === "cloud" ? "success" : "warning"}>
            <Cloud className="h-3 w-3" /> {mode === "cloud" ? "Configured" : "Local mode"}
          </Badge>
        </Row>
        <Row title="Recall AI" description={ai?.configured ? `Connected · model ${ai.model}` : "Needs ANTHROPIC_API_KEY on the server. Basic mode is used for generation meanwhile."}>
          <Badge tone={ai?.configured ? "success" : "warning"}>
            {ai?.configured ? <Sparkles className="h-3 w-3" /> : <KeyRound className="h-3 w-3" />} {ai?.configured ? "Connected" : "Not connected"}
          </Badge>
        </Row>
        <Row title="Browser storage" description={isPersistent() ? "Documents, decks and progress are saved in this browser (IndexedDB)." : "Unavailable — data lasts only for this session."}>
          <Badge tone={isPersistent() ? "neutral" : "danger"}>
            <Database className="h-3 w-3" /> {isPersistent() ? "Active" : "Off"}
          </Badge>
        </Row>
      </Card>

      <Card className="border-danger/30">
        <Row title="Delete local data" description="Removes all documents, decks, flashcards, chats and progress stored in this browser.">
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={async () => {
              if (!(await confirmAction({ title: "Delete all local study data?", description: "This cannot be undone. Cloud data (if signed in) is not affected.", confirmLabel: "Delete everything", danger: true }))) return;
              await clearAllLocalData();
              try {
                Object.keys(localStorage).filter((k) => k.startsWith("recall.")).forEach((k) => localStorage.removeItem(k));
              } catch {
                /* ignore */
              }
              window.location.assign("/");
            }}
          >
            Delete
          </Button>
        </Row>
      </Card>
    </div>
  );
}
