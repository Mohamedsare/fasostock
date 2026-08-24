"use client";

import {
  ActivityFeed,
  AdoptionTable,
  AiInsightsCard,
  AlertCard,
  ChurnRiskTable,
  HealthScoreCard,
  KpiCard,
  RevenueCard,
  TopCompaniesCard,
} from "@/components/admin/dashboard-cockpit-components";
import { AdminCard } from "@/components/admin/admin-page-header";
import { adminGetCockpitData } from "@/lib/features/admin/api";
import { formatCurrency } from "@/lib/utils/currency";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfMonth, endOfYear, format, startOfMonth, startOfYear, subDays } from "date-fns";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  MdAddBusiness,
  MdCampaign,
  MdBusiness,
  MdCardMembership,
  MdCheckCircle,
  MdCloudSync,
  MdDownload,
  MdErrorOutline,
  MdFilterList,
  MdGroups,
  MdInsights,
  MdInventory2,
  MdMap,
  MdPeople,
  MdSchedule,
  MdSupportAgent,
  MdShoppingCart,
  MdStore,
  MdTimer,
  MdTrendingUp,
  MdUpdate,
} from "react-icons/md";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatOperationDateTime } from "@/lib/utils/operation-datetime";

type RangePreset = "today" | "7d" | "30d" | "month" | "year" | "custom";

