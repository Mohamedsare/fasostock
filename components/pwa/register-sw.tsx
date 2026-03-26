"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker `/sw.js` (cache assets) — sans bloquer le rendu.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const timer = window.setTimeout(() => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* build local sans sw : ignorer */
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
