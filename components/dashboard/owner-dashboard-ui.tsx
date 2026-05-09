"use client";

import type { ActivityUiTerms } from "@/lib/features/activity/activity-profiles";
import type { DashboardPeriod } from "@/lib/features/dashboard/date-range";
import type { DashboardData } from "@/lib/features/dashboard/types";
import type { AccessHelpers } from "@/lib/features/permissions/access";
import { P } from "@/lib/constants/permissions";
import { ROUTES, storeFactureTabPath } from "@/lib/config/routes";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  MdAddShoppingCart,
  MdAssessment,
  MdCalendarToday,
  MdChevronRight,
  MdCreditCard,
  MdDescription,
  MdInventory2,
  MdLocalShipping,
  MdPercent,
  MdPointOfSale,
  MdReceiptLong,
  MdShoppingCart,
  MdShowChart,
  MdTrendingDown,
  MdTrendingUp,
  MdWarehouse,
} from "react-icons/md";
import {
  DashboardLineChart,
  DashboardPieChart,
} from "@/components/dashboard/dashboard-charts";
import { getDefaultDateRange } from "@/lib/features/dashboard/date-range";

const OWNER_ACCENT = "#FF6B35";

/** Couleur des grands chiffres — alignée sur l’icône / le sens métier (clair + sombre). */
const OWNER_VALUE = {
  revenue: "text-[var(--owner-accent)]",
  margin: "text-emerald-700 dark:text-emerald-400",
  sales: "text-blue-700 dark:text-blue-400",
  ticket: "text-sky-700 dark:text-sky-400",
  purchases: "text-amber-800 dark:text-amber-400",
  stock: "text-violet-700 dark:text-violet-400",
  items: "text-indigo-700 dark:text-indigo-400",
  alert: "text-red-700 dark:text-red-400",
  neutral: "text-neutral-800 dark:text-fs-text",
} as const;

function pctVsPrev(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / prev) * 100;
}

function formatDelta(pct: number | null): { text: string; up: boolean | null } {
  if (pct === null) return { text: "—", up: null };
  if (!Number.isFinite(pct)) return { text: "—", up: null };
  const rounded = pct >= 0 ? pct.toFixed(1) : pct.toFixed(1);
  return {
    text: `${pct >= 0 ? "+" : ""}${rounded}%`,
    up: pct > 0 ? true : pct < 0 ? false : null,
  };
}

function commerceScore(d: DashboardData): { score: number; label: string } {
  const prev = d.previousPeriodSummary;
  const cur = d.salesSummary;
  let points = 52;
  if (prev.totalAmount > 0) {
    const trend = (cur.totalAmount - prev.totalAmount) / prev.totalAmount;
    points += Math.max(-18, Math.min(18, trend * 40));
  }
  const marginRate =
    cur.totalAmount > 0 ? (cur.margin / cur.totalAmount) * 100 : 0;
  points += Math.max(0, Math.min(22, (marginRate / 35) * 22));
  points -= Math.min(12, d.lowStockCount * 0.28);
  const score = Math.max(0, Math.min(100, Math.round(points)));
  const label =
    score >= 85 ? "Excellent" : score >= 70 ? "Bon" : score >= 50 ? "Moyen" : "À suivre";
  return { score, label };
}

function CommerceGauge({ score, label }: { score: number; label: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 112 112" className="h-[100px] w-[100px] shrink-0" aria-hidden>
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          className="text-neutral-200 dark:text-neutral-700"
        />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="var(--owner-accent)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          transform="rotate(-90 56 56)"
        />
        <text
          x="56"
          y="54"
          textAnchor="middle"
          className="fill-neutral-800 dark:fill-neutral-100"
          style={{ fontSize: 15, fontWeight: 800 }}
        >
          {score}
        </text>
        <text
          x="56"
          y="68"
          textAnchor="middle"
          className="fill-neutral-400 dark:fill-neutral-500"
          style={{ fontSize: 9, fontWeight: 600 }}
        >
          / 100
        </text>
      </svg>
      <div>
        <p className="text-xs font-medium text-neutral-500">Score commerce</p>
        <p className="text-lg font-bold text-neutral-900">{label}</p>
      </div>
    </div>
  );
}

function SoftCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[14px] border border-black/6 bg-fs-card text-fs-text shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function KpiTile({
  title,
  value,
  sub,
  icon: Icon,
  iconBg,
  iconColor,
  deltaPct,
  href,
  deltaLabel = "vs période précédente",
  valueClassName,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  deltaPct: number | null;
  href?: string;
  /** Texte après le pourcentage (ex. comparaison non applicable). */
  deltaLabel?: string;
  /** Couleur / emphase du montant principal (sémantique métier). */
  valueClassName?: string;
}) {
  const d = formatDelta(deltaPct);
  const inner = (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] sm:h-9 sm:w-9"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />
        </span>
      </div>
      <p className="mt-2.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-neutral-500 min-[900px]:text-[11px] dark:text-fs-on-surface-variant">
        {title}
      </p>
      <p
        className={cn(
          "mt-1 min-w-0 max-w-full break-words text-base font-extrabold leading-tight tracking-tight tabular-nums min-[900px]:text-lg",
          valueClassName ?? OWNER_VALUE.neutral,
        )}
      >
        {value}
      </p>
      <div className="mt-1.5 flex min-w-0 max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-snug min-[900px]:text-xs">
        {d.up === null ? (
          <span className="min-w-0 break-words font-semibold text-neutral-400">
            {d.text} {deltaLabel}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex min-w-0 max-w-full items-center gap-0.5 break-words font-bold",
              d.up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
            )}
          >
            {d.up ? (
              <MdTrendingUp className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
            ) : (
              <MdTrendingDown className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
            )}
            <span className="min-w-0">
              {d.text} {deltaLabel}
            </span>
          </span>
        )}
      </div>
      {sub ? (
        <p className="mt-1.5 min-w-0 break-words text-[10px] leading-snug text-neutral-500 min-[900px]:text-xs dark:text-fs-on-surface-variant">
          {sub}
        </p>
      ) : null}
    </div>
  );
  const card = (
    <SoftCard
      className={cn(
        "h-full overflow-hidden p-2.5 min-[900px]:p-3",
        href &&
          "cursor-pointer transition hover:shadow-md active:scale-[0.99] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.35)]",
      )}
    >
      {inner}
    </SoftCard>
  );
  if (href) {
    return (
      <Link
        href={href}
        scroll={false}
        className="block h-full min-h-[44px] min-w-0 touch-manipulation"
      >
        {card}
      </Link>
    );
  }
  return card;
}

export type OwnerDashboardUiProps = {
  companyName: string;
  terms: ActivityUiTerms;
  description: string;
  scope: "company" | "store";
  setScope: (s: "company" | "store") => void;
  stores: { id: string; name: string }[];
  dashboardStoreId: string | null;
  setDashboardStoreId: (id: string | null) => void;
  syncGlobalStoreFromDashboard: (id: string) => void;
  ctxStoreId: string | null;
  period: DashboardPeriod;
  setPeriod: (p: DashboardPeriod) => void;
  customFrom: string | null;
  customTo: string | null;
  setCustomFrom: (v: string | null) => void;
  setCustomTo: (v: string | null) => void;
  selectedDay: string;
  setSelectedDay: (v: string) => void;
  d: DashboardData;
  isWide: boolean;
  effectiveStoreId: string | null;
  purchasesLabel: string;
  rangeFooter: { from: string; to: string };
  helpers: AccessHelpers;
  hasPermission: (key: string) => boolean;
  canPosQuick: boolean;
  canInvoiceA4: boolean;
  canFactureTab: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
};

