"use client";

import { useSyncExternalStore } from "react";
import { getInteractiveUiMode, INTERACTIVE_UI_MODE_EVENT } from "@/lib/interactive-ui";

function subscribe(listener: () => void) {
  window.addEventListener(INTERACTIVE_UI_MODE_EVENT, listener);
  return () => window.removeEventListener(INTERACTIVE_UI_MODE_EVENT, listener);
}

export function useInteractiveUiMode() {
  return useSyncExternalStore(subscribe, getInteractiveUiMode, () => "off" as const);
}
