"use client";

import { useCallback, useSyncExternalStore } from "react";

export type DisplayMode = "standard" | "minimal";

export const DISPLAY_MODE_STORAGE_KEY = "pi-web:display-mode";
export const DISPLAY_MODE_DEFAULT: DisplayMode = "standard";

function parseDisplayMode(raw: string | null): DisplayMode {
  return raw === "minimal" ? "minimal" : DISPLAY_MODE_DEFAULT;
}

function readStoredDisplayMode(): DisplayMode {
  try {
    return parseDisplayMode(window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY));
  } catch {
    return DISPLAY_MODE_DEFAULT;
  }
}

let displayMode: DisplayMode | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): DisplayMode {
  if (displayMode === null) displayMode = readStoredDisplayMode();
  return displayMode;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== DISPLAY_MODE_STORAGE_KEY) return;
  const next = readStoredDisplayMode();
  if (next === displayMode) return;
  displayMode = next;
  notify();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorage);
    // No consumer was listening while another tab changed the preference.
    displayMode = readStoredDisplayMode();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function setDisplayMode(next: DisplayMode): void {
  if (next === getSnapshot()) return;
  displayMode = next;
  try {
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, next);
  } catch {
    // The choice still applies for this page when storage is unavailable.
  }
  notify();
}

/** Standard keeps the full top bar; Minimal tucks its technical controls behind a reveal control. */
export function useDisplayMode(): { minimal: boolean; setMinimal: (value: boolean) => void } {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => DISPLAY_MODE_DEFAULT);
  const setMinimal = useCallback((value: boolean) => {
    setDisplayMode(value ? "minimal" : "standard");
  }, []);

  return { minimal: mode === "minimal", setMinimal };
}
