"use client";

import { useEffect } from "react";

/** Assez rapproché pour qu'une instance reste debout, assez espacé pour ne rien coûter. */
const WARMUP_EVERY_MS = 10 * 60_000;

/**
 * Garde le moteur PDF réveillé tant que la caisse est à l'écran.
 *
 * Le ticket est fabriqué par une route serveur qui lance Chromium. Ce lancement se
 * compte en secondes, et il retombe systématiquement sur le premier client d'après
 * l'accalmie : l'ouverture du matin, le retour de pause. En sonnant à vide pendant que
 * la caisse est ouverte, cette attente est payée quand personne n'attend.
 *
 * Trois précautions, pour que le préchauffage ne devienne jamais une nuisance :
 *
 *  1. hors ligne, on ne tente rien — la caisse encaisse quand même, et un appel voué à
 *     l'échec ne ferait qu'ajouter du bruit ;
 *  2. onglet en arrière-plan, on saute le tour : une caisse laissée ouverte derrière
 *     d'autres onglets ne doit pas réveiller un serveur toutes les dix minutes ;
 *  3. l'échec est silencieux. Rien ici n'est nécessaire à la vente.
 */
export function usePdfWarmup(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const ping = (): void => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetch("/api/pdf/warmup", {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => undefined);
    };

    ping();
    const timer = window.setInterval(ping, WARMUP_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);
}
