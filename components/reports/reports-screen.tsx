"use client";

import {
  DashboardBarChart,
  DashboardPieChart,
} from "@/components/dashboard/dashboard-charts";
import { FsPullToRefresh } from "@/components/ui/fs-pull-to-refresh";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  FsSectionLabel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { ROUTES } from "@/lib/config/routes";
import { P } from "@/lib/constants/permissions";
import { fetchReportsPageData } from "@/lib/features/dashboard/api";
import { getDefaultDateRange } from "@/lib/features/dashboard/date-range";
import type { StockMovementByDay } from "@/lib/features/dashboard/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { listCategories, listProducts } from "@/lib/features/products/api";
import {
  downloadReportsExcel,
  downloadReportsPdfBlob,
} from "@/lib/features/reports/reports-export";
import { listCompanyUsers } from "@/lib/features/users/api";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  MdArrowBack,
  MdBarChart,
  MdCalendarMonth,
  MdCalendarToday,
  MdInventory2,
  MdLocalShipping,
  MdLockPerson,
  MdPictureAsPdf,
  MdReceiptLong,
  MdRefresh,
  MdSell,
  MdShoppingCart,
  MdShowChart,
  MdTableChart,
  MdTrendingUp,
  MdUploadFile,
  MdWarehouse,
  MdWarningAmber,
} from "react-icons/md";

type Period = "today" | "week" | "month";

