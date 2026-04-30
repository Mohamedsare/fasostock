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
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminGetCockpitData } from "@/lib/features/admin/api";
import { formatCurrency } from "@/lib/utils/currency";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfMonth, endOfYear, format, startOfMonth, startOfYear, subDays } from "date-fns";
import Link from "next/link";
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
  MdInsights,
  MdMap,
  MdPeople,
  MdSupportAgent,
  MdShoppingCart,
  MdStore,
  MdTimer,
  MdTrendingUp,
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

type RangePreset = "today" | "7d" | "30d" | "month" | "year" | "custom";

export function AdminDashboardScreen() {
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");
  const [selectedSubStatus, setSelectedSubStatus] = useState<string>("all");
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const q = useQuery({
    queryKey: ["admin-dashboard-cockpit-v2"] as const,
    queryFn: adminGetCockpitData,
  });

  const data = q.data;
  const companies = data?.companies ?? [];
  const stores = data?.stores ?? [];
  const userRoles = data?.userRoles ?? [];
  const sales = data?.sales ?? [];
  const subscriptions = data?.subscriptions ?? [];
  const audits = data?.audits ?? [];
  const appErrors = data?.appErrors ?? [];

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
  const storeIdSet = new Set(storesFiltered.map((s) => s.id));
  const companyIdSet = new Set(
    selectedCompanyId === "all" ? storesFiltered.map((s) => s.companyId) : [selectedCompanyId],
  );

  const salesFiltered = useMemo(
    () =>
      sales.filter((s) => {
        const dt = new Date(s.createdAt);
        if (dt < range.start || dt > range.end) return false;
        if (!companyIdSet.has(s.companyId)) return false;
        if (selectedStoreId !== "all" && s.storeId !== selectedStoreId) return false;
        if (selectedStoreId === "all" && s.storeId && !storeIdSet.has(s.storeId)) return false;
        return true;
      }),
    [sales, range.start, range.end, companyIdSet, selectedStoreId, storeIdSet],
  );

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
  const now = new Date();
  const oneDayAgo = subDays(now, 1);
  const sevenDaysAgo = subDays(now, 7);
  const sevenDaysAhead = addDays(now, 7);
  const thirtyDaysAgo = subDays(now, 30);

  const companiesActiveToday = new Set(
    sales.filter((s) => new Date(s.createdAt) >= oneDayAgo).map((s) => s.companyId),
  ).size;
  const storesSoldToday = new Set(
    sales.filter((s) => new Date(s.createdAt) >= oneDayAgo).map((s) => s.storeId).filter(Boolean),
  ).size;
  const usersActiveToday = new Set(
    audits.filter((a) => new Date(a.createdAt) >= oneDayAgo).map((a) => `${a.companyId}:${a.entityType}:${a.action}`),
  ).size;
  const syncRecent = audits.filter((a) => new Date(a.createdAt) >= oneDayAgo && a.entityType.includes("sync")).length;
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
    ...sales.slice(0, 6).map((s) => ({
      time: format(new Date(s.createdAt), "HH:mm"),
      title: "Vente enregistrée",
      detail: `${companyName(s.companyId)} • ${formatCurrency(s.total)}`,
    })),
    ...audits.slice(0, 8).map((a) => ({
      time: format(new Date(a.createdAt), "HH:mm"),
      title: `${a.action} (${a.entityType})`,
      detail: `${a.companyId ? companyName(a.companyId) : "Plateforme"}`,
    })),
  ]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 12);

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
        45 + activityRate * 0.35 + conversionRate * 0.25 - (criticalErrors > 0 ? Math.min(20, criticalErrors * 2) : 0),
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

  if (q.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="p-8">
        <p className="text-sm font-semibold text-red-600">{(q.error as Error)?.message ?? "Erreur"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-slate-50 p-5 md:p-8">
      <AdminPageHeader
        title="Cockpit Super Admin"
        description="Pilotage premium de toute la plateforme SaaS FasoStock"
      />

      <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-900">Filtres globaux</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={rangePreset} onChange={(e) => setRangePreset(e.target.value as RangePreset)}>
            <option value="today">Aujourd’hui</option>
            <option value="7d">7 jours</option>
            <option value="30d">30 jours</option>
            <option value="month">Mois</option>
            <option value="year">Année</option>
            <option value="custom">Personnalisé</option>
          </select>
          <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
            <option value="all">Entreprise (toutes)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
            <option value="all">Boutique (toutes)</option>
            {stores
              .filter((s) => selectedCompanyId === "all" || s.companyId === selectedCompanyId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={selectedSubStatus} onChange={(e) => setSelectedSubStatus(e.target.value)}>
            <option value="all">Abonnement (tous)</option>
            <option value="active">Actif</option>
            <option value="trialing">Essai</option>
            <option value="past_due">Impayé</option>
            <option value="expired">Expiré</option>
            <option value="canceled">Annulé</option>
          </select>
          <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city === "all" ? "Ville (toutes)" : city}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="h-10 rounded-xl border border-slate-300 px-2 text-xs" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <input type="date" className="h-10 rounded-xl border border-slate-300 px-2 text-xs" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        </div>
      </AdminCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total entreprises" value={String(companies.length)} icon={<MdBusiness className="h-5 w-5" />} />
        <KpiCard title="Entreprises actives" value={String(companies.filter((c) => c.isActive).length)} icon={<MdCheckCircle className="h-5 w-5" />} />
        <KpiCard title="Boutiques" value={String(storesFiltered.length)} icon={<MdStore className="h-5 w-5" />} />
        <KpiCard title="Utilisateurs" value={String(userRoles.length)} icon={<MdPeople className="h-5 w-5" />} />
        <KpiCard title="Abonnements actifs" value={String(activeSubs)} icon={<MdCardMembership className="h-5 w-5" />} />
        <KpiCard title="Essais gratuits" value={String(trialSubs)} icon={<MdTimer className="h-5 w-5" />} />
        <KpiCard title="Abonnements expirés" value={String(expiredSubs)} hint={`${pastDueSubs} impayés`} icon={<MdErrorOutline className="h-5 w-5" />} />
        <KpiCard title="Ventes totales" value={String(salesCount)} icon={<MdShoppingCart className="h-5 w-5" />} />
        <KpiCard title="CA commerçants total" value={formatCurrency(salesTotal)} icon={<MdTrendingUp className="h-5 w-5" />} />
        <KpiCard title="Revenus FasoStock estimés" value={formatCurrency(saasRevenueEstimated)} icon={<MdInsights className="h-5 w-5" />} />
        <KpiCard title="Taux d’activité" value={`${activityRate.toFixed(1)}%`} />
        <KpiCard title="Conversion essai -> actif" value={`${conversionRate.toFixed(1)}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HealthScoreCard
          score={healthScore}
          subtitle={`${companiesActiveToday} entreprises actives aujourd'hui • ${storesSoldToday} boutiques vendeuses • ${usersActiveToday} signaux utilisateurs`}
        />
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Santé plateforme détaillée</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <KpiCard title="Entreprises actives aujourd’hui" value={String(companiesActiveToday)} icon={<MdBusiness className="h-4 w-4" />} />
            <KpiCard title="Boutiques ayant vendu aujourd’hui" value={String(storesSoldToday)} icon={<MdStore className="h-4 w-4" />} />
            <KpiCard title="Utilisateurs connectés aujourd’hui" value={String(usersActiveToday)} icon={<MdPeople className="h-4 w-4" />} />
            <KpiCard title="Synchronisations récentes" value={String(syncRecent)} icon={<MdCloudSync className="h-4 w-4" />} />
          </div>
        </AdminCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <RevenueCard title="MRR" value={formatCurrency(mrr)} />
        <RevenueCard title="ARR" value={formatCurrency(arr)} />
        <RevenueCard title="Revenus encaissés" value={formatCurrency(paidRevenue)} />
        <RevenueCard title="Revenus attendus" value={formatCurrency(expectedRevenue)} />
        <RevenueCard title="Impayés" value={formatCurrency(unpaidRevenue)} />
        <RevenueCard title="Renouvellements proches" value={String(renewingSoon)} hint={`${trialsExpiringSoon} essais expirent bientôt`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Évolution du CA (période)</p>
          <div className="mt-3 h-72">
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

        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Ventes par jour</p>
          <div className="mt-3 h-72">
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

      <div className="grid gap-6 xl:grid-cols-3">
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Abonnements par statut</p>
          <div className="mt-3 h-72">
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

        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Répartition par ville</p>
          <div className="mt-3 h-72">
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

        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Modules les plus utilisés</p>
          <div className="mt-3 h-72">
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

      <div className="grid gap-6 xl:grid-cols-3">
        <TopCompaniesCard
          title="Top entreprises par CA"
          rows={topByCa.map((r) => ({ companyName: r.companyName, value: formatCurrency(r.value) }))}
          valueLabel="CA cumulé"
        />
        <TopCompaniesCard
          title="Top entreprises par ventes"
          rows={topBySales.map((r) => ({ companyName: r.companyName, value: `${r.value}` }))}
          valueLabel="Nombre de ventes"
        />
        <TopCompaniesCard
          title="Top entreprises par boutiques"
          rows={topByStores.map((r) => ({ companyName: r.companyName, value: `${r.value}` }))}
          valueLabel="Nombre de boutiques"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <TopCompaniesCard
          title="Top par croissance"
          rows={topGrowth.map((r) => ({ companyName: r.companyName, value: `${r.value.toFixed(1)}%` }))}
          valueLabel="Croissance CA (7j vs 7j précédents)"
        />
        <TopCompaniesCard
          title="Entreprises inactives"
          rows={inactiveCompanies.map((name) => ({ companyName: name, value: "Inactif" }))}
          valueLabel="Sans activité récente"
        />
        <TopCompaniesCard
          title="Entreprises à risque"
          rows={churnRows.slice(0, 10).map((r) => ({ companyName: r.companyName, value: `${r.riskScore}/100` }))}
          valueLabel="Risque churn"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <AlertCard title="Alertes intelligentes" alerts={alerts} />
        <ActivityFeed rows={activityRows} />
        <AiInsightsCard insights={aiInsights} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdoptionTable rows={adoptionRows} />
        <ChurnRiskTable rows={churnRows} />
      </div>

      <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-900">Actions rapides</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Link href="/admin/companies" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <MdAddBusiness className="h-4 w-4 text-orange-500" />
            Ajouter une entreprise
          </Link>
          <Link href="/admin/settings" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <MdCardMembership className="h-4 w-4 text-orange-500" />
            Voir abonnements
          </Link>
          <Link href="/admin/messages" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <MdCampaign className="h-4 w-4 text-orange-500" />
            Relancer clients inactifs
          </Link>
          <Link href="/admin/reports" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <MdDownload className="h-4 w-4 text-orange-500" />
            Exporter rapport
          </Link>
          <Link href="/help" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <MdSupportAgent className="h-4 w-4 text-orange-500" />
            Ouvrir support
          </Link>
          <Link href="/admin/companies" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <MdMap className="h-4 w-4 text-orange-500" />
            Voir entreprises à risque
          </Link>
        </div>
      </AdminCard>
    </div>
  );
}
