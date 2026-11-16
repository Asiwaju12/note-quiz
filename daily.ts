import { SAMPLE_DECK } from "./deck";
import type { Deck, Question } from "./types";
import { DAILY_SIZE } from "./types";
import { getPlayerId, loadString, saveString } from "./storage";
import { supabaseAuth, supabaseRest } from "./supabase";

export type DailyEntry = {
  id: string;
  handle: string;
  score: number;
  correct: number;
  total: number;
  streak: number;
  at: number;
};

export type DailyBoard = {
  date: string;
  entries: DailyEntry[];
  online: boolean;
  fetchedAt: number;
};

export type DailySubmission = {
  handle: string;
  score: number;
  correct: number;
  total: number;
  streak: number;
};

type Snapshot = {
  v: 1;
  date: string;
  scores: DailyEntry[];
};

const DAILY_KEY = "recall.daily.v1";
const BOARD_HOST = "https://ntfy.sh";
const MAX_ENTRIES = 25;
const MAX_SCORE = 99999;

function boardChannel(): string {
  if (typeof window === "undefined") return "main";
  const override = new URLSearchParams(window.location.search).get("board");
  if (override && /^[a-z0-9-]{1,24}$/.test(override)) return override;
  return "main";
}

export function dailyTopic(date: string): string {
  return `recall-v1-${boardChannel()}-${date.replace(/-/g, "")}`;
}

export function dailyKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(year, (month ?? 1) - 1, day ?? 1);
  return parsed.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function nextDailyReset(now = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const next = [...items];
  const random = mulberry32(seed);
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

/** The same eight questions for everyone on a given local calendar date. */
export function buildDailyDeck(date: string): Deck {
  const pool = seededShuffle(SAMPLE_DECK.questions, hashString(date));
  const questions: Question[] = pool.slice(0, Math.min(DAILY_SIZE, pool.length)).map((question, index) => {
    const optionOrder = seededShuffle([0, 1, 2, 3], hashString(`${date}-${question.id}-options`));
    const options = optionOrder.map((position) => question.options[position]);
    return {
      ...question,
      id: `daily-${date}-${index}-${question.id}`,
      options,
      answer: optionOrder.indexOf(question.answer),
    };
  });
  return {
    title: `Daily recall · ${date}`,
    kind: "sample",
    questions,
  };
}

function normalizeHandle(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
  return clean || "YOU";
}

function sanitizeEntry(value: unknown): DailyEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<DailyEntry>;
  const score = Number(entry.score);
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return null;
  const id = typeof entry.id === "string" ? entry.id.slice(0, 80) : "";
  if (!id) return null;
  const at = Number(entry.at);
  return {
    id,
    handle: normalizeHandle(typeof entry.handle === "string" ? entry.handle : "YOU"),
    score: Math.round(score),
    correct: Math.max(0, Math.min(DAILY_SIZE, Math.round(Number(entry.correct) || 0))),
    total: Math.max(0, Math.min(DAILY_SIZE, Math.round(Number(entry.total) || DAILY_SIZE))),
    streak: Math.max(0, Math.min(99, Math.round(Number(entry.streak) || 0))),
    at: Number.isFinite(at) ? at : Date.now(),
  };
}

function readLocalMap(): Record<string, DailyEntry[]> {
  try {
    const parsed = JSON.parse(loadString(DAILY_KEY, "{}"));
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, DailyEntry[]>;
  } catch {
    return {};
  }
}

export function loadLocalDaily(date: string): DailyEntry[] {
  const raw = readLocalMap()[date];
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeEntry).filter((entry): entry is DailyEntry => Boolean(entry));
}

export function saveLocalDaily(date: string, entries: DailyEntry[]): void {
  const map = readLocalMap();
  map[date] = dedupe(entries).slice(0, MAX_ENTRIES);
  saveString(DAILY_KEY, JSON.stringify(map));
}

export function saveDailyAttempt(date: string, submission: DailySubmission): DailyEntry {
  const entry: DailyEntry = {
    id: getPlayerId(),
    handle: normalizeHandle(submission.handle),
    score: Math.max(0, Math.min(MAX_SCORE, Math.round(submission.score))),
    correct: submission.correct,
    total: submission.total,
    streak: submission.streak,
    at: Date.now(),
  };
  const existing = loadLocalDaily(date);
  const withoutMe = existing.filter((item) => item.id !== entry.id);
  const myBest = [entry, ...existing.filter((item) => item.id === entry.id)].reduce((best, item) =>
    item.score > best.score ? item : best,
  );
  saveLocalDaily(date, [myBest, ...withoutMe]);
  return myBest;
}

