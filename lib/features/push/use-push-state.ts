"use client";

import { useCallback, useEffect, useState } from "react";

import {
  currentNotificationPermission,
  getCurrentPushSubscription,
  isWebPushSupported,
  subscribeCurrentUserToWebPush,
  unsubscribeCurrentUserFromWebPush,
} from "@/lib/features/push/subscribe-client";
import { isWebPushConfigured } from "@/lib/features/push/public-key";
import { createClient } from "@/lib/supabase/client";
import { messageFromUnknownError } from "@/lib/toast";

/**
 * Ce que l'utilisateur doit comprendre d'un coup d'œil :
 * - `unsupported` / `unconfigured` : rien à faire ici, le bouton n'a pas de sens ;
 * - `denied` : le navigateur a le dernier mot, seul lui peut revenir en arrière ;
 * - `idle` : jamais configuré → c'est là qu'on propose « Activer » ;
 * - `granted-elsewhere` : permission accordée mais pas d'abonnement en base
 *   (autre appareil, cache vidé, base restaurée) → réactiver, sans redemander la permission ;
 * - `subscribed` : cet appareil recevra les notifications.
 */
export type PushStatus =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "idle"
  | "granted-elsewhere"
  | "subscribed";

/**
 * Le message d'erreur est **renvoyé** en plus d'être stocké : l'appelant qui veut
 * l'afficher en toast le lit tout de suite, sans dépendre d'un `state` que son
 * `onClick` ne verra qu'au rendu suivant.
 */
export type PushActionResult = { ok: boolean; error: string | null };

export type PushState = {
  status: PushStatus;
  /** Nombre d'appareils abonnés pour cet utilisateur (tous navigateurs / téléphones). */
  deviceCount: number;
  error: string | null;
  busy: boolean;
  enable: () => Promise<PushActionResult>;
  disable: () => Promise<PushActionResult>;
  refresh: () => Promise<void>;
};

const MIGRATION_HINT =
  "Table push_subscriptions absente ou non à jour : appliquez la migration Supabase 00091_web_push_subscriptions.sql puis rechargez la page.";

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return error.code === "42P01" || msg.includes("schema cache") || msg.includes("push_subscriptions");
}

export function usePushState(): PushState {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [deviceCount, setDeviceCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isWebPushConfigured()) {
      setStatus("unconfigured");
      return;
    }
    if (!isWebPushSupported()) {
      setStatus("unsupported");
      return;
    }
    const perm = currentNotificationPermission();
    if (perm === "denied") {
      setStatus("denied");
      return;
    }
    if (perm !== "granted") {
      setStatus("idle");
      setDeviceCount(0);
      return;
    }
    try {
      const sub = await getCurrentPushSubscription();
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setStatus("granted-elsewhere");
        setDeviceCount(0);
        return;
      }
      const { data, error: dbErr } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint")
        .eq("user_id", user.id);
      if (dbErr) {
        setError(isMissingTableError(dbErr) ? MIGRATION_HINT : dbErr.message);
        setStatus("granted-elsewhere");
        return;
      }
      const rows = data ?? [];
      setDeviceCount(rows.length);
      const thisDevice = sub ? rows.some((r) => (r as { endpoint: string }).endpoint === sub.endpoint) : false;
      setStatus(thisDevice ? "subscribed" : "granted-elsewhere");
    } catch (e) {
      setError(messageFromUnknownError(e));
      setStatus("granted-elsewhere");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async (): Promise<PushActionResult> => {
    setBusy(true);
    setError(null);
    try {
      await subscribeCurrentUserToWebPush();
      await refresh();
      return { ok: true, error: null };
    } catch (e) {
      const msg = messageFromUnknownError(e);
      setError(msg);
      await refresh();
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disable = useCallback(async (): Promise<PushActionResult> => {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeCurrentUserFromWebPush();
      await refresh();
      return { ok: true, error: null };
    } catch (e) {
      const msg = messageFromUnknownError(e);
      setError(msg);
      await refresh();
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { status, deviceCount, error, busy, enable, disable, refresh };
}
