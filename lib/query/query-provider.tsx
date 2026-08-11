"use client";

import { attachReactQueryErrorLogging } from "@/lib/monitoring/react-query-error-logging";
import {
  createFasoStockQueryPersister,
  RQ_GC_TIME_MS,
  RQ_MAX_AGE_MS,
  RQ_PERSIST_BUSTER,
} from "@/lib/offline";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * Le cache persisté transite par `JSON.stringify` : une `Map` / `Set` y devient `{}`
 * et l'écran qui appelle `.get()` dessus plante à la relecture (historique des ventes,
 * août 2026). Plutôt que d'écrire une donnée qui reviendra cassée, on ne persiste pas
 * cette requête — elle sera simplement refetchée. Contrôle sur 2 niveaux : suffisant
 * pour les `Map` renvoyées telles quelles ou dans un champ de premier niveau, sans
 * coûter un parcours profond à chaque écriture (throttle 1 s).
 */
function isJsonSafeQueryData(data: unknown, depth = 0): boolean {
  if (data instanceof Map || data instanceof Set) return false;
  if (depth >= 2 || data == null || typeof data !== "object") return true;
  const values = Array.isArray(data) ? data : Object.values(data);
  for (const v of values) {
    if (!isJsonSafeQueryData(v, depth + 1)) return false;
  }
  return true;
}

function makeClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        /** Mémoire (RAM), à distinguer du `maxAge` de la copie disque plus bas. */
        gcTime: RQ_GC_TIME_MS,
        refetchOnReconnect: true,
        /** Hors ligne : pas de refetch agressif au focus (données persistées IDB). */
        refetchOnWindowFocus: false,
        retry: (failureCount, err) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;
          const msg = err instanceof Error ? err.message : String(err);
          if (/aborterror|cancelled|canceled/i.test(msg)) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });
  attachReactQueryErrorLogging(client);
  return client;
}

/**
 * Un SEUL type de provider, rendu aussi bien au serveur qu'au client.
 *
 * Auparavant, ce composant rendait `QueryClientProvider` avant l'hydratation puis
 * basculait sur `PersistQueryClientProvider`. Changer de type de composant à la même
 * position de l'arbre force React à **démonter puis remonter tout l'arbre applicatif** :
 * chaque chargement de page montait l'app deux fois, relançait toutes les requêtes et
 * perdait l'état local des composants (filtres, panier en cours de saisie). Sur une
 * tablette d'entrée de gamme, cela se voit.
 *
 * `PersistQueryClientProvider` est sûr côté serveur : il ne lit ni `window` ni IndexedDB
 * au rendu, tout son I/O vit dans un `useEffect`. Et `createStore` d'idb-keyval est
 * paresseux — il n'ouvre la base qu'à la première lecture, donc jamais pendant le SSR.
 *
 * Effet de bord bienvenu : les requêtes attendent désormais la fin de la restauration
 * du cache disque (`isRestoring`) avant de partir, au lieu de démarrer puis d'être
 * écrasées par la copie restaurée.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  const [persister] = useState(createFasoStockQueryPersister);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: RQ_MAX_AGE_MS,
        buster: RQ_PERSIST_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) && isJsonSafeQueryData(query.state.data),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
