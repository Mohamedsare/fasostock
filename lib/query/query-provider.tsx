"use client";

import { attachReactQueryErrorLogging } from "@/lib/monitoring/react-query-error-logging";
import {
  createFasoStockQueryPersister,
  RQ_MAX_AGE_MS,
  RQ_PERSIST_BUSTER,
} from "@/lib/offline";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  defaultShouldDehydrateQuery,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

const noopSubscribe = () => () => {};

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
        gcTime: RQ_MAX_AGE_MS,
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

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  // false côté serveur (SSR), true après hydratation — sans setState dans un effet.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const persister = useMemo(() => {
    if (!mounted || typeof window === "undefined") return null;
    return createFasoStockQueryPersister();
  }, [mounted]);

  if (!mounted || !persister) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

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
