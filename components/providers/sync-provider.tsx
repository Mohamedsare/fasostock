"use client";

import { createClient } from "@/lib/supabase/client";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { processOutbox } from "@/lib/sync/sync-manager";
import { registerOutboxHandlers } from "@/lib/sync/register-handlers";
import { useEffect, useRef, type ReactNode } from "react";

const PERIODIC_MS = 90_000;

/**
 * Pousse l’outbox Dexie vers Supabase quand le réseau est disponible + heartbeat périodique (comme Flutter).
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();
  const registered = useRef(false);

  useEffect(() => {
    if (!registered.current) {
      registered.current = true;
      registerOutboxHandlers();
    }
  }, []);

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
        await processOutbox(supabase);
      } catch (e) {
        reportHandledClientError(e, { source: "sync-outbox" });
      }
    }

    void flush();
    const id = window.setInterval(() => void flush(), PERIODIC_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [online]);

  return <>{children}</>;
}