function DashboardSection({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <header className="border-b border-slate-200/90 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-600/90">{kicker}</p>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 md:text-2xl">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function AdminDashboardScreen() {
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");
  const [selectedSubStatus, setSelectedSubStatus] = useState<string>("all");
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const q = useQuery({
    queryKey: ["admin-dashboard-cockpit-v3"] as const,
    queryFn: adminGetCockpitData,
  });

  const data = q.data;
  const companies = data?.companies ?? [];
  const stores = useMemo(() => data?.stores ?? [], [data?.stores]);
  const userRoles = data?.userRoles ?? [];
  const sales = useMemo(() => data?.sales ?? [], [data?.sales]);
  const subscriptions = useMemo(() => data?.subscriptions ?? [], [data?.subscriptions]);
  const audits = data?.audits ?? [];
  const appErrors = data?.appErrors ?? [];
  const platformMetrics = data?.platformMetrics ?? null;
  const salesLoadedCap = data?.salesLoadedCap ?? 15_000;

  const cities = useMemo(
    () => ["all", ...Array.from(new Set(stores.map((s) => (s.city ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr"))],
    [stores],
  );

  const range = useMemo(() => {
    const now = new Date();
    if (rangePreset === "today") {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return { start: d, end: now };
    }
    if (rangePreset === "7d") return { start: subDays(now, 6), end: now };
    if (rangePreset === "30d") return { start: subDays(now, 29), end: now };
    if (rangePreset === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
    if (rangePreset === "year") return { start: startOfYear(now), end: endOfYear(now) };
    const start = customStart ? new Date(`${customStart}T00:00:00`) : subDays(now, 29);
    const end = customEnd ? new Date(`${customEnd}T23:59:59`) : now;
    return { start, end };
  }, [rangePreset, customStart, customEnd]);

  const periodLabelFr = useMemo(() => {
    switch (rangePreset) {
      case "today":
        return "Aujourd’hui (depuis minuit)";
      case "7d":
        return "7 derniers jours glissants";
      case "30d":
        return "30 derniers jours glissants";
      case "month":
        return "Mois calendaire en cours";
      case "year":
        return "Année calendaire en cours";
      case "custom":
        if (customStart && customEnd) return `Du ${customStart} au ${customEnd}`;
        return "Personnalisé — choisissez deux dates";
      default:
        return "";
    }
  }, [rangePreset, customStart, customEnd]);

  const storesFiltered = useMemo(
    () =>
      stores.filter((s) => {
        if (selectedCompanyId !== "all" && s.companyId !== selectedCompanyId) return false;
        if (selectedStoreId !== "all" && s.id !== selectedStoreId) return false;
        if (selectedCity !== "all" && (s.city ?? "") !== selectedCity) return false;
        return true;
      }),
    [stores, selectedCompanyId, selectedStoreId, selectedCity],
  );
  const salesFiltered = useMemo(() => {
    const storeIdSet = new Set(storesFiltered.map((s) => s.id));
    const companyIdSet = new Set(
      selectedCompanyId === "all" ? storesFiltered.map((s) => s.companyId) : [selectedCompanyId],
    );
    return sales.filter((s) => {
      const dt = new Date(s.createdAt);
      if (dt < range.start || dt > range.end) return false;
      if (!companyIdSet.has(s.companyId)) return false;
      if (selectedStoreId !== "all" && s.storeId !== selectedStoreId) return false;
      if (selectedStoreId === "all" && s.storeId && !storeIdSet.has(s.storeId)) return false;
      return true;
    });
  }, [sales, range.start, range.end, storesFiltered, selectedCompanyId, selectedStoreId]);

  const subscriptionsFiltered = useMemo(
    () =>
      subscriptions.filter((s) => {
        if (selectedCompanyId !== "all" && s.companyId !== selectedCompanyId) return false;
        if (selectedSubStatus !== "all" && s.status !== selectedSubStatus) return false;
        return true;
      }),
    [subscriptions, selectedCompanyId, selectedSubStatus],
  );

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "—";
  // Fenêtre temporelle figée au montage (références stables pour les useMemo en aval).
  const { now, oneDayAgo, sevenDaysAgo, sevenDaysAhead, thirtyDaysAgo } = useMemo(() => {
    const now = new Date();
    return {
      now,
      oneDayAgo: subDays(now, 1),
      sevenDaysAgo: subDays(now, 7),
      sevenDaysAhead: addDays(now, 7),
      thirtyDaysAgo: subDays(now, 30),
    };
  }, []);

  const companiesActiveToday = new Set(
    sales.filter((s) => new Date(s.createdAt) >= oneDayAgo).map((s) => s.companyId),
  ).size;
  const storesSoldToday = new Set(
    sales.filter((s) => new Date(s.createdAt) >= oneDayAgo).map((s) => s.storeId).filter(Boolean),
  ).size;
  const usersActive24h =
    platformMetrics?.auditDistinctUsers24h ??
    new Set(
      audits
        .filter((a) => new Date(a.createdAt) >= oneDayAgo && a.companyId)
        .map((a) => `${a.companyId}:${a.entityType}:${a.action}`),
    ).size;
  const syncRecent = audits.filter(
    (a) =>
      new Date(a.createdAt) >= oneDayAgo &&
      (/sync/i.test(a.entityType) || /sync/i.test(a.action)),
  ).length;
  const criticalErrors = appErrors.filter((e) => new Date(e.createdAt) >= oneDayAgo).length;

  const salesTotal = salesFiltered.reduce((s, x) => s + x.total, 0);
  const salesCount = salesFiltered.length;
  const activeSubs = subscriptionsFiltered.filter((s) => s.status === "active").length;
  const trialSubs = subscriptionsFiltered.filter((s) => s.status === "trialing").length;
  const expiredSubs = subscriptionsFiltered.filter((s) => s.status === "expired").length;
  const pastDueSubs = subscriptionsFiltered.filter((s) => s.status === "past_due").length;
  const mrr = subscriptionsFiltered
    .filter((s) => s.status === "active" || s.status === "trialing")
    .reduce((sum, s) => sum + s.amountFcfa, 0);
  const arr = mrr * 12;
  const expectedRevenue = subscriptionsFiltered
    .filter((s) => s.status === "active" || s.status === "past_due" || s.status === "trialing")
    .reduce((sum, s) => sum + s.amountFcfa, 0);
  const paidRevenue = subscriptionsFiltered
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + s.amountFcfa, 0);
  const unpaidRevenue = Math.max(0, expectedRevenue - paidRevenue);
  const renewingSoon = subscriptionsFiltered.filter((s) => {
    if (!s.endsAt) return false;
    const d = new Date(s.endsAt);
    return d >= now && d <= sevenDaysAhead;
  }).length;
  const trialsExpiringSoon = subscriptionsFiltered.filter((s) => {
    if (s.status !== "trialing" || !s.trialEndsAt) return false;
    const d = new Date(s.trialEndsAt);
    return d >= now && d <= sevenDaysAhead;
  }).length;
  const activityRate = companies.length > 0 ? (companiesActiveToday / companies.length) * 100 : 0;
  const conversionRate = trialSubs + activeSubs > 0 ? (activeSubs / (trialSubs + activeSubs)) * 100 : 0;
  const saasRevenueEstimated = mrr;

  const companyAgg = useMemo(() => {
    const by = new Map<string, { total: number; count: number; todayCount: number; last7: number; prev7: number }>();
    for (const s of sales) {
      const dt = new Date(s.createdAt);
      const cur = by.get(s.companyId) ?? { total: 0, count: 0, todayCount: 0, last7: 0, prev7: 0 };
      cur.total += s.total;
      cur.count += 1;
      if (dt >= oneDayAgo) cur.todayCount += 1;
      if (dt >= sevenDaysAgo) cur.last7 += s.total;
      else if (dt >= subDays(now, 14)) cur.prev7 += s.total;
      by.set(s.companyId, cur);
    }
    return by;
  }, [sales, oneDayAgo, sevenDaysAgo, now]);

  const topByCa = [...companyAgg.entries()]
    .map(([companyId, v]) => ({ companyId, companyName: companyName(companyId), value: v.total }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const topBySales = [...companyAgg.entries()]
    .map(([companyId, v]) => ({ companyId, companyName: companyName(companyId), value: v.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const storeCountByCompany = new Map<string, number>();
  for (const s of stores) storeCountByCompany.set(s.companyId, (storeCountByCompany.get(s.companyId) ?? 0) + 1);
  const topByStores = [...storeCountByCompany.entries()]
    .map(([companyId, count]) => ({ companyName: companyName(companyId), value: count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const topGrowth = [...companyAgg.entries()]
    .map(([companyId, v]) => {
      const growth = v.prev7 > 0 ? ((v.last7 - v.prev7) / v.prev7) * 100 : v.last7 > 0 ? 100 : 0;
      return { companyName: companyName(companyId), value: growth };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const inactiveCompanies = companies
    .filter((c) => {
      const agg = companyAgg.get(c.id);
      return !agg || agg.count === 0 || agg.last7 === 0;
    })
    .slice(0, 10)
    .map((c) => c.name);

  const alerts: string[] = [];
  if (expiredSubs > 0) alerts.push(`${expiredSubs} abonnements expirés.`);
  if (trialsExpiringSoon > 0) alerts.push(`${trialsExpiringSoon} essais expirent bientôt.`);
  if (inactiveCompanies.length > 0) alerts.push(`${inactiveCompanies.length} entreprises inactives sur 7 jours.`);
  if (criticalErrors > 0) alerts.push(`${criticalErrors} erreurs/alertes critiques récentes.`);
  if (pastDueSubs > 0) alerts.push(`${pastDueSubs} abonnements en impayé.`);

  const dailyMap = new Map<string, { ca: number; sales: number }>();
  for (const s of salesFiltered) {
    const day = s.createdAt.slice(0, 10);
    const cur = dailyMap.get(day) ?? { ca: 0, sales: 0 };
    cur.ca += s.total;
    cur.sales += 1;
    dailyMap.set(day, cur);
  }
  const days = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date: date.slice(5), ca: Math.round(v.ca), sales: v.sales }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byStatus = [
    { name: "Actifs", value: activeSubs, color: "#f97316" },
    { name: "Essais", value: trialSubs, color: "#22c55e" },
    { name: "Impayés", value: pastDueSubs, color: "#eab308" },
    { name: "Expirés", value: expiredSubs, color: "#ef4444" },
  ];
  const cityDistribution = Array.from(
    stores.reduce((m, s) => {
      const k = (s.city ?? "Non renseignée").trim() || "Non renseignée";
      m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    }, new Map<string, number>()),
  )
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const moduleUsage = Array.from(
    audits.reduce((m, a) => {
      const key = a.entityType || "autre";
      m.set(key, (m.get(key) ?? 0) + 1);
      return m;
    }, new Map<string, number>()),
  )
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const activityRows = [
    ...sales.slice(0, 40).map((s) => ({
      at: new Date(s.createdAt),
      title: "Vente enregistrée",
      detail: `${companyName(s.companyId)} • ${formatCurrency(s.total)}`,
    })),
    ...audits.slice(0, 40).map((a) => ({
      at: new Date(a.createdAt),
      title: `${a.action} (${a.entityType})`,
      detail: `${a.companyId ? companyName(a.companyId) : "Plateforme"}`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 14)
    .map((r) => ({
      time: format(r.at, "dd/MM HH:mm"),
      title: r.title,
      detail: r.detail,
    }));

  const adoptionRows = companies
    .map((c) => {
      const salesAgg = companyAgg.get(c.id);
      const activeUsers = userRoles.filter((u) => u.companyId === c.id && u.createdAt && new Date(u.createdAt) >= thirtyDaysAgo).length;
      const score =
        Math.min(100, (salesAgg?.count ?? 0) * 2) +
        Math.min(100, activeUsers * 8) * 0.3 +
        (salesAgg?.last7 ?? 0) / 500000;
      return {
        companyName: c.name,
        score: Math.max(0, Math.min(100, Math.round(score))),
        activeUsers,
        sales: salesAgg?.count ?? 0,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const churnRows = companies
    .map((c) => {
      const agg = companyAgg.get(c.id);
      const sub = subscriptions.find((s) => s.companyId === c.id);
      let risk = 0;
      const reasons: string[] = [];
      if (!agg || agg.last7 === 0) {
        risk += 45;
        reasons.push("Inactivité récente");
      }
      if (!sub || sub.status === "expired" || sub.status === "past_due") {
        risk += 35;
        reasons.push("Abonnement non sain");
      }
      if (agg && agg.prev7 > 0 && agg.last7 < agg.prev7 * 0.5) {
        risk += 20;
        reasons.push("Baisse forte d’activité");
      }
      return {
        companyName: c.name,
        riskScore: Math.max(0, Math.min(100, risk)),
        reason: reasons.join(" • ") || "RAS",
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 12);

  const healthScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        40 +
        activityRate * 0.35 +
        conversionRate * 0.25 +
        (platformMetrics ? 5 : 0) -
        (criticalErrors > 0 ? Math.min(20, criticalErrors * 2) : 0),
      ),
    ),
  );

  const aiInsights = [
    topByCa[0] ? `Entreprise leader CA: ${topByCa[0].companyName} (${formatCurrency(topByCa[0].value)}).` : "",
    churnRows[0] && churnRows[0].riskScore > 50
      ? `À relancer: ${churnRows[0].companyName} (risque ${churnRows[0].riskScore}/100).`
      : "Aucune entreprise à risque élevé immédiat.",
    moduleUsage[0] ? `Module le plus utilisé: ${moduleUsage[0].module} (${moduleUsage[0].count} événements).` : "",
    days.length > 0 ? `Pic de ventes observé: ${days.slice().sort((a, b) => b.ca - a.ca)[0]?.date}.` : "",
    pastDueSubs > 0 ? `Priorité recouvrement: ${pastDueSubs} abonnements en impayé.` : "Aucun impayé abonnement détecté.",
  ].filter(Boolean);

  const salesSampleIncomplete = sales.length >= salesLoadedCap;
  const historicCa = platformMetrics?.completedSalesTotal ?? sales.reduce((s, x) => s + x.total, 0);
  const historicSalesN = platformMetrics?.completedSalesCount ?? sales.length;

  if (q.isLoading) {
    return (
      <div className="min-h-dvh bg-linear-to-b from-slate-100 via-white to-slate-50 px-4 py-10 md:px-8">
        <div className="mx-auto max-w-[1600px] space-y-8 animate-pulse">
          <div className="h-36 rounded-3xl bg-slate-200/70" />
          <div className="h-24 rounded-3xl bg-slate-200/50" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-slate-200/45" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-16">
        <div className="max-w-md rounded-3xl border border-red-200/80 bg-white p-8 text-center shadow-lg ring-1 ring-red-100/60">
          <p className="text-sm font-bold text-red-700">Impossible de charger le tableau de bord</p>
          <p className="mt-2 text-sm text-slate-600">{(q.error as Error)?.message ?? "Erreur inconnue"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-linear-to-b from-slate-100/95 via-[#f8fafc] to-slate-100 pb-16">
      <div className="relative overflow-hidden border-b border-white/10 bg-linear-to-br from-[#0a0f1c] via-[#121a2e] to-[#0f172a] px-4 py-10 text-white md:px-8 md:py-12">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-orange-500/30 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 left-1/4 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.03)_50%,transparent_60%)]" aria-hidden />
        <div className="relative mx-auto max-w-[1600px] space-y-8">
          <div className="space-y-8">
            <div className="max-w-3xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-300/90">Espace super-admin</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Tableau de bord</h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Totaux globaux ci-dessous ; le détail répond aux filtres plus bas.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="group relative min-h-0 min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-linear-to-br from-white/14 to-white/5 p-5 shadow-xl ring-1 ring-white/10 backdrop-blur-xl transition hover:border-orange-400/30 hover:shadow-orange-500/10">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-300">CA ventes — toute la plateforme</p>
                    <p className="wrap-break-word text-2xl font-bold leading-tight tabular-nums text-white sm:text-3xl">
                      {formatCurrency(historicCa)}
                    </p>
                    <p className="text-xs font-semibold tabular-nums text-slate-300">
                      {historicSalesN.toLocaleString("fr-FR")} ventes complétées
                    </p>
                  </div>
                  <div className="shrink-0 rounded-xl bg-white/10 p-3 text-orange-300 ring-1 ring-white/15 sm:mt-0">
                    <MdTrendingUp className="h-6 w-6" aria-hidden />
                  </div>
                </div>
              </div>

              <div className="group relative min-h-0 min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-linear-to-br from-white/14 to-white/5 p-5 shadow-xl ring-1 ring-white/10 backdrop-blur-xl transition hover:border-cyan-400/25 hover:shadow-cyan-500/10">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Référentiel produits</p>
                    <p className="text-2xl font-bold tabular-nums text-white sm:text-3xl">
                      {platformMetrics != null ? platformMetrics.productsCount.toLocaleString("fr-FR") : "—"}
                    </p>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Nombre d’articles enregistrés dans le catalogue, cumulé sur toutes les sociétés.
                    </p>
                  </div>
                  <div className="shrink-0 rounded-xl bg-white/10 p-3 text-cyan-200 ring-1 ring-white/15">
                    <MdInventory2 className="h-6 w-6" aria-hidden />
                  </div>
                </div>
              </div>

              <div className="group relative min-h-0 min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-linear-to-br from-white/14 to-white/5 p-5 shadow-xl ring-1 ring-white/10 backdrop-blur-xl transition hover:border-emerald-400/25 hover:shadow-emerald-500/10 sm:col-span-2 xl:col-span-1">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Carnet clients (module Clients)</p>
                    <p className="text-2xl font-bold tabular-nums text-white sm:text-3xl">
                      {platformMetrics != null ? platformMetrics.customersCount.toLocaleString("fr-FR") : "—"}
                    </p>
                    <p className="text-xs leading-relaxed text-slate-400">Fiches module Clients, toutes entreprises — pas les comptes utilisateurs.</p>
                  </div>
                  <div className="shrink-0 rounded-xl bg-white/10 p-3 text-emerald-300 ring-1 ring-white/15">
                    <MdGroups className="h-6 w-6" aria-hidden />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-xs text-slate-300 shadow-inner backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
            <span className="inline-flex items-center gap-2">
              <MdUpdate className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
              <span>
                Dernière synchro affichée :{" "}
                <strong className="font-semibold text-white">
                  {q.dataUpdatedAt ? formatOperationDateTime(q.dataUpdatedAt) : "—"}
                </strong>
              </span>
            </span>
            <span className="hidden h-4 w-px bg-white/20 sm:block" aria-hidden />
            <span className="inline-flex items-center gap-2">
              <MdSchedule className="h-4 w-4 shrink-0 text-cyan-300/90" aria-hidden />
              <span>
                Période pour graphiques & ventes filtrées :{" "}
                <strong className="font-semibold text-white">{periodLabelFr}</strong>
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-6 max-w-[1600px] space-y-10 px-4 md:px-8">
        {salesSampleIncomplete ? (
          <div className="rounded-3xl border border-amber-200/90 bg-linear-to-r from-amber-50 to-orange-50/60 px-5 py-4 text-sm text-amber-950 shadow-md ring-1 ring-amber-100/80">
            <span className="font-bold">Échantillon ventes.</span> Les graphiques et classements utilisent les{" "}
            {sales.length.toLocaleString("fr-FR")} ventes les plus récentes (plafond {salesLoadedCap.toLocaleString("fr-FR")}). Les
            totaux « CA » et « carnet » dans l’en-tête restent calculés sur la base complète.
          </div>
        ) : null}

        <AdminCard className="rounded-3xl border border-slate-200/70 bg-linear-to-br from-white via-white to-orange-50/25 p-6 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/90">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-orange-500/15 to-amber-500/10 text-orange-600 ring-1 ring-orange-500/25">
                <MdFilterList className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Périmètre d’analyse</p>
                <p className="mt-1 text-base font-bold text-slate-900">Filtres</p>
                <p className="mt-1 max-w-xl text-sm text-slate-600">
                  S’appliquent aux ventes, graphiques, tops et tableaux d’abonnements ci-dessous. Les trois cartes sombres en tête de page
                  restent des totaux plateforme.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <select className="h-12 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/30" value={rangePreset} onChange={(e) => setRangePreset(e.target.value as RangePreset)}>
              <option value="today">Aujourd’hui</option>
              <option value="7d">7 jours</option>
              <option value="30d">30 jours</option>
              <option value="month">Mois</option>
              <option value="year">Année</option>
              <option value="custom">Personnalisé</option>
            </select>
            <select className="h-12 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/30" value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
              <option value="all">Entreprise (toutes)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="h-12 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/30" value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
              <option value="all">Boutique (toutes)</option>
              {stores
                .filter((s) => selectedCompanyId === "all" || s.companyId === selectedCompanyId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <select className="h-12 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/30" value={selectedSubStatus} onChange={(e) => setSelectedSubStatus(e.target.value)}>
              <option value="all">Abonnement (tous)</option>
              <option value="active">Actif</option>
              <option value="trialing">Essai</option>
              <option value="past_due">Impayé</option>
              <option value="expired">Expiré</option>
              <option value="canceled">Annulé</option>
            </select>
            <select className="h-12 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/30" value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city === "all" ? "Ville (toutes)" : city}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="h-12 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-2 text-xs font-semibold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-orange-500/30" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <input type="date" className="h-12 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-2 text-xs font-semibold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-orange-500/30" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </div>
        </AdminCard>

        <DashboardSection
          kicker="Parc"
          title="Structure du réseau"
          description="Effectifs et référentiels : ces chiffres décrivent l’installation globale (hors filtre de période). Les boutiques comptées tiennent compte des filtres entreprise / ville."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              title="Entreprises inscrites"
              caption="Fiches société présentes dans FasoStock."
              value={String(companies.length)}
              icon={<MdBusiness className="h-5 w-5" />}
            />
            <KpiCard
              title="Sociétés actives (flag)"
              caption="Comptes non désactivés côté administration."
              value={String(companies.filter((c) => c.isActive).length)}
              icon={<MdCheckCircle className="h-5 w-5" />}
            />
            <KpiCard
              title="Boutiques visibles"
              caption="Après filtres entreprise, point de vente et ville."
              value={String(storesFiltered.length)}
              icon={<MdStore className="h-5 w-5" />}
            />
            <KpiCard
              title="Liaisons utilisateur → entreprise"
              caption="Rôles actifs (accès multi-société)."
              value={String(userRoles.length)}
              icon={<MdPeople className="h-5 w-5" />}
            />
            <KpiCard
              title="Articles catalogue"
              caption="Produits en base, toute la plateforme."
              value={platformMetrics != null ? platformMetrics.productsCount.toLocaleString("fr-FR") : "—"}
              icon={<MdInventory2 className="h-5 w-5" />}
            />
            <KpiCard
              title="Fiches client"
              caption="Clients enregistrés, toutes entreprises."
              value={platformMetrics != null ? platformMetrics.customersCount.toLocaleString("fr-FR") : "—"}
              icon={<MdGroups className="h-5 w-5" />}
            />
          </div>
        </DashboardSection>

        <DashboardSection
          kicker="Commerce"
          title="Ventes sur la période choisie"
          description={`Montants et volumes calculés sur : ${periodLabelFr}, avec les filtres entreprise / boutique / ville. Comparez au CA global affiché dans l’en-tête.`}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Nombre de ventes"
              caption="Tickets comptés dans l’intervalle."
              value={String(salesCount)}
              icon={<MdShoppingCart className="h-5 w-5" />}
            />
            <KpiCard
              title="Chiffre d’affaires"
              caption="Somme des montants sur la période filtrée."
              value={formatCurrency(salesTotal)}
              icon={<MdTrendingUp className="h-5 w-5" />}
            />
            <KpiCard
              title="Taux d’activité réseau"
              caption="Part des entreprises ayant vendu dans les dernières 24 h."
              value={`${activityRate.toFixed(1)}%`}
              icon={<MdInsights className="h-5 w-5" />}
            />
            <KpiCard
              title="Conversion essai → payant"
              caption="Abonnements actifs / (actifs + essais), sur le filtre courant."
              value={`${conversionRate.toFixed(1)}%`}
              icon={<MdCardMembership className="h-5 w-5" />}
            />
          </div>
        </DashboardSection>

        <DashboardSection
          kicker="SaaS"
          title="Abonnements FasoStock"
          description="État des souscriptions selon les filtres entreprise et statut. Le MRR additionne les montants des abonnements actifs ou en essai."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Abonnements actifs"
              caption="Clients qui paient (hors essai)."
              value={String(activeSubs)}
              icon={<MdCardMembership className="h-5 w-5" />}
            />
            <KpiCard
              title="Périodes d’essai"
              caption="Comptes encore en trial."
              value={String(trialSubs)}
              icon={<MdTimer className="h-5 w-5" />}
            />
            <KpiCard
              title="Expirations / impayés"
              caption={`${pastDueSubs} impayé(s) · ${expiredSubs} expiré(s)`}
              value={String(expiredSubs)}
              icon={<MdErrorOutline className="h-5 w-5" />}
            />
            <KpiCard
              title="MRR estimé"
              caption="Somme mensuelle facturable (actifs + essais filtrés)."
              value={formatCurrency(saasRevenueEstimated)}
              icon={<MdTrendingUp className="h-5 w-5" />}
            />
          </div>
        </DashboardSection>

        <DashboardSection
          kicker="Pulse"
          title="Les dernières 24 heures"
          description="Signaux bruts d’usage : ventes, points de vente actifs, présence dans les journaux d’audit et synchronisations détectées."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <HealthScoreCard
              score={healthScore}
              subtitle={`${companiesActiveToday} entreprise(s) ont encaissé au moins une vente · ${storesSoldToday} boutique(s) concernée(s) · ${usersActive24h} personne(s) distincte(s) dans l’audit.`}
            />
            <AdminCard className="rounded-3xl border border-slate-200/70 bg-linear-to-b from-white to-slate-50/50 p-6 shadow-[0_16px_48px_-24px_rgba(15,23,42,0.14)] ring-1 ring-slate-100/80">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-700/85">Activité live</p>
              <p className="mt-1 text-base font-bold text-slate-900">Détail court terme</p>
              <p className="mt-1 text-sm text-slate-600">Complète le score de santé : utile pour voir si le réseau « bouge » aujourd’hui.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <KpiCard
                  title="Entreprises vendeuses"
                  caption="Avec au moins une vente sur 24 h."
                  value={String(companiesActiveToday)}
                  icon={<MdBusiness className="h-4 w-4" />}
                />
                <KpiCard
                  title="Boutiques actives"
                  caption="Ayant enregistré une vente récente."
                  value={String(storesSoldToday)}
                  icon={<MdStore className="h-4 w-4" />}
                />
                <KpiCard
                  title="Utilisateurs (audit)"
                  caption="Profils distincts vus dans les logs."
                  value={String(usersActive24h)}
                  icon={<MdPeople className="h-4 w-4" />}
                />
                <KpiCard
                  title="Sync détectées"
                  caption="Événements liés à la synchro (24 h)."
                  value={String(syncRecent)}
                  icon={<MdCloudSync className="h-4 w-4" />}
                />
              </div>
            </AdminCard>
          </div>
        </DashboardSection>

        <DashboardSection
          kicker="Facturation"
          title="Projection des revenus SaaS"
          description="MRR / ARR dérivés des montants d’abonnement filtrés. « Encaissé » vs « attendu » aide à suivre le cash et les relances."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RevenueCard title="MRR (mensuel récurrent)" caption="Somme des abonnements actifs + essais." value={formatCurrency(mrr)} />
            <RevenueCard title="ARR (annualisé)" caption="MRR × 12 — ordre de grandeur annuel." value={formatCurrency(arr)} />
            <RevenueCard title="Encaissé (actifs)" caption="Montants des abonnements au statut actif." value={formatCurrency(paidRevenue)} />
            <RevenueCard title="Attendu (actifs + essais + impayés)" caption="Ce qui devrait rentrer sur la période suivie." value={formatCurrency(expectedRevenue)} />
            <RevenueCard title="Écart / impayés" caption="Différence entre attendu et déjà encaissé." value={formatCurrency(unpaidRevenue)} />
            <RevenueCard
              title="Échéances sous 7 jours"
              caption={`${trialsExpiringSoon} essai(x) touchent aussi leur fin.`}
              value={String(renewingSoon)}
            />
          </div>
        </DashboardSection>

        <DashboardSection
          kicker="Graphiques"
          title="Tendances sur la période filtrée"
          description="Chaque graphique respecte les filtres (dates, société, boutique, ville). Comparez la courbe orange (CA) au volume bleu (nombre de tickets)."
        >
          <div className="grid gap-6 xl:grid-cols-2">
            <AdminCard className="rounded-3xl border border-slate-200/70 bg-linear-to-b from-white to-slate-50/40 p-6 shadow-[0_14px_44px_-22px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-600/90">Courbe</p>
              <p className="mt-1 text-base font-bold text-slate-900">Chiffre d’affaires par jour</p>
              <p className="mt-1 text-xs text-slate-600">Montants par jour sur la période filtrée.</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={days}>
                    <defs>
                      <linearGradient id="caGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area dataKey="ca" stroke="#f97316" fill="url(#caGradient)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            <AdminCard className="rounded-3xl border border-slate-200/70 bg-linear-to-b from-white to-slate-50/40 p-6 shadow-[0_14px_44px_-22px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700/85">Histogramme</p>
              <p className="mt-1 text-base font-bold text-slate-900">Nombre de ventes par jour</p>
              <p className="mt-1 text-xs text-slate-600">Compte les tickets sur la même fenêtre que la courbe CA.</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="sales" fill="#2563eb" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <AdminCard className="rounded-3xl border border-slate-200/70 bg-linear-to-b from-white to-slate-50/40 p-6 shadow-[0_14px_44px_-22px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Mix abonnements</p>
              <p className="mt-1 text-base font-bold text-slate-900">Statuts (filtre courant)</p>
              <p className="mt-1 text-xs text-slate-600">Répartition des souscriptions sélectionnées.</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={90} innerRadius={54}>
                      {byStatus.map((r) => (
                        <Cell key={r.name} fill={r.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            <AdminCard className="rounded-3xl border border-slate-200/70 bg-linear-to-b from-white to-slate-50/40 p-6 shadow-[0_14px_44px_-22px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700/85">Carte chaude</p>
              <p className="mt-1 text-base font-bold text-slate-900">Boutiques par ville</p>
              <p className="mt-1 text-xs text-slate-600">Dénombre les points de vente déclarés (toutes sociétés).</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cityDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="city" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#22c55e" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            <AdminCard className="rounded-3xl border border-slate-200/70 bg-linear-to-b from-white to-violet-50/30 p-6 shadow-[0_14px_44px_-22px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700/85">Usage produit</p>
              <p className="mt-1 text-base font-bold text-slate-900">Modules les plus touchés</p>
              <p className="mt-1 text-xs text-slate-600">Basé sur les journaux d’audit récents chargés.</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moduleUsage}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="module" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>
          </div>
        </DashboardSection>

        <DashboardSection
          kicker="Classements"
          title="Entreprises à suivre"
          description="Les tops utilisent l’historique ventes chargé (voir bandeau échantillon si présent). Les variations comparent deux fenêtres de 7 jours."
        >
          <div className="grid gap-6 xl:grid-cols-3">
            <TopCompaniesCard
              title="Plus gros chiffre d’affaires"
              subtitle="Somme historique des ventes complétées par société."
              rows={topByCa.map((r) => ({ companyName: r.companyName, value: formatCurrency(r.value) }))}
              valueLabel="CA cumulé observé"
            />
            <TopCompaniesCard
              title="Plus de tickets"
              subtitle="Nombre de ventes enregistrées dans l’échantillon."
              rows={topBySales.map((r) => ({ companyName: r.companyName, value: `${r.value}` }))}
              valueLabel="Nombre de ventes"
            />
            <TopCompaniesCard
              title="Réseaux les plus denses"
              subtitle="Nombre de boutiques déclarées par entreprise."
              rows={topByStores.map((r) => ({ companyName: r.companyName, value: `${r.value}` }))}
              valueLabel="Points de vente"
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <TopCompaniesCard
              title="Croissance 7 jours"
              subtitle="Comparaison CA 7 j glissants vs 7 j précédents."
              rows={topGrowth.map((r) => ({ companyName: r.companyName, value: `${r.value.toFixed(1)}%` }))}
              valueLabel="Variation %"
            />
            <TopCompaniesCard
              title="Sociétés à réactiver"
              subtitle="Aucune vente sur les 7 derniers jours ou jamais vendu."
              rows={inactiveCompanies.map((name) => ({ companyName: name, value: "Veille" }))}
              valueLabel="Statut"
            />
            <TopCompaniesCard
              title="Priorité rétention"
              subtitle="Score interne (inactivité + abonnement + baisse)."
              rows={churnRows.slice(0, 10).map((r) => ({ companyName: r.companyName, value: `${r.riskScore}/100` }))}
              valueLabel="Indice de risque"
            />
          </div>
        </DashboardSection>

        <DashboardSection
          kicker="Veille"
          title="Alertes & lecture express"
          description="Alertes = règles simples sur les compteurs filtrés. Le flux reflète les derniers événements connus côté API."
        >
          <div className="grid gap-6 xl:grid-cols-3">
            <AlertCard title="Suivi opérationnel" alerts={alerts} />
            <ActivityFeed rows={activityRows} />
            <AiInsightsCard insights={aiInsights} />
          </div>
        </DashboardSection>

        <DashboardSection
          kicker="Profondeur"
          title="Tables analytiques"
          description="Adoption = score interne par entreprise. Churn détaille les signaux utilisés dans le classement de risque."
        >
          <div className="grid gap-6 xl:grid-cols-2">
            <AdoptionTable rows={adoptionRows} />
            <ChurnRiskTable rows={churnRows} />
          </div>
        </DashboardSection>

        <AdminCard className="rounded-3xl border border-slate-200/70 bg-linear-to-br from-slate-50/80 via-white to-orange-50/30 p-6 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/90">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-600/90">Navigation</p>
          <p className="mt-1 text-lg font-bold text-slate-900">Accès directs</p>
          <p className="mt-1 text-sm text-slate-600">Liens utiles pour agir depuis ce tableau de bord.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Link href="/admin/companies" className="group inline-flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-100/80 transition hover:border-orange-300 hover:shadow-md hover:ring-orange-100/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/20 transition group-hover:bg-orange-500/15">
                <MdAddBusiness className="h-5 w-5" />
              </span>
              Nouvelle entreprise
            </Link>
            <Link href="/admin/settings" className="group inline-flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-100/80 transition hover:border-orange-300 hover:shadow-md hover:ring-orange-100/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/20 transition group-hover:bg-orange-500/15">
                <MdCardMembership className="h-5 w-5" />
              </span>
              Abonnements
            </Link>
            <Link href="/admin/messages" className="group inline-flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-100/80 transition hover:border-orange-300 hover:shadow-md hover:ring-orange-100/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/20 transition group-hover:bg-orange-500/15">
                <MdCampaign className="h-5 w-5" />
              </span>
              Campagnes / relances
            </Link>
            <Link href="/admin/reports" className="group inline-flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-100/80 transition hover:border-orange-300 hover:shadow-md hover:ring-orange-100/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/20 transition group-hover:bg-orange-500/15">
                <MdDownload className="h-5 w-5" />
              </span>
              Exports & rapports
            </Link>
            <Link href="/help" className="group inline-flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-100/80 transition hover:border-orange-300 hover:shadow-md hover:ring-orange-100/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/20 transition group-hover:bg-orange-500/15">
                <MdSupportAgent className="h-5 w-5" />
              </span>
              Centre d’aide
            </Link>
            <Link href="/admin/maps" className="group inline-flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-100/80 transition hover:border-orange-300 hover:shadow-md hover:ring-orange-100/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/20 transition group-hover:bg-orange-500/15">
                <MdMap className="h-5 w-5" />
              </span>
              Carte live
            </Link>
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
