"use client";

import { createClient } from "@/lib/supabase/client";
import { broadcastOutboxFlushed, subscribeOutboxBroadcast } from "@/lib/offline";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { logSyncFlushFailure } from "@/lib/offline";
import { processOutbox } from "@/lib/sync/sync-manager";
import { registerOutboxHandlers } from "@/lib/sync/register-handlers";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

const PERIODIC_MS = 90_000;

/**
 * Sync outbox : réseau OK, handlers enregistrés, mutex côté `processOutbox`,
 * invalidation RQ après flush, broadcast multi-onglets, flush au retour visible.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const registered = useRef(false);

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    if (!registered.current) {
      registered.current = true;
      registerOutboxHandlers();
    }
  }, []);

  useEffect(() => {
    return subscribeOutboxBroadcast(invalidateAll);
  }, [invalidateAll]);

  useEffect(() => {
    if (!online) return;

    let cancelled = false;

    async function flush() {
      if (cancelled || typeof window === "undefined") return;
      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
        !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
      ) {
        return;
      }
      try {
        const supabase = createClient();
        const { processed } = await processOutbox(supabase);
        if (processed > 0) {
          await queryClient.invalidateQueries();
          broadcastOutboxFlushed();
        }
      } catch (e) {
        logSyncFlushFailure(e, { phase: "flush" });
      }
    }

    void flush();
    const id = window.setInterval(() => void flush(), PERIODIC_MS);
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [online, queryClient]);

  return <>{children}</>;
}