function dedupe(entries: DailyEntry[]): DailyEntry[] {
  const bestById = new Map<string, DailyEntry>();
  entries.map(sanitizeEntry).forEach((entry) => {
    if (!entry) return;
    const existing = bestById.get(entry.id);
    if (!existing || entry.score > existing.score) bestById.set(entry.id, entry);
  });
  return [...bestById.values()].sort((a, b) => b.score - a.score || b.streak - a.streak || a.at - b.at);
}

async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, milliseconds = 7000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), milliseconds);
  try {
    return await task(controller.signal);
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchRemote(date: string): Promise<DailyEntry[]> {
  const result = await withTimeout(async (signal) => {
    const response = await fetch(
      `${BOARD_HOST}/${dailyTopic(date)}/json?poll=1&since=all&ts=${Date.now()}`,
      { cache: "no-store", signal },
    );
    if (!response.ok) throw new Error(`Leaderboard unavailable (${response.status})`);
    return response.text();
  });
  const lines = result.split("\n").filter(Boolean);
  const collected: DailyEntry[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as { event?: string; message?: string };
      if (event.event && event.event !== "message") continue;
      if (!event.message) continue;
      const snapshot = JSON.parse(event.message) as Snapshot;
      if (!snapshot || snapshot.v !== 1 || snapshot.date !== date || !Array.isArray(snapshot.scores)) continue;
      snapshot.scores.forEach((entry) => {
        const clean = sanitizeEntry(entry);
        if (clean) collected.push(clean);
      });
    } catch {
      /* ignore unrelated or malformed messages on the shared topic */
    }
  }
  return dedupe(collected);
}

async function publishRemote(date: string, entries: DailyEntry[]): Promise<void> {
  const snapshot: Snapshot = { v: 1, date, scores: entries.slice(0, MAX_ENTRIES) };
  await withTimeout(async (signal) => {
    const response = await fetch(`${BOARD_HOST}/${dailyTopic(date)}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(snapshot),
      signal,
    });
    if (!response.ok) throw new Error(`Could not publish score (${response.status})`);
    return response.text();
  });
}

export async function fetchDailyBoard(date: string): Promise<DailyBoard> {
  const local = loadLocalDaily(date);
  const session = await supabaseAuth.getSession().catch(() => null);
  if (session) {
    try {
      const rows = await supabaseRest<Array<{ user_id: string; handle: string; score: number; correct: number; total: number; streak: number; created_at: string }>>(
        "daily_scores",
        `select=user_id,handle,score,correct,total,streak,created_at&score_date=eq.${encodeURIComponent(date)}&order=score.desc&limit=25`,
      );
      return {
        date,
        entries: rows.map((row) => ({ id: row.user_id, handle: normalizeHandle(row.handle), score: row.score, correct: row.correct, total: row.total, streak: row.streak, at: new Date(row.created_at).getTime() })),
        online: true,
        fetchedAt: Date.now(),
      };
    } catch {
      return { date, entries: dedupe(local).slice(0, MAX_ENTRIES), online: false, fetchedAt: Date.now() };
    }
  }
  try {
    const remote = await fetchRemote(date);
    return {
      date,
      entries: dedupe([...remote, ...local]).slice(0, MAX_ENTRIES),
      online: true,
      fetchedAt: Date.now(),
    };
  } catch {
    return { date, entries: dedupe(local).slice(0, MAX_ENTRIES), online: false, fetchedAt: Date.now() };
  }
}

export async function submitDailyScore(date: string, submission: DailySubmission): Promise<DailyBoard> {
  const session = await supabaseAuth.getSession().catch(() => null);
  if (session) {
    await supabaseRest<unknown>(
      "daily_scores",
      "on_conflict=user_id,score_date",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: session.user.id,
          score_date: date,
          handle: normalizeHandle(submission.handle),
          score: Math.max(0, Math.min(MAX_SCORE, Math.round(submission.score))),
          correct: submission.correct,
          total: submission.total,
          streak: submission.streak,
        }),
      },
    );
    return fetchDailyBoard(date);
  }
  const mine = saveDailyAttempt(date, submission);
  const local = loadLocalDaily(date);
  let remote: DailyEntry[] = [];
  let fetched = false;
  try {
    remote = await fetchRemote(date);
    fetched = true;
  } catch {
    remote = [];
  }
  const merged = dedupe([...remote, mine, ...local]);
  if (fetched) {
    try {
      await publishRemote(date, merged);
    } catch {
      fetched = false;
    }
  }
  return {
    date,
    entries: merged.slice(0, MAX_ENTRIES),
    online: fetched,
    fetchedAt: Date.now(),
  };
}

export function dailyStanding(board: DailyBoard, playerId = getPlayerId()): { rank: number; entry: DailyEntry | null } {
  const index = board.entries.findIndex((entry) => entry.id === playerId);
  return { rank: index >= 0 ? index + 1 : 0, entry: index >= 0 ? board.entries[index] : null };
}
