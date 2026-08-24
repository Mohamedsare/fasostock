"use client";

import {
  DashboardBarChart,
  DashboardPieChart,
} from "@/components/dashboard/dashboard-charts";
import { FsPullToRefresh } from "@/components/ui/fs-pull-to-refresh";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsSectionLabel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { ROUTES } from "@/lib/config/routes";
import { P } from "@/lib/constants/permissions";
import {
  fetchReportsPageData,
  fetchTeamPerformance,
} from "@/lib/features/dashboard/api";
import { getDefaultDateRange } from "@/lib/features/dashboard/date-range";
import type {
  SalesSummary,
  StockMovementByDay,
} from "@/lib/features/dashboard/types";
import { activityUiTerms } from "@/lib/features/activity/activity-profiles";
import { PharmacyReportsCard } from "@/components/reports/pharmacy-reports-card";
import { TeamPerformanceCard } from "@/components/reports/team-performance-card";
import { expiryModuleOverride } from "@/lib/features/permissions/access";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { listCategories, listProducts } from "@/lib/features/products/api";
import {
  downloadReportsExcel,
  downloadReportsPdfBlob,
} from "@/lib/features/reports/reports-export";
import { listCompanyUsers } from "@/lib/features/users/api";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { queryKeys } from "@/lib/query/query-keys";
import { applyActiveStoreChange } from "@/lib/features/stores/active-store";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  MdArrowBack,
  MdBarChart,
  MdCalendarToday,
  MdClose,
  MdExpandMore,
  MdFilterAlt,
  MdGroups,
  MdInsights,
  MdInventory2,
  MdLocalShipping,
  MdLockPerson,
  MdPictureAsPdf,
  MdReceiptLong,
  MdRefresh,
  MdSell,
  MdShoppingCart,
  MdShowChart,
  MdStorefront,
  MdTableChart,
  MdTrendingDown,
  MdTrendingUp,
  MdTune,
  MdWarehouse,
  MdWarningAmber,
  MdWidgets,
} from "react-icons/md";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

type Period = "today" | "week" | "month" | "custom";
type Tab = "overview" | "team" | "products" | "stock";

const PERIODS: { key: Exclude<Period, "custom">; label: string; short: string }[] = [
  { key: "today", label: "Aujourd'hui", short: "Auj." },
  { key: "week", label: "Cette semaine", short: "Semaine" },
  { key: "month", label: "Ce mois", short: "Mois" },
];

