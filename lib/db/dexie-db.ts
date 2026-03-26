import Dexie, { type Table } from "dexie";
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