function formatDateFr(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function NetStockLineChart({ data }: { data: StockMovementByDay[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-neutral-500">
        Aucun mouvement sur la période
      </div>
    );
  }
  const vals = data.map((d) => d.netQuantity);
  const minV = Math.min(0, ...vals);
  const maxV = Math.max(0, ...vals);
  const span = Math.max(maxV - minV, 1);
  const w = 100;
  const h = 100;
  const pad = 6;
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - 2 * pad);
    const v = d.netQuantity;
    const y = h - pad - ((v - minV) / span) * (h - 2 * pad);
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(" L ")}`;
  const zeroY =
    h - pad - ((0 - minV) / span) * (h - 2 * pad);
  return (
    <div className="h-[200px] min-[900px]:h-[220px] w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-full w-full overflow-visible"
        preserveAspectRatio="none"
        aria-hidden
      >
        <line
          x1={pad}
          x2={w - pad}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={0.4}
        />
        <path
          d={pathD}
          fill="none"
          stroke="var(--fs-accent)"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  colorClass,
  accentBorder,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  accentBorder?: boolean;
}) {
  return (
    <FsCard
      padding="p-4"
      className={cn(
        "flex min-h-[120px] flex-col justify-between",
        accentBorder && "border-2 border-fs-accent/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-xs text-neutral-600 min-[900px]:text-sm">{label}</p>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
            colorClass,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
      <div>
        <p className="text-base font-bold text-fs-text min-[900px]:text-lg">{value}</p>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-500">{subtitle}</p>
        ) : null}
      </div>
    </FsCard>
  );
}

export function ReportsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const {
    data: ctx,
    helpers,
    hasPermission,
    isLoading: permLoading,
  } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const companyName = ctx?.companyName ?? "";
  const stores = ctx?.stores ?? [];
  const ctxStoreId = ctx?.storeId ?? null;
  const storeLabel = ctxStoreId
    ? stores.find((s) => s.id === ctxStoreId)?.name
    : null;

  const isWide = useMediaQuery("(min-width: 900px)");
  const narrow = useMediaQuery("(max-width: 559px)");

  const [period, setPeriod] = useState<Period>("week");
  const [fromDate, setFromDate] = useState(() => getDefaultDateRange("week").from);
  const [toDate, setToDate] = useState(() => getDefaultDateRange("week").to);
  const [storePick, setStorePick] = useState<"unset" | "all" | string>("unset");
  const [cashierUserId, setCashierUserId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const effectiveStoreId =
    stores.length <= 1
      ? ctxStoreId
      : storePick === "unset"
        ? ctxStoreId
        : storePick === "all"
          ? null
          : storePick;

  const applyPeriod = (p: Period) => {
    setPeriod(p);
    const r = getDefaultDateRange(p);
    setFromDate(r.from);
    setToDate(r.to);
  };

  const onStoreSelectChange = (v: string) => {
    if (v === "") {
      setStorePick("all");
      try {
        localStorage.setItem("fs_active_store_id", "__all__");
      } catch {
        /* */
      }
    } else {
      setStorePick(v);
      try {
        localStorage.setItem("fs_active_store_id", v);
      } catch {
        /* */
      }
    }
    void qc.invalidateQueries({ queryKey: queryKeys.appContext });
  };

  const reportsParams = useMemo(
    () => ({
      companyId,
      storeId: effectiveStoreId,
      fromDate,
      toDate,
      cashierUserId,
      productId,
      categoryId,
    }),
    [
      companyId,
      effectiveStoreId,
      fromDate,
      toDate,
      cashierUserId,
      productId,
      categoryId,
    ],
  );

  const q = useQuery({
    queryKey: queryKeys.reports(reportsParams),
    queryFn: () => fetchReportsPageData(reportsParams),
    enabled: Boolean(companyId) && Boolean(helpers?.canReports),
    staleTime: 15_000,
  });

  const usersQ = useQuery({
    queryKey: queryKeys.companyUsers(companyId),
    queryFn: () => listCompanyUsers(companyId),
    enabled: Boolean(companyId) && Boolean(helpers?.canReports),
  });

  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProducts(companyId),
    enabled: Boolean(companyId) && Boolean(helpers?.canReports),
  });

  const categoriesQ = useQuery({
    queryKey: queryKeys.categories(companyId),
    queryFn: () => listCategories(companyId),
    enabled: Boolean(companyId) && Boolean(helpers?.canReports),
  });

  const refreshAll = useCallback(async () => {
    await q.refetch();
  }, [q]);

  const d = q.data;

  const description = companyName
    ? `Tableau de bord — ${companyName}${storeLabel ? ` · ${storeLabel}` : ""}`
    : "Rapports";

  const exportReportsPdf = useCallback(async () => {
    if (!d) return;
    try {
      const blob = await downloadReportsPdfBlob(d, {
        title: "Rapports",
        subtitle: description,
      });
      const name = `rapports_${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF enregistré.");
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Export PDF impossible."));
    }
  }, [d, description]);

  const exportReportsExcelWithToast = useCallback(() => {
    if (!d) return;
    void (async () => {
      try {
        await downloadReportsExcel(d);
        toast.success("Excel enregistré.");
      } catch (e) {
        toast.error(messageFromUnknownError(e, "Export Excel impossible."));
      }
    })();
  }, [d]);

  const canView = helpers?.canReports ?? false;

  const fallbackHref = useMemo(() => {
    const h = helpers;
    if (!h) return ROUTES.settings;
    if (h.canSales) return ROUTES.sales;
    if (h.canProducts) return ROUTES.products;
    if (h.canInventory) {
      return h.isCashier ? ROUTES.stockCashier : ROUTES.inventory;
    }
    if (h.canCustomers) return ROUTES.customers;
    if (h.canStores) return ROUTES.stores;
    return ROUTES.settings;
  }, [helpers]);

  const pieTotal = d
    ? d.salesByCategory.reduce((s, c) => s + c.revenue, 0)
    : 0;

  const selectedStoreName = effectiveStoreId
    ? stores.find((s) => s.id === effectiveStoreId)?.name ?? null
    : null;

  const resetFilters = () => {
    setCashierUserId(null);
    setProductId(null);
    setCategoryId(null);
  };

  if (permLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if (!canView) {
    const needGlobal = !hasPermission(P.reportsViewGlobal);
    const needStore = !hasPermission(P.reportsViewStore);
    const parts: string[] = [];
    if (needGlobal) parts.push("Voir les rapports (global)");
    if (needStore) parts.push("Voir les rapports (boutique)");
    const requiredText = parts.length ? parts.join(" + ") : "Voir les rapports";

    return (
      <FsPage>
        <FsCard padding="p-6" className="mx-auto max-w-md text-center">
          <MdLockPerson
            className="mx-auto h-14 w-14 text-red-600"
            aria-hidden
          />
          <h2 className="mt-3 text-lg font-extrabold text-fs-text">Accès restreint</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Vous n&apos;avez pas les permissions nécessaires pour afficher les rapports.
          </p>
          <p className="mt-3 text-sm font-bold text-neutral-700">
            Droit requis : {requiredText}
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
              } else {
                router.push(fallbackHref);
              }
            }}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white"
          >
            <MdArrowBack className="h-5 w-5" aria-hidden />
            Retour
          </button>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Rapports"
        subtitle={description}
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
      />

      <FsPullToRefresh onRefresh={refreshAll}>
        <FsCard className="mb-6" padding="p-4">
          <div className="flex flex-wrap gap-2">
            <FsFilterChip
              icon={MdCalendarToday}
              label="Aujourd'hui"
              selected={period === "today"}
              onClick={() => applyPeriod("today")}
            />
            <FsFilterChip
              icon={MdShowChart}
              label="Cette semaine"
              selected={period === "week"}
              onClick={() => applyPeriod("week")}
            />
            <FsFilterChip
              icon={MdBarChart}
              label="Ce mois"
              selected={period === "month"}
              onClick={() => applyPeriod("month")}
            />
          </div>

          <div
            className={cn(
              "mt-3 gap-3",
              narrow ? "flex flex-col" : "flex flex-wrap items-end",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="rep-from">
                Du
              </label>
              <input
                id="rep-from"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setFromDate(v);
                  if (toDate < v) setToDate(v);
                }}
                className={fsInputClass("max-w-[160px]")}
              />
              <span className="text-neutral-400">—</span>
              <label className="sr-only" htmlFor="rep-to">
                Au
              </label>
              <input
                id="rep-to"
                type="date"
                value={toDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setToDate(v);
                  if (fromDate > v) setFromDate(v);
                }}
                className={fsInputClass("max-w-[160px]")}
              />
            </div>
            <p className="pb-1 text-[11px] text-neutral-500 sm:text-xs">
              ({formatDateFr(fromDate)} — {formatDateFr(toDate)})
            </p>
          </div>

          {stores.length > 1 ? (
            <div className="mt-3">
              <label className="sr-only" htmlFor="reports-store">
                Boutique
              </label>
              <select
                id="reports-store"
                className={fsInputClass()}
                value={
                  storePick === "unset"
                    ? ctxStoreId ?? ""
                    : storePick === "all"
                      ? ""
                      : storePick
                }
                onChange={(e) => onStoreSelectChange(e.target.value)}
              >
                <option value="">Toutes les boutiques</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div
            className={cn(
              "mt-4 border-t border-black/[0.06] pt-4",
              narrow ? "space-y-3" : "grid gap-3 min-[700px]:grid-cols-3",
            )}
          >
            <div>
              <label className="mb-1 block text-[11px] font-medium text-neutral-600">
                Caissier
              </label>
              <select
                className={fsInputClass()}
                value={cashierUserId ?? ""}
                onChange={(e) =>
                  setCashierUserId(e.target.value === "" ? null : e.target.value)
                }
              >
                <option value="">Caissier (tous)</option>
                {(usersQ.data ?? [])
                  .filter((u) => u.isActive)
                  .map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.fullName?.trim() || u.roleName || u.userId.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-neutral-600">
                Produit
              </label>
              <select
                className={fsInputClass()}
                value={productId ?? ""}
                onChange={(e) =>
                  setProductId(e.target.value === "" ? null : e.target.value)
                }
              >
                <option value="">Produit (tous)</option>
                {(productsQ.data ?? [])
                  .filter((p) => p.is_active !== false)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-neutral-600">
                Catégorie
              </label>
              <select
                className={fsInputClass()}
                value={categoryId ?? ""}
                onChange={(e) =>
                  setCategoryId(e.target.value === "" ? null : e.target.value)
                }
              >
                <option value="">Catégorie (toutes)</option>
                {(categoriesQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="text-sm font-semibold text-fs-accent underline-offset-2 hover:underline"
            >
              Réinitialiser filtres
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-neutral-600">
            <MdCalendarToday className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">
              {formatDateFr(fromDate)} — {formatDateFr(toDate)}
            </span>
          </div>
        </FsCard>

        {q.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          </div>
        ) : null}

        {q.isError ? (
          <FsQueryErrorPanel error={q.error} onRetry={() => q.refetch()} />
        ) : null}

        {d ? (
          <>
            <div
              className={cn(
                "grid gap-3 sm:gap-4",
                isWide ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              <KpiCard
                label="Chiffre d'affaires"
                value={formatCurrency(d.salesSummary.totalAmount)}
                icon={MdTrendingUp}
                colorClass="bg-fs-accent/15 text-fs-accent"
                accentBorder
              />
              <KpiCard
                label="Ventes"
                value={String(d.salesSummary.count)}
                icon={MdShoppingCart}
                colorClass="bg-emerald-500/15 text-emerald-600"
              />
              <KpiCard
                label="Ticket moyen"
                value={formatCurrency(d.ticketAverage)}
                icon={MdReceiptLong}
                colorClass="bg-sky-500/15 text-sky-600"
              />
              <KpiCard
                label="Produits vendus"
                value={String(d.salesSummary.itemsSold)}
                icon={MdInventory2}
                colorClass="bg-blue-600/15 text-blue-700"
              />
              <KpiCard
                label="Marge"
                value={formatCurrency(d.salesSummary.margin)}
                subtitle={`Taux: ${d.marginRatePercent.toFixed(1)}%`}
                icon={MdSell}
                colorClass="bg-emerald-500/15 text-emerald-600"
              />
              <KpiCard
                label="Achats"
                value={formatCurrency(d.purchasesSummary.totalAmount)}
                subtitle={`${d.purchasesSummary.count} commandes`}
                icon={MdLocalShipping}
                colorClass="bg-amber-500/15 text-amber-700"
              />
              <KpiCard
                label="Valeur stock"
                value={formatCurrency(d.stockValue.totalValue)}
                subtitle={
                  effectiveStoreId
                    ? `${d.stockValue.productCount} produits`
                    : "—"
                }
                icon={MdWarehouse}
                colorClass="bg-violet-500/15 text-violet-700"
              />
            </div>

            <FsCard className="mt-6" padding="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <MdBarChart className="h-5 w-5 text-fs-accent" aria-hidden />
                <FsSectionLabel className="mb-0">
                  Chiffre d&apos;affaires par jour
                </FsSectionLabel>
              </div>
              <div className="mt-4">
                <DashboardBarChart data={d.salesByDay} />
              </div>
            </FsCard>

            <FsCard className="mt-6" padding="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <MdShowChart className="h-5 w-5 text-fs-accent" aria-hidden />
                <FsSectionLabel className="mb-0">Ventes par catégorie</FsSectionLabel>
              </div>
              <div className="mt-4 min-[560px]:grid min-[560px]:grid-cols-2 min-[560px]:gap-6">
                <DashboardPieChart
                  categories={d.salesByCategory}
                  total={pieTotal}
                  legendMax={narrow ? 4 : 6}
                />
              </div>
            </FsCard>

            <FsCard className="mt-6 overflow-hidden p-0">
              <div className="border-b border-black/[0.06] px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-fs-text">
                    Top 10 produits vendus
                  </h2>
                  <span className="rounded-md bg-fs-accent/15 px-2 py-0.5 text-[11px] font-bold text-fs-accent">
                    {d.topProducts.length} produits
                  </span>
                </div>
              </div>
              {d.topProducts.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-neutral-500">
                  Aucune vente sur la période
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="bg-fs-surface-container/80 text-[11px] text-neutral-600">
                        <th className="px-4 py-2 font-semibold">Produit</th>
                        <th className="px-2 py-2 text-right font-semibold">
                          Qté vendue
                        </th>
                        <th className="px-2 py-2 text-right font-semibold">CA</th>
                        <th className="px-2 py-2 text-right font-semibold">Marge</th>
                        <th className="px-3 py-2 text-right font-semibold">Rang</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.topProducts.map((p, i) => (
                        <tr
                          key={p.productId}
                          className="border-t border-black/[0.06] odd:bg-fs-card/50"
                        >
                          <td className="max-w-[200px] truncate px-4 py-2.5 font-medium text-fs-text">
                            {p.productName}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">
                            {p.quantitySold}
                          </td>
                          <td className="px-2 py-2.5 text-right font-semibold tabular-nums">
                            {formatCurrency(p.revenue)}
                          </td>
                          <td className="px-2 py-2.5 text-right font-medium tabular-nums text-emerald-700">
                            {formatCurrency(p.margin)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className={cn(
                                "inline-block min-w-[2rem] rounded-md px-2 py-0.5 text-center text-[11px] font-bold",
                                i < 3
                                  ? "bg-fs-accent/20 text-fs-accent"
                                  : "bg-fs-surface-container text-neutral-600",
                              )}
                            >
                              {i + 1}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {d.leastProducts.length > 0 ? (
                <>
                  <div className="border-t border-black/[0.06] px-4 py-3 sm:px-5">
                    <p className="text-sm font-semibold text-fs-text">
                      Produits les moins vendus (période)
                    </p>
                  </div>
                  <ul className="divide-y divide-black/[0.06] px-2 pb-2">
                    {d.leastProducts.map((p) => (
                      <li
                        key={`least-${p.productId}`}
                        className="flex items-center justify-between gap-3 px-2 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fs-text">
                            {p.productName}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            {p.quantitySold} vendu(s)
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-fs-text">
                          {formatCurrency(p.revenue)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </FsCard>

            <FsCard className="mt-6" padding="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <MdWarehouse className="h-5 w-5 text-fs-accent" aria-hidden />
                <FsSectionLabel className="mb-0">
                  Rapport de stock
                  {effectiveStoreId && selectedStoreName
                    ? ` — ${selectedStoreName}`
                    : ""}
                </FsSectionLabel>
              </div>
              {!effectiveStoreId ? (
                <p className="mt-3 text-sm text-neutral-600">
                  Sélectionnez une boutique pour voir le stock (filtres).
                </p>
              ) : d.stockReport ? (
                <>
                  <div
                    className={cn(
                      "mt-4 grid gap-3",
                      isWide ? "grid-cols-5" : "grid-cols-2 sm:grid-cols-3",
                    )}
                  >
                    <div className="rounded-[10px] bg-fs-surface-container/80 px-3 py-2.5">
                      <p className="text-[11px] text-neutral-600">Produits en stock</p>
                      <p className="mt-1 text-lg font-bold text-blue-700">
                        {d.stockReport.currentStockCount}
                      </p>
                    </div>
                    <div className="rounded-[10px] bg-fs-surface-container/80 px-3 py-2.5">
                      <p className="text-[11px] text-neutral-600">Rupture</p>
                      <p className="mt-1 text-lg font-bold text-red-600">
                        {d.stockReport.outOfStock.length}
                      </p>
                    </div>
                    <div className="rounded-[10px] bg-fs-surface-container/80 px-3 py-2.5">
                      <p className="text-[11px] text-neutral-600">Stock faible</p>
                      <p className="mt-1 text-lg font-bold text-amber-700">
                        {d.stockReport.lowStock.length}
                      </p>
                    </div>
                    <div className="rounded-[10px] bg-fs-surface-container/80 px-3 py-2.5">
                      <p className="text-[11px] text-neutral-600">Entrées</p>
                      <p className="mt-1 text-lg font-bold text-emerald-600">
                        {d.stockReport.entries}
                      </p>
                    </div>
                    <div className="rounded-[10px] bg-fs-surface-container/80 px-3 py-2.5">
                      <p className="text-[11px] text-neutral-600">Sorties</p>
                      <p className="mt-1 text-lg font-bold text-red-600">
                        {d.stockReport.exits}
                      </p>
                    </div>
                  </div>

                  {d.stockReport.byDayNet.length > 0 ? (
                    <div className="mt-6">
                      <p className="mb-2 text-xs font-medium text-neutral-600">
                        Mouvements nets par jour
                      </p>
                      <NetStockLineChart data={d.stockReport.byDayNet} />
                    </div>
                  ) : null}

                  {(d.stockReport.outOfStock.length > 0 ||
                    d.stockReport.lowStock.length > 0) && (
                    <div className="mt-6">
                      <p className="text-sm font-semibold text-fs-text">
                        Alertes stock
                      </p>
                      <ul className="mt-2 space-y-1">
                        {d.stockReport.outOfStock.slice(0, 5).map((a) => (
                          <li
                            key={`o-${a.productId}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-black/[0.06] px-3 py-2 text-xs"
                          >
                            <span className="min-w-0 truncate font-medium">
                              {a.productName}
                            </span>
                            <span className="shrink-0 text-red-600">
                              Rupture · seuil {a.threshold} · {a.quantity}
                            </span>
                          </li>
                        ))}
                        {d.stockReport.lowStock.slice(0, 5).map((a) => (
                          <li
                            key={`l-${a.productId}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-black/[0.06] px-3 py-2 text-xs"
                          >
                            <span className="min-w-0 truncate font-medium">
                              {a.productName}
                            </span>
                            <span className="shrink-0 text-amber-700">
                              Faible · seuil {a.threshold} · {a.quantity}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm text-neutral-600">
                  Impossible de charger le rapport de stock.
                </p>
              )}
            </FsCard>

            {d.lowStockCount > 0 ? (
              <FsCard className="mt-6" padding="p-3 sm:p-4">
                <div className="flex items-start gap-2 text-amber-700">
                  <MdWarningAmber className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                  <p className="text-xs font-semibold sm:text-sm">
                    {d.lowStockCount} produit(s) en alerte stock sur le périmètre
                    actuel.
                  </p>
                </div>
              </FsCard>
            ) : null}

            <FsCard className="mt-6" padding="p-4">
              <div className="flex items-center gap-2.5">
                <MdUploadFile className="h-[22px] w-[22px] text-fs-accent" aria-hidden />
                <h2 className="text-base font-semibold text-fs-text">Export</h2>
              </div>
              <p className="mt-2 text-xs text-neutral-600">
                PDF ou Excel : feuilles multiples, en-têtes colorés, filtres et mise
                en forme type tableau de bord.
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => void exportReportsPdf()}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-black/[0.12] bg-fs-card px-4 py-2.5 text-sm font-semibold text-fs-text"
                >
                  <MdPictureAsPdf className="h-5 w-5" aria-hidden />
                  Exporter PDF
                </button>
                <button
                  type="button"
                  onClick={exportReportsExcelWithToast}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-black/[0.12] bg-fs-card px-4 py-2.5 text-sm font-semibold text-fs-text"
                >
                  <MdTableChart className="h-5 w-5" aria-hidden />
                  Exporter Excel
                </button>
                <button
                  type="button"
                  onClick={() => q.refetch()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-black/[0.12] bg-fs-card text-fs-text"
                  aria-label="Rafraîchir"
                >
                  <MdRefresh className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </FsCard>
          </>
        ) : null}
      </FsPullToRefresh>
    </FsPage>
  );
}
