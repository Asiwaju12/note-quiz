/**
 * User preferences and "continue where you left off" state.
 * Stored in localStorage (small, synchronous). Development-only persistence:
 * when Supabase is connected these map to the `profiles` / `user_settings` tables.
 */
import { useSyncExternalStore } from "react";
import type { Pace } from "@/lib/game/types";
import { loadMuted, loadPace, saveMuted, savePace } from "@/lib/game/storage";

export type ThemePref = "system" | "light" | "dark";

export type Settings = {
  name: string;
  theme: ThemePref;
  dailyGoalMinutes: number;
  dailyGoalCards: number;
  dailyGoalQuestions: number;
  muted: boolean;
  pace: Pace;
  reduceMotion: boolean;
  onboarded: boolean;
};

export type ResumeState = {
  docId?: string;
  docTab?: string;
  deckId?: string;
  /** A practice/exam run that was left unfinished. */
  run?: {
    kind: "practice" | "exam";
    title: string;
    path: string;
    answered: number;
    total: number;
    updatedAt: string;
  };
  updatedAt?: string;
};

const SETTINGS_KEY = "recall.settings.v2";
const RESUME_KEY = "recall.resume.v1";
const SETTINGS_UPDATED_KEY = "recall.settings.updated-at.v1";
const RESUME_UPDATED_KEY = "recall.resume.updated-at.v1";

const defaults: Settings = {
  name: "",
  theme: "system",
  dailyGoalMinutes: 30,
  dailyGoalCards: 20,
  dailyGoalQuestions: 10,
  muted: loadMuted(),
  pace: loadPace(),
  reduceMotion: false,
  onboarded: false,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — settings stay in memory for this session */
  }
}

let settings: Settings = read(SETTINGS_KEY, defaults);
let resume: ResumeState = read<ResumeState>(RESUME_KEY, {});
function readTimestamp(key: string): string | undefined {
  try { return localStorage.getItem(key) ?? undefined; } catch { return undefined; }
}
let settingsUpdatedAt = readTimestamp(SETTINGS_UPDATED_KEY);
let resumeUpdatedAt = readTimestamp(RESUME_UPDATED_KEY);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export const subscribeSettings = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function getSettings(): Settings {
  return settings;
}

export function getSettingsUpdatedAt(): string | undefined { return settingsUpdatedAt; }
export function getResumeUpdatedAt(): string | undefined { return resumeUpdatedAt; }

export function replaceSettings(value: Settings, updatedAt?: string): void {
  settings = { ...value };
  settingsUpdatedAt = updatedAt ?? new Date().toISOString();
  write(SETTINGS_UPDATED_KEY, settingsUpdatedAt);
  write(SETTINGS_KEY, settings);
  saveMuted(settings.muted);
  savePace(settings.pace);
  applyTheme();
  emit();
}

export function resetSettings(): void { replaceSettings({ ...defaults }); }

export function updateSettings(changes: Partial<Settings>): void {
  settings = { ...settings, ...changes };
  settingsUpdatedAt = new Date().toISOString();
  write(SETTINGS_UPDATED_KEY, settingsUpdatedAt);
  write(SETTINGS_KEY, settings);
  // Keep the original game's keys in sync so the arcade code keeps working unchanged.
  if (changes.muted !== undefined) saveMuted(changes.muted);
  if (changes.pace !== undefined) savePace(changes.pace);
  if (changes.theme !== undefined) applyTheme();
  emit();
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, () => settings, () => settings);
}

export function getResume(): ResumeState {
  return resume;
}

export function replaceResume(value: ResumeState, updatedAt?: string): void {
  resume = { ...value };
  resumeUpdatedAt = updatedAt ?? new Date().toISOString();
  write(RESUME_UPDATED_KEY, resumeUpdatedAt);
  write(RESUME_KEY, resume);
  emit();
}

export function resetResume(): void { replaceResume({}); }

export function updateResume(changes: Partial<ResumeState>): void {
  resumeUpdatedAt = new Date().toISOString();
  resume = { ...resume, ...changes, updatedAt: resumeUpdatedAt };
  write(RESUME_UPDATED_KEY, resumeUpdatedAt);
  write(RESUME_KEY, resume);
  emit();
}

export function clearResumeRun(): void {
  if (!resume.run) return;
  const next = { ...resume };
  delete next.run;
  resumeUpdatedAt = new Date().toISOString();
  next.updatedAt = resumeUpdatedAt;
  resume = next;
  write(RESUME_UPDATED_KEY, resumeUpdatedAt);
  write(RESUME_KEY, resume);
  emit();
}

export function useResume(): ResumeState {
  return useSyncExternalStore(subscribeSettings, () => resume, () => resume);
}

export function resolvedTheme(): "light" | "dark" {
  if (settings.theme === "system") {
    return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return settings.theme;
}

export function applyTheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolvedTheme();
}

if (typeof window !== "undefined") {
  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (settings.theme === "system") applyTheme();
    });
  } catch {
    /* older browsers */
  }
}
