"use client";

import { useCallback, useEffect, useState } from "react";

import { getOutboxCounts, type OutboxCounts } from "@/lib/db/dexie-db";
import { subscribeOutboxBroadcast } from "@/lib/offline";

/**
 * Rythme de relecture de la file. La mise en file, elle, n'émet pas d'événement : sans
 * ce sondage, une vente encaissée en réseau dégradé resterait invisible jusqu'au
 * prochain flux de synchronisation. Le comptage porte sur un index Dexie de quelques
 * lignes — le coût est négligeable, et on s'arrête dès que l'onglet passe en arrière-plan.
 */
const POLL_MS = 8000;

const EMPTY: OutboxCounts = { pending: 0, stuck: 0, stuckSales: 0 };

/**
 * État de la file d'attente locale (ventes et autres écritures pas encore parties).
 *
 * Renvoie `EMPTY` au rendu serveur et au premier rendu client : la file vit dans
 * IndexedDB, indisponible côté serveur.
 */
export function useOutboxCounts(): OutboxCounts {
  const [counts, setCounts] = useState<OutboxCounts>(EMPTY);

  const refresh = useCallback(() => {
    void getOutboxCounts().then(
      (next) => setCounts(next),
      () => setCounts(EMPTY),
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      // Onglet caché : personne ne regarde, inutile de réveiller IndexedDB.
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    const timer = window.setInterval(tick, POLL_MS);

    // Après un envoi réussi (y compris depuis un autre onglet), le compte change.
    const unsubscribe = subscribeOutboxBroadcast(refresh);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", refresh);
    };
  }, [refresh]);

  return counts;
}