export function OwnerDashboardUi(props: OwnerDashboardUiProps) {
  const {
    companyName,
    terms,
    description,
    scope,
    setScope,
    stores,
    dashboardStoreId,
    setDashboardStoreId,
    syncGlobalStoreFromDashboard,
    ctxStoreId,
    period,
    setPeriod,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
    selectedDay,
    setSelectedDay,
    d,
    isWide,
    effectiveStoreId,
    purchasesLabel,
    rangeFooter,
    helpers,
    hasPermission,
    canPosQuick,
    canInvoiceA4,
    canFactureTab,
    isFetching,
    isPlaceholderData,
  } = props;

  const router = useRouter();

  const reportsHref = helpers.canReports ? ROUTES.reports : ROUTES.sales;

  useEffect(() => {
    const paths = new Set<string>([
      reportsHref,
      ROUTES.inventory,
      ROUTES.purchases,
      ROUTES.products,
      ROUTES.stores,
      ROUTES.sales,
    ]);
    if (helpers.canCredit) paths.add(ROUTES.credit);
    paths.forEach((p) => {
      try {
        router.prefetch(p);
      } catch {
        /* */
      }
    });
    const sid = effectiveStoreId ?? ctxStoreId;
    if (sid) {
      if (canPosQuick) router.prefetch(`${ROUTES.stores}/${sid}/pos-quick`);
      if (canInvoiceA4) router.prefetch(`${ROUTES.stores}/${sid}/pos`);
      if (canFactureTab && canInvoiceA4) router.prefetch(storeFactureTabPath(sid));
    }
  }, [
    router,
    reportsHref,
    helpers.canCredit,
    effectiveStoreId,
    ctxStoreId,
    canPosQuick,
    canInvoiceA4,
    canFactureTab,
  ]);

  const prev = d.previousPeriodSummary;
  const prevTicket =
    prev.count > 0 ? prev.totalAmount / prev.count : 0;
  const curTicket = d.ticketAverage;

  const welcomeTrend = pctVsPrev(d.salesSummary.totalAmount, prev.totalAmount);
  const welcome =
    welcomeTrend === null
      ? "Vos indicateurs clés pour piloter votre activité."
      : welcomeTrend > 2
        ? "Aujourd’hui, votre activité est en hausse."
        : welcomeTrend < -2
          ? "Aujourd’hui, surveillez vos marges et votre stock."
          : "Aujourd’hui, votre activité est stable.";

  const { score, label: scoreLabel } = commerceScore(d);
  const headerDate = (() => {
    try {
      return format(parseISO(selectedDay), "dd/MM/yyyy", { locale: fr });
    } catch {
      return selectedDay;
    }
  })();

  const totalCat =
    d.salesByCategory.reduce((s, e) => s + e.revenue, 0) ?? 0;

  const recCards = [
    d.lowStockCount > 0
      ? {
          title: "Alertes stock",
          body: `${d.lowStockCount} produit${d.lowStockCount > 1 ? "s" : ""} nécessitent une vérification.`,
          href: helpers.canInventory ? ROUTES.inventory : reportsHref,
          tone: "amber" as const,
        }
      : null,
    d.topProducts.length > 0
      ? {
          title: "Produits performants",
          body: `« ${d.topProducts[0]!.productName} » mène les ventes sur la période.`,
          href: reportsHref,
          tone: "emerald" as const,
        }
      : null,
    d.purchasesSummary.count > 0
      ? {
          title: "Réassort",
          body: "Pensez à réconcilier vos bons de livraison et votre stock.",
          href: helpers.canPurchases ? ROUTES.purchases : reportsHref,
          tone: "sky" as const,
        }
      : {
          title: "Optimisation",
          body: "Analysez vos catégories pour équilibrer le catalogue.",
          href: reportsHref,
          tone: "violet" as const,
        },
  ].filter(Boolean) as {
    title: string;
    body: string;
    href: string;
    tone: "amber" | "emerald" | "sky" | "violet";
  }[];

  const actionBarCount = Math.max(1, Math.min(5, 2 + (d.lowStockCount > 0 ? 1 : 0)));

  const storeIdForLinks = effectiveStoreId ?? ctxStoreId;

  const quickTiles: {
    label: string;
    sub?: string;
    href: string;
    bg: string;
    icon: ComponentType<{ className?: string }>;
    show: boolean;
  }[] = [
    {
      label: "Caisse rapide",
      href: storeIdForLinks ? `${ROUTES.stores}/${storeIdForLinks}/pos-quick` : ROUTES.stores,
      bg: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-500/25",
      icon: MdPointOfSale,
      show: canPosQuick,
    },
    {
      label: "Nouvelle vente",
      href: storeIdForLinks ? `${ROUTES.stores}/${storeIdForLinks}/pos` : ROUTES.stores,
      bg: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-500/25",
      icon: MdAddShoppingCart,
      show: canInvoiceA4 || hasPermission(P.salesCreate),
    },
    {
      label: "Facture A4",
      href: storeIdForLinks ? `${ROUTES.stores}/${storeIdForLinks}/pos` : ROUTES.stores,
      bg: "bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-500/25",
      icon: MdDescription,
      show: canInvoiceA4,
    },
    {
      label: "Facture (tableau)",
      href: storeIdForLinks ? storeFactureTabPath(storeIdForLinks) : ROUTES.stores,
      bg: "bg-orange-50 text-orange-800 ring-orange-100 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-500/25",
      icon: MdReceiptLong,
      show: Boolean(canFactureTab && canInvoiceA4 && storeIdForLinks),
    },
    {
      label: "Nouvel achat",
      href: ROUTES.purchases,
      bg: "bg-amber-50 text-amber-800 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/25",
      icon: MdLocalShipping,
      show: helpers.canPurchases,
    },
    {
      label: "Inventaire",
      href: ROUTES.inventory,
      bg: "bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-400/25",
      icon: MdWarehouse,
      show: helpers.canInventory,
    },
    {
      label: "Crédit client",
      href: ROUTES.credit,
      bg: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-violet-500/25",
      icon: MdCreditCard,
      show: helpers.canCredit,
    },
    {
      label: "Ajouter produit",
      href: ROUTES.products,
      bg: "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-500/25",
      icon: MdInventory2,
      show: hasPermission(P.productsCreate),
    },
    {
      label: "Rapports",
      href: reportsHref,
      bg: "bg-slate-100 text-slate-800 ring-slate-200/80 dark:bg-fs-surface-container dark:text-fs-text dark:ring-white/12",
      icon: MdAssessment,
      show: helpers.canReports,
    },
  ];

  const visibleQuick = quickTiles.filter((t) => t.show);

  return (
    <div
      className={cn(
        "fs-owner-dashboard relative min-w-0 pb-10 [--owner-accent:#FF6B35]",
        isPlaceholderData && "motion-safe:opacity-90 motion-safe:transition-opacity",
      )}
      style={
        {
          ["--fs-accent" as string]: OWNER_ACCENT,
        } as CSSProperties
      }
    >
      {isFetching ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 rounded-full bg-[var(--owner-accent)]/85 motion-safe:animate-pulse"
          aria-hidden
        />
      ) : null}
      <div className="min-[900px]:px-1">
        {/* En-tête — mobile : titre + jour sélectionné (période = barre de filtres) */}
        <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between min-[900px]:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-neutral-900 min-[900px]:text-[1.65rem]">
              {terms.dashboardTitle}
            </h1>
            <p className="mt-1 text-sm font-medium leading-snug text-neutral-500">{description}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-[14px] border border-black/6 bg-neutral-100/80 p-2 dark:bg-fs-surface-container/90 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex min-h-11 flex-wrap items-center gap-2 touch-manipulation">
              <MdCalendarToday className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <input
                type="date"
                value={selectedDay}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) =>
                  startTransition(() => setSelectedDay(e.target.value))
                }
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-black/8 bg-fs-card px-2 py-2 text-base font-semibold text-neutral-800 min-[900px]:max-w-[11rem] min-[900px]:py-1.5 min-[900px]:text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  startTransition(() =>
                    setSelectedDay(format(new Date(), "yyyy-MM-dd")),
                  )
                }
                className="min-h-11 shrink-0 rounded-lg bg-fs-card px-3 py-2 text-xs font-bold text-[var(--owner-accent)] ring-1 ring-black/8 touch-manipulation min-[900px]:text-xs dark:ring-white/12"
              >
                Aujourd&apos;hui
              </button>
            </div>
            <p className="px-0.5 text-center text-xs font-semibold text-neutral-500 sm:text-left">
              {headerDate}
            </p>
          </div>
        </div>

        {/* Bandeau accueil + stats jour + jauge + alertes */}
        <SoftCard className="mt-5 p-4 min-[900px]:p-5">
          <div className="flex flex-col gap-5 min-[1100px]:flex-row min-[1100px]:items-center min-[1100px]:justify-between">
            <div className="min-w-0 flex-1 space-y-4">
              <p className="text-sm font-semibold text-neutral-800">
                Bonjour ! <span aria-hidden>👋</span> {welcome}
              </p>
              <div className="grid grid-cols-2 gap-2 min-[600px]:grid-cols-4">
                {(
                  [
                    {
                      k: "CA aujourd'hui",
                      v: formatCurrency(d.daySalesSummary.totalAmount),
                      vc: cn(OWNER_VALUE.revenue, "text-sm min-[600px]:text-base"),
                    },
                    {
                      k: "Marge aujourd'hui",
                      v: formatCurrency(d.daySalesSummary.margin),
                      vc: cn(OWNER_VALUE.margin, "text-sm min-[600px]:text-base"),
                    },
                    {
                      k: "Ventes",
                      v: `${d.daySalesSummary.count}`,
                      vc: cn(OWNER_VALUE.sales, "text-sm min-[600px]:text-base"),
                    },
                    {
                      k: "Articles vendus",
                      v: `${d.daySalesSummary.itemsSold}`,
                      vc: cn(OWNER_VALUE.items, "text-sm min-[600px]:text-base"),
                    },
                  ] as const
                ).map(({ k, v, vc }) => (
                  <div
                    key={k}
                    className="min-w-0 overflow-hidden rounded-xl bg-neutral-50/90 px-2.5 py-2 ring-1 ring-black/5 dark:bg-fs-surface-container dark:ring-white/12"
                  >
                    <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-neutral-600 min-[600px]:text-[11px] dark:text-fs-on-surface-variant">
                      {k}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 min-w-0 max-w-full break-words font-extrabold leading-snug tracking-tight tabular-nums",
                        vc,
                      )}
                    >
                      {v}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-stretch gap-3 min-[1100px]:flex-row min-[1100px]:items-center">
              <CommerceGauge score={score} label={scoreLabel} />
              <div className="flex min-w-0 flex-1 flex-col gap-2 min-[1100px]:max-w-[280px]">
                <Link
                  href={reportsHref}
                  scroll={false}
                  className="flex min-h-12 items-center justify-between gap-2 rounded-xl bg-[color-mix(in_srgb,var(--owner-accent)_14%,white)] px-3 py-2.5 text-sm font-bold text-[var(--owner-accent)] ring-1 ring-[color-mix(in_srgb,var(--owner-accent)_28%,transparent)] transition hover:brightness-[1.02] touch-manipulation dark:bg-[color-mix(in_oklab,var(--owner-accent)_22%,var(--fs-surface-container))] dark:ring-[color-mix(in_srgb,var(--owner-accent)_42%,transparent)] dark:hover:brightness-110"
                >
                  <span>{actionBarCount} actions recommandées</span>
                  <MdChevronRight className="h-5 w-5 shrink-0 opacity-80" aria-hidden />
                </Link>
                <Link
                  href={ROUTES.inventory}
                  scroll={false}
                  className="flex min-h-12 items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-bold text-red-700 ring-1 ring-red-100 transition hover:bg-red-50/90 touch-manipulation dark:bg-red-950/35 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-950/45"
                >
                  <span>
                    {d.lowStockCount} alerte{d.lowStockCount > 1 ? "s" : ""} stock
                  </span>
                  <MdChevronRight className="h-5 w-5 shrink-0 opacity-80" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </SoftCard>

        {/* Filtres */}
        <SoftCard className="mt-4 p-3 min-[900px]:p-4">
          <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:flex-wrap min-[900px]:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                Vue
              </span>
              <button
                type="button"
                onClick={() =>
                  startTransition(() => {
                    setScope("company");
                  })
                }
                className={cn(
                  "min-h-11 touch-manipulation rounded-lg px-3 py-2 text-sm font-bold transition-colors",
                  scope === "company"
                    ? "bg-[color-mix(in_srgb,var(--owner-accent)_16%,white)] text-[var(--owner-accent)] ring-1 ring-[color-mix(in_srgb,var(--owner-accent)_35%,transparent)] dark:bg-[color-mix(in_oklab,var(--owner-accent)_26%,var(--fs-surface-container))] dark:ring-[color-mix(in_srgb,var(--owner-accent)_45%,transparent)]"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200/80 dark:bg-fs-surface-container dark:hover:bg-white/[0.08]",
                )}
              >
                Entreprise
              </button>
              {stores.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      setScope("store");
                      const id = dashboardStoreId ?? ctxStoreId ?? stores[0]?.id ?? null;
                      setDashboardStoreId(id);
                      if (id) syncGlobalStoreFromDashboard(id);
                    });
                  }}
                  className={cn(
                    "min-h-11 touch-manipulation rounded-lg px-3 py-2 text-sm font-bold transition-colors",
                    scope === "store"
                      ? "bg-[color-mix(in_srgb,var(--owner-accent)_16%,white)] text-[var(--owner-accent)] ring-1 ring-[color-mix(in_srgb,var(--owner-accent)_35%,transparent)] dark:bg-[color-mix(in_oklab,var(--owner-accent)_26%,var(--fs-surface-container))] dark:ring-[color-mix(in_srgb,var(--owner-accent)_45%,transparent)]"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200/80 dark:bg-fs-surface-container dark:hover:bg-white/[0.08]",
                  )}
                >
                  {terms.storeSingular}
                </button>
              ) : null}
            </div>
            {scope === "store" && stores.length > 0 ? (
              <label className="flex min-w-[200px] flex-1 items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                  Boutique
                </span>
                <select
                  value={dashboardStoreId ?? stores[0]?.id ?? ""}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    startTransition(() => {
                      setDashboardStoreId(id);
                      if (id) syncGlobalStoreFromDashboard(id);
                    });
                  }}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-black/10 bg-fs-card px-2 py-2 text-base font-semibold text-neutral-800 touch-manipulation min-[900px]:text-sm"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="flex min-w-[200px] items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                  Boutique
                </span>
                <span className="rounded-lg bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-500 ring-1 ring-black/5 dark:ring-white/10">
                  Toutes les boutiques
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                Période
              </span>
              {(
                [
                  ["today", "Aujourd'hui"],
                  ["week", "Semaine"],
                  ["month", "Mois"],
                  ["custom", "Personnalisé"],
                ] as const
              ).map(([p, lbl]) => (
                <button
                  key={`f-${p}`}
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      setPeriod(p);
                      if (p === "custom") {
                        const w = getDefaultDateRange("week");
                        setCustomFrom(w.from);
                        setCustomTo(w.to);
                      }
                    });
                  }}
                  className={cn(
                    "min-h-11 touch-manipulation rounded-lg px-2.5 py-2 text-xs font-bold sm:py-1.5",
                    period === p
                      ? "bg-[color-mix(in_srgb,var(--owner-accent)_16%,white)] text-[var(--owner-accent)] dark:bg-[color-mix(in_oklab,var(--owner-accent)_26%,var(--fs-surface-container))]"
                      : "bg-neutral-100 text-neutral-700 dark:bg-fs-surface-container dark:hover:bg-white/[0.06]",
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <label className="flex min-w-0 flex-1 flex-col gap-1 min-[900px]:max-w-[220px]">
              <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                Comparer à
              </span>
              <select
                value="previous"
                aria-label="Période de comparaison"
                onChange={() => undefined}
                className="min-h-11 w-full rounded-lg border border-black/8 bg-neutral-50 px-3 py-2 text-base font-semibold text-neutral-800 ring-1 ring-black/6 touch-manipulation min-[900px]:text-sm dark:bg-fs-surface-low"
              >
                <option value="previous">Période précédente</option>
              </select>
            </label>
          </div>
          {period === "custom" ? (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-black/6 pt-3">
              <label className="text-xs font-semibold text-neutral-600">
                Du{" "}
                <input
                  type="date"
                  value={customFrom ?? ""}
                  onChange={(e) =>
                    startTransition(() => setCustomFrom(e.target.value || null))
                  }
                  className="ml-1 min-h-11 rounded-lg border border-black/10 bg-fs-card px-2 py-2 text-base touch-manipulation min-[900px]:py-1.5 min-[900px]:text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-neutral-600">
                au{" "}
                <input
                  type="date"
                  value={customTo ?? ""}
                  onChange={(e) =>
                    startTransition(() => setCustomTo(e.target.value || null))
                  }
                  className="ml-1 min-h-11 rounded-lg border border-black/10 bg-fs-card px-2 py-2 text-base touch-manipulation min-[900px]:py-1.5 min-[900px]:text-sm"
                />
              </label>
            </div>
          ) : null}
        </SoftCard>

        {/* KPI */}
        <div className="mt-4 grid grid-cols-2 gap-2 min-[700px]:grid-cols-4 min-[1200px]:grid-cols-8 min-[1200px]:gap-2.5">
          <KpiTile
            title="Chiffre d'affaires"
            value={formatCurrency(d.salesSummary.totalAmount)}
            sub={`${d.salesSummary.count} vente${d.salesSummary.count > 1 ? "s" : ""}`}
            icon={MdTrendingUp}
            iconBg="rgba(255,107,53,0.12)"
            iconColor={OWNER_ACCENT}
            deltaPct={pctVsPrev(d.salesSummary.totalAmount, prev.totalAmount)}
            href={helpers.canSales ? ROUTES.sales : undefined}
            valueClassName={OWNER_VALUE.revenue}
          />
          <KpiTile
            title="Marge"
            value={formatCurrency(d.salesSummary.margin)}
            sub={
              d.salesSummary.totalAmount > 0
                ? `${((d.salesSummary.margin / d.salesSummary.totalAmount) * 100).toFixed(1)}% du CA`
                : undefined
            }
            icon={MdPercent}
            iconBg="rgba(16,185,129,0.12)"
            iconColor="#059669"
            deltaPct={pctVsPrev(d.salesSummary.margin, prev.margin)}
            href={helpers.canSales ? ROUTES.sales : undefined}
            valueClassName={OWNER_VALUE.margin}
          />
          <KpiTile
            title="Ventes"
            value={`${d.salesSummary.count}`}
            sub={`${d.salesSummary.itemsSold} articles`}
            icon={MdShoppingCart}
            iconBg="rgba(37,99,235,0.1)"
            iconColor="#2563EB"
            deltaPct={pctVsPrev(d.salesSummary.count, prev.count)}
            href={helpers.canSales ? ROUTES.sales : undefined}
            valueClassName={OWNER_VALUE.sales}
          />
          <KpiTile
            title="Ticket moyen"
            value={formatCurrency(curTicket)}
            icon={MdReceiptLong}
            iconBg="rgba(14,165,233,0.12)"
            iconColor="#0EA5E9"
            deltaPct={pctVsPrev(curTicket, prevTicket)}
            href={helpers.canSales ? ROUTES.sales : undefined}
            valueClassName={OWNER_VALUE.ticket}
          />
          <KpiTile
            title={purchasesLabel}
            value={formatCurrency(d.purchasesSummary.totalAmount)}
            sub={`${d.purchasesSummary.count} commande${d.purchasesSummary.count > 1 ? "s" : ""}`}
            icon={MdLocalShipping}
            iconBg="rgba(217,119,6,0.12)"
            iconColor="#D97706"
            deltaPct={pctVsPrev(
              d.purchasesSummary.totalAmount,
              d.previousPurchasesSummary.totalAmount,
            )}
            href={helpers.canPurchases ? ROUTES.purchases : reportsHref}
            valueClassName={OWNER_VALUE.purchases}
          />
          <KpiTile
            title="Valeur stock"
            value={formatCurrency(d.stockValue.totalValue)}
            sub={`${d.stockValue.productCount} produits`}
            icon={MdWarehouse}
            iconBg="rgba(124,58,237,0.1)"
            iconColor="#7C3AED"
            deltaPct={null}
            deltaLabel="instantané (hors comparaison)"
            href={helpers.canInventory ? ROUTES.inventory : undefined}
            valueClassName={OWNER_VALUE.stock}
          />
          <KpiTile
            title="Articles vendus"
            value={`${d.salesSummary.itemsSold}`}
            icon={MdInventory2}
            iconBg="rgba(59,130,246,0.1)"
            iconColor="#2563EB"
            deltaPct={pctVsPrev(d.salesSummary.itemsSold, prev.itemsSold)}
            href={helpers.canSales ? ROUTES.sales : undefined}
            valueClassName={OWNER_VALUE.items}
          />
          <KpiTile
            title="Alertes stock"
            value={`${d.lowStockCount}`}
            sub={d.lowStockCount > 0 ? "Voir inventaire" : "RAS"}
            icon={MdShowChart}
            iconBg="rgba(239,68,68,0.1)"
            iconColor="#DC2626"
            deltaPct={null}
            deltaLabel="seuil actuel (hors comparaison)"
            href={helpers.canInventory ? ROUTES.inventory : reportsHref}
            valueClassName={OWNER_VALUE.alert}
          />
        </div>

        {/* Recommandations */}
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-end min-[520px]:justify-between">
            <h2 className="text-base font-extrabold leading-snug text-neutral-900">
              Actions recommandées pour votre commerce
            </h2>
            <Link
              href={reportsHref}
              scroll={false}
              className="min-h-11 shrink-0 self-center text-sm font-bold text-[var(--owner-accent)] hover:underline touch-manipulation"
            >
              Voir toutes les recommandations
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 min-[800px]:grid-cols-2 min-[1100px]:grid-cols-4">
            {recCards.slice(0, 4).map((c) => (
              <Link key={c.title} href={c.href} scroll={false} className="block touch-manipulation">
                <SoftCard
                  className={cn(
                    "h-full overflow-hidden p-3 transition hover:shadow-md dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.35)] min-[900px]:p-4",
                    c.tone === "amber" &&
                      "bg-amber-50/50 ring-amber-100/80 dark:bg-amber-950/35 dark:ring-amber-500/20",
                    c.tone === "emerald" &&
                      "bg-emerald-50/50 ring-emerald-100/80 dark:bg-emerald-950/35 dark:ring-emerald-500/20",
                    c.tone === "sky" &&
                      "bg-sky-50/50 ring-sky-100/80 dark:bg-sky-950/35 dark:ring-sky-500/20",
                    c.tone === "violet" &&
                      "bg-violet-50/40 ring-violet-100/80 dark:bg-violet-950/35 dark:ring-violet-500/20",
                  )}
                >
                  <p className="text-xs font-extrabold leading-snug break-words text-neutral-900 min-[900px]:text-sm">
                    {c.title}
                  </p>
                  <p className="mt-1.5 text-[11px] font-medium leading-relaxed break-words text-neutral-600 min-[900px]:text-xs">
                    {c.body}
                  </p>
                </SoftCard>
              </Link>
            ))}
          </div>
        </section>

        {/* Graphiques + listes */}
        <div
          className={cn(
            "mt-6 grid gap-4",
            isWide ? "min-[900px]:grid-cols-[1.35fr_1fr_320px]" : "grid-cols-1",
          )}
        >
          <SoftCard className="min-h-[280px] overflow-hidden p-3 min-[900px]:min-h-[300px] min-[900px]:p-4">
            <div className="mb-2 flex min-w-0 items-center gap-2 min-[900px]:mb-3">
              <MdShowChart className="h-4 w-4 shrink-0 text-[var(--owner-accent)] min-[900px]:h-5 min-[900px]:w-5" aria-hidden />
              <h3 className="min-w-0 text-xs font-extrabold leading-snug text-neutral-900 min-[900px]:text-sm">
                Évolution du chiffre d&apos;affaires
              </h3>
            </div>
            <div className="min-h-0 min-w-0">
              <DashboardLineChart data={d.salesByDay} />
            </div>
          </SoftCard>
          <SoftCard className="overflow-hidden p-3 min-[900px]:p-4">
            <h3 className="mb-2 min-w-0 text-xs font-extrabold text-neutral-900 min-[900px]:mb-3 min-[900px]:text-sm">
              Ventes par catégorie
            </h3>
            <DashboardPieChart
              categories={d.salesByCategory}
              total={totalCat}
              legendMax={isWide ? 6 : 4}
              centerHint={null}
            />
          </SoftCard>
          <div className="flex flex-col gap-4">
            <SoftCard className="overflow-hidden p-3 min-[900px]:p-4">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <h3 className="min-w-0 text-xs font-extrabold text-neutral-900 min-[900px]:text-sm">
                  Top produits
                </h3>
                <Link
                  href={reportsHref}
                  scroll={false}
                  className="min-h-11 shrink-0 text-xs font-bold text-[var(--owner-accent)] hover:underline touch-manipulation"
                >
                  Voir tout
                </Link>
              </div>
              <ul className="space-y-2">
                {d.topProducts.slice(0, 3).map((p, i) => (
                  <li
                    key={p.productId}
                    className="flex min-w-0 items-center justify-between gap-2 text-xs min-[900px]:text-sm"
                  >
                    <span className="min-w-0 truncate font-medium text-neutral-800">
                      <span className="mr-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[10px] font-bold text-neutral-600 min-[900px]:mr-2 min-[900px]:h-6 min-[900px]:w-6 min-[900px]:text-xs">
                        {i + 1}
                      </span>
                      {p.productName}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 max-w-[min(100%,11rem)] text-right font-extrabold leading-tight tracking-tight break-words tabular-nums",
                        OWNER_VALUE.revenue,
                      )}
                    >
                      {formatCurrency(p.revenue)}
                    </span>
                  </li>
                ))}
                {d.topProducts.length === 0 ? (
                  <li className="text-xs text-neutral-500">Aucune vente sur la période</li>
                ) : null}
              </ul>
            </SoftCard>
            <SoftCard className="overflow-hidden p-3 min-[900px]:p-4">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <h3 className="min-w-0 text-xs font-extrabold text-neutral-900 min-[900px]:text-sm">
                  Meilleure marge
                </h3>
                <Link
                  href={reportsHref}
                  scroll={false}
                  className="min-h-11 shrink-0 text-xs font-bold text-[var(--owner-accent)] hover:underline touch-manipulation"
                >
                  Voir tout
                </Link>
              </div>
              <ul className="space-y-2">
                {d.topByMargin.map((p) => (
                  <li
                    key={p.productId}
                    className="flex min-w-0 items-center justify-between gap-2 text-xs min-[900px]:text-sm"
                  >
                    <span className="min-w-0 truncate font-medium text-neutral-800">
                      {p.productName}
                    </span>
                    <span className="min-w-0 max-w-[min(100%,11rem)] text-right font-bold leading-tight break-words tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(p.margin)}
                    </span>
                  </li>
                ))}
                {d.topByMargin.length === 0 ? (
                  <li className="text-xs text-neutral-500">Pas assez de données</li>
                ) : null}
              </ul>
            </SoftCard>
            <SoftCard className="overflow-hidden p-3 min-[900px]:p-4">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <h3 className="min-w-0 text-xs font-extrabold text-neutral-900 min-[900px]:text-sm">
                  Produits à surveiller
                </h3>
                <Link
                  href={helpers.canInventory ? ROUTES.inventory : reportsHref}
                  scroll={false}
                  className="min-h-11 shrink-0 text-xs font-bold text-[var(--owner-accent)] hover:underline touch-manipulation"
                >
                  Voir tout
                </Link>
              </div>
              <ul className="space-y-2">
                {d.stockWatchSamples.slice(0, 3).map((s, idx) => (
                  <li
                    key={`${s.productName}-${idx}`}
                    className="flex min-w-0 items-center justify-between gap-2 text-xs min-[900px]:text-sm"
                  >
                    <span className="min-w-0 truncate font-medium text-neutral-800">
                      {s.productName}
                    </span>
                    <span className="max-w-[45%] shrink-0 rounded-md bg-red-50 px-1.5 py-0.5 text-center text-[9px] font-bold uppercase leading-tight break-words text-red-700 ring-1 ring-red-100 min-[900px]:max-w-none min-[900px]:px-2 min-[900px]:text-[10px] dark:bg-red-950/50 dark:text-red-300 dark:ring-red-500/25">
                      Stock {s.quantity}
                    </span>
                  </li>
                ))}
                {d.leastByRevenue.slice(0, 2).map((p) => (
                  <li
                    key={`least-${p.productId}`}
                    className="flex min-w-0 items-center justify-between gap-2 text-xs min-[900px]:text-sm"
                  >
                    <span className="min-w-0 truncate font-medium text-neutral-800">
                      {p.productName}
                    </span>
                    <span className="max-w-[45%] shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-center text-[9px] font-bold uppercase leading-tight break-words text-amber-800 ring-1 ring-amber-100 min-[900px]:max-w-none min-[900px]:px-2 min-[900px]:text-[10px] dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-500/25">
                      Faible CA
                    </span>
                  </li>
                ))}
                {d.stockWatchSamples.length === 0 && d.leastByRevenue.length === 0 ? (
                  <li className="text-xs text-neutral-500">Rien à signaler</li>
                ) : null}
              </ul>
            </SoftCard>
          </div>
        </div>

        {/* Actions rapides */}
        <section className="mt-8">
          <h3 className="mb-3 text-base font-extrabold text-neutral-900">Actions rapides</h3>
          <div
            className={cn(
              "flex gap-3 overflow-x-auto overflow-y-visible pb-2 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              "snap-x snap-mandatory min-[1100px]:grid min-[1100px]:snap-none min-[1100px]:grid-cols-8 min-[1100px]:gap-3 min-[1100px]:overflow-visible",
            )}
          >
            {visibleQuick.map((t) => (
              <Link
                key={`${t.label}-${t.href}`}
                href={t.href}
                scroll={false}
                prefetch
                className="group block min-w-[min(46vw,11.5rem)] shrink-0 snap-start touch-manipulation min-[1100px]:min-w-0"
              >
                <div
                  className={cn(
                    "flex min-h-[96px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-[14px] p-2.5 text-center ring-1 transition group-active:scale-[0.99] min-[1100px]:min-h-[88px] min-[1100px]:p-3 dark:ring-white/10",
                    t.bg,
                  )}
                >
                  <t.icon className="h-6 w-6 shrink-0 opacity-90 min-[1100px]:h-5 min-[1100px]:w-5" aria-hidden />
                  <span className="w-full min-w-0 px-0.5 text-[11px] font-extrabold leading-tight break-words min-[1100px]:text-[10px]">
                    {t.label}
                  </span>
                  {t.sub ? (
                    <span className="w-full min-w-0 px-0.5 text-[10px] font-semibold leading-tight break-words opacity-80 min-[1100px]:text-[9px]">
                      {t.sub}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </section>

        <p className="mt-6 text-center text-xs font-medium text-neutral-400 min-[900px]:text-[11px]">
          Période sélectionnée : {rangeFooter.from} — {rangeFooter.to} · {companyName}
        </p>
      </div>
    </div>
  );
}
