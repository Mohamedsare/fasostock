/** Durée de conservation du cache TanStack Query (alignée gcTime). */
export const RQ_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Clé + buster : incrémenter le buster si le format persisté change (invalidation anciens caches).
 */
export const RQ_PERSIST_KEY = "fasostock-tanstack-query";
/**
 * v4 : `fetchSalesCost` passe de `Map` à objet simple. Une `Map` persistée en JSON
 * revenait en `{}` et faisait planter l'historique des ventes (`costById.get is not a
 * function`) — le buster purge les caches déjà pollués au prochain chargement.
 */
export const RQ_PERSIST_BUSTER = "v4-idb";

/** IndexedDB : base + store dédiés (séparés de la Dexie outbox). */
export const IDB_RQ_DB = "fasostock_offline";
export const IDB_RQ_STORE = "react_query_cache";

/** Canal BroadcastChannel pour invalider les autres onglets après sync. */
export const SYNC_BROADCAST_CHANNEL = "fasostock-sync";

/** Aligné `sync-manager` / Flutter — au-delà, entrée considérée bloquée. */
export const MAX_OUTBOX_ATTEMPTS = 25;
