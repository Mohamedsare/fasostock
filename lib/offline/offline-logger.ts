import { captureWebAppError } from "@/lib/monitoring/remote-error-logger";
import { MAX_OUTBOX_ATTEMPTS } from "./constants";

/** Préfixes `p_source` côté `log_app_error` — filtrables dans l’admin. */
export const OFFLINE_LOG_SOURCE = {
  syncFlush: "offline:sync-flush",
  syncOutboxRow: "offline:outbox-row",
  outboxCorrupt: "offline:outbox-corrupt",
  outboxStuck: "offline:outbox-stuck",
  enqueue: "offline:enqueue",
  rqPersist: "offline:rq-persist",
  broadcast: "offline:broadcast",
} as const;

/** Anti-spam : même entrée d’outbox (kind + id) — logs intermédiaires au plus 1 / minute. */
const outboxFailureThrottle = new Map<string, number>();
const OUTBOX_FAILURE_THROTTLE_MS = 60_000;

function outboxThrottleKey(kind: string, outboxId: number): string {
  return `${kind}:${outboxId}`;
}

function shouldThrottleOutboxFailure(kind: string, outboxId: number, attempts: number): boolean {
  if (attempts >= MAX_OUTBOX_ATTEMPTS) return false;
  const key = outboxThrottleKey(kind, outboxId);
  const now = Date.now();
  const last = outboxFailureThrottle.get(key) ?? 0;
  if (now - last < OUTBOX_FAILURE_THROTTLE_MS) return true;
  outboxFailureThrottle.set(key, now);
  return false;
}

/**
 * Erreur lors du traitement d’une ligne outbox (handler Supabase).
 * Les échecs répétés sont throttlés ; le blocage définitif est toujours loggé.
 */
export function logOutboxHandlerFailure(
  error: unknown,
  kind: string,
  outboxId: number,
  attempts: number,
): void {
  if (attempts < MAX_OUTBOX_ATTEMPTS && shouldThrottleOutboxFailure(kind, outboxId, attempts)) {
    return;
  }
  void captureWebAppError(error, {
    source: OFFLINE_LOG_SOURCE.syncOutboxRow,
    level: attempts >= MAX_OUTBOX_ATTEMPTS ? "error" : "warning",
    stack: error instanceof Error ? error.stack : undefined,
    extra: {
      kind,
      outboxId,
      attempts,
    },
  });
}

/** Payload JSON illisible — ligne supprimée côté sync-manager. */
export function logOutboxCorruptPayload(
  error: unknown,
  outboxId: number,
  payloadPreview: string,
): void {
  void captureWebAppError(error, {
    source: OFFLINE_LOG_SOURCE.outboxCorrupt,
    extra: { outboxId, payloadPreview },
    stack: error instanceof Error ? error.stack : undefined,
  });
}

/** Entrée abandonnée après max tentatives (nécessite action support). */
export function logOutboxStuck(kind: string, outboxId: number, lastError: string | undefined): void {
  void captureWebAppError(new Error(`Outbox bloquée après max tentatives: ${kind}`), {
    source: OFFLINE_LOG_SOURCE.outboxStuck,
    level: "error",
    extra: { kind, outboxId, lastError: lastError ?? null },
  });
}

export function logEnqueueFailure(error: unknown, kind: string): void {
  void captureWebAppError(error, {
    source: OFFLINE_LOG_SOURCE.enqueue,
    extra: { kind },
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export function logRqPersistFailure(
  phase: "read" | "write" | "remove",
  error: unknown,
  key?: string,
): void {
  const name = error instanceof Error ? error.name : "";
  const isQuota =
    name === "QuotaExceededError" ||
    (error instanceof Error && /quota|storage/i.test(error.message));
  void captureWebAppError(error, {
    source: OFFLINE_LOG_SOURCE.rqPersist,
    level: isQuota ? "warning" : "error",
    extra: { phase, key: key ?? null, quota: isQuota },
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export function logSyncFlushFailure(error: unknown, extra?: Record<string, unknown>): void {
  void captureWebAppError(error, {
    source: OFFLINE_LOG_SOURCE.syncFlush,
    extra: extra ?? undefined,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export function logBroadcastFailure(error: unknown): void {
  void captureWebAppError(error, {
    source: OFFLINE_LOG_SOURCE.broadcast,
    stack: error instanceof Error ? error.stack : undefined,
  });
}
