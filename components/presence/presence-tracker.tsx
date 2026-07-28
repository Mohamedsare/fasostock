"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAppContext } from "@/lib/features/common/app-context";
import { activityLabelFromPathname } from "@/lib/features/presence/activity-label";

/** Rythme du battement de cœur. La fenêtre « en ligne » côté serveur est de 90 s. */
const HEARTBEAT_MS = 25_000;
const SESSION_KEY = "fs_presence_session_id";

/** Un identifiant par onglet : deux onglets du même compte = deux sessions distinctes. */
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function deviceKind(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * Signale au serveur que cette session est active, et sur quel écran (page Live du super admin).
 * Ne rend rien, n'affiche rien, et n'échoue jamais bruyamment : une panne de suivi de présence
 * ne doit avoir aucune conséquence sur le travail de l'utilisateur.
 *
 * L'IP et la ville ne sont **pas** envoyées d'ici : le serveur les lit dans les en-têtes.
 */
export function PresenceTracker() {
  const pathname = usePathname() ?? "/";
  const { data } = useAppContext();
  const isAuthed = data != null;
  const companyId = data?.companyId || null;
  const storeId = data?.storeId || null;

  /** Évite de recréer l'intervalle à chaque changement de page. */
  const payloadRef = useRef({ pathname, companyId, storeId });
  useEffect(() => {
    payloadRef.current = { pathname, companyId, storeId };
  }, [pathname, companyId, storeId]);

  useEffect(() => {
    if (!isAuthed) return;

    const sid = sessionId();
    const device = deviceKind();
    let stopped = false;

    const send = (leaving: boolean) => {
      const { pathname: p, companyId: c, storeId: s } = payloadRef.current;
      const body = JSON.stringify({
        sessionId: sid,
        pathname: p,
        activity: activityLabelFromPathname(p),
        companyId: c,
        storeId: s,
        deviceKind: device,
        leaving,
      });

      // À la fermeture de l'onglet, seul `sendBeacon` a le temps de partir.
      if (leaving && typeof navigator !== "undefined" && navigator.sendBeacon) {
        try {
          navigator.sendBeacon(
            "/api/presence/heartbeat",
            new Blob([body], { type: "application/json" }),
          );
          return;
        } catch {
          /* on retombe sur fetch */
        }
      }

      void fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: leaving,
      }).catch(() => {
        /* le suivi de présence n'est jamais bloquant */
      });
    };

    send(false);
    const timer = setInterval(() => {
      // Onglet en arrière-plan = la personne n'utilise pas l'app : on ne la compte plus.
      if (document.visibilityState === "visible" && !stopped) send(false);
    }, HEARTBEAT_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") send(false);
      else send(true);
    };
    const onPageHide = () => {
      stopped = true;
      send(true);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [isAuthed]);

  /** Changement d'écran : signalé immédiatement, sans attendre le battement suivant. */
  useEffect(() => {
    if (!isAuthed) return;
    const sid = sessionId();
    void fetch("/api/presence/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sid,
        pathname,
        activity: activityLabelFromPathname(pathname),
        companyId,
        storeId,
        deviceKind: deviceKind(),
      }),
    }).catch(() => {
      /* jamais bloquant */
    });
  }, [pathname, companyId, storeId, isAuthed]);

  return null;
}
