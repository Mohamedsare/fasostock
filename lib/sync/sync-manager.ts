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

/**
 * Entrées examinées par passe. Assez large pour vider d'un coup la file d'une journée
 * hors ligne, assez bas pour qu'une file anormalement longue ne fige pas l'onglet.
 */
const MAX_OUTBOX_PER_TICK = 200;

/** Entrées bloquées inspectées par passe, uniquement pour le signalement. */
const MAX_STUCK_LOGGED_PER_TICK = 50;

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

/** Signale les entrées à bout de tentatives — une fois par entrée et par session. */
async function logStuckOutboxOnce(
  db: NonNullable<ReturnType<typeof getLocalDb>>,
): Promise<void> {
  try {
    const stuck = await db.outbox
      .filter((r) => (r.attempts ?? 0) >= MAX_OUTBOX_ATTEMPTS)
      .limit(MAX_STUCK_LOGGED_PER_TICK)
      .toArray();
    for (const row of stuck) {
      if (row.id == null || stuckLoggedIds.has(row.id)) continue;
      stuckLoggedIds.add(row.id);
      logOutboxStuck(row.kind, row.id, row.lastError);
    }
  } catch {
    /* Le diagnostic ne doit jamais empêcher la synchronisation. */
  }
}

async function processOutboxImpl(supabase: SupabaseClient): Promise<{
  processed: number;
  errors: number;
}> {
  const db = getLocalDb();
  if (!db) return { processed: 0, errors: 0 };

  /*
   * Lecture bornée ET filtrée à la source.
   *
   * `toArray()` sur toute la table chargeait en mémoire **chaque** entrée à chaque tick,
   * payload JSON compris — y compris les entrées définitivement bloquées, qui ne sont
   * jamais supprimées (ce sont souvent des ventes encaissées : les effacer perdrait de
   * l'argent, cf. migration 00177). Une longue coupure suivie d'un blocage persistant
   * transformait le tick en travail inutile et grandissant, sur les tablettes les plus
   * modestes.
   *
   * Le filtre est posé DANS la requête, pas dans la boucle : sinon, 200 entrées bloquées
   * en tête de file consommeraient tout le quota de la passe et les ventes récentes ne
   * partiraient jamais. Ici le plafond ne compte que les entrées réellement traitables.
   */
  const rows = await db.outbox
    .orderBy("createdAt")
    .filter(
      (r) =>
        (r.status ?? "pending") === "pending" &&
        (r.attempts ?? 0) < MAX_OUTBOX_ATTEMPTS,
    )
    .limit(MAX_OUTBOX_PER_TICK)
    .toArray();
  const now = Date.now();

  // Les entrées bloquées ne sont plus traitées, mais restent à signaler une fois par
  // session (diagnostic support). Requête distincte et plafonnée : le signalement ne
  // doit pas peser sur la synchronisation.
  await logStuckOutboxOnce(db);

  let processed = 0;
  let errors = 0;

  for (const row of rows) {
    if (row.id == null) continue;
    const id = row.id;
    const attempts = row.attempts ?? 0;

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
