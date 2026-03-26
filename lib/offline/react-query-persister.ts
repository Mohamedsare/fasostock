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
    throttleTime: 1000,
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
