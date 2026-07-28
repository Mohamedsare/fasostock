"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { activityLabelFromPathname } from "@/lib/features/presence/activity-label";

/** Rythme du battement de cœur. La fenêtre « en ligne » côté serveur est de 90 s. */
const HEARTBEAT_MS = 25_000;
/** Onglet courant : identifie la session. */
const SESSION_KEY = "fs_presence_session_id";
/** Navigateur : survit à la fermeture, distingue un visiteur qui revient d'un nouveau venu. */
const VISITOR_KEY = "fs_visitor_id";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Repli (contextes non sécurisés) : format UUID v4 attendu par la route.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (Math.floor(Math.random() * 256) & (15 >> (n / 4)))).toString(16);
  });
}

/** Identifiant stocké, régénéré s'il manque. Sans stockage disponible, la visite reste comptée. */
function readOrCreateId(storage: "session" | "local", key: string): string {
  try {
    const store = storage === "session" ? sessionStorage : localStorage;
    const existing = store.getItem(key);
    if (existing) return existing;
    const created = uuid();
    store.setItem(key, created);
    return created;
  } catch {
    return uuid();
  }
}

function readStored(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return v && v !== "__all__" ? v : null;
  } catch {
    return null;
  }
}

function deviceKind(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
}

/** Référent externe uniquement : une navigation interne n'est pas une source de trafic. */
function externalReferrer(): string | null {
  if (typeof document === "undefined") return null;
  const ref = document.referrer?.trim();
  if (!ref) return null;
  try {
    if (new URL(ref).host === window.location.host) return null;
  } catch {
    return null;
  }
  return ref.slice(0, 300);
}

/**
 * Signale au serveur que cette session est active, et sur quel écran (page Live du super admin).
 * Monté dans le layout racine : il suit **aussi les visiteurs anonymes** du site vitrine, qui
 * sont précisément les prospects à rappeler.
 *
 * Ne rend rien, n'affiche rien, et n'échoue jamais bruyamment : une panne de suivi de présence
 * ne doit avoir aucune conséquence sur le travail de l'utilisateur.
 *
 * L'IP et la ville ne sont **pas** envoyées d'ici : le serveur les lit dans les en-têtes.
 */
export function PresenceTracker() {
  const pathname = usePathname() ?? "/";

  /** Évite de recréer l'intervalle à chaque changement de page. */
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const sid = readOrCreateId("session", SESSION_KEY);
    const vid = readOrCreateId("local", VISITOR_KEY);
    const device = deviceKind();
    const referrer = externalReferrer();
    let stopped = false;

    const payload = (leaving: boolean) => {
      const p = pathRef.current;
      return JSON.stringify({
        sessionId: sid,
        visitorId: vid,
        referrer,
        pathname: p,
        activity: activityLabelFromPathname(p),
        // Lues au moment de l'envoi : elles changent quand l'utilisateur bascule de boutique.
        companyId: readStored("fs_active_company_id"),
        storeId: readStored("fs_active_store_id"),
        deviceKind: device,
        leaving,
      });
    };

    const send = (leaving: boolean) => {
      const body = payload(leaving);

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

    // Le premier envoi est fait par l'effet « changement d'écran » ci-dessous, qui part au montage.
    const timer = setInterval(() => {
      // Onglet en arrière-plan = la personne n'utilise pas l'app : on ne la compte plus.
      if (document.visibilityState === "visible" && !stopped) send(false);
    }, HEARTBEAT_MS);

    const onVisibility = () => send(document.visibilityState !== "visible");
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
  }, []);

  /** Changement d'écran : signalé immédiatement, sans attendre le battement suivant. */
  useEffect(() => {
    void fetch("/api/presence/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: readOrCreateId("session", SESSION_KEY),
        visitorId: readOrCreateId("local", VISITOR_KEY),
        referrer: externalReferrer(),
        pathname,
        activity: activityLabelFromPathname(pathname),
        companyId: readStored("fs_active_company_id"),
        storeId: readStored("fs_active_store_id"),
        deviceKind: deviceKind(),
      }),
    }).catch(() => {
      /* jamais bloquant */
    });
  }, [pathname]);

  return null;
}
