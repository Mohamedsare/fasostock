"use client";

import { useEffect } from "react";

import { getVapidPublicKey } from "@/lib/features/push/public-key";

/**
 * Enregistre le service worker `/sw.js` (cache assets) — sans bloquer le rendu.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Le SW n'enregistre rien de plus qu'un point d'écoute push : hors production,
    // il ne sert que si les clés VAPID sont là. Aucune permission n'est demandée ici.
    if (process.env.NODE_ENV !== "production" && !getVapidPublicKey()) return;
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
