/**
 * Validité de la copie persistée : au-delà, le cache retrouvé sur disque est jugé trop
 * vieux et ignoré au démarrage. Large exprès — une caisse rouverte après le week-end
 * doit retrouver ses écrans remplis immédiatement.
 */
export const RQ_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Durée pendant laquelle une requête inactive reste **en mémoire**.
 *
 * À ne pas confondre avec `RQ_MAX_AGE_MS` : celui-ci parle du disque, celui-là de la RAM.
 * Les deux valaient 7 jours, ce qui revenait à ne jamais rien libérer — une caisse ouverte
 * du matin au soir accumulait chaque écran visité sans jamais rendre la mémoire, sur des
 * jeux de données qui pèsent ~1 Mo pièce.
 *
 * 24 h borne cette croissance sans rien coûter en pratique : une boutique ouvre son app
 * tous les jours, donc les données utiles sont toujours revues dans la fenêtre. Ce qui
 * sort de la mémoire n'est pas perdu, seulement rechargé au prochain affichage.
 */
export const RQ_GC_TIME_MS = 1000 * 60 * 60 * 24;

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

/**
 * Vente encaissée mais pas encore partie : l'identifiant renvoyé au POS n'est pas
 * encore celui de la base. Les écrans s'en servent pour proposer un ticket provisoire
 * au lieu d'un numéro définitif (`saleId.startsWith(OFFLINE_SALE_ID_PREFIX)`).
 */
export const OFFLINE_SALE_ID_PREFIX = "offline:";
export const OFFLINE_SALE_NUMBER_LABEL = "Hors ligne — en attente sync";

/**
 * IndexedDB : base dédiée aux **brouillons d'écran** (travail en cours non validé).
 *
 * Base séparée de `IDB_RQ_DB` et de la Dexie outbox, et ce n'est pas cosmétique :
 * `idb-keyval` ouvre la base sans numéro de version, donc son `onupgradeneeded` ne se
 * déclenche jamais sur une base qui existe déjà. Deux `createStore()` sur le même nom de
 * base avec des noms de store différents donnent un `NotFoundError` au premier accès.
 */
export const IDB_DRAFTS_DB = "fasostock_drafts";
export const IDB_DRAFTS_STORE = "screen_drafts";

/**
 * Au-delà, un brouillon retrouvé sur disque est ignoré et supprimé.
 *
 * 12 h couvre largement le cas réel — « je quitte la caisse pour vérifier un stock et je
 * reviens » — sans ressusciter le panier de la veille au matin : entre-temps le stock et
 * les prix ont bougé, et le caissier encaisserait un client qui n'est plus là.
 */
export const DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 12;
