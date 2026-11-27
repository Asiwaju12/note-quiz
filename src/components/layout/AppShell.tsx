import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Bell, Flame, Grid2x2, MessageCircle, Moon, Sun, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAccount } from "@/app/account";
import { useCollection } from "@/data/db";
import type { DailyStat } from "@/data/models";
import { resolvedTheme, updateSettings, useSettings } from "@/data/settings";
import { computeStreak } from "@/lib/learning/insights";
import { useAiStatus } from "@/services/ai";
import { supabaseRest } from "@/services/supabase";
import { Avatar } from "./Avatar";
import { Logo, LogoMark } from "./Logo";
import { PRIMARY_NAV, PROFILE_NAV, SECONDARY_NAV, isActivePath, type NavItem } from "./nav";
import { Drawer } from "@/components/ui/Overlay";

function SideLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { pathname } = useLocation();
  const active = isActivePath(pathname, item.to);
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "text-text" : "text-muted hover:bg-surface-3/70 hover:text-text",
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl border border-border bg-surface shadow-xs"
          transition={{ type: "spring", damping: 32, stiffness: 420 }}
        />
      )}
      <Icon className={cn("relative h-[18px] w-[18px] shrink-0", active && "text-accent-text")} strokeWidth={active ? 2.2 : 1.9} />
      {!collapsed && <span className="relative truncate">{item.label}</span>}
    </NavLink>
  );
}

function ThemeToggle({ compact }: { compact?: boolean }) {
  useSettings();
  const dark = resolvedTheme() === "dark";
  const toggleTheme = (event: React.MouseEvent<HTMLButtonElement>) => {
    const nextTheme = dark ? "light" : "dark";
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const root = document.documentElement;
    root.style.setProperty("--theme-origin-x", `${rect.left + rect.width / 2}px`);
    root.style.setProperty("--theme-origin-y", `${rect.top + rect.height / 2}px`);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const viewTransitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };
    if (!reduceMotion && viewTransitionDocument.startViewTransition) {
      viewTransitionDocument.startViewTransition(() => updateSettings({ theme: nextTheme }));
    } else {
      updateSettings({ theme: nextTheme });
    }
  };
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn("grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-3 hover:text-text", compact && "h-10 w-10")}
    >
      <motion.span
        key={dark ? "sun" : "moon"}
        initial={{ opacity: 0, rotate: -75, scale: 0.55 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className="grid place-items-center"
      >
        {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </motion.span>
    </button>
  );
}

function StreakPill() {
  const stats = useCollection<DailyStat>("dailyStats");
  const { current, activeToday } = computeStreak(stats);
  return (
    <Link
      to="/progress"
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold tabular-nums transition-colors hover:bg-surface-3",
        activeToday ? "text-warning" : "text-subtle",
      )}
      aria-label={`${current} day study streak`}
      title={activeToday ? "You've studied today" : "Study today to keep your streak"}
    >
      <Flame className="h-4 w-4" fill={activeToday ? "currentColor" : "none"} />
      {current}
    </Link>
  );
}

function useUnreadAlertCount() {
  const { account, mode } = useAccount();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!account || mode !== "cloud") { setCount(0); return; }
    let active = true;
    const refresh = async () => {
      try {
        const [messages, requests] = await Promise.all([
          supabaseRest<{ id: string }[]>("direct_messages", "select=id&receiver_id=eq." + account.id + "&read_at=is.null&limit=100"),
          supabaseRest<{ id: string }[]>("friend_requests", "select=id&receiver_id=eq." + account.id + "&status=eq.pending&limit=100"),
        ]);
        if (active) setCount(messages.length + requests.length);
      } catch { /* Notification counts are non-blocking. */ }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [account?.id, mode]);
  return count;
}

