"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  MdComputer,
  MdLocationCity,
  MdPhoneIphone,
  MdRefresh,
  MdTabletMac,
} from "react-icons/md";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminListLivePresence,
  adminListPresenceCities,
  type LivePresenceSession,
} from "@/lib/features/admin/live-api";

/** Rythme de rafraîchissement : le battement client est de 25 s, inutile d'aller plus vite. */
const REFRESH_MS = 5_000;

function relativeFr(seconds: number): string {
  if (seconds < 10) return "à l'instant";
  if (seconds < 60) return `il y a ${Math.round(seconds)} s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

function DeviceIcon({ kind }: { kind: string | null }) {
  const cls = "h-4 w-4 shrink-0 text-slate-400";
  if (kind === "mobile") return <MdPhoneIphone className={cls} aria-label="Mobile" />;
  if (kind === "tablet") return <MdTabletMac className={cls} aria-label="Tablette" />;
  return <MdComputer className={cls} aria-label="Ordinateur" />;
}

function Kpi({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 text-3xl font-bold tabular-nums ${accent ? "text-emerald-600" : "text-slate-900"}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </AdminCard>
  );
}

/** Pastille verte animée : signale d'un coup d'œil que la page est bien « vivante ». */
function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

function SessionRow({ s }: { s: LivePresenceSession }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2">
          {s.isOnline ? <LiveDot /> : <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{s.fullName}</p>
            <p className="truncate text-xs text-slate-500">{s.email}</p>
          </div>
        </div>
      </td>
      <td className="py-2.5 pr-3">
        <p className="truncate text-sm text-slate-800">{s.companyName ?? "—"}</p>
        {s.storeName ? <p className="truncate text-xs text-slate-500">{s.storeName}</p> : null}
      </td>
      <td className="py-2.5 pr-3">
        <p className="truncate text-sm font-medium text-slate-800">{s.activity ?? "—"}</p>
        <p className="truncate font-mono text-[11px] text-slate-400">{s.pathname ?? ""}</p>
      </td>
      <td className="py-2.5 pr-3">
        <p className="truncate text-sm text-slate-800">
          {s.city ?? "Inconnue"}
          {s.country ? <span className="text-slate-400"> · {s.country}</span> : null}
        </p>
        <p className="truncate font-mono text-[11px] text-slate-400">{s.ip ?? "—"}</p>
      </td>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-1.5">
          <DeviceIcon kind={s.deviceKind} />
          <span className="text-xs text-slate-500">{s.pageViews} vues</span>
        </div>
      </td>
      <td className="whitespace-nowrap py-2.5 text-right text-xs text-slate-500">
        {relativeFr(s.secondsSinceSeen)}
      </td>
    </tr>
  );
}

export function AdminLiveScreen() {
  const [onlineOnly, setOnlineOnly] = useState(true);
  const [cityDays, setCityDays] = useState(30);

  const sessionsQ = useQuery({
    queryKey: ["admin-live-presence"] as const,
    queryFn: () => adminListLivePresence({ windowSeconds: 90, limit: 500 }),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  const citiesQ = useQuery({
    queryKey: ["admin-presence-cities", cityDays] as const,
    queryFn: () => adminListPresenceCities(cityDays),
    refetchInterval: 60_000,
  });

  const sessions = useMemo(() => sessionsQ.data ?? [], [sessionsQ.data]);
  const online = useMemo(() => sessions.filter((s) => s.isOnline), [sessions]);
  const visible = onlineOnly ? online : sessions;

  const stats = useMemo(() => {
    const users = new Set(online.map((s) => s.userId));
    const companies = new Set(online.map((s) => s.companyId).filter(Boolean));
    const cities = new Set(online.map((s) => s.city).filter(Boolean));
    const users24 = new Set(sessions.map((s) => s.userId));
    return {
      users: users.size,
      companies: companies.size,
      cities: cities.size,
      users24: users24.size,
    };
  }, [online, sessions]);

  /** Ce qui occupe les gens en ce moment — utile pour savoir quels modules « portent ». */
  const activities = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of online) {
      const key = s.activity ?? "Inconnu";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [online]);

  const cities = citiesQ.data ?? [];
  const maxCityUsers = cities.length > 0 ? Math.max(...cities.map((c) => c.usersCount)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader
          title="Live"
          description="Qui utilise FasoStock en ce moment : activité, ville et appareil. Actualisé toutes les 5 secondes."
        />
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            <LiveDot />
            En direct
          </span>
          <button
            type="button"
            onClick={() => void sessionsQ.refetch()}
            disabled={sessionsQ.isFetching}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-60"
          >
            <MdRefresh
              className={`h-4 w-4 ${sessionsQ.isFetching ? "animate-spin" : ""}`}
              aria-hidden
            />
            Actualiser
          </button>
        </div>
      </div>

      {sessionsQ.isError ? (
        <AdminCard className="border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">
            Impossible de charger les sessions.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {sessionsQ.error instanceof Error
              ? sessionsQ.error.message
              : "Erreur inconnue. Vérifiez que la migration 00159 est appliquée."}
          </p>
        </AdminCard>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="En ligne maintenant"
          value={stats.users}
          hint={`${online.length} session${online.length > 1 ? "s" : ""} ouverte${online.length > 1 ? "s" : ""}`}
          accent
        />
        <Kpi label="Entreprises actives" value={stats.companies} hint="distinctes, en ce moment" />
        <Kpi label="Villes actives" value={stats.cities} hint="d'où viennent les connexions" />
        <Kpi label="Utilisateurs (24 h)" value={stats.users24} hint="au moins une session" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <AdminCard padding="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <h2 className="text-base font-bold text-slate-900">
              {onlineOnly ? "Sessions en cours" : "Sessions des 24 dernières heures"}
            </h2>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
              <button
                type="button"
                onClick={() => setOnlineOnly(true)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${onlineOnly ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                En ligne ({online.length})
              </button>
              <button
                type="button"
                onClick={() => setOnlineOnly(false)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${!onlineOnly ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                24 h ({sessions.length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-215 px-4 text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-semibold">Personne</th>
                  <th className="py-2 font-semibold">Entreprise</th>
                  <th className="py-2 font-semibold">Fait quoi</th>
                  <th className="py-2 font-semibold">Ville / IP</th>
                  <th className="py-2 font-semibold">Appareil</th>
                  <th className="py-2 text-right font-semibold">Vu</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td:first-child]:pl-4 [&>tr>td:last-child]:pr-4">
                {visible.map((s) => (
                  <SessionRow key={s.id} s={s} />
                ))}
              </tbody>
            </table>
          </div>

          {visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">
              {sessionsQ.isLoading
                ? "Chargement…"
                : onlineOnly
                  ? "Personne n’est connecté à cet instant."
                  : "Aucune session sur les 24 dernières heures."}
            </p>
          ) : null}
        </AdminCard>

        <div className="space-y-4">
          <AdminCard>
            <h2 className="text-base font-bold text-slate-900">Activité en cours</h2>
            <p className="mt-0.5 text-xs text-slate-500">Ce que les gens font à cet instant.</p>
            <ul className="mt-3 space-y-2">
              {activities.length === 0 ? (
                <li className="text-sm text-slate-500">—</li>
              ) : (
                activities.map(([label, count]) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-slate-700">{label}</span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700">
                      {count}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </AdminCard>

          <AdminCard>
            <div className="flex items-center justify-between gap-3">
              <h2 className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
                <MdLocationCity className="h-5 w-5 text-slate-400" aria-hidden />
                Villes
              </h2>
              <select
                value={cityDays}
                onChange={(e) => setCityDays(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                aria-label="Période"
              >
                <option value={7}>7 jours</option>
                <option value={30}>30 jours</option>
                <option value={90}>90 jours</option>
              </select>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Où l’app est réellement utilisée — à croiser avec votre prospection.
            </p>
            <ul className="mt-3 space-y-3">
              {cities.length === 0 ? (
                <li className="text-sm text-slate-500">
                  {citiesQ.isLoading ? "Chargement…" : "Pas encore de données."}
                </li>
              ) : (
                cities.slice(0, 12).map((c) => (
                  <li key={`${c.city}-${c.country ?? ""}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-800">
                        {c.city}
                        {c.country ? (
                          <span className="text-slate-400"> · {c.country}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">
                        {c.usersCount} pers. · {c.companiesCount} ent.
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{
                          width: `${Math.max(4, Math.round((c.usersCount / maxCityUsers) * 100))}%`,
                        }}
                      />
                    </div>
                  </li>
                ))
              )}
            </ul>
          </AdminCard>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Les adresses IP sont des données personnelles : elles restent dans cet espace et servent
        uniquement au support et à la compréhension de l&apos;usage. La géolocalisation est celle du
        réseau (approximative, parfois celle de l&apos;opérateur).
      </p>
    </div>
  );
}
