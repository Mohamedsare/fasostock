"use client";

import { attachReactQueryErrorLogging } from "@/lib/monitoring/react-query-error-logging";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

function makeClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
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
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