function NotificationLink({ compact = false }: { compact?: boolean }) {
  const count = useUnreadAlertCount();
  return (
    <Link to="/notifications" aria-label={count ? "Notifications, " + count + " unread" : "Notifications"} title="Notifications" className={cn("relative grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-3 hover:text-text", compact && "h-10 w-10")}>
      <Bell className="h-[18px] w-[18px]" />
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold leading-4 text-white">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
type LiveAlert = { id: string; title: string; body: string; createdAt: string };
function LiveNotificationPopups() {
  const { account, mode } = useAccount();
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!account?.id || mode !== "cloud") { setAlerts([]); return; }
    let active = true;
    let initialized = false;
    let since = new Date().toISOString();
    const seen = new Set<string>();
    const refresh = async () => {
      try {
        const [messages, requests] = await Promise.all([
          supabaseRest<{ id: string; body: string; created_at: string }[]>("direct_messages", "select=id,body,created_at&receiver_id=eq." + account.id + "&created_at=gt." + encodeURIComponent(since) + "&order=created_at.desc&limit=8"),
          supabaseRest<{ id: string; created_at: string }[]>("friend_requests", "select=id,created_at&receiver_id=eq." + account.id + "&status=eq.pending&created_at=gt." + encodeURIComponent(since) + "&order=created_at.desc&limit=8"),
        ]);
        if (!active) return;
        const now = new Date().toISOString();
        if (initialized) {
          const incoming: LiveAlert[] = [
            ...messages.map(m => ({ id: "message-" + m.id, title: "New message", body: m.body || "You received a message.", createdAt: m.created_at })),
            ...requests.map(r => ({ id: "request-" + r.id, title: "New friend request", body: "Someone wants to connect with you on Recall Quiz.", createdAt: r.created_at })),
          ].filter(a => !seen.has(a.id)).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
          incoming.forEach(a => seen.add(a.id));
          if (incoming.length) setAlerts(current => [...incoming, ...current].slice(0, 3));
        } else {
          messages.forEach(m => seen.add("message-" + m.id));
          requests.forEach(r => seen.add("request-" + r.id));
          initialized = true;
        }
        since = now;
      } catch { /* Keep the app usable if realtime polling is temporarily unavailable. */ }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 12000);
    return () => { active = false; window.clearInterval(interval); };
  }, [account?.id, mode]);
  if (!alerts.length) return null;
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed right-4 top-16 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 md:right-6 md:top-6">
      {alerts.map(alert => (
        <div key={alert.id} className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xl">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text"><Bell className="h-4 w-4" /></span>
          <Link to="/notifications" onClick={() => setAlerts(current => current.filter(a => a.id !== alert.id))} className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{alert.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{alert.body}</p>
            <span className="mt-2 inline-block text-xs font-semibold text-accent-text">Open messages</span>
          </Link>
          <button type="button" aria-label="Dismiss notification" onClick={() => setAlerts(current => current.filter(a => a.id !== alert.id))} className="rounded-lg p-1 text-muted hover:bg-surface-3"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

function Sidebar() {
  const { displayName, mode, account } = useAccount();
  const ai = useAiStatus();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col border-r border-border bg-bg-subtle px-3 py-4 md:flex lg:w-[248px]">
      <Link to="/" className="mb-6 flex h-10 items-center justify-center px-1 lg:justify-start lg:px-2" aria-label="Recall Quiz home">
        <span className="lg:hidden">
          <LogoMark />
        </span>
        <span className="hidden lg:inline-flex">
          <Logo />
        </span>
      </Link>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto no-scrollbar">
        <div className="hidden lg:contents">
          {PRIMARY_NAV.map((item) => (
            <SideLink key={item.to} item={item} collapsed={false} />
          ))}
          <p className="eyebrow mb-1.5 mt-5 px-3">Learn</p>
          {SECONDARY_NAV.map((item) => (
            <SideLink key={item.to} item={item} collapsed={false} />
          ))}
        </div>
        <div className="contents lg:hidden">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
            <SideLink key={item.to} item={item} collapsed />
          ))}
        </div>
      </nav>
      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-2 flex flex-col items-center gap-1 lg:flex-row lg:justify-between lg:px-1">
          <StreakPill />
          <NotificationLink />
          <ThemeToggle />
        </div>
        <NavLink
          to={PROFILE_NAV.to}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-surface-3/70 lg:p-2",
              isActive && "bg-surface shadow-xs",
              "justify-center lg:justify-start",
            )
          }
          aria-label="Profile and settings"
        >
          <Avatar name={displayName} size="sm" />
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-[13px] font-semibold text-text">{displayName}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-subtle">
              <span className={cn("h-1.5 w-1.5 rounded-full", ai?.configured ? "bg-success" : "bg-border-strong")} />
              {mode === "cloud" && account ? "Synced" : "Local mode"} · AI {ai?.configured ? "on" : "off"}
            </span>
          </span>
        </NavLink>
      </div>
    </aside>
  );
}

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/85 px-4 backdrop-blur-xl md:hidden">
      <Link to="/" aria-label="Recall Quiz home">
        <Logo />
      </Link>
      <div className="flex items-center gap-0.5">
        <StreakPill />
        <NotificationLink compact />
        <ThemeToggle />
      </div>
    </header>
  );
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const { pathname } = useLocation();
  const moreActive = [...SECONDARY_NAV, PROFILE_NAV].some((item) => isActivePath(pathname, item.to));
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 px-1">
        {PRIMARY_NAV.map((item) => {
          const active = isActivePath(pathname, item.to);
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} className="relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium">
              {active && <motion.span layoutId="bottom-active" className="absolute top-1.5 h-8 w-12 rounded-full bg-accent-soft" transition={{ type: "spring", damping: 30, stiffness: 420 }} />}
              <Icon className={cn("relative h-5 w-5", active ? "text-accent-text" : "text-muted")} strokeWidth={active ? 2.2 : 1.9} />
              <span className={cn("relative", active ? "text-text" : "text-muted")}>{item.label === "Study Centre" ? "Study" : item.label === "Recall AI" ? "AI" : item.label}</span>
            </NavLink>
          );
        })}
        <button type="button" onClick={onMore} className="relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium" aria-haspopup="dialog">
          {moreActive && <span className="absolute top-1.5 h-8 w-12 rounded-full bg-accent-soft" />}
          <Grid2x2 className={cn("relative h-5 w-5", moreActive ? "text-accent-text" : "text-muted")} />
          <span className={cn("relative", moreActive ? "text-text" : "text-muted")}>More</span>
        </button>
      </div>
    </nav>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { displayName, mode } = useAccount();
  return (
    <Drawer open={open} onClose={onClose} title="More">
      <div className="grid grid-cols-3 gap-2 p-4">
        {SECONDARY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} onClick={onClose} className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface-2 px-2 py-4 text-center text-[12px] font-medium text-text transition-colors active:bg-surface-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
                <Icon className="h-5 w-5" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="px-4 pb-5">
        <Link to="/profile" onClick={onClose} className="flex items-center gap-3 rounded-2xl border border-border p-3">
          <Avatar name={displayName} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{displayName}</span>
            <span className="text-xs text-subtle">{mode === "cloud" ? "Account & settings" : "Local mode · Profile & settings"}</span>
          </span>
        </Link>
      </div>
    </Drawer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { account } = useAccount();
  const [messagingUpdate, setMessagingUpdate] = useState(false);
  useEffect(() => {
    if (!account?.id) { setMessagingUpdate(false); return; }
    try { setMessagingUpdate(localStorage.getItem(`recall-messaging-launch-popup-v2:${account.id}`) !== "dismissed"); }
    catch { setMessagingUpdate(true); }
  }, [account?.id]);
  const dismissMessagingUpdate = () => {
    setMessagingUpdate(false);
    try { if (account?.id) localStorage.setItem(`recall-messaging-launch-popup-v1:${account.id}`, "dismissed"); } catch { /* Ignore storage restrictions. */ }
  };
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar />
      <MobileTopBar />
      <LiveNotificationPopups />
      <div className="md:pl-[76px] lg:pl-[248px]">
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-5 sm:px-6 md:pb-16 md:pt-10 lg:px-10">
          {messagingUpdate && account && pathname === "/" && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="presentation"><motion.section role="dialog" aria-modal="true" aria-labelledby="messaging-launch-title" initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }} className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-2xl sm:p-7"><button type="button" aria-label="Close announcement" className="absolute right-4 top-4 rounded-xl p-2 text-muted hover:bg-surface-3" onClick={dismissMessagingUpdate}><X className="h-4 w-4" /></button><div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-text"><MessageCircle className="h-7 w-7" /></div><p className="eyebrow mb-2 text-accent-text">A new way to study together</p><h2 id="messaging-launch-title" className="text-2xl font-bold tracking-tight text-text">Messages are now on Recall Quiz!</h2><p className="mt-3 text-sm leading-6 text-muted">You can now connect with other learners without leaving Recall Quiz. Find friends, send private messages, and invite people to study and compete together.</p><div className="my-5 space-y-3 rounded-2xl bg-surface-2 p-4"><div className="flex items-center gap-3 text-sm"><Users className="h-4 w-4 text-accent-text"/> Find and add friends</div><div className="flex items-center gap-3 text-sm"><MessageCircle className="h-4 w-4 text-accent-text"/> Chat and react to messages</div><div className="flex items-center gap-3 text-sm"><Flame className="h-4 w-4 text-accent-text"/> Study and compete together</div></div><Link to="/messages" onClick={dismissMessagingUpdate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90">Explore Messages <MessageCircle className="h-4 w-4"/></Link><button type="button" onClick={dismissMessagingUpdate} className="mt-3 w-full rounded-xl px-4 py-2 text-sm font-medium text-muted hover:bg-surface-3">Maybe later</button></motion.section></div>}
          <motion.div key={pathname.split("/").slice(0, 3).join("/")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
            {children}
          </motion.div>
        </main>
      </div>
      <BottomNav onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
