import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistedClient } from "@tanstack/query-persist-client-core";
import { createStore, del, get, set } from "idb-keyval";
import { IDB_RQ_DB, IDB_RQ_STORE, RQ_PERSIST_KEY } from "./constants";
import { logRqPersistFailure } from "./offline-logger";

const idbStore = createStore(IDB_RQ_DB, IDB_RQ_STORE);

/**
 * Persistance du cache TanStack Query dans **IndexedDB** (quota élevé vs localStorage).
 * Chaque opération est isolée : une erreur (ex. quota) ne casse pas toute l’app.
 */
const asyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const v = await get<string>(key, idbStore);
      return v ?? null;
    } catch (e) {
      logRqPersistFailure("read", e, key);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await set(key, value, idbStore);
    } catch (e) {
      logRqPersistFailure("write", e, key);
      throw e;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await del(key, idbStore);
    } catch (e) {
      logRqPersistFailure("remove", e, key);
    }
  },
};

export function createFasoStockQueryPersister() {
  return createAsyncStoragePersister({
    storage: asyncStorage,
    key: RQ_PERSIST_KEY,
    /*
     * Chaque écriture sérialise le cache ENTIER (`JSON.stringify`) avant de l'envoyer
     * dans IndexedDB. Sur ce parc, un seul jeu produits + stock + clients pèse déjà ~1 Mo,
     * et le cache grossit tant que la caisse reste ouverte. À une écriture par seconde,
     * une tablette d'entrée de gamme passe la journée à réallouer des chaînes de plusieurs
     * méga-octets : gigue, pression sur le ramasse-miettes, puis onglet qui meurt.
     *
     * Espacer les écritures est sans risque : cette copie ne sert qu'à **relire** plus vite
     * après un rechargement. Les écritures réelles — les ventes encaissées — vivent dans la
     * file Dexie, pas ici. Au pire on repart avec quelques secondes de cache en moins, et
     * les requêtes se refont.
     */
    throttleTime: 5000,
    /** JSON corrompu : log puis throw — le core TanStack purge le cache et évite un crash silencieux. */
    deserialize: (cachedString: string): PersistedClient => {
      try {
        return JSON.parse(cachedString) as PersistedClient;
      } catch (e) {
        logRqPersistFailure("read", e, RQ_PERSIST_KEY);
        throw e;
      }
    },
    /** Échec persist (serialize / setItem) : log puis abandon (évite boucle). */
    retry: ({ error }) => {
      logRqPersistFailure("write", error, RQ_PERSIST_KEY);
      return undefined;
    },
  });
}
