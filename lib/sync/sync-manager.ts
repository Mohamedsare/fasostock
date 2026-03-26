import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_OUTBOX_ATTEMPTS } from "@/lib/offline/constants";
import {
  logOutboxCorruptPayload,
  logOutboxHandlerFailure,
  logOutboxStuck,
} from "@/lib/offline/offline-logger";
import { getLocalDb } from "@/lib/db/dexie-db";
import type { OutboxRecord } from "@/lib/db/outbox-types";

const BASE_DELAY_MS = 1500;
const MAX_DELAY_MS = 5 * 60 * 1000;

export type OutboxHandler = (
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
) => Promise<void>;

const handlers = new Map<string, OutboxHandler>();

/** Une entrée « bloquée » n’est loguée qu’une fois par session (évite doublons). */
const stuckLoggedIds = new Set<number>();

export function registerOutboxHandler(kind: string, fn: OutboxHandler): void {
  handlers.set(kind, fn);
}

function backoffMs(attempts: number): number {
  const raw = Math.min(
    MAX_DELAY_MS,
    BASE_DELAY_MS * Math.pow(2, Math.max(0, attempts - 1)),
  );
  return raw + Math.floor(Math.random() * 400);
}

/** Évite deux traitements concurrents (intervalle + online + onglet visible). */
let outboxMutex = Promise.resolve();

/**
 * Traite la file hors ligne : push vers Supabase puis supprime la ligne si succès.
 * En cas d’échec : reste `pending`, `attempts++`, `lastError`, backoff.
 */
export async function processOutbox(supabase: SupabaseClient): Promise<{
  processed: number;
  errors: number;
}> {
  const p = outboxMutex.then(() => processOutboxImpl(supabase));
  outboxMutex = p.then(
    () => {},
    () => {},
  );
  return p;
}

async function processOutboxImpl(supabase: SupabaseClient): Promise<{
  processed: number;
  errors: number;
}> {
  const db = getLocalDb();
  if (!db) return { processed: 0, errors: 0 };

  const rows = await db.outbox.orderBy("createdAt").toArray();
  const now = Date.now();

  let processed = 0;
  let errors = 0;

  for (const row of rows) {
    if (row.id == null || (row.status ?? "pending") !== "pending") continue;
    const id = row.id;
    const attempts = row.attempts ?? 0;

    if (attempts >= MAX_OUTBOX_ATTEMPTS) {
      if (!stuckLoggedIds.has(id)) {
        stuckLoggedIds.add(id);
        logOutboxStuck(row.kind, id, row.lastError);
      }
      continue;
    }

    if (attempts > 0 && now - row.updatedAt < backoffMs(attempts)) {
      continue;
    }

    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(row.payload) as Record<string, unknown>;
      } catch (parseErr) {
        const preview = (row.payload ?? "").slice(0, 200);
        logOutboxCorruptPayload(parseErr, id, preview);
        await db.outbox.delete(id);
        errors++;
        continue;
      }

      const handler = handlers.get(row.kind);
      if (!handler) {
        throw new Error(`Aucun handler outbox pour kind="${row.kind}"`);
      }
      await handler(supabase, parsed);
      await db.outbox.delete(id);
      stuckLoggedIds.delete(id);
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const nextAttempts = attempts + 1;
      await db.outbox.update(id, {
        status: "pending",
        attempts: nextAttempts,
        lastError: msg,
        updatedAt: Date.now(),
      });
      logOutboxHandlerFailure(e, row.kind, id, nextAttempts);
      errors++;
    }
  }

  return { processed, errors };
}

/** Marque les entrées en échec définitif comme non traitées (pour inspection / support). */
export async function listStuckOutbox(): Promise<OutboxRecord[]> {
  const db = getLocalDb();
  if (!db) return [];
  const rows = await db.outbox.toArray();
  return rows.filter((r) => (r.attempts ?? 0) >= MAX_OUTBOX_ATTEMPTS);
}
