"use client";

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false, // Snapshot serveur (SSR) : pas de matchMedia → false.
  );
}

/** ≥ 1024px — cohérent avec navigation latérale Flutter (desktop). */
export function useDesktopNav(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
