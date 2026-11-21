import type { LucideIcon } from "lucide-react";
import { BarChart3, BookOpen, CalendarDays, GraduationCap, Home, Layers, LibraryBig, Sparkles, Target, Trophy, UserRound } from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; match?: string[] };

/** Primary destinations — shown in the sidebar and (first four) in the mobile bottom bar. */
export const PRIMARY_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/study", label: "Study Centre", icon: BookOpen },
  { to: "/quiz", label: "Quiz", icon: Target },
  { to: "/ai", label: "Recall AI", icon: Sparkles },
];

/** Secondary destinations — sidebar "Learn" group and the mobile "More" sheet. */
export const SECONDARY_NAV: NavItem[] = [
  { to: "/decks", label: "My Decks", icon: LibraryBig },
  { to: "/review", label: "Flashcard review", icon: Layers },
  { to: "/exam", label: "Exam Mode", icon: GraduationCap },
  { to: "/planner", label: "Study planner", icon: CalendarDays },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

export const PROFILE_NAV: NavItem = { to: "/profile", label: "Profile & settings", icon: UserRound };

export function isActivePath(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
