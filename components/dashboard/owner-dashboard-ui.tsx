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
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  MdAddShoppingCart,
  MdAssessment,
  MdCalendarToday,
  MdCheckCircle,
  MdChevronRight,
  MdCreditCard,
  MdDescription,
  MdExpandLess,
  MdExpandMore,
  MdInventory2,
  MdLocalShipping,
  MdPayments,
  MdPercent,
  MdPointOfSale,
  MdReceiptLong,
  MdSavings,
  MdShoppingCart,
  MdShowChart,
  MdTrendingDown,
  MdTrendingUp,
  MdWarehouse,
  MdWarningAmber,
} from "react-icons/md";
import {
  DashboardLineChart,
  DashboardPieChart,
} from "@/components/dashboard/dashboard-charts";
import { PaymentMixPanel } from "@/components/dashboard/payment-mix-panel";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { getDefaultDateRange } from "@/lib/features/dashboard/date-range";
import { operationTodayYmd } from "@/lib/utils/operation-datetime";

/** Aligné sur `--fs-accent` / `globals.css`. */
const OWNER_ACCENT = "#E85D2C";

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

/** Typographie compacte des cartes (listes, graphiques). */
const OWNER_SOFT_CARD_TITLE =
  "min-w-0 text-[11px] font-extrabold leading-snug text-neutral-900 min-[900px]:text-xs";
const OWNER_SOFT_CARD_LINK =
  "min-h-11 shrink-0 text-[11px] font-bold text-[var(--owner-accent)] hover:underline touch-manipulation";
const OWNER_SOFT_CARD_ROW = "text-[11px] min-[900px]:text-xs";

/** Listes défilantes des cartes : lignes séparées, hauteur confortable au doigt. */
const OWNER_SCROLL_LIST = "divide-y divide-black/[0.05] dark:divide-white/[0.07]";
const OWNER_SCROLL_ROW =
  "flex min-w-0 items-center justify-between gap-2 py-2 first:pt-0.5 last:pb-0.5";
const OWNER_SCROLL_EMPTY =
  "py-2 text-[11px] text-neutral-500 min-[900px]:text-xs";

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

/**
 * Carte-liste à contenu long. L'en-tête (titre, total, « Voir tout ») reste fixe.
 *
 * UX — deux modes, pour ne JAMAIS piéger le défilement de la page :
 *  • Desktop (`isWide`) : défilement interne à la molette. Le sur-scroll n'est PAS
 *    confiné (cf. `fs-scroll-y`) → arrivé en bas de la liste, la page reprend le
 *    relais dans le même geste, et il reste de la place autour des cartes pour
 *    scroller la page.
 *  • Mobile / tablette : AUCUN scroller imbriqué (la carte occupe toute la largeur,
 *    le doigt tomberait forcément dessus). La liste est repliée en hauteur et un
 *    bouton la déplie sur place — le geste vertical scrolle toujours la page.
 *
 * Dans les deux cas, les dégradés haut/bas n'apparaissent que s'il reste du contenu
 * dans cette direction (affordance), et le total dans l'en-tête annonce le volume.
 */
function SoftScrollListCard({
  title,
  count,
  href,
  linkLabel = "Voir tout",
  ariaLabel,
  isWide,
  children,
}: {
  title: string;
  count: number;
  href: string;
  linkLabel?: string;
  ariaLabel: string;
  isWide: boolean;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const [expanded, setExpanded] = useState(false);

  const syncEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const scrollable = max > 4;
    const next = {
      top: scrollable && el.scrollTop > 4,
      bottom: scrollable && el.scrollTop < max - 4,
    };
    setEdges((prev) =>
      prev.top === next.top && prev.bottom === next.bottom ? prev : next,
    );
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") return;
    // Le 1er callback est émis dès `observe()` → mesure initiale incluse.
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    const inner = el.firstElementChild;
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, [syncEdges, count, isWide, expanded]);

  // Mobile : `edges.bottom` (scrollTop toujours 0, overflow masqué) ⇒ « il reste
  // des lignes cachées sous le pli ».
  const showToggle = !isWide && (expanded || edges.bottom);

  return (
    <SoftCard className="overflow-hidden p-3 min-[900px]:p-4">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className={OWNER_SOFT_CARD_TITLE}>{title}</h3>
          {count > 0 ? (
            <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-bold tabular-nums leading-none text-neutral-600 min-[900px]:text-[10px] dark:bg-white/10 dark:text-neutral-300">
              {count}
            </span>
          ) : null}
        </div>
        <Link href={href} scroll={false} className={OWNER_SOFT_CARD_LINK}>
          {linkLabel}
        </Link>
      </div>
      <div className="relative min-w-0">
        <div
          ref={scrollRef}
          onScroll={isWide ? syncEdges : undefined}
          tabIndex={isWide ? 0 : undefined}
          role={isWide ? "group" : undefined}
          aria-label={isWide ? ariaLabel : undefined}
          className={cn(
            "min-w-0 rounded-lg",
            isWide
              ? "fs-scroll-y max-h-[15.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--owner-accent)]/40"
              : cn(
                  "overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none",
                  expanded ? "max-h-[200rem]" : "max-h-[11.5rem]",
                ),
          )}
        >
          {children}
        </div>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-fs-card to-transparent transition-opacity duration-200",
            edges.top ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-fs-card to-transparent transition-opacity duration-200",
            edges.bottom && !expanded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
      {showToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 flex min-h-11 w-full touch-manipulation items-center justify-center gap-1 rounded-lg text-[11px] font-bold text-[var(--owner-accent)] active:bg-[var(--owner-accent)]/8"
        >
          {expanded ? "Réduire" : `Tout afficher (${count})`}
          {expanded ? (
            <MdExpandLess className="h-4 w-4" aria-hidden />
          ) : (
            <MdExpandMore className="h-4 w-4" aria-hidden />
          )}
        </button>
      ) : null}
    </SoftCard>
  );
}

