import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalDb } from "@/lib/db/dexie-db";
import type { OutboxRecord } from "@/lib/db/outbox-types";

const BASE_DELAY_MS = 1500;
const MAX_DELAY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 25;

export type OutboxHandler = (
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
) => Promise<void>;

const handlers = new Map<string, OutboxHandler>();

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

/**
 * Traite la file hors ligne : push vers Supabase puis supprime la ligne si succès.
 * En cas d’échec : reste `pending`, `attempts++`, `lastError`, backoff.
 */
export async function processOutbox(supabase: SupabaseClient): Promise<{
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
    if (attempts >= MAX_ATTEMPTS) continue;

    if (
      attempts > 0 &&
      now - row.updatedAt < backoffMs(attempts)
    ) {
      continue;
    }

    try {
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      const handler = handlers.get(row.kind);
      if (!handler) {
        throw new Error(`Aucun handler outbox pour kind="${row.kind}"`);
      }
      await handler(supabase, payload);
      await db.outbox.delete(id);
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
  return rows.filter((r) => (r.attempts ?? 0) >= MAX_ATTEMPTS);
}
