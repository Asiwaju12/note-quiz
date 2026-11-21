/**
 * Tracks long-running generation jobs so they keep going (and keep their
 * status) when the student switches tabs inside a document workspace.
 */
import { useSyncExternalStore } from "react";

export type JobState = { running: boolean; error: string | null; startedAt?: number };

const jobs = new Map<string, JobState>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const IDLE: JobState = { running: false, error: null };

export async function runJob<T>(key: string, task: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
  if (jobs.get(key)?.running) return undefined;
  const controller = new AbortController();
  controllers.set(key, controller);
  jobs.set(key, { running: true, error: null, startedAt: Date.now() });
  emit();
  try {
    const result = await task(controller.signal);
    jobs.set(key, IDLE);
    return result;
  } catch (error) {
    const aborted = (error as Error).name === "AbortError";
    jobs.set(key, { running: false, error: aborted ? null : error instanceof Error ? error.message : "Something went wrong." });
    return undefined;
  } finally {
    controllers.delete(key);
    emit();
  }
}

export function cancelJob(key: string): void {
  controllers.get(key)?.abort();
}

export function clearJobError(key: string): void {
  if (jobs.get(key)?.error) {
    jobs.set(key, IDLE);
    emit();
  }
}

export function useJob(key: string): JobState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => jobs.get(key) ?? IDLE,
    () => IDLE,
  );
}
