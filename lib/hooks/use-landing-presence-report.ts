"use client";

import { hasSupabaseConfig } from "@/lib/env";
import {
  APP_WEB_PRESENCE_CHANNEL,
  getOrCreateLandingVisitorId,
  type AppWebPresencePayload,
} from "@/lib/realtime/app-presence-channel";
import { shouldReportLandingPresence } from "@/lib/realtime/landing-presence-paths";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const GEO_MIN_INTERVAL_MS = 20_000;

function buildLandingPayload(p: {
  presenceUserId: string;
  email: string | null;
  path: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  geolocation: AppWebPresencePayload["geolocation"];
}): AppWebPresencePayload {
  return {
    surface: "landing",
    user_id: p.presenceUserId,
    email: p.email,
    company_id: "",
    company_name: "",
    path: p.path,
    lat: p.lat,
    lng: p.lng,
    accuracy_m: p.accuracyM,
    geolocation: p.geolocation,
    ts: Date.now(),
  };
}

async function trackLanding(
  ch: ReturnType<ReturnType<typeof createClient>["channel"]> | null,
  subscribed: boolean,
  payload: AppWebPresencePayload | null,
) {
  if (!ch || !subscribed || !payload?.user_id) return;
  try {
    await ch.track(payload);
  } catch {
    /* ignore */
  }
}

/**
 * Présence pour visiteurs sur pages publiques (accueil, login, légal, …).
 * Clé Realtime : `user.id` si session, sinon UUID stocké en localStorage.
 */
export function useLandingPresenceReport() {
  const pathname = usePathname() ?? "";
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const active = hasSupabaseConfig() && shouldReportLandingPresence(pathname);

  const geoRef = useRef<{
    lat: number | null;
    lng: number | null;
    accuracyM: number | null;
    status: AppWebPresencePayload["geolocation"];
  }>({ lat: null, lng: null, accuracyM: null, status: "unknown" });

  const lastGeoTrackRef = useRef(0);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const subscribedRef = useRef(false);
  const presenceKeyRef = useRef<string | null>(null);
  const emailRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let watchId: number | undefined;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    async function setup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      const visitorId = getOrCreateLandingVisitorId();
      const presenceKey = user?.id ?? visitorId;
      presenceKeyRef.current = presenceKey;
      emailRef.current = user?.email ?? null;

      const channel = supabase.channel(APP_WEB_PRESENCE_CHANNEL, {
        config: { presence: { key: presenceKey } },
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
        await trackLanding(
          channelRef.current,
          true,
          buildLandingPayload({
            presenceUserId: presenceKey,
            email: emailRef.current,
            path: pathRef.current,
            lat: geoRef.current.lat,
            lng: geoRef.current.lng,
            accuracyM: geoRef.current.accuracyM,
            geolocation: geoRef.current.status,
          }),
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
            void trackLanding(
              channelRef.current,
              subscribedRef.current,
              buildLandingPayload({
                presenceUserId: presenceKeyRef.current ?? presenceKey,
                email: emailRef.current,
                path: pathRef.current,
                lat: geoRef.current.lat,
                lng: geoRef.current.lng,
                accuracyM: geoRef.current.accuracyM,
                geolocation: geoRef.current.status,
              }),
            );
          },
          (err) => {
            const denied = typeof err?.code === "number" && err.code === err.PERMISSION_DENIED;
            geoRef.current = {
              ...geoRef.current,
              status: denied ? "denied" : "unavailable",
            };
            void trackLanding(
              channelRef.current,
              subscribedRef.current,
              buildLandingPayload({
                presenceUserId: presenceKeyRef.current ?? presenceKey,
                email: emailRef.current,
                path: pathRef.current,
                lat: geoRef.current.lat,
                lng: geoRef.current.lng,
                accuracyM: geoRef.current.accuracyM,
                geolocation: geoRef.current.status,
              }),
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
      void trackLanding(
        channelRef.current,
        subscribedRef.current,
        buildLandingPayload({
          presenceUserId: presenceKeyRef.current ?? "",
          email: emailRef.current,
          path: pathRef.current,
          lat: geoRef.current.lat,
          lng: geoRef.current.lng,
          accuracyM: geoRef.current.accuracyM,
          geolocation: geoRef.current.status,
        }),
      );
    }, 45_000);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void trackLanding(
        channelRef.current,
        subscribedRef.current,
        buildLandingPayload({
          presenceUserId: presenceKeyRef.current ?? "",
          email: emailRef.current,
          path: pathRef.current,
          lat: geoRef.current.lat,
          lng: geoRef.current.lng,
          accuracyM: geoRef.current.accuracyM,
          geolocation: geoRef.current.status,
        }),
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
      presenceKeyRef.current = null;
      emailRef.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    void trackLanding(
      channelRef.current,
      subscribedRef.current,
      buildLandingPayload({
        presenceUserId: presenceKeyRef.current ?? "",
        email: emailRef.current,
        path: pathRef.current,
        lat: geoRef.current.lat,
        lng: geoRef.current.lng,
        accuracyM: geoRef.current.accuracyM,
        geolocation: geoRef.current.status,
      }),
    );
  }, [pathname, active]);
}
