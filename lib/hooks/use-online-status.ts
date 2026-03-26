"use client";

import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getSnapshot(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

/** Toujours « en ligne » côté serveur + 1er rendu client pour éviter les erreurs d’hydratation. */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * État réseau du navigateur. Aligné avec Flutter (Connectivity) : après hydratation,
 * reflète `navigator.onLine` et les événements online/offline.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
