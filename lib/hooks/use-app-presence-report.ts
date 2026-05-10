"use client";

import { useAppContext } from "@/lib/features/common/app-context";
import {
  APP_WEB_PRESENCE_CHANNEL,
  type AppWebPresencePayload,
} from "@/lib/realtime/app-presence-channel";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const GEO_MIN_INTERVAL_MS = 20_000;

function buildPayload(p: {
  userId: string;
  email: string | null;
  companyId: string;
  companyName: string;
  path: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  geolocation: AppWebPresencePayload["geolocation"];
}): AppWebPresencePayload {
  return {
    surface: "web",
    user_id: p.userId,
    email: p.email,
    company_id: p.companyId,
    company_name: p.companyName,
    path: p.path,
    lat: p.lat,
    lng: p.lng,
    accuracy_m: p.accuracyM,
    geolocation: p.geolocation,
    ts: Date.now(),
  };
}

async function trackIfReady(
  ch: ReturnType<ReturnType<typeof createClient>["channel"]> | null,
  subscribed: boolean,
  userId: string | null,
  email: string | null,
  companyId: string,
  companyName: string,
  path: string,
  geo: {
    lat: number | null;
    lng: number | null;
    accuracyM: number | null;
    status: AppWebPresencePayload["geolocation"];
  },
) {
  if (!ch || !subscribed || !userId) return;
  try {
    await ch.track(
      buildPayload({
        userId,
        email,
        companyId,
        companyName,
        path,
        lat: geo.lat,
        lng: geo.lng,
        accuracyM: geo.accuracyM,
        geolocation: geo.status,
      }),
    );
  } catch {
    /* Realtime indisponible ou canal fermé — évite du bruit dans la console */
  }
}

/**
 * Inscrit l’utilisateur web (hors super-admin) sur le canal Presence et diffuse
 * page courante + position approximative (si l’utilisateur autorise la géoloc).
 */
export function useAppPresenceReport() {
  const pathname = usePathname() ?? "";
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const { data } = useAppContext();
  /** Tout utilisateur métier web (hors super-admin), même sans `company_id` chargé encore. */
  const enabled = Boolean(data && !data.isSuperAdmin);

  const companyId = data?.companyId?.trim() ?? "";
  const companyName = data?.companyName?.trim() ?? "";

  const geoRef = useRef<{
    lat: number | null;
    lng: number | null;
    accuracyM: number | null;
    status: AppWebPresencePayload["geolocation"];
  }>({ lat: null, lng: null, accuracyM: null, status: "unknown" });

  const lastGeoTrackRef = useRef(0);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const subscribedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const emailRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const supabase = createClient();
    let watchId: number | undefined;

    async function setup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user?.id) return;

      userIdRef.current = user.id;
      emailRef.current = user.email ?? null;

      const channel = supabase.channel(APP_WEB_PRESENCE_CHANNEL, {
        config: { presence: { key: user.id } },
      });
      if (cancelled) {
        void supabase.removeChannel(channel);
        return;
      }
      channelRef.current = channel;

      channel.subscribe(async (status) => {
        if (cancelled || status !== "SUBSCRIBED") {
          subscribedRef.current = status === "SUBSCRIBED";
          return;
        }
        subscribedRef.current = true;
        await trackIfReady(
          channelRef.current,
          true,
          userIdRef.current,
          emailRef.current,
          companyId,
          companyName,
          pathRef.current,
          geoRef.current,
        );
      });

      if (cancelled) return;

      if (typeof navigator !== "undefined" && navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            geoRef.current = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
              status: "ok",
            };
            const now = Date.now();
            if (now - lastGeoTrackRef.current < GEO_MIN_INTERVAL_MS) return;
            lastGeoTrackRef.current = now;
            void trackIfReady(
              channelRef.current,
              subscribedRef.current,
              userIdRef.current,
              emailRef.current,
              companyId,
              companyName,
              pathRef.current,
              geoRef.current,
            );
          },
          (err) => {
            const denied = typeof err?.code === "number" && err.code === err.PERMISSION_DENIED;
            geoRef.current = {
              ...geoRef.current,
              status: denied ? "denied" : "unavailable",
            };
            void trackIfReady(
              channelRef.current,
              subscribedRef.current,
              userIdRef.current,
              emailRef.current,
              companyId,
              companyName,
              pathRef.current,
              geoRef.current,
            );
          },
          { enableHighAccuracy: false, maximumAge: 30_000, timeout: 12_000 },
        );
      } else {
        geoRef.current = { ...geoRef.current, status: "unavailable" };
      }
    }

    void setup();

    const heartbeat = window.setInterval(() => {
      void trackIfReady(
        channelRef.current,
        subscribedRef.current,
        userIdRef.current,
        emailRef.current,
        companyId,
        companyName,
        pathRef.current,
        geoRef.current,
      );
    }, 45_000);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void trackIfReady(
        channelRef.current,
        subscribedRef.current,
        userIdRef.current,
        emailRef.current,
        companyId,
        companyName,
        pathRef.current,
        geoRef.current,
      );
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      subscribedRef.current = false;
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisible);
      if (watchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      const ch = channelRef.current;
      channelRef.current = null;
      userIdRef.current = null;
      emailRef.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [enabled, companyId, companyName]);

  useEffect(() => {
    if (!enabled) return;
    void trackIfReady(
      channelRef.current,
      subscribedRef.current,
      userIdRef.current,
      emailRef.current,
      companyId,
      companyName,
      pathRef.current,
      geoRef.current,
    );
  }, [pathname, enabled, companyId, companyName]);
}
