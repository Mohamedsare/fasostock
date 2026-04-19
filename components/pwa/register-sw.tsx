"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker `/sw.js` (cache assets) — sans bloquer le rendu.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const vapid = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    if (process.env.NODE_ENV !== "production" && !vapid) return;
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
