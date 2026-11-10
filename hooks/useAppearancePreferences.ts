"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearancePreferences,
  normalizeAppearancePreferences,
  parseAppearancePreferences,
  serializeAppearancePreferences,
  type AppearanceChoiceKey,
  type AppearancePreferences,
} from "@/lib/appearance-preferences";

const PERSIST_DELAY_MS = 150;

let preferences: AppearancePreferences | null = null;
let lastPersisted = "";
let pendingPersist: AppearancePreferences | null = null;
let persistTimer: number | null = null;
let pendingApply: AppearancePreferences | null = null;
let applyFrame: number | null = null;
let pagehideInstalled = false;
const listeners = new Set<() => void>();

function readStoredPreferences(): AppearancePreferences {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    return parseAppearancePreferences(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return normalizeAppearancePreferences(null);
  }
}

function samePreferences(left: AppearancePreferences, right: AppearancePreferences): boolean {
  return serializeAppearancePreferences(left) === serializeAppearancePreferences(right);
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function flushPersist(): void {
  if (typeof window === "undefined") return;
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  const next = pendingPersist;
  pendingPersist = null;
  if (!next) return;
  const raw = serializeAppearancePreferences(next);
  if (raw === lastPersisted) return;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, raw);
    lastPersisted = raw;
  } catch {
    // The page keeps the chosen appearance when storage is blocked.
  }
}

function ensurePagehideListener(): void {
  if (pagehideInstalled || typeof window === "undefined") return;
  pagehideInstalled = true;
  window.addEventListener("pagehide", flushPersist);
}

function schedulePersist(next: AppearancePreferences): void {
  if (typeof window === "undefined") return;
  pendingPersist = next;
  ensurePagehideListener();
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(flushPersist, PERSIST_DELAY_MS);
}

function scheduleApply(next: AppearancePreferences): void {
  if (typeof window === "undefined") return;
  pendingApply = next;
  if (applyFrame !== null) return;
  const run = () => {
    applyFrame = null;
    const queued = pendingApply;
    pendingApply = null;
    if (queued) applyAppearancePreferences(queued);
  };
  applyFrame = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(run)
    : window.setTimeout(run, 0);
}

function getSnapshot(): AppearancePreferences {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  if (preferences === null) {
    preferences = readStoredPreferences();
    lastPersisted = serializeAppearancePreferences(preferences);
    applyAppearancePreferences(preferences);
  }
  return preferences;
}

function getServerSnapshot(): AppearancePreferences {
  return DEFAULT_APPEARANCE;
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== APPEARANCE_STORAGE_KEY) return;
  if (pendingPersist) return;
  const next = readStoredPreferences();
  const current = preferences ?? getSnapshot();
  if (samePreferences(current, next)) return;
  preferences = next;
  lastPersisted = serializeAppearancePreferences(next);
  scheduleApply(next);
  notify();
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorage);
    ensurePagehideListener();
    if (!pendingPersist) {
      const next = readStoredPreferences();
      if (preferences === null) {
        preferences = next;
        lastPersisted = serializeAppearancePreferences(next);
        applyAppearancePreferences(next);
      } else if (!samePreferences(preferences, next)) {
        preferences = next;
        lastPersisted = serializeAppearancePreferences(next);
        applyAppearancePreferences(next);
      }
    }
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function setPreferences(
  value: AppearancePreferences | ((current: AppearancePreferences) => AppearancePreferences),
): void {
  if (typeof window === "undefined") return;
  const current = getSnapshot();
  const next = normalizeAppearancePreferences(typeof value === "function" ? value(current) : value);
  if (samePreferences(current, next)) return;
  preferences = next;
  scheduleApply(next);
  schedulePersist(next);
  notify();
}

export function useAppearancePreferences(): {
  preferences: AppearancePreferences;
  setPreferences: typeof setPreferences;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { preferences: snapshot, setPreferences };
}

/** Subscribe to one choice as a primitive, so slider edits do not rerender this consumer. */
export function useAppearanceChoice<Key extends AppearanceChoiceKey>(key: Key): AppearancePreferences[Key] {
  const getChoice = useCallback(() => getSnapshot()[key], [key]);
  const getServerChoice = useCallback(() => DEFAULT_APPEARANCE[key], [key]);
  return useSyncExternalStore(subscribe, getChoice, getServerChoice);
}
