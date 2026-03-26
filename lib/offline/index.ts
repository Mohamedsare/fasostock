/**
 * Couche **offline-first** appweb :
 * - lecture : cache TanStack Query persisté (IndexedDB via `react-query-persister`)
 * - écriture : outbox Dexie (`lib/db/dexie-db`) + handlers `lib/sync/register-handlers.ts`
 * - sync : `lib/sync/sync-manager.ts` + `components/providers/sync-provider.tsx`
 */
export {
  RQ_MAX_AGE_MS,
  RQ_PERSIST_KEY,
  RQ_PERSIST_BUSTER,
  IDB_RQ_DB,
  IDB_RQ_STORE,
  SYNC_BROADCAST_CHANNEL,
  MAX_OUTBOX_ATTEMPTS,
} from "./constants";
export { createFasoStockQueryPersister } from "./react-query-persister";
export { broadcastOutboxFlushed, subscribeOutboxBroadcast } from "./sync-broadcast";
export {
  OFFLINE_LOG_SOURCE,
  logBroadcastFailure,
  logEnqueueFailure,
  logOutboxCorruptPayload,
  logOutboxHandlerFailure,
  logOutboxStuck,
  logRqPersistFailure,
  logSyncFlushFailure,
} from "./offline-logger";
