import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Flame, Grid2x2, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAccount } from "@/app/account";
import { useCollection } from "@/data/db";
import type { DailyStat } from "@/data/models";
import { resolvedTheme, updateSettings, useSettings } from "@/data/settings";
import { computeStreak } from "@/lib/learning/insights";
import { useAiStatus } from "@/services/ai";
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
  return (
    <button
      type="button"
      onClick={() => updateSettings({ theme: dark ? "light" : "dark" })}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn("grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-3 hover:text-text", compact && "h-10 w-10")}
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
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
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar />
      <MobileTopBar />
      <div className="md:pl-[76px] lg:pl-[248px]">
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-5 sm:px-6 md:pb-16 md:pt-10 lg:px-10">
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
