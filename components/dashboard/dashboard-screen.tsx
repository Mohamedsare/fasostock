"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  MdArrowBack,
  MdArrowForward,
  MdBarChart,
  MdBusiness,
  MdCalendarToday,
  MdDescription,
  MdInventory2,
  MdLocalShipping,
  MdLockPerson,
  MdPercent,
  MdPointOfSale,
  MdReceiptLong,
  MdShowChart,
  MdShoppingCart,
  MdStore,
  MdTableChart,
  MdTrendingUp,
  MdWarehouse,
  MdWarningAmber,
} from "react-icons/md";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { fetchDashboardData } from "@/lib/features/dashboard/api";
import { getDefaultDateRange } from "@/lib/features/dashboard/date-range";
import { useAppContext } from "@/lib/features/common/app-context";
import type { AccessHelpers } from "@/lib/features/permissions/access";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { P } from "@/lib/constants/permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { ROUTES, storeFactureTabPath } from "@/lib/config/routes";
import {
  fetchInvoiceTablePosEnabled,
  peekInvoiceTablePosEnabled,
} from "@/lib/features/settings/invoice-table-pos";
import { activityUiTerms } from "@/lib/features/activity/activity-profiles";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import {
  DashboardBarChart,
  DashboardLineChart,
  DashboardPieChart,
} from "@/components/dashboard/dashboard-charts";
import {
  FsPage,
  FsScreenHeader,
  FsSectionLabel,
} from "@/components/ui/fs-screen-primitives";

function getDashboardFallbackRoute(h: AccessHelpers): string {
  if (h.canSales) return ROUTES.sales;
  if (h.canProducts) return ROUTES.products;
  if (h.canInventory)
    return h.isCashier ? ROUTES.stockCashier : ROUTES.inventory;
  if (h.canCustomers) return ROUTES.customers;
  if (h.canPurchases) return ROUTES.purchases;
  if (h.canStores) return ROUTES.stores;
  /** Dernier recours — `dashboard_page.dart` Flutter (`return AppRoutes.settings`). */
  return ROUTES.settings;
}

/**
 * Aligné `CompanyProvider.setCurrentStoreId` (Flutter) : la boutique choisie sur le dashboard
 * doit devenir la boutique active pour toute l’app (Produits, POS, stock, etc.).
 * Sur le web : `fs_active_store_id` + invalidation du contexte React Query.
 */
function persistGlobalActiveStore(storeId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("fs_active_store_id", storeId);
  } catch {
    /* */
  }
}

