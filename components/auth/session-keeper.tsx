"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

/** Marge de sécurité : on prolonge dès qu'il reste moins de 5 minutes de validité. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** Anti-rafale : jamais deux prolongations à moins de 30 s d'intervalle. */
const MIN_INTERVAL_MS = 30_000;
/** Vérification de fond quand l'app reste ouverte longtemps sur le même écran. */
const CHECK_EVERY_MS = 5 * 60 * 1000;

/**
 * Maintient la session ouverte tant que l'utilisateur ne se déconnecte pas lui-même.
 *
 * Supabase prolonge déjà la session en tâche de fond, mais son minuteur est mis en pause
 * (voire gelé) quand l'onglet passe en arrière-plan — c'est le cas typique du commerçant
 * qui pose son téléphone et le reprend deux heures plus tard. On prolonge donc
 * explicitement au réveil de l'app, au retour du réseau et à la sortie du cache de page,
 * pour qu'il retrouve son écran au lieu d'une page de connexion.
 *
 * Ne rend rien ; ne déconnecte jamais.
 */
export function SessionKeeper() {
  const busy = useRef(false);
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function keepSessionAlive() {
      if (cancelled || busy.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (Date.now() - lastRefreshAt.current < MIN_INTERVAL_MS) return;

      busy.current = true;
      try {
        // `getSession()` prolonge déjà tout seul un jeton expiré : on ne force la
        // prolongation que pour un jeton *bientôt* expiré, sans jamais doubler l'appel.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session || cancelled) return;

        const expiresAtMs = (session.expires_at ?? 0) * 1000;
        if (expiresAtMs - Date.now() > REFRESH_MARGIN_MS) return;

        lastRefreshAt.current = Date.now();
        await supabase.auth.refreshSession();
      } catch {
        /* Hors ligne ou serveur injoignable : on retentera au prochain réveil. */
      } finally {
        busy.current = false;
      }
    }

    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      void keepSessionAlive();
    };

    void keepSessionAlive();
    const timer = setInterval(() => void keepSessionAlive(), CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("pageshow", onWake);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, []);

  return null;
}