/**
 * Fond deux tons + icône filigrane. Palette SÉMANTIQUE : la couleur porte le sens
 * métier (pas seulement la marque) pour une lecture instantanée —
 *   • gains / argent gagné → vert
 *   • comptes informatifs (ventes, ticket, articles) → bleus / teal
 *   • dépenses (achats) → ambre (sortie d'argent, prudence)
 *   • valeur de stock (actif immobilisé) → violet
 *   • danger (alertes) → rouge si présent, vert si tout va bien
 *   • CA = métrique phare → orange de marque (ancrage identité)
 */
type OwnerKpiTheme = { top: string; footer: string };

const FASO_BRAND = {
  accent: "#E85D2C",
  accentDark: "#C2410C",
  // Sémantique
  emerald: "#059669",
  emeraldDark: "#047857",
  blue: "#2563EB",
  blueDark: "#1D4ED8",
  sky: "#0EA5E9",
  skyDark: "#0284C7",
  amber: "#D97706",
  amberDark: "#B45309",
  violet: "#7C3AED",
  violetDark: "#6D28D9",
  teal: "#0D9488",
  tealDark: "#0F766E",
  danger: "#DC2626",
  dangerDark: "#B91C1C",
} as const;

const OWNER_KPI_THEMES = {
  revenue: { top: FASO_BRAND.accent, footer: FASO_BRAND.accentDark },
  margin: { top: FASO_BRAND.emerald, footer: FASO_BRAND.emeraldDark },
  /** Bénéfice net (marge − dépenses) — vert profond, distinct de la marge brute. */
  net: { top: FASO_BRAND.emeraldDark, footer: "#065F46" },
  sales: { top: FASO_BRAND.blue, footer: FASO_BRAND.blueDark },
  ticket: { top: FASO_BRAND.sky, footer: FASO_BRAND.skyDark },
  purchases: { top: FASO_BRAND.amber, footer: FASO_BRAND.amberDark },
  stock: { top: FASO_BRAND.violet, footer: FASO_BRAND.violetDark },
  items: { top: FASO_BRAND.teal, footer: FASO_BRAND.tealDark },
  /** Danger (alertes présentes). Pour « tout va bien », utiliser `alertOk`. */
  alert: { top: FASO_BRAND.danger, footer: FASO_BRAND.dangerDark },
  /** Aucune alerte : vert « tout va bien ». */
  alertOk: { top: FASO_BRAND.emerald, footer: FASO_BRAND.emeraldDark },
} as const satisfies Record<string, OwnerKpiTheme>;

function OwnerKpiCardShell({
  theme,
  watermark: Watermark,
  className,
  children,
  compact = false,
}: {
  theme: OwnerKpiTheme;
  watermark: ComponentType<{ className?: string }>;
  className?: string;
  children: ReactNode;
  /** Variante plus basse (stats du jour dans le bandeau accueil). */
  compact?: boolean;
}) {
  const cardBackground = `linear-gradient(180deg, ${theme.top} 0%, ${theme.top} 68%, ${theme.footer} 100%)`;

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg",
        compact ? "min-h-[4.25rem]" : "min-h-[5.75rem]",
        className,
      )}
      style={{ background: cardBackground }}
    >
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-hidden",
          compact ? "p-1.5 min-[600px]:p-2" : "p-2 min-[900px]:p-2.5",
        )}
      >
        <span
          className={cn(
            "fs-kpi-card-watermark pointer-events-none absolute -right-0.5 bottom-0 text-white",
            compact
              ? "fs-kpi-card-watermark--compact h-[2.5rem] w-[2.5rem] min-[600px]:h-[2.75rem] min-[600px]:w-[2.75rem]"
              : "h-[3.25rem] w-[3.25rem] sm:h-[3.5rem] sm:w-[3.5rem]",
          )}
          aria-hidden
        >
          <Watermark className="h-full w-full" />
        </span>
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

