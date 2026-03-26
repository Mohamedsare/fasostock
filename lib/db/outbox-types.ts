/** Aligné sur la file `pending_actions` côté app Flutter (kind + payload JSON). */
export type OutboxStatus = "pending" | "syncing" | "failed";

export interface OutboxRecord {
  id?: number;
  kind: string;
  payload: string;
  status: OutboxStatus;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError?: string;
}
