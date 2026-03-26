import type { QueryClient } from "@tanstack/react-query";
import { captureWebAppError, shouldSkipRemoteErrorLog } from "@/lib/monitoring/remote-error-logger";

function safeSerializeKey(key: unknown): string {
  try {
    return JSON.stringify(key, (_k, v) => (typeof v === "bigint" ? String(v) : v));
  } catch {
    return "[unserializable]";
  }
}

/**
 * Enregistre toutes les erreurs de requêtes / mutations React Query vers `log_app_error`.
 * À brancher une fois sur le `QueryClient` racine.
 */
export function attachReactQueryErrorLogging(client: QueryClient): void {
  client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const { action } = event;
    if (action.type !== "error") return;
    const err = action.error;
    if (shouldSkipRemoteErrorLog(err)) return;
    void captureWebAppError(err, {
      source: "react-query",
      stack: err instanceof Error ? err.stack : undefined,
      extra: {
        layer: "react-query",
        queryKey: safeSerializeKey(event.query.queryKey),
      },
    });
  });

  client.getMutationCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const { action } = event;
    if (action.type !== "error") return;
    const err = action.error;
    if (shouldSkipRemoteErrorLog(err)) return;
    const m = event.mutation;
    void captureWebAppError(err, {
      source: "react-mutation",
      stack: err instanceof Error ? err.stack : undefined,
      extra: {
        layer: "react-mutation",
        mutationKey: m.options.mutationKey
          ? safeSerializeKey(m.options.mutationKey)
          : null,
      },
    });
  });
}