function OwnerDayStatCard({
  label,
  value,
  theme,
  watermark,
  sub,
  loading = false,
}: {
  label: string;
  value: string;
  theme: OwnerKpiTheme;
  watermark: ComponentType<{ className?: string }>;
  /** Petite ligne de ventilation sous la valeur (ex. « Ventes X · Crédits Y »). */
  sub?: string;
  /**
   * Le libellé suit la date choisie immédiatement, la valeur vient de la requête.
   * Tant que la nouvelle journée n'est pas chargée, on masque le chiffre : afficher
   * l'ancien montant sous le nouveau libellé serait faux (et donne l'impression
   * que le tableau de bord ne réagit pas).
   */
  loading?: boolean;
}) {
  return (
    <OwnerKpiCardShell theme={theme} watermark={watermark} compact>
      <p className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-white/85 min-[600px]:text-[10px]">
        {label}
      </p>
      {loading ? (
        <div
          className="mt-1 h-3.5 w-2/3 rounded bg-white/35 motion-safe:animate-pulse min-[600px]:h-4"
          aria-label="Chargement"
        />
      ) : (
        <p className="mt-0.5 min-w-0 max-w-full break-words text-xs font-extrabold leading-snug tracking-tight text-white tabular-nums min-[600px]:text-sm">
          {value}
        </p>
      )}
      {sub && !loading ? (
        <p className="mt-0.5 min-w-0 max-w-full truncate text-[8px] font-semibold leading-tight text-white/75 tabular-nums min-[600px]:text-[9px]">
          {sub}
        </p>
      ) : null}
    </OwnerKpiCardShell>
  );
}

