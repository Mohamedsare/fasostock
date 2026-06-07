"use client";

import { attachReactQueryErrorLogging } from "@/lib/monitoring/react-query-error-logging";
import {
  createFasoStockQueryPersister,
  RQ_MAX_AGE_MS,
  RQ_PERSIST_BUSTER,
} from "@/lib/offline";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

const noopSubscribe = () => () => {};

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
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