export function DashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const ctx = useAppContext();

  const syncGlobalStoreFromDashboard = useCallback(
    (storeId: string | null) => {
      if (!storeId) return;
      persistGlobalActiveStore(storeId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    [queryClient],
  );
  const { hasPermission, helpers, isLoading: permLoading } = usePermissions();
  const isWide = useMediaQuery("(min-width: 900px)");

  const [scope, setScope] = useState<"company" | "store">("company");
  const [dashboardStoreId, setDashboardStoreId] = useState<string | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const [selectedDay, setSelectedDay] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );

  const companyId = ctx.data?.companyId ?? "";
  const stores = ctx.data?.stores ?? [];
  const ctxStoreId = ctx.data?.storeId ?? null;

  useEffect(() => {
    if (scope !== "store") return;
    if (dashboardStoreId) return;
    if (stores.length === 0) return;
    setDashboardStoreId(ctxStoreId ?? stores[0]?.id ?? null);
  }, [scope, dashboardStoreId, stores, ctxStoreId]);

  const effectiveStoreId = scope === "company" ? null : dashboardStoreId;

  const canDash = hasPermission(P.dashboardView);
  const canPosQuick = hasPermission(P.salesCreate);
  const canInvoiceA4 =
    hasPermission(P.salesInvoiceA4) || hasPermission(P.salesCreate);

  const peekFactureTab =
    companyId.length > 0 ? peekInvoiceTablePosEnabled(companyId) : undefined;
  const invoiceTableDashQ = useQuery({
    queryKey: queryKeys.invoiceTablePosEnabled(companyId),
    queryFn: () => fetchInvoiceTablePosEnabled(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    ...(peekFactureTab !== undefined ? { initialData: peekFactureTab } : {}),
  });
  const canFactureTab =
    hasPermission(P.salesInvoiceA4Table) &&
    canInvoiceA4 &&
    (invoiceTableDashQ.data ?? false);

  useEffect(() => {
    if (scope === "store" && stores.length === 0) setScope("company");
  }, [scope, stores.length]);

  const dashQ = useQuery({
    queryKey: queryKeys.dashboard({
      companyId,
      storeId: effectiveStoreId,
      period,
      selectedDay,
    }),
    queryFn: () =>
      fetchDashboardData({
        companyId,
        storeId: effectiveStoreId,
        period,
        selectedDay,
      }),
    enabled:
      !!companyId &&
      canDash &&
      (scope !== "store" || !!effectiveStoreId),
  });

  const range = useMemo(() => getDefaultDateRange(period), [period]);
  const companyName = ctx.data?.companyName ?? "";
  const storeName =
    stores.find((s) => s.id === dashboardStoreId)?.name ?? "";
  const terms = activityUiTerms(ctx.data?.businessTypeSlug);
  const description =
    scope === "company"
      ? `Vue Entreprise — ${companyName}`
      : `Vue ${terms.storeSingular} — ${storeName}`;

  const d = dashQ.data;
  const marginRate =
    d && d.salesSummary.totalAmount > 0
      ? ((d.salesSummary.margin / d.salesSummary.totalAmount) * 100).toFixed(1)
      : "0";

  const totalCat =
    d?.salesByCategory.reduce((s, e) => s + e.revenue, 0) ?? 0;

  const dayLabel = useMemo(() => {
    try {
      return format(parseISO(selectedDay), "EEEE d MMMM yyyy", {
        locale: fr,
      });
    } catch {
      return selectedDay;
    }
  }, [selectedDay]);

  const footerFrom = useMemo(() => {
    try {
      return format(parseISO(range.from), "dd MMM yyyy", { locale: fr });
    } catch {
      return range.from;
    }
  }, [range.from]);

  const footerTo = useMemo(() => {
    try {
      return format(parseISO(range.to), "dd MMM yyyy", { locale: fr });
    } catch {
      return range.to;
    }
  }, [range.to]);

  if (ctx.isLoading || permLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
      </div>
    );
  }

  if (!ctx.isLoading && helpers && !canDash) {
    const fallback = getDashboardFallbackRoute(helpers);
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-fs-card p-6 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <MdLockPerson className="h-14 w-14 text-red-600" aria-hidden />
            <h2 className="mt-3 text-xl font-extrabold text-neutral-900">
              Accès restreint
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Votre rôle ne dispose pas des permissions nécessaires pour afficher
              cette section.
            </p>
            <p className="mt-3 text-sm font-bold text-neutral-500">
              Droit requis : Voir le tableau de bord
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  router.back();
                } else {
                  router.push(fallback);
                }
              }}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white"
            >
              <MdArrowBack className="h-4 w-4" aria-hidden />
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12 text-center text-sm text-neutral-600">
        Aucune entreprise. Contactez l’administrateur.
      </div>
    );
  }

  return (
    <FsPage className="flex flex-col min-[900px]:pt-6">
      <div className="mb-3 flex items-start gap-3 min-[900px]:mb-5">
        <FsScreenHeader
          title={terms.dashboardTitle}
          subtitle={description}
          className="mb-0 min-w-0 flex-1"
          titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
          subtitleClassName="min-[900px]:text-base min-[900px]:leading-normal"
        />
      </div>

      <section
        id="dashboard-vue-periode"
        className="rounded-xl border border-black/[0.06] bg-fs-card p-3 shadow-sm sm:rounded-2xl sm:p-4"
      >
        <FsSectionLabel>Vue & période</FsSectionLabel>
        <p className="mt-1 text-[11px] leading-snug text-neutral-500 sm:text-xs">
          Ces choix s&apos;appliquent au tableau (KPI, graphiques « Chiffre d&apos;affaires par jour »,
          « Évolution du CA », etc.).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setScope("company");
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors",
              scope === "company"
                ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-[var(--fs-accent)]"
                : "border-black/[0.08] bg-fs-surface text-neutral-800",
            )}
          >
            <MdBusiness
              className={cn(
                "h-[18px] w-[18px]",
                scope === "company" ? "text-[var(--fs-accent)]" : "text-neutral-500",
              )}
              aria-hidden
            />
            Entreprise
          </button>
          {stores.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setScope("store");
                const id =
                  dashboardStoreId ?? ctxStoreId ?? stores[0]?.id ?? null;
                setDashboardStoreId(id);
                if (id) syncGlobalStoreFromDashboard(id);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors",
                scope === "store"
                  ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-[var(--fs-accent)]"
                  : "border-black/[0.08] bg-fs-surface text-neutral-800",
              )}
            >
              <MdStore
                className={cn(
                  "h-[18px] w-[18px]",
                  scope === "store" ? "text-[var(--fs-accent)]" : "text-neutral-500",
                )}
                aria-hidden
              />
              {terms.storeSingular}
            </button>
          ) : (
            <button
              type="button"
              disabled
              title={`Aucune ${terms.storeSingular.toLowerCase()} enregistrée. Créez une ${terms.storeSingular.toLowerCase()} dans le menu ${terms.storesPlural}.`}
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-black/[0.06] bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-400"
            >
              <MdStore className="h-[18px] w-[18px] text-neutral-400" aria-hidden />
              {terms.storeSingular}
            </button>
          )}
          {scope === "store" && stores.length > 1 ? (
            <label className="flex min-w-0 max-w-[200px] flex-1 items-center gap-2">
              <span className="sr-only">{terms.storeSingular}</span>
              <select
                value={dashboardStoreId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  setDashboardStoreId(id);
                  if (id) syncGlobalStoreFromDashboard(id);
                }}
                className="w-full min-w-0 rounded-lg border border-black/[0.12] bg-white px-2 py-2 text-sm"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["today", "Aujourd'hui"],
              ["week", "Semaine"],
              ["month", "Mois"],
            ] as const
          ).map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold",
                period === p
                  ? "bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-[var(--fs-accent)]"
                  : "bg-fs-surface text-neutral-700",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {dashQ.isLoading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : dashQ.isError ? (
        <div className="mt-3 min-[900px]:mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {(dashQ.error as Error)?.message ?? "Impossible de charger le tableau de bord."}
        </div>
      ) : d ? (
        <>
          {/* Stats du jour */}
          <section className="mt-3 min-[900px]:mt-5 rounded-xl border-2 border-[color-mix(in_srgb,var(--fs-accent)_35%,transparent)] bg-fs-card shadow-sm">
            <div className="border-b border-black/[0.06] p-3 min-[600px]:px-5 min-[600px]:py-3">
              <div className="flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
                <div className="flex items-center gap-2">
                  <MdCalendarToday className="h-[22px] w-[22px] shrink-0 text-[var(--fs-accent)]" aria-hidden />
                  <span className="text-sm font-semibold text-neutral-900">
                    Statistiques du jour
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={selectedDay}
                    max={format(new Date(), "yyyy-MM-dd")}
                    onChange={(e) => setSelectedDay(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-black/[0.12] px-2 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDay(format(new Date(), "yyyy-MM-dd"))
                    }
                    className="shrink-0 rounded-lg border border-black/[0.1] px-3 py-2 text-sm font-medium text-[var(--fs-accent)]"
                  >
                    Aujourd&apos;hui
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-neutral-500">{dayLabel}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 min-[600px]:grid-cols-5 min-[600px]:gap-3 min-[600px]:p-5">
              <DayStat label="CA du jour" value={formatCurrency(d.daySalesSummary.totalAmount)} />
              <DayStat label="Ventes" value={`${d.daySalesSummary.count}`} />
              <DayStat label="Articles vendus" value={`${d.daySalesSummary.itemsSold}`} />
              <DayStat
                label="Marge du jour"
                value={formatCurrency(d.daySalesSummary.margin)}
                highlight
              />
              <DayStat
                label={`${terms.purchasesTitle} du jour`}
                value={`${formatCurrency(d.dayPurchasesSummary.totalAmount)}\n${d.dayPurchasesSummary.count} commande(s)`}
              />
            </div>
          </section>

          {/* KPI */}
          <section className="mt-3 min-[900px]:mt-5 grid grid-cols-2 gap-2 min-[600px]:grid-cols-3 min-[900px]:grid-cols-4 min-[900px]:gap-4">
            <KpiCard
              label="Chiffre d'affaires"
              value={formatCurrency(d.salesSummary.totalAmount)}
              icon={MdTrendingUp}
              color="var(--fs-accent)"
              accent
            />
            <KpiCard
              label="Ventes"
              value={`${d.salesSummary.count}`}
              icon={MdShoppingCart}
              color="#059669"
            />
            <KpiCard
              label="Ticket moyen"
              value={formatCurrency(d.ticketAverage)}
              icon={MdReceiptLong}
              color="#0EA5E9"
            />
            <KpiCard
              label={`${terms.productsTitle} vendus`}
              value={`${d.salesSummary.itemsSold}`}
              icon={MdInventory2}
              color="#2563EB"
            />
            <KpiCard
              label="Marge"
              value={formatCurrency(d.salesSummary.margin)}
              icon={MdPercent}
              color="#059669"
              subtitle={`${marginRate}%`}
            />
            <KpiCard
              label={terms.purchasesTitle}
              value={formatCurrency(d.purchasesSummary.totalAmount)}
              icon={MdLocalShipping}
              color="#D97706"
              subtitle={`${d.purchasesSummary.count} commandes`}
            />
            <KpiCard
              label="Valeur stock"
              value={formatCurrency(d.stockValue.totalValue)}
              icon={MdWarehouse}
              color="#7C3AED"
              subtitle={`${d.stockValue.productCount} produits`}
            />
            <KpiCard
              label="Alertes stock"
              value={`${d.lowStockCount}`}
              icon={MdWarningAmber}
              color="#D97706"
              inventoryLink={d.lowStockCount > 0 ? ROUTES.inventory : undefined}
            />
          </section>

          {/* Charts — ordre mobile = Flutter : barres → top 5 → évolution + catégories → raccourcis */}
          {isWide ? (
            <div className="mt-3 min-[900px]:mt-5 grid grid-cols-1 gap-6 min-[900px]:grid-cols-[2fr_340px]">
              <ChartCard title="Chiffre d'affaires par jour" icon={MdBarChart}>
                <DashboardBarChart data={d.salesByDay} />
              </ChartCard>
              <div>
                <ChartCard title="Top 5 produits" smallTitle>
                  <TopProductsList products={d.topProducts} />
                  <Link
                    href={ROUTES.reports}
                    className="mt-2 flex w-full items-center justify-center gap-2 border-t border-black/[0.06] py-3 text-sm font-medium text-[var(--fs-accent)]"
                  >
                    Voir les rapports
                    <MdArrowForward className="h-4 w-4" aria-hidden />
                  </Link>
                </ChartCard>
              </div>
            </div>
          ) : (
            <>
              <ChartCard
                title="Chiffre d'affaires par jour"
                icon={MdBarChart}
                className="mt-3 min-[900px]:mt-5"
              >
                <DashboardBarChart data={d.salesByDay} />
              </ChartCard>
              <ChartCard title="Top 5 produits" smallTitle className="mt-6">
                <TopProductsList products={d.topProducts} />
                <Link
                  href={ROUTES.reports}
                  className="mt-2 flex w-full items-center justify-center gap-2 border-t border-black/[0.06] py-3 text-sm font-medium text-[var(--fs-accent)]"
                >
                  Voir les rapports
                  <MdArrowForward className="h-4 w-4" aria-hidden />
                </Link>
              </ChartCard>
            </>
          )}

          {isWide ? (
            <>
              <Shortcuts
                className="mt-6"
                canPosQuick={canPosQuick}
                canInvoiceA4={canInvoiceA4}
                canFactureTab={canFactureTab}
                storeId={effectiveStoreId ?? ctxStoreId}
                purchasesLabel={terms.purchasesTitle}
              />
              <div className="mt-7 grid grid-cols-2 gap-9">
                <ChartCard title="Évolution du CA" icon={MdShowChart}>
                  <DashboardLineChart data={d.salesByDay} />
                </ChartCard>
                <ChartCard title="Ventes par catégorie">
                  <DashboardPieChart
                    categories={d.salesByCategory}
                    total={totalCat}
                    legendMax={6}
                  />
                </ChartCard>
              </div>
            </>
          ) : (
            <>
              <div className="mt-6 flex flex-col gap-5">
                <ChartCard title="Évolution du CA" icon={MdShowChart}>
                  <DashboardLineChart data={d.salesByDay} />
                </ChartCard>
                <ChartCard title="Ventes par catégorie">
                  <DashboardPieChart
                    categories={d.salesByCategory}
                    total={totalCat}
                    legendMax={4}
                  />
                </ChartCard>
              </div>
              <Shortcuts
                className="mt-6"
                canPosQuick={canPosQuick}
                canInvoiceA4={canInvoiceA4}
                canFactureTab={canFactureTab}
                storeId={effectiveStoreId ?? ctxStoreId}
                purchasesLabel={terms.purchasesTitle}
              />
            </>
          )}

          <p className="mt-3 min-[900px]:mt-5 text-center text-[11px] text-neutral-500 sm:text-xs">
            Période : {footerFrom} — {footerTo}
          </p>
        </>
      ) : null}
    </FsPage>
  );
}

