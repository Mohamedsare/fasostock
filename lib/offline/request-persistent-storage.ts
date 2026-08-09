"use client";

import { logRqPersistFailure } from "@/lib/offline/offline-logger";

/**
 * Demande au navigateur de **ne pas effacer** le stockage local de l'app.
 *
 * Sans cela, IndexedDB est en mode « best-effort » : le navigateur s'autorise à le vider
 * quand l'espace disque se réduit, et Safari purge celui d'une PWA non installée après
 * sept jours sans visite. Or c'est là que vivent les ventes encaissées pas encore
 * synchronisées — leur suppression, ce n'est pas un cache perdu, c'est de l'argent
 * encaissé qui disparaît des livres sans laisser de trace.
 *
 * L'accord est accordé silencieusement par Chrome/Edge quand l'app est installée ou
 * suffisamment utilisée ; Safari le refuse souvent. On ne peut donc pas s'y fier, mais
 * le demander ne coûte rien et supprime le risque là où c'est possible.
 *
 * Ne lève jamais : l'échec ne doit pas empêcher l'app de démarrer.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const storage = navigator.storage;
  if (!storage?.persist || !storage.persisted) return false;

  try {
    // Déjà accordé (visite précédente) : ne pas redemander à chaque démarrage.
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch (e) {
    logRqPersistFailure("write", e, "navigator.storage.persist");
    return false;
  }
}
