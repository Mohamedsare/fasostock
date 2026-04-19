"use client";

import { FsCard } from "@/components/ui/fs-screen-primitives";
import {
  isWebPushConfigured,
  subscribeCurrentUserToWebPush,
  unsubscribeCurrentUserFromWebPush,
} from "@/lib/features/push/subscribe-client";
import { createClient } from "@/lib/supabase/client";
import { messageFromUnknownError, toastError, toastSuccess } from "@/lib/toast";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { MdNotificationsActive } from "react-icons/md";

function SettingsCardTitle({
  icon: Icon,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-[22px] w-[22px] shrink-0 text-fs-accent" aria-hidden />
      <p className="text-base font-semibold text-fs-text">{title}</p>
    </div>
  );
}

/**
 * Carte Paramètres : activer les notifications navigateur (Web Push + SW).
 * Visible seulement si `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` est défini au build.
 */
export function PushNotificationsSettingsCard() {
  const [ready, setReady] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okHint, setOkHint] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<{ subscribed: boolean; errorMessage?: string }> => {
    if (!isWebPushConfigured() || typeof window === "undefined" || !("serviceWorker" in navigator)) {
      setReady(true);
      setSubscribed(false);
      setPerm("unsupported");
      return { subscribed: false };
    }
    setPerm(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        reg = await navigator.serviceWorker.ready;
      }
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setSubscribed(false);
        return { subscribed: false };
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSubscribed(false);
        return { subscribed: false };
      }
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("endpoint", sub.endpoint)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        setSubscribed(false);
        const hint =
          error.message.includes("push_subscriptions") ||
          error.code === "42P01" ||
          error.message.toLowerCase().includes("schema cache")
            ? "Table push_subscriptions absente ou non à jour : appliquez la migration Supabase 00091_web_push_subscriptions.sql puis rechargez la page."
            : error.message;
        setErr(hint);
        return { subscribed: false, errorMessage: hint };
      }
      const active = Boolean(data);
      setSubscribed(active);
      return { subscribed: active };
    } catch (e) {
      setSubscribed(false);
      const msg = messageFromUnknownError(e);
      setErr(msg);
      return { subscribed: false, errorMessage: msg };
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isWebPushConfigured()) {
    return null;
  }

  return (
    <FsCard className="mt-5" padding="p-5">
      <SettingsCardTitle icon={MdNotificationsActive} title="Notifications sur cet appareil" />
      <p className="mt-4 text-sm text-neutral-600">
        Recevoir une alerte navigateur lorsque vous avez un message dans la section Notifications (ex.
        messages administrateur).
      </p>
      {!ready ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          Chargement…
        </div>
      ) : perm === "denied" ? (
        <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
          Les notifications sont bloquées pour ce site dans les paramètres du navigateur. Réactivez-les
          pour FasoStock puis revenez ici.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {subscribed ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setErr(null);
                setOkHint(null);
                setBusy(true);
                try {
                  await unsubscribeCurrentUserFromWebPush();
                  await refresh();
                  setOkHint(null);
                  toastSuccess("Notifications navigateur désactivées sur cet appareil.");
                } catch (e) {
                  const m = messageFromUnknownError(e);
                  setErr(m);
                  toastError(m);
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex min-h-[40px] min-w-[200px] items-center justify-center gap-2 rounded-[10px] border border-black/10 bg-fs-card px-4 text-sm font-semibold text-neutral-800 shadow-sm disabled:opacity-60"
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
                  Patientez…
                </>
              ) : (
                "Désactiver sur cet appareil"
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || perm === "unsupported"}
              onClick={async () => {
                setErr(null);
                setOkHint(null);
                setBusy(true);
                try {
                  await subscribeCurrentUserToWebPush();
                  const { subscribed: active, errorMessage: refreshErr } = await refresh();
                  if (active) {
                    const hint =
                      "Vous recevrez une alerte système quand un message arrive dans Notifications (ex. admin).";
                    setOkHint(hint);
                    toastSuccess("Notifications activées sur ce navigateur.");
                  } else if (refreshErr) {
                    toastError(refreshErr);
                  } else {
                    const m =
                      "L’abonnement navigateur n’a pas été retrouvé en base après activation. Vérifiez la migration et les droits RLS sur push_subscriptions.";
                    setErr(m);
                    toastError(m);
                  }
                } catch (e) {
                  const m = messageFromUnknownError(e);
                  setErr(m);
                  toastError(m);
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex min-h-[40px] min-w-[160px] items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Activation…
                </>
              ) : (
                "Activer"
              )}
            </button>
          )}
        </div>
      )}
      {okHint ? (
        <p className="mt-3 rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2.5 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
          {okHint}
        </p>
      ) : null}
      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
    </FsCard>
  );
}
