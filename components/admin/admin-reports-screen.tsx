"use client";

import { AdminCard } from "@/components/admin/admin-page-header";
import {
  ActivityRevenueMatrix,
  AiInsightsCard,
  AnomalyDetectionPanel,
  CompanyReportTable,
  DecisionKpiCard,
  ExecutiveSummaryCard,
  FollowUpClientsTable,
  ForecastSection,
  MonetizationReport,
  PerformanceScoreCard,
  ProductAdoptionSection,
  RecommendedDecisions,
  ReportFilters,
  ReportHeader,
  RevenueCharts,
  TopFlopSection,
} from "@/components/admin/reports-intelligence-components";
import { adminGetCockpitData } from "@/lib/features/admin/api";
import { fetchReportsPdfBlob } from "@/lib/features/pdf/pdf-api-client";
import { formatCurrency } from "@/lib/utils/currency";
import type { ReportsPageData } from "@/lib/features/dashboard/types";
import { downloadProSpreadsheet } from "@/lib/utils/spreadsheet-export-pro";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subDays } from "date-fns";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type RangePreset = "today" | "7d" | "30d" | "month" | "year" | "custom";
type ViewMode = "platform" | "company" | "store";

export function AdminReportsScreen() {
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [viewMode, setViewMode] = useState<ViewMode>("platform");
  const [companyId, setCompanyId] = useState("all");
  const [storeId, setStoreId] = useState("all");
  const [city, setCity] = useState("all");
  const [subStatus, setSubStatus] = useState("all");
  const [activityLevel, setActivityLevel] = useState("all");
  const [riskLevel, setRiskLevel] = useState("all");
  const [sector, setSector] = useState("all");
  const [planType, setPlanType] = useState("all");
  const [comparePrevious, setComparePrevious] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);

  const q = useQuery({
    queryKey: ["admin-reports"] as const,
    queryFn: adminGetCockpitData,
  });

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
    return {
      start: customStart ? new Date(`${customStart}T00:00:00`) : subDays(now, 29),
      end: customEnd ? new Date(`${customEnd}T23:59:59`) : now,
    };
  }, [rangePreset, customStart, customEnd]);

  if (q.isError) {
    return <div className="p-8 text-red-600">{(q.error as Error).message}</div>;
  }

  if (q.isPending || !q.data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  const data = q.data;
  const companies = data.companies ?? [];
  const stores = data.stores ?? [];
  const sales = data.sales ?? [];
  const subscriptions = data.subscriptions ?? [];
  const audits = data.audits ?? [];
  const appErrors = data.appErrors ?? [];

  const cityOptions = ["all", ...Array.from(new Set(stores.map((s) => (s.city ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr"))];
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "—";
  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "—";
  const companyStoreMap = stores.reduce((m, s) => {
    m.set(s.companyId, (m.get(s.companyId) ?? 0) + 1);
    return m;
  }, new Map<string, number>());

  const filteredSales = sales.filter((s) => {
    const dt = new Date(s.createdAt);
    if (dt < range.start || dt > range.end) return false;
    if (companyId !== "all" && s.companyId !== companyId) return false;
    if (storeId !== "all" && s.storeId !== storeId) return false;
    if (city !== "all") {
      const st = stores.find((x) => x.id === s.storeId);
      if ((st?.city ?? "") !== city) return false;
    }
    return true;
  });

  const filteredSubs = subscriptions.filter((s) => {
    if (companyId !== "all" && s.companyId !== companyId) return false;
    if (subStatus !== "all" && s.status !== subStatus) return false;
    if (planType !== "all" && (s.planCode ?? "unknown") !== planType) return false;
    return true;
  });

  const salesTotal = filteredSales.reduce((sum, s) => sum + s.total, 0);
  const salesCount = filteredSales.length;
  const avgTicket = salesCount > 0 ? salesTotal / salesCount : 0;
  const companiesActive = new Set(filteredSales.map((s) => s.companyId)).size;
  const storesActive = new Set(filteredSales.map((s) => s.storeId).filter(Boolean)).size;
  const activeUsers = new Set(
    audits
      .filter((a) => new Date(a.createdAt) >= range.start)
      .map((a) => `${a.companyId}:${a.entityType}:${a.action}`),
  ).size;
  const activeSubs = filteredSubs.filter((s) => s.status === "active").length;
  const trials = filteredSubs.filter((s) => s.status === "trialing").length;
  const expired = filteredSubs.filter((s) => s.status === "expired").length;
  const pastDue = filteredSubs.filter((s) => s.status === "past_due").length;
  const paidClients = activeSubs;
  const freeClients = Math.max(0, companies.length - paidClients - trials);
  const mrr = filteredSubs.filter((s) => s.status === "active" || s.status === "trialing").reduce((sum, s) => sum + s.amountFcfa, 0);
  const arr = mrr * 12;
  const expectedRevenue = filteredSubs.filter((s) => s.status === "active" || s.status === "past_due" || s.status === "trialing").reduce((sum, s) => sum + s.amountFcfa, 0);
  const cashIn = filteredSubs.filter((s) => s.status === "active").reduce((sum, s) => sum + s.amountFcfa, 0);
  const unpaid = Math.max(0, expectedRevenue - cashIn);
  const conversionRate = activeSubs + trials > 0 ? (activeSubs / (activeSubs + trials)) * 100 : 0;
  const churnRate = activeSubs + expired > 0 ? (expired / (activeSubs + expired)) * 100 : 0;
  const adoptionAvg = Math.max(0, Math.min(100, Math.round((companiesActive / Math.max(1, companies.length)) * 100)));
  const riskAvg = Math.min(100, Math.round(churnRate * 0.6 + (pastDue > 0 ? 20 : 0)));
  const platformRevenue = mrr;

  const dailyMap = new Map<string, { ca: number; sales: number }>();
  for (const s of filteredSales) {
    const day = s.createdAt.slice(0, 10);
    const cur = dailyMap.get(day) ?? { ca: 0, sales: 0 };
    cur.ca += s.total;
    cur.sales += 1;
    dailyMap.set(day, cur);
  }
  const dailyData = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date: date.slice(5), fullDate: date, ca: Math.round(v.ca), sales: v.sales }))
    .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  const saasRevenueData = dailyData.map((d) => ({ ...d, saas: Math.round(d.ca * 0.08) }));

  const byCompany = Array.from(
    filteredSales.reduce((m, s) => {
      const cur = m.get(s.companyId) ?? { ca: 0, sales: 0, lastActivity: s.createdAt };
      cur.ca += s.total;
      cur.sales += 1;
      if (s.createdAt > cur.lastActivity) cur.lastActivity = s.createdAt;
      m.set(s.companyId, cur);
      return m;
    }, new Map<string, { ca: number; sales: number; lastActivity: string }>()),
  )
    .map(([companyId, v]) => ({ companyId, companyName: companyName(companyId), ...v }))
    .sort((a, b) => b.ca - a.ca);

  const topByCa = byCompany.slice(0, 10);
  const topBySales = [...byCompany].sort((a, b) => b.sales - a.sales).slice(0, 10);
  const topBoutiques = Array.from(
    filteredSales.reduce((m, s) => {
      if (!s.storeId) return m;
      m.set(s.storeId, (m.get(s.storeId) ?? 0) + 1);
      return m;
    }, new Map<string, number>()),
  )
    .map(([id, salesCount]) => ({ id, name: storeName(id), salesCount }))
    .sort((a, b) => b.salesCount - a.salesCount)
    .slice(0, 5);
  const topCities = Array.from(
    filteredSales.reduce((m, s) => {
      const st = stores.find((x) => x.id === s.storeId);
      const k = (st?.city ?? "Non renseignée").trim() || "Non renseignée";
      m.set(k, (m.get(k) ?? 0) + s.total);
      return m;
    }, new Map<string, number>()),
  )
    .map(([cityName, total]) => ({ city: cityName, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const subStatusData = [
    { name: "Actifs", value: activeSubs, color: "#f97316" },
    { name: "Essais", value: trials, color: "#22c55e" },
    { name: "Impayés", value: pastDue, color: "#eab308" },
    { name: "Expirés", value: expired, color: "#ef4444" },
  ];

  const modules = [
    "POS",
    "stock",
    "credits",
    "reports",
    "employees",
    "purchases",
    "multi-stores",
    "offline-sync",
  ];
  const moduleUsage = modules.map((m) => {
    const count = audits.filter((a) => a.entityType.toLowerCase().includes(m.replace("-", ""))).length;
    return { module: m, count };
  });
  const moduleUsageSorted = [...moduleUsage].sort((a, b) => b.count - a.count);

  const companyRows = companies.map((c) => {
    const agg = byCompany.find((x) => x.companyId === c.id);
    const ca = agg?.ca ?? 0;
    const count = agg?.sales ?? 0;
    const avg = count > 0 ? ca / count : 0;
    const cityName = stores.find((s) => s.companyId === c.id)?.city ?? "—";
    const sub = subscriptions.find((s) => s.companyId === c.id);
    const users = data.userRoles.filter((u) => u.companyId === c.id).length;
    const adoption = Math.min(100, Math.round((count / 30) * 100 + users * 4));
    const risk = Math.max(0, Math.min(100, (sub?.status === "expired" ? 55 : 20) + (count === 0 ? 30 : 0) + (sub?.status === "past_due" ? 20 : 0)));
    return {
      company: c.name,
      city: cityName,
      ca: formatCurrency(ca),
      sales: count,
      avgTicket: formatCurrency(avg),
      stores: companyStoreMap.get(c.id) ?? 0,
      activeUsers: users,
      plan: sub?.planCode ?? "—",
      subscriptionStatus: sub?.status ?? "none",
      adoption,
      churnRisk: risk,
      lastActivity: agg?.lastActivity ? format(new Date(agg.lastActivity), "dd/MM/yyyy") : "—",
      action: risk >= 70 ? "Relancer immédiatement" : risk >= 45 ? "Accompagner" : "Maintenir",
    };
  });

  const matrixRows = companyRows.map((r) => ({
    company: r.company,
    activity: r.sales,
    revenue: Number(r.ca.replace(/[^\d]/g, "")) || 0,
    risk: r.churnRisk,
    zone: r.churnRisk >= 70 ? "À relancer" : r.adoption >= 70 ? "Premium" : r.sales > 0 ? "À convertir" : "À accompagner",
  }));

  const topList = [
    ...topByCa.slice(0, 3).map((x) => `${x.companyName}: ${formatCurrency(x.ca)} de CA`),
    ...topBySales.slice(0, 2).map((x) => `${x.companyName}: ${x.sales} ventes`),
    ...topBoutiques.slice(0, 2).map((x) => `${x.name}: ${x.salesCount} ventes boutique`),
    ...topCities.slice(0, 2).map((x) => `${x.city}: ${formatCurrency(x.total)}`),
  ];
  const inactiveCompanies = companyRows.filter((r) => r.sales === 0).map((r) => r.company);
  const flopList = [
    `${inactiveCompanies.length} entreprises inactives`,
    `${expired} abonnements expirés`,
    `${trials} essais non convertis`,
    `${companyRows.filter((r) => r.churnRisk >= 65).length} entreprises en baisse d'activité`,
    `${companyRows.filter((r) => r.adoption < 35).length} entreprises à faible adoption`,
  ];

  const anomalies = [
    ...((dailyData.length > 2 && dailyData.some((d) => d.ca > (dailyData.reduce((s, x) => s + x.ca, 0) / Math.max(1, dailyData.length)) * 2)) ? ["Pic de ventes inhabituel détecté"] : []),
    ...(companyRows.some((r) => r.sales === 0 && r.subscriptionStatus === "active") ? ["Entreprise active sans abonnement détectée"] : []),
    ...(pastDue > 0 ? [`${pastDue} abonnements en impayé`] : []),
    ...(appErrors.length > 0 ? [`${appErrors.length} erreurs techniques récentes`] : []),
    ...(companyRows.filter((r) => r.churnRisk >= 70).length > 0 ? ["Risque churn élevé sur plusieurs clients"] : []),
  ];

  const forecast = [
    { label: "CA commerçants fin de période", value: formatCurrency(salesTotal * 1.12) },
    { label: "Revenus FasoStock estimés", value: formatCurrency(platformRevenue * 1.08) },
    { label: "Abonnements probables", value: `${Math.max(0, activeSubs + Math.round(trials * 0.35))}` },
    { label: "Clients à risque", value: `${companyRows.filter((r) => r.churnRisk >= 65).length}` },
    { label: "Clients convertibles", value: `${trials}` },
    { label: "Potentiel revenu conversion", value: formatCurrency(trials * 15000) },
  ];

  const recommendedDecisions = [
    {
      title: "Relancer les entreprises inactives",
      priority: "haute" as const,
      reason: `${inactiveCompanies.length} entreprises sans ventes sur la période.`,
      impact: formatCurrency(inactiveCompanies.length * 15000),
    },
    {
      title: "Convertir les essais actifs",
      priority: "haute" as const,
      reason: `${trials} essais en cours pouvant devenir payants.`,
      impact: formatCurrency(trials * 15000),
    },
    {
      title: "Traiter les impayés",
      priority: "moyenne" as const,
      reason: `${pastDue} abonnements en retard.`,
      impact: formatCurrency(unpaid),
    },
    {
      title: "Former les clients faible adoption",
      priority: "moyenne" as const,
      reason: `${companyRows.filter((r) => r.adoption < 35).length} clients sous-utilisent la plateforme.`,
      impact: "Hausse rétention",
    },
  ];

  const followUpRows = companyRows
    .filter((r) => r.churnRisk >= 55 || r.subscriptionStatus === "expired" || r.subscriptionStatus === "past_due")
    .slice(0, 12)
    .map((r) => ({
      company: r.company,
      reason: r.subscriptionStatus === "expired" ? "Abonnement expiré" : r.churnRisk >= 70 ? "Risque churn élevé" : "Impayé / usage faible",
      urgency: r.churnRisk >= 70 ? "Haute" : "Moyenne",
      potential: r.plan !== "—" ? formatCurrency(15000) : formatCurrency(10000),
      message: `Bonjour ${r.company}, nous pouvons vous aider à relancer vos ventes et sécuriser votre abonnement FasoStock. Disponibles pour un accompagnement rapide.`,
    }));

  const aiLines = [
    topByCa[0] ? `${topByCa[0].companyName} représente ${((topByCa[0].ca / Math.max(1, salesTotal)) * 100).toFixed(0)}% du CA total.` : "Aucun leader CA identifiable.",
    activeSubs === 0 && companiesActive > 0 ? "Aucun abonnement actif malgré une activité commerciale : priorité monétisation." : `${activeSubs} abonnements actifs enregistrés.`,
    `${companyRows.filter((r) => r.churnRisk >= 65).length} entreprises doivent être relancées en priorité.`,
    moduleUsageSorted[0] ? `Le module ${moduleUsageSorted[0].module} est le plus utilisé.` : "Usage modules insuffisant pour conclure.",
    `Risque principal: ${pastDue > 0 ? "impayés / monétisation" : "adoption produit hétérogène"}.`,
  ];

  const summaryLines = [
    `CA commerçants: ${formatCurrency(salesTotal)} • Ventes: ${salesCount}.`,
    `Entreprises actives: ${companiesActive}/${companies.length} • Abonnements actifs: ${activeSubs}.`,
    `Risque principal: ${pastDue > 0 ? "abonnements impayés" : "inactivité de certains clients"}.`,
    `Opportunité principale: convertir ${trials} essais en abonnements payants.`,
    `Priorité recommandée: relancer ${followUpRows.length} clients sensibles cette semaine.`,
  ];

  const scoreParts = [
    { label: "Activité", value: (companiesActive / Math.max(1, companies.length)) * 100 },
    { label: "Monétisation", value: (activeSubs / Math.max(1, companies.length)) * 100 },
    { label: "Adoption", value: adoptionAvg },
    { label: "Risque client", value: 100 - riskAvg },
    { label: "Santé technique", value: Math.max(0, 100 - appErrors.length * 3) },
    { label: "Synchronisation", value: Math.max(0, 85 - Math.max(0, anomalies.length - 1) * 5) },
  ];
  const performanceScore = scoreParts.reduce((s, p) => s + p.value, 0) / scoreParts.length;

  async function handleExportExcel() {
    const headers = [
      "Entreprise",
      "Ville",
      "CA",
      "Ventes",
      "Ticket moyen",
      "Boutiques",
      "Users actifs",
      "Plan",
      "Statut abonnement",
      "Adoption",
      "Risque churn",
      "Dernière activité",
      "Action",
    ];
    const rows = companyRows.map((r) => [
      r.company,
      r.city,
      r.ca,
      r.sales,
      r.avgTicket,
      r.stores,
      r.activeUsers,
      r.plan,
      r.subscriptionStatus,
      r.adoption,
      r.churnRisk,
      r.lastActivity,
      r.action,
    ]);
    await downloadProSpreadsheet(
      `admin-rapports-intelligence-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Rapports",
      headers,
      rows,
      {
        title: "FasoStock Super Admin — Rapports & Intelligence Décisionnelle",
        subtitle: `Période: ${rangePreset} • Mode: ${viewMode}`,
      },
    );
  }

  async function handleExportPdf() {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const pdfData: ReportsPageData = {
        salesSummary: {
          totalAmount: salesTotal,
          count: salesCount,
          itemsSold: salesCount,
          margin: 0,
        },
        ticketAverage: avgTicket,
        marginRatePercent: 0,
        salesByDay: dailyData.map((d) => ({
          date: d.fullDate,
          total: d.ca,
          count: d.sales,
        })),
        topProducts: [],
        leastProducts: [],
        salesByCategory: topCities.map((c) => ({
          categoryId: c.city,
          categoryName: c.city,
          revenue: c.total,
          quantity: 0,
        })),
        purchasesSummary: { totalAmount: 0, count: 0 },
        stockValue: { totalValue: 0, productCount: 0 },
        lowStockCount: 0,
        stockReport: null,
        // Vue plateforme : pas de comparatif période précédente (non utilisé par le PDF).
        previousSummary: { totalAmount: 0, count: 0, itemsSold: 0, margin: 0 },
      };

      const blob = await fetchReportsPdfBlob(pdfData, {
        title: "Rapports & Intelligence Décisionnelle — Super Admin",
        subtitle: `Période: ${rangePreset} • Mode: ${viewMode} • Généré le ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      }, { asPlatformAdmin: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport-super-admin-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingPdf(false);
    }
  }

  function handleGenerateAi() {
    alert(aiLines.join("\n"));
  }

  async function handleShare() {
    const text = aiLines.join(" ");
    if (navigator.share) {
      await navigator.share({
        title: "Rapports FasoStock",
        text,
      });
      return;
    }
    await navigator.clipboard.writeText(text);
  }

  function handleCopyMessage(message: string) {
    void navigator.clipboard.writeText(message);
  }

  return (
    <div className="space-y-6 bg-slate-50 p-5 md:p-8">
      <ReportHeader
        onExportPdf={() => void handleExportPdf()}
        onExportExcel={() => void handleExportExcel()}
        onGenerateAi={handleGenerateAi}
        onShare={() => void handleShare()}
      />
      {exportingPdf ? (
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600 shadow-sm">
          Génération du PDF en cours...
        </AdminCard>
      ) : null}

      <ReportFilters>
        <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={rangePreset} onChange={(e) => setRangePreset(e.target.value as RangePreset)}>
          <option value="today">Aujourd’hui</option>
          <option value="7d">7 jours</option>
          <option value="30d">30 jours</option>
          <option value="month">Mois actuel</option>
          <option value="year">Année</option>
          <option value="custom">Personnalisé</option>
        </select>
        <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="all">Entreprise</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="all">Boutique</option>
          {stores.filter((s) => companyId === "all" || s.companyId === companyId).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={city} onChange={(e) => setCity(e.target.value)}>
          {cityOptions.map((c) => (
            <option key={c} value={c}>
              {c === "all" ? "Ville" : c}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="all">Secteur d’activité</option>
          <option value="all">Tous (fallback)</option>
        </select>
        <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={subStatus} onChange={(e) => setSubStatus(e.target.value)}>
          <option value="all">Statut abonnement</option>
          <option value="active">Actif</option>
          <option value="trialing">Essai</option>
          <option value="past_due">Impayé</option>
          <option value="expired">Expiré</option>
          <option value="canceled">Annulé</option>
        </select>
        <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={planType} onChange={(e) => setPlanType(e.target.value)}>
          <option value="all">Type de plan</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
          <option value="unknown">Non renseigné</option>
        </select>
        <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)}>
          <option value="all">Niveau d’activité</option>
          <option value="high">Élevé</option>
          <option value="medium">Moyen</option>
          <option value="low">Faible</option>
        </select>
        <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
          <option value="all">Risque client</option>
          <option value="high">Élevé</option>
          <option value="medium">Moyen</option>
          <option value="low">Faible</option>
        </select>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3">
          <span className="text-xs font-semibold text-slate-600">Comparer période précédente</span>
          <input type="checkbox" checked={comparePrevious} onChange={(e) => setComparePrevious(e.target.checked)} />
        </div>
        <select className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)}>
          <option value="platform">Vue plateforme</option>
          <option value="company">Vue entreprise</option>
          <option value="store">Vue boutique</option>
        </select>
        <input type="date" className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
        <input type="date" className="h-10 rounded-xl border border-slate-300 px-2 text-sm" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
      </ReportFilters>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <ExecutiveSummaryCard lines={summaryLines} />
        <PerformanceScoreCard score={performanceScore} parts={scoreParts} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <DecisionKpiCard title="CA commerçants" value={formatCurrency(salesTotal)} />
        <DecisionKpiCard title="Ventes totales" value={String(salesCount)} />
        <DecisionKpiCard title="Ticket moyen" value={formatCurrency(avgTicket)} />
        <DecisionKpiCard title="Entreprises actives" value={String(companiesActive)} hint={`${companies.length} total`} />
        <DecisionKpiCard title="Boutiques actives" value={String(storesActive)} />
        <DecisionKpiCard title="Utilisateurs actifs" value={String(activeUsers)} />
        <DecisionKpiCard title="Revenus FasoStock" value={formatCurrency(platformRevenue)} />
        <DecisionKpiCard title="MRR" value={formatCurrency(mrr)} />
        <DecisionKpiCard title="ARR" value={formatCurrency(arr)} />
        <DecisionKpiCard title="Impayés" value={formatCurrency(unpaid)} tone={unpaid > 0 ? "warn" : "good"} />
        <DecisionKpiCard title="Essais gratuits" value={String(trials)} />
        <DecisionKpiCard title="Conversions" value={`${conversionRate.toFixed(1)}%`} />
        <DecisionKpiCard title="Churn" value={`${churnRate.toFixed(1)}%`} tone={churnRate > 20 ? "danger" : "default"} />
        <DecisionKpiCard title="Adoption moyenne" value={`${adoptionAvg}%`} />
        <DecisionKpiCard title="Risque moyen" value={`${riskAvg}%`} tone={riskAvg > 45 ? "warn" : "default"} />
      </div>

      <RevenueCharts>
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Évolution du CA commerçants</p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="caReport" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area dataKey="ca" stroke="#f97316" fill="url(#caReport)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Ventes par jour</p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="sales" fill="#2563eb" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Revenus FasoStock par période</p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={saasRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area dataKey="saas" stroke="#22c55e" fill="#22c55e33" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Abonnements par statut</p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={subStatusData} dataKey="value" nameKey="name" outerRadius={90} innerRadius={52}>
                  {subStatusData.map((x) => (
                    <Cell key={x.name} fill={x.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Top entreprises par CA</p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topByCa.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="companyName" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="ca" fill="#f97316" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Top entreprises par ventes</p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBySales.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="companyName" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="sales" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
      </RevenueCharts>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Répartition par ville</p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCities}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="city" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#22c55e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
        <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Utilisation des modules</p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moduleUsageSorted}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="module" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
      </div>

      <ActivityRevenueMatrix rows={matrixRows} />
      <TopFlopSection top={topList} flop={flopList} />
      <CompanyReportTable rows={companyRows} />
      <ProductAdoptionSection rows={moduleUsage.map((m) => ({ module: m.module, score: Math.min(100, m.count * 8), trend: m.count > 4 ? "up" : m.count > 1 ? "flat" : "down" }))} />
      <MonetizationReport rows={[
        { label: "Clients gratuits", value: String(freeClients) },
        { label: "Essais actifs", value: String(trials) },
        { label: "Clients payants", value: String(paidClients) },
        { label: "Abonnements expirés", value: String(expired) },
        { label: "Revenus encaissés", value: formatCurrency(cashIn) },
        { label: "Revenus attendus", value: formatCurrency(expectedRevenue) },
        { label: "Impayés", value: formatCurrency(unpaid) },
        { label: "Clients à convertir", value: String(trials) },
        { label: "Potentiel conversion", value: formatCurrency(trials * 15000) },
      ]} />
      <FollowUpClientsTable rows={followUpRows} onCopy={handleCopyMessage} />
      <AnomalyDetectionPanel items={anomalies.length > 0 ? anomalies : ["Aucune anomalie critique détectée."]} />
      <ForecastSection rows={forecast} />
      <RecommendedDecisions rows={recommendedDecisions} />
      <AiInsightsCard lines={aiLines} />
    </div>
  );
}