function formatDateFr(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("fr-FR", {
    timeZone: getActiveTimeZone(),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** « 01 juil. » — format court de la barre repliée. */
function formatDateCompact(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("fr-FR", {
    timeZone: getActiveTimeZone(), day: "2-digit", month: "short" });
}

function pctDelta(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / prev) * 100;
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
  const zeroY = h - pad - ((0 - minV) / span) * (h - 2 * pad);
  return (
    <div className="h-[200px] w-full min-[900px]:h-[220px]">
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

/** Palette sémantique des cartes KPI (fond dégradé + filigrane), alignée sur le tableau de bord propriétaire. */
const KPI_THEMES = {
  revenue: { from: "#E85D2C", to: "#C2410C" },
  sales: { from: "#2563EB", to: "#1D4ED8" },
  ticket: { from: "#0EA5E9", to: "#0284C7" },
  items: { from: "#0D9488", to: "#0F766E" },
  margin: { from: "#059669", to: "#047857" },
  purchases: { from: "#D97706", to: "#B45309" },
  stock: { from: "#7C3AED", to: "#6D28D9" },
} as const;

/**
 * Carte KPI « héros » : dégradé sémantique, filigrane d'icône, delta vs période
 * précédente. Lecture instantanée du chiffre même sur petit écran.
 */
function KpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  theme,
  deltaPct,
  featured = false,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  theme: { from: string; to: string };
  deltaPct?: number | null;
  /** Carte principale (CA) : occupe deux colonnes sur mobile. */
  featured?: boolean;
}) {
  const hasDelta = deltaPct !== undefined;
  const up = deltaPct != null && deltaPct > 0;
  const down = deltaPct != null && deltaPct < 0;
  return (
    <div
      className={cn(
        "group relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-[6px] p-3 text-white shadow-sm transition-transform duration-300 hover:-translate-y-0.5",
        featured && "col-span-2 min-h-[124px] min-[900px]:col-span-1",
      )}
      style={{
        background: `linear-gradient(160deg, ${theme.from} 0%, ${theme.from} 60%, ${theme.to} 100%)`,
      }}
    >
      <Icon
        className="pointer-events-none absolute -bottom-2 -right-2 h-16 w-16 text-white/15 transition-transform duration-500 group-hover:scale-110"
        aria-hidden
      />
      <p className="relative text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/85">
        {label}
      </p>
      <div className="relative">
        <p
          className={cn(
            "break-words font-black leading-none tabular-nums",
            featured ? "text-xl min-[900px]:text-2xl" : "text-base min-[900px]:text-lg",
          )}
        >
          {value}
        </p>
        {hasDelta ? (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold">
            {deltaPct == null ? (
              <span className="text-white/70">— vs période précédente</span>
            ) : (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5",
                  up ? "text-[#D9F99D]" : down ? "text-[#FECACA]" : "text-white/80",
                )}
              >
                {up ? (
                  <MdTrendingUp className="h-3.5 w-3.5" aria-hidden />
                ) : down ? (
                  <MdTrendingDown className="h-3.5 w-3.5" aria-hidden />
                ) : null}
                {deltaPct >= 0 ? "+" : ""}
                {deltaPct.toFixed(1)}% vs préc.
              </span>
            )}
          </p>
        ) : null}
        {subtitle ? (
          <p className="mt-1 truncate text-[10px] font-medium text-white/80">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Zone repliable animée : `grid-template-rows` 0fr → 1fr, seule technique CSS qui
 * anime réellement une hauteur inconnue sans mesure JS. Contenu retiré du focus
 * et des lecteurs d'écran quand replié.
 */
function CollapsePanel({
  id,
  open,
  children,
}: {
  id: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className={cn(
        "grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out",
        open ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
      )}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** Puce de filtre actif, retirable d'un geste. */
function ActiveFilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-[4px] bg-fs-accent/15 py-1 pl-2.5 pr-1 text-[11px] font-bold text-fs-accent">
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Retirer le filtre ${label}`}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] hover:bg-fs-accent/20"
      >
        <MdClose className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <FsCard className={cn("overflow-hidden rounded-[6px] p-0 sm:rounded-[6px]", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] bg-fs-accent/12 text-fs-accent">
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <h2 className="min-w-0 truncate text-[14px] font-extrabold text-fs-text min-[900px]:text-base">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
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
  const stores = useMemo(() => ctx?.stores ?? [], [ctx?.stores]);
  const ctxStoreId = ctx?.storeId ?? null;
  const storeLabel = ctxStoreId
    ? stores.find((s) => s.id === ctxStoreId)?.name
    : null;

  const isWide = useMediaQuery("(min-width: 900px)");
  const narrow = useMediaQuery("(max-width: 559px)");

  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("week");
  const [fromDate, setFromDate] = useState(() => getDefaultDateRange("week").from);
  const [toDate, setToDate] = useState(() => getDefaultDateRange("week").to);
  const [storePick, setStorePick] = useState<"unset" | "all" | string>("unset");
  const [cashierUserId, setCashierUserId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  /** Un seul panneau ouvert à la fois : la page reste dense. */
  const [panel, setPanel] = useState<"period" | "filters" | null>(null);
  const togglePanel = useCallback(
    (p: "period" | "filters") => setPanel((cur) => (cur === p ? null : p)),
    [],
  );

  /**
   * Suivre la boutique active quand elle change ailleurs (barre supérieure).
   * Cet écran n'est pas remonté au changement de boutique — il perdrait sa
   * période, son onglet et ses filtres — donc il se recale lui-même en
   * repassant sur « unset », qui suit `ctxStoreId` (affichage compris).
   */
  const lastSyncedCtxStore = useRef<string | null>(null);
  useEffect(() => {
    if (!ctxStoreId) return;
    const previous = lastSyncedCtxStore.current;
    lastSyncedCtxStore.current = ctxStoreId;
    if (previous === null || previous === ctxStoreId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation sur une préférence externe (boutique active)
    setStorePick("unset");
  }, [ctxStoreId]);

  const effectiveStoreId =
    stores.length <= 1
      ? ctxStoreId
      : storePick === "unset"
        ? ctxStoreId
        : storePick === "all"
          ? null
          : storePick;

  const applyPeriod = (p: Exclude<Period, "custom">) => {
    setPeriod(p);
    const r = getDefaultDateRange(p);
    setFromDate(r.from);
    setToDate(r.to);
  };

  const onStoreSelectChange = (v: string) => {
    setStorePick(v === "" ? "all" : v);
    applyActiveStoreChange(qc, v === "" ? null : v);
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
    /**
     * Changer de période / boutique / vendeur change la clé : sans ceci la page entière
     * retombait en squelette à chaque clic. On garde les chiffres précédents affichés
     * (légèrement atténués) pendant le chargement — même comportement que le Tableau de bord.
     */
    placeholderData: keepPreviousData,
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

  /**
   * Statistiques par vendeur : réservées au propriétaire (ou droit rapports
   * global) — c'est une lecture croisée de l'activité de chaque employé.
   */
  const canTeam =
    Boolean(helpers?.isOwner) || hasPermission(P.reportsViewGlobal);
  /** Chargé à la première ouverture de l'onglet, puis gardé en cache (pas de coût si jamais consulté). */
  const [teamVisited, setTeamVisited] = useState(false);
  const openTab = useCallback((next: Tab) => {
    setTab(next);
    if (next === "team") setTeamVisited(true);
  }, []);

  const teamParams = useMemo(
    () => ({ companyId, storeId: effectiveStoreId, fromDate, toDate }),
    [companyId, effectiveStoreId, fromDate, toDate],
  );

  const teamQ = useQuery({
    queryKey: queryKeys.reportsTeam(teamParams),
    queryFn: () => fetchTeamPerformance(teamParams),
    enabled: Boolean(companyId) && canTeam && teamVisited,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const refreshAll = useCallback(async () => {
    await Promise.all([q.refetch(), canTeam && teamVisited ? teamQ.refetch() : null]);
  }, [q, teamQ, canTeam, teamVisited]);

  const d = q.data;

  const terms = activityUiTerms(ctx?.businessTypeSlug);
  const description = companyName
    ? `${companyName}${storeLabel ? ` · ${storeLabel}` : ""}`
    : terms.reportsTitle;

  const exportReportsPdf = useCallback(async () => {
    if (!d) return;
    try {
      const blob = await downloadReportsPdfBlob(
        d,
        { title: terms.reportsTitle, subtitle: description },
        { companyId },
      );
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
  }, [d, description, terms.reportsTitle, companyId]);

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

  const pieTotal = d ? d.salesByCategory.reduce((s, c) => s + c.revenue, 0) : 0;

  const selectedStoreName = effectiveStoreId
    ? stores.find((s) => s.id === effectiveStoreId)?.name ?? null
    : null;
  const scopeLabel = selectedStoreName ?? `Tous les ${terms.storesPlural.toLowerCase()}`;
  const periodLabel = `${formatDateFr(fromDate)} — ${formatDateFr(toDate)}`;
  const periodName =
    period === "custom"
      ? "Période"
      : PERIODS.find((p) => p.key === period)?.label ?? "Période";
  const compactRange =
    fromDate === toDate
      ? formatDateCompact(fromDate)
      : `${formatDateCompact(fromDate)} → ${formatDateCompact(toDate)}`;
  const dayCount = Math.max(
    1,
    Math.round(
      (new Date(`${toDate}T12:00:00`).getTime() -
        new Date(`${fromDate}T12:00:00`).getTime()) /
        86_400_000,
    ) + 1,
  );

  const cashierName = useMemo(() => {
    if (!cashierUserId) return null;
    const u = (usersQ.data ?? []).find((x) => x.userId === cashierUserId);
    return u?.fullName?.trim() || u?.roleName || cashierUserId.slice(0, 8);
  }, [cashierUserId, usersQ.data]);

  const productName = useMemo(() => {
    if (!productId) return null;
    return (productsQ.data ?? []).find((p) => p.id === productId)?.name ?? null;
  }, [productId, productsQ.data]);

  const categoryName = useMemo(() => {
    if (!categoryId) return null;
    return (categoriesQ.data ?? []).find((c) => c.id === categoryId)?.name ?? null;
  }, [categoryId, categoriesQ.data]);

  const activeFilterCount =
    (cashierUserId ? 1 : 0) + (productId ? 1 : 0) + (categoryId ? 1 : 0);

  const resetFilters = () => {
    setCashierUserId(null);
    setProductId(null);
    setCategoryId(null);
  };

  const prev: SalesSummary | undefined = d?.previousSummary;
  const filteredByItem = Boolean(productId || categoryId);

  const tabs: { key: Tab; label: string; icon: ComponentType<{ className?: string }> }[] =
    useMemo(() => {
      const base: {
        key: Tab;
        label: string;
        icon: ComponentType<{ className?: string }>;
      }[] = [{ key: "overview", label: "Synthèse", icon: MdInsights }];
      if (canTeam) base.push({ key: "team", label: "Équipe", icon: MdGroups });
      base.push({ key: "products", label: terms.productsTitle, icon: MdWidgets });
      base.push({ key: "stock", label: "Stock", icon: MdWarehouse });
      return base;
    }, [canTeam, terms.productsTitle]);

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
    if (needStore)
      parts.push(`Voir les rapports (${terms.storeSingular.toLowerCase()})`);
    const requiredText = parts.length ? parts.join(" + ") : "Voir les rapports";

    return (
      <FsPage>
        <FsCard padding="p-6" className="mx-auto max-w-md rounded-[6px] text-center sm:rounded-[6px]">
          <MdLockPerson className="mx-auto h-14 w-14 text-red-600" aria-hidden />
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
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-[6px] bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white"
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
      {/* ── Bandeau de commande : identité, période, portée, filtres, exports ── */}
      <div className="sticky top-0 z-30 -mx-2 mb-3 border-b border-black/[0.07] bg-fs-surface/95 px-2 pb-2 pt-2 backdrop-blur-md sm:-mx-3 sm:px-3 min-[900px]:-mx-4 min-[900px]:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold tracking-tight text-fs-text min-[900px]:text-2xl">
              {terms.reportsTitle}
            </h1>
            <p className="truncate text-[11px] font-semibold text-neutral-600 min-[900px]:text-xs">
              {description}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => togglePanel("filters")}
              aria-expanded={panel === "filters"}
              aria-controls="rep-filters-panel"
              className={cn(
                "relative inline-flex h-9 items-center gap-1.5 rounded-[6px] border px-2.5 text-[11px] font-bold transition-colors",
                panel === "filters" || activeFilterCount > 0
                  ? "border-fs-accent/40 bg-fs-accent/12 text-fs-accent"
                  : "border-black/[0.12] bg-fs-card text-fs-text",
              )}
            >
              <MdTune className="h-4 w-4" aria-hidden />
              {narrow ? null : "Filtres"}
              {activeFilterCount > 0 ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-fs-accent px-1 text-[9px] font-black text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => void q.refetch()}
              aria-label={
                q.isError && d
                  ? "Chiffres en cache — actualisation échouée, réessayer"
                  : "Rafraîchir"
              }
              title={
                q.isError && d
                  ? "Chiffres en cache : la dernière actualisation a échoué."
                  : undefined
              }
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-[6px] border bg-fs-card",
                q.isError && d
                  ? "border-amber-500/60 text-amber-600"
                  : "border-black/[0.12] text-fs-text",
              )}
            >
              <MdRefresh
                className={cn("h-4 w-4", q.isFetching && "animate-spin")}
                aria-hidden
              />
            </button>
          </div>
        </div>

        {/* Résumé cliquable : une seule ligne quand tout est replié */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => togglePanel("period")}
            aria-expanded={panel === "period"}
            aria-controls="rep-period-panel"
            className={cn(
              "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-[6px] border px-2 py-1.5 text-[11px] font-bold transition-colors",
              panel === "period"
                ? "border-fs-accent/40 bg-fs-accent/12 text-fs-accent"
                : "border-black/[0.10] bg-fs-card text-fs-text hover:bg-fs-surface-container",
            )}
          >
            <MdCalendarToday className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="shrink-0">{periodName}</span>
            <span className="min-w-0 truncate font-medium tabular-nums text-neutral-500">
              {compactRange}
            </span>
            <span className="shrink-0 rounded-[4px] bg-fs-surface-container px-1 text-[9px] font-black tabular-nums text-neutral-500">
              {dayCount} j
            </span>
            <MdExpandMore
              className={cn(
                "h-4 w-4 shrink-0 transition-transform duration-300",
                panel === "period" && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          {stores.length > 1 ? (
            <button
              type="button"
              onClick={() => togglePanel("period")}
              aria-expanded={panel === "period"}
              aria-controls="rep-period-panel"
              className={cn(
                "inline-flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-[6px] border px-2 py-1.5 text-[11px] font-bold transition-colors",
                panel === "period"
                  ? "border-fs-accent/40 bg-fs-accent/12 text-fs-accent"
                  : "border-black/[0.10] bg-fs-card text-fs-text hover:bg-fs-surface-container",
              )}
            >
              <MdStorefront className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{scopeLabel}</span>
              <MdExpandMore
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-300",
                  panel === "period" && "rotate-180",
                )}
                aria-hidden
              />
            </button>
          ) : null}
        </div>

        {/* Panneau période / portée — plié par défaut */}
        <CollapsePanel id="rep-period-panel" open={panel === "period"}>
          <div className="rounded-[6px] border border-black/[0.07] bg-fs-card p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-[6px] bg-fs-surface-container p-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPeriod(p.key)}
                    className={cn(
                      "rounded-[4px] px-2.5 py-1.5 text-[11px] font-bold transition-colors sm:px-3 sm:text-xs",
                      period === p.key
                        ? "bg-fs-card text-fs-accent shadow-sm"
                        : "text-neutral-600",
                    )}
                  >
                    {narrow ? p.short : p.label}
                  </button>
                ))}
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <input
                  aria-label="Date de début"
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPeriod("custom");
                    setFromDate(v);
                    if (toDate < v) setToDate(v);
                  }}
                  className={fsInputClass("rounded-[6px] h-9 max-w-[140px] py-1.5 sm:py-1.5")}
                />
                <span className="text-neutral-400">—</span>
                <input
                  aria-label="Date de fin"
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPeriod("custom");
                    setToDate(v);
                    if (fromDate > v) setFromDate(v);
                  }}
                  className={fsInputClass("rounded-[6px] h-9 max-w-[140px] py-1.5 sm:py-1.5")}
                />
              </div>
              {stores.length > 1 ? (
                <select
                  aria-label={terms.storeSingular}
                  className={fsInputClass(
                    "rounded-[6px] h-9 w-auto min-w-[150px] max-w-[220px] py-1.5 sm:py-1.5",
                  )}
                  value={
                    storePick === "unset"
                      ? ctxStoreId ?? ""
                      : storePick === "all"
                        ? ""
                        : storePick
                  }
                  onChange={(e) => onStoreSelectChange(e.target.value)}
                >
                  <option value="">Tous les {terms.storesPlural.toLowerCase()}</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="ml-auto shrink-0 text-[11px] font-bold text-fs-accent"
              >
                Replier
              </button>
            </div>
          </div>
        </CollapsePanel>

        {/* Filtres fins — plié par défaut */}
        <CollapsePanel id="rep-filters-panel" open={panel === "filters"}>
          <div className="rounded-[6px] border border-black/[0.07] bg-fs-card p-3">
            <div className="grid gap-2.5 min-[700px]:grid-cols-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  Vendeur / caissier
                </label>
                <select
                  className={fsInputClass("rounded-[6px]")}
                  value={cashierUserId ?? ""}
                  onChange={(e) =>
                    setCashierUserId(e.target.value === "" ? null : e.target.value)
                  }
                >
                  <option value="">Tous</option>
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
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  {terms.productsTitle}
                </label>
                <select
                  className={fsInputClass("rounded-[6px]")}
                  value={productId ?? ""}
                  onChange={(e) =>
                    setProductId(e.target.value === "" ? null : e.target.value)
                  }
                >
                  <option value="">Tous</option>
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
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  Catégorie
                </label>
                <select
                  className={fsInputClass("rounded-[6px]")}
                  value={categoryId ?? ""}
                  onChange={(e) =>
                    setCategoryId(e.target.value === "" ? null : e.target.value)
                  }
                >
                  <option value="">Toutes</option>
                  {(categoriesQ.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <p className="text-[10px] leading-snug text-neutral-500">
                Un filtre {terms.productsTitle.toLowerCase()} ou catégorie bascule le
                CA en base « facturé au prorata de l&apos;encaissé ».
              </p>
              <button
                type="button"
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
                className="shrink-0 text-[11px] font-bold text-fs-accent disabled:opacity-40"
              >
                Tout réinitialiser
              </button>
            </div>
          </div>
        </CollapsePanel>

        {activeFilterCount > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MdFilterAlt className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
            {cashierName ? (
              <ActiveFilterChip
                label={`Vendeur : ${cashierName}`}
                onClear={() => setCashierUserId(null)}
              />
            ) : null}
            {productName ? (
              <ActiveFilterChip
                label={`${terms.productsTitle} : ${productName}`}
                onClear={() => setProductId(null)}
              />
            ) : null}
            {categoryName ? (
              <ActiveFilterChip
                label={`Catégorie : ${categoryName}`}
                onClear={() => setCategoryId(null)}
              />
            ) : null}
          </div>
        ) : null}

        {/* Onglets */}
        <FsHorizontalScroll className="-mx-2 mt-2 overflow-x-auto px-2">
          <div className="flex gap-1">
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => openTab(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative shrink-0 rounded-t-[5px] px-3 py-2 text-xs font-bold transition-colors",
                    active
                      ? "text-fs-accent"
                      : "text-neutral-500 hover:text-neutral-700",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <t.icon className="h-4 w-4" aria-hidden />
                    {t.label}
                  </span>
                  <span
                    className={cn(
                      "absolute inset-x-2 bottom-0 h-[3px] rounded-[2px] transition-all",
                      active ? "bg-fs-accent" : "bg-transparent",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </FsHorizontalScroll>
      </div>

      <PharmacyReportsCard
        companyId={companyId}
        businessTypeSlug={ctx?.businessTypeSlug}
        expiryModuleEnabled={expiryModuleOverride(ctx)}
        storeId={effectiveStoreId}
        fromDate={fromDate}
        toDate={toDate}
      />

      <FsPullToRefresh onRefresh={refreshAll}>
        {q.isLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-[104px] animate-pulse rounded-[6px] bg-fs-surface-container"
                />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-[6px] bg-fs-surface-container" />
          </div>
        ) : null}

        {/*
          Erreur bloquante uniquement s'il n'y a rien à montrer. Avec des chiffres en
          cache (connexion coupée, requête échouée), on garde le rapport lisible : le
          bouton d'actualisation en tête signale déjà l'échec.
        */}
        {q.isError && !d ? (
          <FsQueryErrorPanel
            className="rounded-[6px] sm:rounded-[6px]"
            error={q.error}
            onRetry={() => q.refetch()}
          />
        ) : null}

        {d ? (
          <div
            className={cn(
              q.isPlaceholderData &&
                "motion-safe:opacity-90 motion-safe:transition-opacity",
            )}
          >
            {tab === "overview" ? (
              <div className="space-y-4">
                <div
                  className={cn(
                    "grid gap-2.5 sm:gap-3",
                    isWide ? "grid-cols-4" : "grid-cols-2",
                  )}
                >
                  <KpiCard
                    label={filteredByItem ? "Chiffre d'affaires" : "CA encaissé"}
                    value={formatCurrency(d.salesSummary.totalAmount)}
                    icon={MdTrendingUp}
                    theme={KPI_THEMES.revenue}
                    deltaPct={
                      prev ? pctDelta(d.salesSummary.totalAmount, prev.totalAmount) : null
                    }
                    featured
                  />
                  <KpiCard
                    label="Ventes"
                    value={String(d.salesSummary.count)}
                    icon={MdShoppingCart}
                    theme={KPI_THEMES.sales}
                    deltaPct={prev ? pctDelta(d.salesSummary.count, prev.count) : null}
                  />
                  <KpiCard
                    label="Panier moyen"
                    value={formatCurrency(d.ticketAverage)}
                    icon={MdReceiptLong}
                    theme={KPI_THEMES.ticket}
                  />
                  <KpiCard
                    label="Marge"
                    value={formatCurrency(d.salesSummary.margin)}
                    subtitle={`Taux ${d.marginRatePercent.toFixed(1)} %`}
                    icon={MdSell}
                    theme={KPI_THEMES.margin}
                    deltaPct={prev ? pctDelta(d.salesSummary.margin, prev.margin) : null}
                  />
                  <KpiCard
                    label={`${terms.productsTitle} vendus`}
                    value={String(d.salesSummary.itemsSold)}
                    icon={MdInventory2}
                    theme={KPI_THEMES.items}
                    deltaPct={
                      prev ? pctDelta(d.salesSummary.itemsSold, prev.itemsSold) : null
                    }
                  />
                  <KpiCard
                    label={terms.purchasesTitle}
                    value={formatCurrency(d.purchasesSummary.totalAmount)}
                    subtitle={`${d.purchasesSummary.count} commande(s)`}
                    icon={MdLocalShipping}
                    theme={KPI_THEMES.purchases}
                  />
                  <KpiCard
                    label="Valeur stock"
                    value={formatCurrency(d.stockValue.totalValue)}
                    subtitle={
                      effectiveStoreId ? `${d.stockValue.productCount} éléments` : "—"
                    }
                    icon={MdWarehouse}
                    theme={KPI_THEMES.stock}
                  />
                </div>

                {d.lowStockCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => openTab("stock")}
                    className="flex w-full items-center gap-2 rounded-[6px] border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-left"
                  >
                    <MdWarningAmber
                      className="h-5 w-5 shrink-0 text-amber-600"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 text-xs font-bold text-amber-800 dark:text-amber-300">
                      {d.lowStockCount} produit(s) en alerte stock sur ce périmètre
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-amber-700 underline">
                      Voir
                    </span>
                  </button>
                ) : null}

                <SectionCard title="Chiffre d'affaires par jour" icon={MdBarChart}>
                  <DashboardBarChart data={d.salesByDay} />
                </SectionCard>

                <SectionCard title="Ventes par catégorie" icon={MdShowChart}>
                  <div className="min-[560px]:grid min-[560px]:grid-cols-2 min-[560px]:gap-6">
                    <DashboardPieChart
                      categories={d.salesByCategory}
                      total={pieTotal}
                      legendMax={narrow ? 4 : 6}
                    />
                  </div>
                </SectionCard>

                <SectionCard title="Exporter le rapport" icon={MdTableChart}>
                  <p className="text-xs leading-relaxed text-neutral-600">
                    PDF ou Excel : feuilles multiples, en-têtes colorés, filtres et mise
                    en forme type tableau de bord. La période et les filtres actifs sont
                    repris.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void exportReportsPdf()}
                      className="inline-flex items-center gap-2 rounded-[6px] border border-black/[0.12] bg-fs-card px-4 py-2.5 text-sm font-bold text-fs-text"
                    >
                      <MdPictureAsPdf className="h-5 w-5 text-red-600" aria-hidden />
                      Exporter PDF
                    </button>
                    <button
                      type="button"
                      onClick={exportReportsExcelWithToast}
                      className="inline-flex items-center gap-2 rounded-[6px] border border-black/[0.12] bg-fs-card px-4 py-2.5 text-sm font-bold text-fs-text"
                    >
                      <MdTableChart className="h-5 w-5 text-emerald-600" aria-hidden />
                      Exporter Excel
                    </button>
                  </div>
                </SectionCard>
              </div>
            ) : null}

            {tab === "team" && canTeam ? (
              <TeamPerformanceCard
                data={teamQ.data}
                isLoading={teamQ.isLoading}
                periodLabel={periodLabel}
                scopeLabel={scopeLabel}
                onFocusCashier={(userId) => {
                  setCashierUserId(userId);
                  setPanel("filters");
                  openTab("overview");
                }}
              />
            ) : null}

            {tab === "products" ? (
              <div className="space-y-4">
                <SectionCard
                  title={`Top 10 ${terms.productsTitle.toLowerCase()} vendus`}
                  icon={MdWidgets}
                  action={
                    <span className="rounded-[4px] bg-fs-accent/15 px-2 py-0.5 text-[11px] font-bold text-fs-accent">
                      {d.topProducts.length} éléments
                    </span>
                  }
                  className="[&>div:last-child]:p-0"
                >
                  {d.topProducts.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-neutral-500">
                      Aucune vente sur la période
                    </p>
                  ) : (
                    <FsHorizontalScroll>
                      <table className="w-full min-w-[520px] text-left text-xs">
                        <thead>
                          <tr className="bg-fs-surface-container/80 text-[11px] text-neutral-600">
                            <th className="px-4 py-2 font-semibold">#</th>
                            <th className="px-2 py-2 font-semibold">
                              {terms.productsTitle}
                            </th>
                            <th className="px-2 py-2 text-right font-semibold">Qté</th>
                            <th className="px-2 py-2 text-right font-semibold">CA</th>
                            <th className="px-4 py-2 text-right font-semibold">Marge</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.topProducts.map((p, i) => {
                            const best = d.topProducts[0]?.revenue || 1;
                            return (
                              <tr
                                key={p.productId}
                                className="border-t border-black/[0.06] odd:bg-fs-card/50"
                              >
                                <td className="px-4 py-2.5">
                                  <span
                                    className={cn(
                                      "inline-flex h-6 w-6 items-center justify-center rounded-[4px] text-[11px] font-black tabular-nums",
                                      i < 3
                                        ? "bg-fs-accent/20 text-fs-accent"
                                        : "bg-fs-surface-container text-neutral-500",
                                    )}
                                  >
                                    {i + 1}
                                  </span>
                                </td>
                                <td className="max-w-[220px] px-2 py-2.5">
                                  <p className="truncate font-semibold text-fs-text">
                                    {p.productName}
                                  </p>
                                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-[2px] bg-fs-surface-container">
                                    <span
                                      className="block h-full rounded-[2px] bg-fs-accent/70"
                                      style={{
                                        width: `${Math.max(2, (p.revenue / best) * 100)}%`,
                                      }}
                                    />
                                  </span>
                                </td>
                                <td className="px-2 py-2.5 text-right tabular-nums">
                                  {p.quantitySold}
                                </td>
                                <td className="px-2 py-2.5 text-right font-bold tabular-nums">
                                  {formatCurrency(p.revenue)}
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {formatCurrency(p.margin)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </FsHorizontalScroll>
                  )}
                </SectionCard>

                {d.leastProducts.length > 0 ? (
                  <SectionCard
                    title={`${terms.productsTitle} les moins vendus`}
                    icon={MdTrendingDown}
                    className="[&>div:last-child]:p-2"
                  >
                    <ul className="divide-y divide-black/[0.06]">
                      {d.leastProducts.map((p) => (
                        <li
                          key={`least-${p.productId}`}
                          className="flex items-center justify-between gap-3 px-2 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-fs-text">
                              {p.productName}
                            </p>
                            <p className="text-[11px] tabular-nums text-neutral-500">
                              {p.quantitySold} vendu(s)
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-bold tabular-nums text-fs-text">
                            {formatCurrency(p.revenue)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                ) : null}
              </div>
            ) : null}

            {tab === "stock" ? (
              <SectionCard
                title={`Rapport de stock${
                  effectiveStoreId && selectedStoreName ? ` — ${selectedStoreName}` : ""
                }`}
                icon={MdWarehouse}
              >
                {!effectiveStoreId ? (
                  <p className="text-sm text-neutral-600">
                    Sélectionnez un {terms.storeSingular.toLowerCase()} dans le bandeau
                    pour voir le détail du stock.
                  </p>
                ) : d.stockReport ? (
                  <>
                    <div
                      className={cn(
                        "grid gap-2.5",
                        isWide ? "grid-cols-5" : "grid-cols-2 sm:grid-cols-3",
                      )}
                    >
                      <div className="rounded-[6px] bg-fs-surface-container/80 px-3 py-2.5">
                        <p className="text-[11px] text-neutral-600">
                          {terms.productsTitle} en stock
                        </p>
                        <p className="mt-1 text-lg font-black tabular-nums text-blue-700 dark:text-blue-400">
                          {d.stockReport.currentStockCount}
                        </p>
                      </div>
                      <div className="rounded-[6px] bg-fs-surface-container/80 px-3 py-2.5">
                        <p className="text-[11px] text-neutral-600">Rupture</p>
                        <p className="mt-1 text-lg font-black tabular-nums text-red-600">
                          {d.stockReport.outOfStock.length}
                        </p>
                      </div>
                      <div className="rounded-[6px] bg-fs-surface-container/80 px-3 py-2.5">
                        <p className="text-[11px] text-neutral-600">Stock faible</p>
                        <p className="mt-1 text-lg font-black tabular-nums text-amber-700 dark:text-amber-400">
                          {d.stockReport.lowStock.length}
                        </p>
                      </div>
                      <div className="rounded-[6px] bg-fs-surface-container/80 px-3 py-2.5">
                        <p className="text-[11px] text-neutral-600">Entrées</p>
                        <p className="mt-1 text-lg font-black tabular-nums text-emerald-600">
                          {d.stockReport.entries}
                        </p>
                      </div>
                      <div className="rounded-[6px] bg-fs-surface-container/80 px-3 py-2.5">
                        <p className="text-[11px] text-neutral-600">Sorties</p>
                        <p className="mt-1 text-lg font-black tabular-nums text-red-600">
                          {d.stockReport.exits}
                        </p>
                      </div>
                    </div>

                    {d.stockReport.byDayNet.length > 0 ? (
                      <div className="mt-5">
                        <FsSectionLabel className="mb-2">
                          Mouvements nets par jour
                        </FsSectionLabel>
                        <NetStockLineChart data={d.stockReport.byDayNet} />
                      </div>
                    ) : null}

                    {d.stockReport.outOfStock.length > 0 ||
                    d.stockReport.lowStock.length > 0 ? (
                      <div className="mt-5">
                        <FsSectionLabel className="mb-2">Alertes stock</FsSectionLabel>
                        <ul className="space-y-1.5">
                          {d.stockReport.outOfStock.slice(0, 5).map((a) => (
                            <li
                              key={`o-${a.productId}`}
                              className="flex items-center justify-between gap-2 rounded-[5px] border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs"
                            >
                              <span className="min-w-0 truncate font-semibold">
                                {a.productName}
                              </span>
                              <span className="shrink-0 font-bold tabular-nums text-red-600">
                                Rupture · seuil {a.threshold}
                              </span>
                            </li>
                          ))}
                          {d.stockReport.lowStock.slice(0, 5).map((a) => (
                            <li
                              key={`l-${a.productId}`}
                              className="flex items-center justify-between gap-2 rounded-[5px] border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs"
                            >
                              <span className="min-w-0 truncate font-semibold">
                                {a.productName}
                              </span>
                              <span className="shrink-0 font-bold tabular-nums text-amber-700 dark:text-amber-400">
                                Faible · {a.quantity}/{a.threshold}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-neutral-600">
                    Impossible de charger le rapport de stock.
                  </p>
                )}
              </SectionCard>
            ) : null}
          </div>
        ) : null}
      </FsPullToRefresh>
    </FsPage>
  );
}
