import { SYNC_BROADCAST_CHANNEL } from "./constants";
import { logBroadcastFailure } from "./offline-logger";

type SyncMessage = { type: "outbox-flushed"; ts: number };

/**
 * Notifie les autres onglets qu’une sync outbox a eu lieu (invalidation cache RQ).
 */
export function broadcastOutboxFlushed(): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(SYNC_BROADCAST_CHANNEL);
    const msg: SyncMessage = { type: "outbox-flushed", ts: Date.now() };
    ch.postMessage(msg);
    ch.close();
  } catch (e) {
    logBroadcastFailure(e);
  }
}

/**
 * Écoute les syncs depuis d’autres onglets.
 */
export function subscribeOutboxBroadcast(onFlush: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  try {
    const ch = new BroadcastChannel(SYNC_BROADCAST_CHANNEL);
    ch.onmessage = (ev: MessageEvent<SyncMessage>) => {
      try {
        if (ev.data?.type === "outbox-flushed") onFlush();
      } catch (e) {
        logBroadcastFailure(e);
      }
    };
    return () => {
      try {
        ch.close();
      } catch (e) {
        logBroadcastFailure(e);
      }
    };
  } catch (e) {
    logBroadcastFailure(e);
    return () => {};
  }
}
