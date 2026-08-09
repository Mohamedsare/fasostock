import Dexie, { type Table } from "dexie";
import { MAX_OUTBOX_ATTEMPTS } from "@/lib/offline/constants";
import { logEnqueueFailure } from "@/lib/offline/offline-logger";
import type { OutboxRecord } from "./outbox-types";

/**
 * IndexedDB local — outbox pour opérations hors ligne.
 * N’instancier que côté navigateur (`getLocalDb()`).
 */
export class FasoStockLocalDB extends Dexie {
  outbox!: Table<OutboxRecord, number>;

  constructor() {
    super("fasostock_web");
    this.version(1).stores({
      outbox: "++id, kind, status, createdAt",
    });
  }
}

let _db: FasoStockLocalDB | null = null;

export function getLocalDb(): FasoStockLocalDB | null {
  if (typeof window === "undefined") return null;
  if (!_db) _db = new FasoStockLocalDB();
  return _db;
}

export async function enqueueOutbox(kind: string, payload: unknown): Promise<number> {
  const db = getLocalDb();
  if (!db) throw new Error("IndexedDB indisponible (SSR)");
  const now = Date.now();
  try {
    const id = await db.outbox.add({
      kind,
      payload: JSON.stringify(payload),
      status: "pending",
      createdAt: now,
      updatedAt: now,
      attempts: 0,
    });
    return id as number;
  } catch (e) {
    logEnqueueFailure(e, kind);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export async function getPendingCount(): Promise<number> {
  const db = getLocalDb();
  if (!db) return 0;
  try {
    return db.outbox.where("status").equals("pending").count();
  } catch {
    return 0;
  }
}

/** Opérations d'encaissement — celles dont l'échec coûte de l'argent au commerçant. */
const SALE_KINDS = new Set(["pos_sale_create", "engine_sale_create"]);

export type OutboxCounts = {
  /** En attente d'envoi, réessais encore possibles. */
  pending: number;
  /** Réessais épuisés : n'partiront plus seules, il faut intervenir. */
  stuck: number;
  /** Part des bloquées qui sont des ventes — de l'argent encaissé absent de la base. */
  stuckSales: number;
};

const EMPTY_COUNTS: OutboxCounts = { pending: 0, stuck: 0, stuckSales: 0 };

/**
 * Remet à zéro le compteur de tentatives des entrées bloquées : la prochaine
 * synchronisation les reprend.
 *
 * Utile après avoir levé la cause du blocage — typiquement la migration 00177, qui
 * permet enfin d'enregistrer une vente hors ligne dont le stock était devenu
 * insuffisant. Sans ce bouton, l'argent déjà encaissé resterait absent de la base.
 */
export async function retryStuckOutbox(): Promise<number> {
  const db = getLocalDb();
  if (!db) return 0;
  try {
    const rows = await db.outbox.where("status").equals("pending").toArray();
    const now = Date.now();
    let revived = 0;
    for (const row of rows) {
      if (row.id == null || (row.attempts ?? 0) < MAX_OUTBOX_ATTEMPTS) continue;
      await db.outbox.update(row.id, { attempts: 0, updatedAt: now });
      revived += 1;
    }
    return revived;
  } catch {
    return 0;
  }
}

/**
 * Compte la file en un seul parcours.
 *
 * `stuck` et `pending` partagent le statut `"pending"` : ce qui les sépare est le nombre
 * de tentatives. Sans cette distinction, une vente définitivement bloquée serait comptée
 * comme « en cours d'envoi » et personne ne s'en inquiéterait.
 */
export async function getOutboxCounts(): Promise<OutboxCounts> {
  const db = getLocalDb();
  if (!db) return EMPTY_COUNTS;
  try {
    const rows = await db.outbox.where("status").equals("pending").toArray();
    let pending = 0;
    let stuck = 0;
    let stuckSales = 0;
    for (const row of rows) {
      if ((row.attempts ?? 0) >= MAX_OUTBOX_ATTEMPTS) {
        stuck += 1;
        if (SALE_KINDS.has(row.kind)) stuckSales += 1;
      } else {
        pending += 1;
      }
    }
    return { pending, stuck, stuckSales };
  } catch {
    return EMPTY_COUNTS;
  }
}
