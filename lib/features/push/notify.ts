import "server-only";

import {
  listOwnerUserIds,
  PushNotConfiguredError,
  sendPushNotificationToUsers,
  type PushSendResult,
} from "@/lib/features/push/send-web-push";
import type { WebPushPayload } from "@/lib/features/push/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Une notification a deux vies indépendantes : une ligne `notifications` (l'historique
 * consultable dans l'app, qui survit à tout) et un push système (éphémère, qui n'arrive
 * que si l'utilisateur a un appareil abonné). Ce module envoie les deux d'un seul geste.
 */
export type NotifyPayload = WebPushPayload & {
  /** Catégorie stockée dans `notifications.type` (défaut : `app_message`). */
  type?: string | null;
  /** Entreprise rattachée à la notification, si le message est propre à l'une d'elles. */
  companyId?: string | null;
};

export type NotifyResult = {
  /** Lignes d'historique créées. */
  stored: number;
  push: PushSendResult;
  /** Push impossible côté serveur (VAPID absent) — l'historique, lui, est bien écrit. */
  pushConfigured: boolean;
};

const DEFAULT_TYPE = "app_message";

async function storeNotifications(
  userIds: string[],
  payload: NotifyPayload,
): Promise<number> {
  if (userIds.length === 0) return 0;
  const svc = createServiceRoleClient();
  const rows = userIds.map((userId) => ({
    user_id: userId,
    company_id: payload.companyId ?? null,
    type: payload.type?.trim() || DEFAULT_TYPE,
    title: payload.title.trim(),
    body: payload.body?.trim() || null,
  }));
  const { error } = await svc.from("notifications").insert(rows);
  if (error) throw error;
  return rows.length;
}

/**
 * Écrit l'historique **puis** pousse. L'ordre compte : si le push échoue (VAPID absent,
 * appareil injoignable), l'utilisateur retrouve quand même le message dans l'app.
 * Un push non configuré n'est donc pas une erreur ici, juste `pushConfigured: false`.
 */
export async function notifyUsers(
  userIds: string[],
  payload: NotifyPayload,
  options: { persist?: boolean } = {},
): Promise<NotifyResult> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const persist = options.persist !== false;
  const stored = persist ? await storeNotifications(uniqueIds, payload) : 0;

  try {
    const push = await sendPushNotificationToUsers(uniqueIds, payload);
    return { stored, push, pushConfigured: true };
  } catch (e) {
    if (e instanceof PushNotConfiguredError) {
      return {
        stored,
        push: { attempted: 0, failures: 0, removed: 0, errors: [] },
        pushConfigured: false,
      };
    }
    throw e;
  }
}

/** Notifie un utilisateur : historique dans l'app + push sur ses appareils. */
export async function notifyUser(
  userId: string,
  payload: NotifyPayload,
  options: { persist?: boolean } = {},
): Promise<NotifyResult> {
  return notifyUsers([userId], payload, options);
}

/** Notifie tous les propriétaires d'entreprise (message plateforme). */
export async function notifyAllOwners(
  payload: NotifyPayload,
  options: { persist?: boolean } = {},
): Promise<NotifyResult> {
  const ownerIds = await listOwnerUserIds();
  return notifyUsers(ownerIds, payload, options);
}