function DayStat({
  label,
  value,
  highlight,
  className,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-neutral-100/80 px-3 py-2.5 min-[600px]:px-3 min-[600px]:py-3",
        className,
      )}
    >
      <p className="text-[11px] font-medium text-neutral-500">{label}</p>
      <p
        className={cn(
          "mt-1 whitespace-pre-line text-sm font-bold leading-tight text-neutral-900 min-[600px]:text-base",
          highlight && "text-emerald-600",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  subtitle,
  accent,
  inventoryLink,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  subtitle?: string;
  accent?: boolean;
  inventoryLink?: string;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium leading-tight text-neutral-500 min-[600px]:text-xs">
          {label}
        </span>
        <span
          className="rounded-lg p-1.5 min-[600px]:p-2"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <p
        className="mt-2 text-base font-bold tabular-nums leading-tight text-neutral-900 min-[600px]:text-lg"
        style={color === "#059669" ? { color: "#059669" } : undefined}
      >
        {value}
      </p>
      {subtitle ? (
        <p className="mt-0.5 text-[10px] text-neutral-500">{subtitle}</p>
      ) : null}
      {inventoryLink ? (
        <p className="mt-1 text-[10px] font-semibold text-red-600">
          Voir inventaire <MdArrowForward className="inline h-3 w-3" aria-hidden />
        </p>
      ) : null}
    </>
  );

  if (inventoryLink) {
    return (
      <Link
        href={inventoryLink}
        className={cn(
          "block rounded-xl border bg-fs-card p-3 shadow-sm min-[600px]:p-4",
          accent
            ? "border-[color-mix(in_srgb,var(--fs-accent)_40%,transparent)]"
            : "border-black/[0.06]",
        )}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-fs-card p-3 shadow-sm min-[600px]:p-4",
        accent
          ? "border-[color-mix(in_srgb,var(--fs-accent)_40%,transparent)]"
          : "border-black/[0.06]",
      )}
    >
      {inner}
    </div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  smallTitle,
  className,
  children,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  smallTitle?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-black/[0.06] bg-fs-card shadow-sm",
        className,
      )}
    >
      <div className={cn("border-b border-black/[0.06] px-3 py-3 min-[900px]:px-5", smallTitle && "py-2.5")}>
        <div className="flex items-center gap-2">
          {Icon ? (
            <Icon className="h-[22px] w-[22px] text-[var(--fs-accent)]" aria-hidden />
          ) : null}
          <h2
            className={cn(
              "font-semibold text-neutral-900",
              smallTitle
                ? "text-xs min-[900px]:text-base"
                : "text-sm min-[900px]:text-base",
            )}
          >
            {title}
          </h2>
        </div>
      </div>
      <div className="p-3 min-[900px]:p-5">{children}</div>
    </section>
  );
}

