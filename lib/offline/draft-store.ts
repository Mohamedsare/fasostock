"use client";

import { createStore, del, get, set } from "idb-keyval";
import { DRAFT_MAX_AGE_MS, IDB_DRAFTS_DB, IDB_DRAFTS_STORE } from "./constants";

/**
 * Brouillons d'écran — le travail **commencé mais pas validé**.
 *
 * Le cache TanStack (`react-query-persister`) garde ce qui vient du serveur ; la file
 * Dexie garde ce qui est parti vers le serveur. Entre les deux il manquait ce que le
 * commerçant a tapé et n'a pas encore encaissé : quitter la caisse pour aller vérifier
 * un stock démontait la page et vidait le panier.
 *
 * Volontairement séparé du cache de requêtes : celui-ci est purgé, busté et remplacé au
 * gré des invalidations, un panier en cours n'a rien à faire dedans.
 */

const idbStore =
  typeof window === "undefined" ? null : createStore(IDB_DRAFTS_DB, IDB_DRAFTS_STORE);

/** Enveloppe persistée : la version permet d'ignorer un brouillon d'un format révolu. */
type StoredDraft<T> = {
  v: number;
  savedAt: number;
  data: T;
};

function isStoredDraft(value: unknown): value is StoredDraft<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Partial<StoredDraft<unknown>>;
  return typeof d.v === "number" && typeof d.savedAt === "number" && "data" in d;
}

/**
 * Relit un brouillon. Renvoie `null` — et nettoie la clé — si l'entrée est absente,
 * périmée, d'une autre version, ou illisible.
 *
 * Aucune erreur ne remonte : un brouillon est un confort. En navigation privée ou avec
 * IndexedDB bloqué, l'écran doit s'ouvrir vide, jamais planter.
 */
export async function readDraft<T>(
  key: string,
  version: number,
  maxAgeMs: number = DRAFT_MAX_AGE_MS,
): Promise<T | null> {
  if (!idbStore) return null;
  try {
    const raw = await get<unknown>(key, idbStore);
    if (!isStoredDraft(raw)) {
      if (raw !== undefined) await del(key, idbStore);
      return null;
    }
    if (raw.v !== version || Date.now() - raw.savedAt > maxAgeMs) {
      await del(key, idbStore);
      return null;
    }
    return raw.data as T;
  } catch {
    return null;
  }
}

/** Écrit (ou remplace) un brouillon. Silencieux en cas de quota ou d'IndexedDB indisponible. */
export async function writeDraft<T>(key: string, version: number, data: T): Promise<void> {
  if (!idbStore) return;
  try {
    const payload: StoredDraft<T> = { v: version, savedAt: Date.now(), data };
    await set(key, payload, idbStore);
  } catch {
    /* quota / mode privé : le brouillon ne survivra pas, l'écran continue de fonctionner */
  }
}

/** Supprime un brouillon (travail validé ou abandonné). */
export async function clearDraft(key: string): Promise<void> {
  if (!idbStore) return;
  try {
    await del(key, idbStore);
  } catch {
    /* idem : rien à rattraper, la relecture ignore de toute façon les entrées illisibles */
  }
}