function KpiTile({
  title,
  value,
  sub,
  icon: Icon,
  iconBg,
  iconColor,
  theme,
  deltaPct,
  href,
  deltaLabel = "vs période précédente",
}: {
  title: string;
  value: string;
  sub?: string;
  icon: ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  theme: OwnerKpiTheme;
  deltaPct: number | null;
  href?: string;
  /** Texte après le pourcentage (ex. comparaison non applicable). */
  deltaLabel?: string;
}) {
  const d = formatDelta(deltaPct);
  const inner = (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] sm:h-8 sm:w-8"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-1.5 text-[9px] font-semibold uppercase leading-tight tracking-wide text-white/85 min-[900px]:text-[10px]">
        {title}
      </p>
      <p className="mt-0.5 min-w-0 max-w-full break-words text-xs font-extrabold leading-tight tracking-tight text-white tabular-nums min-[900px]:text-sm">
        {value}
      </p>
      <div className="mt-1 flex min-w-0 max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 text-[9px] leading-snug min-[900px]:text-[10px]">
        {d.up === null ? (
          <span className="min-w-0 break-words font-semibold text-white/70">
            {d.text} {deltaLabel}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex min-w-0 max-w-full items-center gap-0.5 break-words font-bold",
              d.up ? "text-[#FFEDD5]" : "text-[#FECACA]",
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
        <p className="mt-0.5 min-w-0 break-words text-[9px] leading-snug text-white/75 min-[900px]:text-[10px]">
          {sub}
        </p>
      ) : null}
    </div>
  );
  const card = (
    <OwnerKpiCardShell
      theme={theme}
      watermark={Icon}
      className={cn(
        href &&
          "cursor-pointer transition-[filter] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] hover:brightness-[1.03]",
      )}
    >
      {inner}
    </OwnerKpiCardShell>
  );
  if (href) {
    return (
      <Link
        href={href}
        scroll={false}
        className="group block h-full min-h-[44px] min-w-0 touch-manipulation"
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
  /** Réglage owner « Détail des encaissements » — volet repliable sous les cartes. */
  paymentMixEnabled: boolean;
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
    paymentMixEnabled,
  } = props;

  const router = useRouter();
  const [stockPanelOpen, setStockPanelOpen] = useState(false);

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

  // Bénéfice net = marge − dépenses (jour & période). Gardes anti-donnée périmée.
  const dayExpensesTotal = d.dayExpenses?.totalAmount ?? 0;
  const dayNet = d.daySalesSummary.margin - dayExpensesTotal;
  const periodExpensesTotal = d.expensesSummary?.totalAmount ?? 0;
  const prevExpensesTotal = d.previousExpensesSummary?.totalAmount ?? 0;
  const periodNet = d.salesSummary.margin - periodExpensesTotal;
  const prevPeriodNet = prev.margin - prevExpensesTotal;

  const welcomeTrend = pctVsPrev(d.salesSummary.totalAmount, prev.totalAmount);
  const welcome =
    welcomeTrend === null
      ? "Vos indicateurs clés pour piloter votre activité."
      : welcomeTrend > 2
        ? "Aujourd’hui, votre activité est en hausse."
        : welcomeTrend < -2
          ? "Aujourd’hui, surveillez vos marges et votre stock."
          : "Aujourd’hui, votre activité est stable.";

  const headerDate = (() => {
    try {
      return format(parseISO(selectedDay), "dd/MM/yyyy", { locale: fr });
    } catch {
      return selectedDay;
    }
  })();

  // Libellés du bandeau « jour » : « aujourd'hui » si la date choisie EST aujourd'hui,
  // sinon la date sélectionnée (ex. « le 20/07 ») — évite d'écrire « aujourd'hui » sur un jour passé.
  const isSelectedToday = selectedDay === operationTodayYmd();
  const dayShort = (() => {
    try {
      return format(parseISO(selectedDay), "dd/MM", { locale: fr });
    } catch {
      return selectedDay;
    }
  })();
  const daySuffix = isSelectedToday ? "aujourd'hui" : `le ${dayShort}`;
  /** Variante complément de nom : « les encaissements DU jour / DU 20/07 ». */
  const dayOfSuffix = isSelectedToday ? "du jour" : `du ${dayShort}`;

  /**
   * `isPlaceholderData` = les chiffres affichés appartiennent encore à la sélection
   * précédente (date, période ou boutique). Le libellé du bandeau « jour », lui, suit
   * la date choisie instantanément : sans ce garde-fou on affiche « Encaissé le 15/07 »
   * au-dessus du montant de la veille, et rien ne signale que le calcul est en cours.
   */
  const dayFiguresStale = isPlaceholderData;

  const totalCat =
    d.salesByCategory.reduce((s, e) => s + e.revenue, 0) ?? 0;

  const storeIdForLinks = effectiveStoreId ?? ctxStoreId;
  const stockAlertScopeLabel =
    scope === "store"
      ? stores.find((s) => s.id === (dashboardStoreId ?? ctxStoreId))?.name ??
        terms.storeSingular
      : "toutes vos boutiques actives";

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
        "fs-owner-dashboard relative min-w-0 pb-10 [--owner-accent:#E85D2C]",
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
            <div className="flex min-h-9 flex-wrap items-center gap-2 touch-manipulation">
              <MdCalendarToday className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <input
                type="date"
                value={selectedDay}
                max={operationTodayYmd()}
                onChange={(e) =>
                  startTransition(() => setSelectedDay(e.target.value))
                }
                className="min-h-9 min-w-0 flex-1 rounded-lg border border-black/8 bg-fs-card px-2 py-1.5 text-base font-semibold text-neutral-800 min-[900px]:max-w-[11rem] min-[900px]:text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  startTransition(() =>
                    setSelectedDay(operationTodayYmd()),
                  )
                }
                className="min-h-9 shrink-0 rounded-lg bg-fs-card px-3 py-1.5 text-xs font-bold text-[var(--owner-accent)] ring-1 ring-black/8 touch-manipulation min-[900px]:text-xs dark:ring-white/12"
              >
                Aujourd&apos;hui
              </button>
            </div>
            {/*
              La barre de progression de 2 px est ancrée en haut du tableau de bord :
              invisible dès que la page est défilée. On double donc le signal ici, juste
              sous le sélecteur — là où l'œil se trouve après avoir choisi une date.
            */}
            {isFetching ? (
              <p className="inline-flex items-center justify-center gap-1.5 px-0.5 text-center text-xs font-bold text-[var(--owner-accent)] sm:justify-start sm:text-left">
                <span
                  className="h-3 w-3 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
                  aria-hidden
                />
                Calcul en cours…
              </p>
            ) : (
              <p className="px-0.5 text-center text-xs font-semibold text-neutral-500 sm:text-left">
                {headerDate}
              </p>
            )}
          </div>
        </div>

        {/* Bandeau accueil + stats du jour + alertes stock */}
        <SoftCard className="mt-5 p-4 min-[900px]:p-5">
          <p className="text-sm font-semibold text-neutral-800">
            Bonjour ! <span aria-hidden>👋</span> {welcome}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 min-[600px]:grid-cols-3 min-[900px]:grid-cols-6">
            <OwnerDayStatCard
              label={`Encaissé ${daySuffix}`}
              value={formatCurrency(d.daySalesSummary.totalAmount)}
              theme={OWNER_KPI_THEMES.revenue}
              watermark={MdTrendingUp}
              loading={dayFiguresStale}
            />
            <OwnerDayStatCard
              label={`Marge encaissée ${daySuffix}`}
              value={formatCurrency(d.daySalesSummary.margin)}
              theme={OWNER_KPI_THEMES.margin}
              watermark={MdPercent}
              loading={dayFiguresStale}
            />
            <OwnerDayStatCard
              label={`Dépenses ${daySuffix}`}
              value={formatCurrency(dayExpensesTotal)}
              theme={OWNER_KPI_THEMES.purchases}
              watermark={MdPayments}
              loading={dayFiguresStale}
            />
            <OwnerDayStatCard
              label="Bénéfice net"
              value={formatCurrency(dayNet)}
              theme={OWNER_KPI_THEMES.net}
              watermark={MdSavings}
              loading={dayFiguresStale}
            />
            <OwnerDayStatCard
              label="Ventes"
              value={`${d.daySalesSummary.count}`}
              theme={OWNER_KPI_THEMES.sales}
              watermark={MdShoppingCart}
              loading={dayFiguresStale}
            />
            <OwnerDayStatCard
              label="Articles vendus"
              value={`${d.daySalesSummary.itemsSold}`}
              theme={OWNER_KPI_THEMES.items}
              watermark={MdInventory2}
              loading={dayFiguresStale}
            />
          </div>

          {/* Même règle que les tuiles : pas de ventilation d'une journée pas encore calculée. */}
          {!dayFiguresStale && d.dayCreditRepayments > 0
            ? (() => {
                const total = Math.max(0, d.daySalesSummary.totalAmount);
                const credit = Math.min(total, Math.max(0, d.dayCreditRepayments));
                const sales = Math.max(0, total - credit);
                const salesPct = total > 0 ? (sales / total) * 100 : 0;
                const creditPct = total > 0 ? 100 - salesPct : 0;
                return (
                  <div className="mt-2.5 rounded-xl border border-black/[0.06] bg-fs-surface-container/60 p-3 dark:border-white/10">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                        Ventes du jour
                        <span className="tabular-nums">{formatCurrency(sales)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                        Crédits remboursés
                        <span className="tabular-nums">{formatCurrency(credit)}</span>
                      </span>
                    </div>
                    <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                      <div className="h-full bg-emerald-500" style={{ width: `${salesPct}%` }} aria-hidden />
                      <div className="h-full bg-amber-500" style={{ width: `${creditPct}%` }} aria-hidden />
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">
                      Sur {formatCurrency(total)} encaissés {daySuffix}, {formatCurrency(credit)} proviennent
                      de crédits d&apos;anciennes ventes — votre vente réelle du jour est de{" "}
                      <span className="font-semibold text-fs-text">{formatCurrency(sales)}</span>.
                    </p>
                  </div>
                );
              })()
            : null}

          {/*
            Extension repliable du bandeau du jour. Réglage coupé ⇒ rien n'est rendu :
            le bandeau reste identique à ce qu'il a toujours été.
          */}
          {paymentMixEnabled ? (
            <PaymentMixPanel
              title={`Détail des encaissements ${dayOfSuffix}`}
              entries={d.dayPaymentMix ?? []}
              total={d.daySalesSummary.totalAmount}
              loading={dayFiguresStale}
              storageKey="fs.dashboard.paymentMix.day"
              emptyLabel={`Aucun encaissement ${daySuffix}.`}
            />
          ) : null}

          <div className="mt-3">
            <button
              type="button"
              aria-expanded={stockPanelOpen}
              onClick={() => setStockPanelOpen((o) => !o)}
              className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-left text-sm font-bold text-red-700 ring-1 ring-red-100 transition hover:bg-red-50/90 touch-manipulation dark:bg-red-950/35 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-950/45"
            >
              <span className="min-w-0 text-left leading-snug">
                {d.lowStockCount} alerte{d.lowStockCount > 1 ? "s" : ""} stock
                <span className="mt-0.5 block text-[11px] font-semibold opacity-90">
                  {stockAlertScopeLabel}
                </span>
              </span>
              <MdChevronRight
                className={cn(
                  "h-5 w-5 shrink-0 opacity-80 transition-transform duration-300 ease-out",
                  stockPanelOpen && "rotate-90",
                )}
                aria-hidden
              />
            </button>
            {stockPanelOpen ? (
              <div
                className="mt-2 space-y-1.5 rounded-xl border border-red-100 bg-red-50/80 p-2.5 dark:border-red-500/25 dark:bg-red-950/35"
                role="region"
                aria-label="Alertes stock détaillées"
              >
                <p className="text-sm font-medium leading-snug text-red-900 dark:text-red-100">
                  Stock faible ou épuisé — {stockAlertScopeLabel}
                </p>
                {d.lowStockCount === 0 ? (
                  <p className="text-xs text-neutral-600 dark:text-fs-on-surface-variant">
                    Aucun produit en alerte pour le moment.
                  </p>
                ) : d.stockWatchSamples.length === 0 ? (
                  <p className="text-xs text-red-800 dark:text-red-200">
                    {d.lowStockCount} produit{d.lowStockCount > 1 ? "s" : ""} en alerte. Ouvrez
                    Inventaire pour voir la liste complète.
                  </p>
                ) : (
                  <>
                    <ul className="max-h-[min(220px,40vh)] space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
                      {d.stockWatchSamples.map((s, idx) => (
                        <li
                          key={`${s.storeName ?? ""}-${s.productName}-${idx}`}
                          className="flex items-center justify-between gap-2 rounded-lg bg-fs-card/90 px-2.5 py-2 text-xs ring-1 ring-black/5 dark:ring-white/10"
                        >
                          <span className="min-w-0 truncate font-medium text-neutral-800 dark:text-fs-text">
                            {s.productName}
                            {s.storeName ? (
                              <span className="block truncate text-[10px] font-semibold text-neutral-500 dark:text-fs-on-surface-variant">
                                {s.storeName}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-red-800 dark:bg-red-950/60 dark:text-red-200">
                            {s.quantity} en stock
                            {s.threshold > 0 ? ` · min. ${s.threshold}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {d.lowStockCount > d.stockWatchSamples.length ? (
                      <p className="pt-1 text-xs text-red-800/90 dark:text-red-200/90">
                        … et {d.lowStockCount - d.stockWatchSamples.length} autre
                        {d.lowStockCount - d.stockWatchSamples.length > 1 ? "s" : ""}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
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
                  "min-h-9 touch-manipulation rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
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
                    "min-h-9 touch-manipulation rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
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
                  className="min-h-9 w-full min-w-0 rounded-lg border border-black/10 bg-fs-card px-2 py-1.5 text-base font-semibold text-neutral-800 touch-manipulation min-[900px]:text-sm"
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
                <span className="rounded-lg bg-neutral-50 px-3 py-1.5 text-sm font-semibold text-neutral-500 ring-1 ring-black/5 dark:ring-white/10">
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
                    "min-h-9 touch-manipulation rounded-lg px-2.5 py-1.5 text-xs font-bold",
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
                className="min-h-9 w-full rounded-lg border border-black/8 bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-800 ring-1 ring-black/6 touch-manipulation min-[900px]:text-sm dark:bg-fs-surface-low"
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
                  className="ml-1 min-h-9 rounded-lg border border-black/10 bg-fs-card px-2 py-1.5 text-base touch-manipulation min-[900px]:text-sm"
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
                  className="ml-1 min-h-9 rounded-lg border border-black/10 bg-fs-card px-2 py-1.5 text-base touch-manipulation min-[900px]:text-sm"
                />
              </label>
              {/*
                Plage inversée : le tableau de bord ne calcule plus rien (`enabled` retombe
                à faux) — y compris le bandeau du jour. Sans ce message, l'écran semblait
                simplement figé, sans aucune explication.
              */}
              {customFrom && customTo && customFrom > customTo ? (
                <p className="w-full text-xs font-bold text-amber-600">
                  La date de début est après la date de fin — le tableau de bord reste sur
                  la dernière période valide.
                </p>
              ) : null}
            </div>
          ) : null}
        </SoftCard>

        {/* KPI */}
        <div className="mt-4 grid grid-cols-2 gap-2 min-[700px]:grid-cols-4 min-[1200px]:grid-cols-5 min-[1200px]:gap-2.5">
          <KpiTile
            title="CA encaissé"
            value={formatCurrency(d.salesSummary.totalAmount)}
            sub={
              d.periodCreditRepayments > 0
                ? `${d.salesSummary.count} vente${d.salesSummary.count > 1 ? "s" : ""} · dont ${formatCurrency(d.periodCreditRepayments)} crédits`
                : `${d.salesSummary.count} vente${d.salesSummary.count > 1 ? "s" : ""}`
            }
            icon={MdTrendingUp}
            iconBg="rgba(255,255,255,0.22)"
            iconColor="#ffffff"
            theme={OWNER_KPI_THEMES.revenue}
            deltaPct={pctVsPrev(d.salesSummary.totalAmount, prev.totalAmount)}
            href={helpers.canSales ? ROUTES.sales : undefined}
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
            iconBg="rgba(255,255,255,0.22)"
            iconColor="#ffffff"
            theme={OWNER_KPI_THEMES.margin}
            deltaPct={pctVsPrev(d.salesSummary.margin, prev.margin)}
            href={helpers.canSales ? ROUTES.sales : undefined}
          />
          <KpiTile
            title="Dépenses"
            value={formatCurrency(periodExpensesTotal)}
            sub={`${d.expensesSummary?.count ?? 0} charge${(d.expensesSummary?.count ?? 0) > 1 ? "s" : ""}`}
            icon={MdPayments}
            iconBg="rgba(255,255,255,0.22)"
            iconColor="#ffffff"
            theme={OWNER_KPI_THEMES.purchases}
            deltaPct={pctVsPrev(periodExpensesTotal, prevExpensesTotal)}
            href={helpers.canExpenses ? ROUTES.expenses : undefined}
          />
          <KpiTile
            title="Bénéfice net"
            value={formatCurrency(periodNet)}
            sub={
              d.salesSummary.totalAmount > 0
                ? `${((periodNet / d.salesSummary.totalAmount) * 100).toFixed(1)}% du CA`
                : "marge − dépenses"
            }
            icon={MdSavings}
            iconBg="rgba(255,255,255,0.22)"
            iconColor="#ffffff"
            theme={OWNER_KPI_THEMES.net}
            deltaPct={pctVsPrev(periodNet, prevPeriodNet)}
            href={helpers.canReports ? reportsHref : undefined}
          />
          <KpiTile
            title="Ventes"
            value={`${d.salesSummary.count}`}
            sub={`${d.salesSummary.itemsSold} articles`}
            icon={MdShoppingCart}
            iconBg="rgba(255,255,255,0.22)"
            iconColor="#ffffff"
            theme={OWNER_KPI_THEMES.sales}
            deltaPct={pctVsPrev(d.salesSummary.count, prev.count)}
            href={helpers.canSales ? ROUTES.sales : undefined}
          />
          <KpiTile
            title="Ticket moyen"
            value={formatCurrency(curTicket)}
            icon={MdReceiptLong}
            iconBg="rgba(255,255,255,0.22)"
            iconColor="#ffffff"
            theme={OWNER_KPI_THEMES.ticket}
            deltaPct={pctVsPrev(curTicket, prevTicket)}
            href={helpers.canSales ? ROUTES.sales : undefined}
          />
          <KpiTile
            title={purchasesLabel}
            value={formatCurrency(d.purchasesSummary.totalAmount)}
            sub={`${d.purchasesSummary.count} commande${d.purchasesSummary.count > 1 ? "s" : ""}`}
            icon={MdLocalShipping}
            iconBg="rgba(255,255,255,0.22)"
            iconColor="#ffffff"
            theme={OWNER_KPI_THEMES.purchases}
            deltaPct={pctVsPrev(
              d.purchasesSummary.totalAmount,
              d.previousPurchasesSummary.totalAmount,
            )}
            href={helpers.canPurchases ? ROUTES.purchases : reportsHref}
          />
          <KpiTile
            title="Valeur stock"
            value={formatCurrency(d.stockValue.totalValue)}
            sub={`${d.stockValue.productCount} produits`}
            icon={MdWarehouse}
            iconBg="rgba(255,255,255,0.22)"
            iconColor="#ffffff"
            theme={OWNER_KPI_THEMES.stock}
            deltaPct={null}
            deltaLabel="instantané (hors comparaison)"
            href={helpers.canInventory ? ROUTES.inventory : undefined}
          />
          <KpiTile
            title="Articles vendus"
            value={`${d.salesSummary.itemsSold}`}
            icon={MdInventory2}
            iconBg="rgba(255,255,255,0.22)"
            iconColor="#ffffff"
            theme={OWNER_KPI_THEMES.items}
            deltaPct={pctVsPrev(d.salesSummary.itemsSold, prev.itemsSold)}
            href={helpers.canSales ? ROUTES.sales : undefined}
          />
          <KpiTile
            title="Alertes stock"
            value={`${d.lowStockCount}`}
            sub={d.lowStockCount > 0 ? stockAlertScopeLabel : "RAS"}
            icon={d.lowStockCount > 0 ? MdWarningAmber : MdCheckCircle}
            iconBg="rgba(255,255,255,0.22)"
            iconColor="#ffffff"
            theme={d.lowStockCount > 0 ? OWNER_KPI_THEMES.alert : OWNER_KPI_THEMES.alertOk}
            deltaPct={null}
            deltaLabel="seuil actuel (hors comparaison)"
            href={helpers.canInventory ? ROUTES.inventory : reportsHref}
          />
        </div>

        {/* Extension repliable des tuiles KPI — même volet, portée PÉRIODE. */}
        {paymentMixEnabled ? (
          <PaymentMixPanel
            title="Détail des encaissements de la période"
            entries={d.periodPaymentMix ?? []}
            total={d.salesSummary.totalAmount}
            loading={isPlaceholderData}
            storageKey="fs.dashboard.paymentMix.period"
            emptyLabel="Aucun encaissement sur cette période."
          />
        ) : null}

        {/* Graphiques (2 colonnes) */}
        <div
          className={cn(
            "mt-6 grid gap-4",
            isWide ? "min-[900px]:grid-cols-[1.5fr_1fr]" : "grid-cols-1",
          )}
        >
          <SoftCard className="min-h-[280px] overflow-hidden p-3 min-[900px]:min-h-[340px] min-[900px]:p-4">
            <div className="mb-2 flex min-w-0 items-center gap-2 min-[900px]:mb-3">
              <MdShowChart className="h-4 w-4 shrink-0 text-[var(--owner-accent)] min-[900px]:h-5 min-[900px]:w-5" aria-hidden />
              <h3 className={OWNER_SOFT_CARD_TITLE}>
                Évolution du chiffre d&apos;affaires
              </h3>
            </div>
            <div className="min-h-0 min-w-0">
              <DashboardLineChart data={d.salesByDay} />
            </div>
          </SoftCard>
          <SoftCard className="overflow-hidden p-3 min-[900px]:p-4">
            <h3 className={cn("mb-2 min-[900px]:mb-3", OWNER_SOFT_CARD_TITLE)}>
              Ventes par catégorie
            </h3>
            <DashboardPieChart
              categories={d.salesByCategory}
              total={totalCat}
              legendMax={isWide ? 6 : 4}
              centerHint={null}
            />
          </SoftCard>
        </div>

        {/* Listes (2 colonnes) */}
        <div
          className={cn(
            "mt-4 grid items-start gap-4",
            isWide ? "min-[900px]:grid-cols-2" : "grid-cols-1",
          )}
        >
          <div className="flex flex-col gap-4">
            <SoftScrollListCard
              title="Top produits"
              count={d.topProducts.length}
              href={reportsHref}
              ariaLabel="Top produits par chiffre d'affaires — liste défilante"
              isWide={isWide}
            >
              <ul className={OWNER_SCROLL_LIST}>
                {d.topProducts.map((p, i) => (
                  <li
                    key={p.productId}
                    className={cn(OWNER_SCROLL_ROW, OWNER_SOFT_CARD_ROW)}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium text-neutral-800 min-[900px]:gap-2">
                      <span
                        className={cn(
                          "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-md px-1 text-[9px] font-bold tabular-nums min-[900px]:h-5 min-[900px]:min-w-5 min-[900px]:text-[10px]",
                          i < 3
                            ? "bg-[var(--owner-accent)]/12 text-[var(--owner-accent)]"
                            : "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 truncate">{p.productName}</span>
                    </span>
                    <span
                      className={cn(
                        "min-w-0 max-w-[min(100%,11rem)] shrink-0 text-right text-[11px] font-extrabold leading-tight tracking-tight tabular-nums min-[900px]:text-xs",
                        OWNER_VALUE.revenue,
                      )}
                    >
                      {formatCurrency(p.revenue)}
                    </span>
                  </li>
                ))}
                {d.topProducts.length === 0 ? (
                  <li className={OWNER_SCROLL_EMPTY}>Aucune vente sur la période</li>
                ) : null}
              </ul>
            </SoftScrollListCard>
            <SoftScrollListCard
              title="Meilleure marge"
              count={d.topByMargin.length}
              href={reportsHref}
              ariaLabel="Produits par marge — liste défilante"
              isWide={isWide}
            >
              <ul className={OWNER_SCROLL_LIST}>
                {d.topByMargin.map((p) => (
                  <li
                    key={p.productId}
                    className={cn(OWNER_SCROLL_ROW, OWNER_SOFT_CARD_ROW)}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">
                      {p.productName}
                    </span>
                    <span className="min-w-0 max-w-[min(100%,11rem)] shrink-0 text-right text-[11px] font-bold leading-tight tabular-nums text-emerald-700 min-[900px]:text-xs dark:text-emerald-400">
                      {formatCurrency(p.margin)}
                    </span>
                  </li>
                ))}
                {d.topByMargin.length === 0 ? (
                  <li className={OWNER_SCROLL_EMPTY}>Pas assez de données</li>
                ) : null}
              </ul>
            </SoftScrollListCard>
          </div>
          <SoftScrollListCard
            title="Produits à surveiller"
            count={d.stockWatchSamples.length + d.leastByRevenue.length}
            href={helpers.canInventory ? ROUTES.inventory : reportsHref}
            ariaLabel="Produits à surveiller — liste défilante"
            isWide={isWide}
          >
            <ul className={OWNER_SCROLL_LIST}>
              {d.stockWatchSamples.map((s, idx) => (
                <li
                  key={`${s.productName}-${idx}`}
                  className={cn(OWNER_SCROLL_ROW, OWNER_SOFT_CARD_ROW)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">
                    {s.productName}
                  </span>
                  <span className="max-w-[45%] shrink-0 rounded-md bg-red-50 px-1.5 py-0.5 text-center text-[8px] font-bold uppercase leading-tight text-red-700 ring-1 ring-red-100 min-[900px]:max-w-none min-[900px]:px-2 min-[900px]:text-[9px] dark:bg-red-950/50 dark:text-red-300 dark:ring-red-500/25">
                    Stock {s.quantity}
                  </span>
                </li>
              ))}
              {d.leastByRevenue.map((p) => (
                <li
                  key={`least-${p.productId}`}
                  className={cn(OWNER_SCROLL_ROW, OWNER_SOFT_CARD_ROW)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">
                    {p.productName}
                  </span>
                  <span className="max-w-[45%] shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-center text-[8px] font-bold uppercase leading-tight text-amber-800 ring-1 ring-amber-100 min-[900px]:max-w-none min-[900px]:px-2 min-[900px]:text-[9px] dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-500/25">
                    Faible CA
                  </span>
                </li>
              ))}
              {d.stockWatchSamples.length === 0 && d.leastByRevenue.length === 0 ? (
                <li className={OWNER_SCROLL_EMPTY}>Rien à signaler</li>
              ) : null}
            </ul>
          </SoftScrollListCard>
        </div>

        {/* Actions rapides */}
        <section className="mt-8">
          <h3 className="mb-3 text-base font-extrabold text-neutral-900">Actions rapides</h3>
          <FsHorizontalScroll
            className={cn(
              "flex gap-3 overflow-y-visible pb-2 pt-0.5",
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
          </FsHorizontalScroll>
        </section>

        <p className="mt-6 text-center text-xs font-medium text-neutral-400 min-[900px]:text-[11px]">
          Période sélectionnée : {rangeFooter.from} — {rangeFooter.to} · {companyName}
        </p>
      </div>
    </div>
  );
}
