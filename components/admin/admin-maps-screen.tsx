"use client";

import {
  APP_WEB_PRESENCE_CHANNEL,
  flattenAppWebPresence,
  type AppWebPresencePayload,
} from "@/lib/realtime/app-presence-channel";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MdMap, MdMyLocation } from "react-icons/md";

const ACCENT = "#EA580C";

const LiveUsersMap = dynamic(() => import("@/components/admin/maps/live-users-map"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[min(82dvh,800px)] items-center justify-center rounded-[1.25rem] bg-slate-200/40">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-t-transparent"
        style={{ borderColor: `${ACCENT}`, borderTopColor: "transparent" }}
        aria-hidden
      />
    </div>
  ),
});

function formatAgo(ts: number): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function geoDotClass(g: AppWebPresencePayload["geolocation"]): string {
  if (g === "ok") return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]";
  if (g === "denied") return "bg-amber-400";
  return "bg-slate-300";
}

function initialsFromEmail(email: string | null, fallback: string): string {
  const s = (email ?? fallback).trim();
  if (!s) return "?";
  const part = s.includes("@") ? s.split("@")[0]! : s;
  const letters = part.replace(/[^a-zA-ZÀ-ÿ]/g, "").slice(0, 2);
  return (letters || part.slice(0, 2)).toUpperCase() || "?";
}

export function AdminMapsScreen() {
  const [users, setUsers] = useState<AppWebPresencePayload[]>([]);

  const refresh = useCallback((raw: Record<string, unknown>) => {
    const flat = flattenAppWebPresence(raw);
    const byUser = new Map<string, AppWebPresencePayload>();
    for (const u of flat) {
      const prev = byUser.get(u.user_id);
      if (!prev || u.ts >= prev.ts) byUser.set(u.user_id, u);
    }
    setUsers([...byUser.values()]);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(APP_WEB_PRESENCE_CHANNEL);

    const pull = () => {
      refresh(channel.presenceState() as Record<string, unknown>);
    };

    channel
      .on("presence", { event: "sync" }, pull)
      .on("presence", { event: "join" }, pull)
      .on("presence", { event: "leave" }, pull)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") pull();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const sorted = useMemo(
    () => [...users].sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    [users],
  );

  const onMap = users.filter((u) => u.lat != null && u.lng != null).length;

  return (
    <div className="min-h-dvh bg-linear-to-br from-slate-50 via-white to-slate-100/90 px-3 py-5 sm:px-5 sm:py-6 md:px-7 md:py-7">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-md shadow-orange-500/15 ring-1 ring-white/80"
              style={{ background: `linear-gradient(145deg, ${ACCENT}22, ${ACCENT}08)` }}
            >
              <MdMap className="h-6 w-6" style={{ color: ACCENT }} aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">Maps</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Live
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {sorted.length} · {onMap} carte
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(260px,300px)_1fr] lg:items-start lg:gap-5">
          <aside className="order-2 flex max-h-[min(42vh,420px)] flex-col overflow-hidden rounded-[1.25rem] border border-slate-200/60 bg-white/70 shadow-[0_8px_30px_rgb(15,23,42,0.06)] backdrop-blur-md lg:order-1 lg:max-h-none lg:h-[min(82dvh,820px)]">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3.5">
              <span className="text-[13px] font-bold text-slate-800">Sessions</span>
              <span
                className="rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums text-white"
                style={{ backgroundColor: ACCENT }}
              >
                {sorted.length}
              </span>
            </div>
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-3">
              {sorted.length === 0 ? (
                <li className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                  <div className="rounded-full bg-slate-100 p-3 text-slate-400">
                    <MdMyLocation className="h-6 w-6" aria-hidden />
                  </div>
                  <p className="text-sm font-medium text-slate-500">Aucune session</p>
                  <p className="max-w-[240px] text-[11px] leading-snug text-slate-400">
                    Super-admin non compté · ouvrez <span className="font-mono text-slate-500">/dashboard</span> avec un compte métier.
                  </p>
                </li>
              ) : (
                sorted.map((u) => (
                  <li
                    key={u.user_id}
                    className="group rounded-xl border border-transparent bg-slate-50/80 px-2.5 py-2 transition-colors hover:border-slate-200/80 hover:bg-white"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white shadow-sm"
                        style={{ background: `linear-gradient(145deg, ${ACCENT}, #c2410c)` }}
                      >
                        {initialsFromEmail(u.email, u.user_id)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-900">
                          {u.email ?? u.user_id.slice(0, 8)}
                        </p>
                        {u.company_name ? (
                          <p className="truncate text-[11px] text-slate-500">{u.company_name}</p>
                        ) : null}
                        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                          {u.path || "/"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className="text-[10px] font-semibold tabular-nums text-slate-400"
                          title="Dernière activité"
                        >
                          {formatAgo(u.ts)}
                        </span>
                        <span
                          className={`h-2 w-2 rounded-full ${geoDotClass(u.geolocation)}`}
                          title={u.geolocation}
                        />
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </aside>

          <div className="order-1 min-h-0 lg:order-2">
            <LiveUsersMap users={sorted} />
          </div>
        </div>
      </div>
    </div>
  );
}