function TopProductsList({
  products,
}: {
  products: { productName: string; revenue: number }[];
}) {
  if (products.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-500">
        Aucune vente sur la période
      </p>
    );
  }
  return (
    <ul className="divide-y divide-black/[0.06]">
      {products.map((p, i) => (
        <li
          key={`${p.productName}-${i}`}
          className="flex items-center gap-3 py-2.5 first:pt-0"
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
              i < 3
                ? "bg-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)] text-[var(--fs-accent)]"
                : "bg-neutral-100 text-neutral-600",
            )}
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{p.productName}</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {formatCurrency(p.revenue)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Shortcuts({
  className,
  canPosQuick,
  canInvoiceA4,
  canFactureTab,
  storeId,
  purchasesLabel,
}: {
  className?: string;
  canPosQuick: boolean;
  canInvoiceA4: boolean;
  canFactureTab: boolean;
  storeId: string | null;
  purchasesLabel: string;
}) {
  const tiles: {
    label: string;
    href: string;
    icon: ComponentType<{ className?: string }>;
    color: string;
  }[] = [];
  if (canPosQuick) {
    tiles.push({
      label: "Caisse rapide",
      href: storeId ? `${ROUTES.stores}/${storeId}/pos-quick` : ROUTES.stores,
      icon: MdPointOfSale,
      color: "var(--fs-accent)",
    });
  }
  if (canInvoiceA4) {
    tiles.push({
      label: "Facture A4",
      href: storeId ? `${ROUTES.stores}/${storeId}/pos` : ROUTES.stores,
      icon: MdDescription,
      color: "#059669",
    });
  }
  if (canFactureTab) {
    tiles.push({
      label: "Facture (tableau)",
      href: storeId ? storeFactureTabPath(storeId) : ROUTES.stores,
      icon: MdTableChart,
      color: "#EA580C",
    });
  }
  tiles.push(
    {
      label: "Ventes",
      href: ROUTES.sales,
      icon: MdShoppingCart,
      color: "#2563EB",
    },
    {
      label: "Inventaire",
      href: ROUTES.inventory,
      icon: MdWarehouse,
      color: "#2563EB",
    },
    {
      label: purchasesLabel,
      href: ROUTES.purchases,
      icon: MdLocalShipping,
      color: "#D97706",
    },
  );

  return (
    <section
      className={cn(
        "shrink-0 rounded-xl border border-black/[0.06] bg-fs-card p-3 shadow-sm min-[900px]:p-4",
        className,
      )}
    >
      <h2 className="text-sm font-semibold text-neutral-900">Raccourcis</h2>
      <div className="mt-3 grid grid-cols-2 gap-2.5 min-[560px]:grid-cols-3 min-[780px]:grid-cols-4 min-[1000px]:grid-cols-5">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="flex min-h-[52px] items-center gap-3 rounded-xl border border-black/[0.08] px-3 py-2.5 transition-colors active:bg-neutral-50"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${t.color}1f`, color: t.color }}
            >
              <t.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 truncate text-sm font-medium">{t.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
