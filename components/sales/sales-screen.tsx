"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { P } from "@/lib/constants/permissions";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import type { AccessHelpers } from "@/lib/features/permissions/access";
import {
  cancelSale,
  fetchSalesCost,
  listSales,
  purgeCancelledSaleAsOwner,
} from "@/lib/features/sales/api";
import {
  computeSaleProfit,
  profitTier,
  saleProfitCountable,
  PROFIT_TIER_BAR_CLASS,
  PROFIT_TIER_TEXT_CLASS,
  type SaleCostAggregate,
} from "@/lib/features/sales/sale-profit";
import type { SaleItem, SaleStatus } from "@/lib/features/sales/types";
import { queryKeys } from "@/lib/query/query-keys";
import {
  fetchInvoiceTablePosEnabled,
  peekInvoiceTablePosEnabled,
} from "@/lib/features/settings/invoice-table-pos";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime, toIsoDate } from "@/lib/utils/date";
import { salesToSpreadsheetMatrix } from "@/lib/features/sales/csv";
import { downloadProSpreadsheet } from "@/lib/utils/spreadsheet-export-pro";
import { saleSellerLabel, saleStoreLabel } from "@/lib/features/sales/sale-display";
import { salePaymentDisplays } from "@/lib/features/payments/payment-display";
import {
  SETTLEMENT_EPS,
  SETTLEMENT_LABELS,
  saleSettlement,
  settlementPillClass,
} from "@/lib/features/sales/sale-settlement";
import {
  SALES_PERIOD_PRESETS,
  groupSalesBySeller,
  matchSalesPeriodPreset,
  saleMatchesSearch,
  salesPeriodRange,
  salesRangeLabel,
  summarizeSales,
  type SalesPeriodPreset,
  type SalesSummary,
} from "@/lib/features/sales/analytics";
import { SalesSellerBoard } from "./sales-seller-board";
import { ROUTES, storeFactureTabPath } from "@/lib/config/routes";
import { activityUiTerms } from "@/lib/features/activity/activity-profiles";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { SaleDetailModal } from "./sale-detail-modal";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import {
  FsPage,
  FsCard,
  FsSectionLabel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import {
  MdAdd,
  MdArrowBack,
  MdCalendarToday,
  MdCancel,
  MdClose,
  MdDeleteOutline,
  MdChevronLeft,
  MdChevronRight,
  MdDescription,
  MdDownload,
  MdFilterAltOff,
  MdHelpOutline,
  MdLocalOffer,
  MdLockPerson,
  MdEdit,
  MdPayments,
  MdPointOfSale,
  MdReceiptLong,
  MdRefresh,
  MdSearch,
  MdShoppingBag,
  MdShoppingCart,
  MdTableChart,
  MdVisibility,
  MdWarningAmber,
} from "react-icons/md";

const PAGE_SIZE = 20;
export type SalesPreset =
  | "default"
  | "new_order"
  | "dine_in"
  | "takeaway"
  | "delivery"
  | "history";
type RestaurantQuickStatus = "all" | SaleStatus;

const statusLabel: Record<SaleStatus, string> = {
  draft: "Brouillon",
  completed: "Complétée",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

function getSalesFallbackRoute(h: AccessHelpers): string {
  if (h.canDashboard) return ROUTES.dashboard;
  if (h.canProducts) return ROUTES.products;
  if (h.canInventory) return h.isCashier ? ROUTES.stockCashier : ROUTES.inventory;
  if (h.canCustomers) return ROUTES.customers;
  if (h.canStores) return ROUTES.stores;
  return ROUTES.settings;
}

function isA4Invoice(s: SaleItem): boolean {
  if (s.document_type === "a4_invoice") return true;
  if (s.document_type === "thermal_receipt") return false;
  if (s.sale_mode === "invoice_pos") return true;
  if (s.sale_mode === "quick_pos") return false;
  return false;
}

/** Aligné sur Flutter `sale_pos_edit.dart` / `AppRoutes.pos` vs `pos-quick`. */
function saleEditHref(storeId: string, sale: SaleItem): string {
  const base = isA4Invoice(sale)
    ? `${ROUTES.stores}/${storeId}/pos`
    : `${ROUTES.stores}/${storeId}/pos-quick`;
  return `${base}?editSale=${encodeURIComponent(sale.id)}`;
}

/** Couleurs statut comme `_statusColor` dans `sales_page.dart` Flutter. */
function saleStatusPillClass(status: SaleStatus): string {
  switch (status) {
    case "completed":
      return "bg-[#059669]/[0.12] text-[#059669]";
    case "cancelled":
    case "refunded":
      return "bg-[#DC2626]/[0.12] text-[#DC2626]";
    default:
      return "bg-neutral-500/10 text-neutral-600";
  }
}

function DocumentTypeChip({ sale }: { sale: SaleItem }) {
  const a4 = isA4Invoice(sale);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold leading-none",
        a4
          ? "bg-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)] text-[var(--fs-accent)]"
          : "bg-fs-surface-container text-neutral-600",
      )}
    >
      {a4 ? (
        <MdDescription className="h-[14px] w-[14px] shrink-0" aria-hidden />
      ) : (
        <MdReceiptLong className="h-[14px] w-[14px] shrink-0" aria-hidden />
      )}
      {a4 ? "A4" : "Thermique"}
    </span>
  );
}

/**
 * Acompte encaissé au moment de la vente. N'a de sens que sur une vente à crédit :
 * une vente réglée intégralement en caisse affiche « — ».
 */
function SaleDownPaymentCell({ sale }: { sale: SaleItem }) {
  const s = saleSettlement(sale);
  if (!s.hasCredit || s.downPayment <= SETTLEMENT_EPS) {
    return <span className="text-neutral-400">—</span>;
  }
  return (
    <span
      className="font-semibold text-amber-700 dark:text-amber-300"
      title="Encaissé au moment de la vente — le reste est à crédit"
    >
      {formatCurrency(s.downPayment)}
    </span>
  );
}

/** Attente du coût d'achat : une barre discrète plutôt qu'un « — » qui clignote. */
function ProfitSkeleton({ compact }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        "block h-4 w-16 animate-pulse rounded bg-neutral-200/80 dark:bg-white/10",
        !compact && "ml-auto",
      )}
      aria-label="Calcul du bénéfice"
    />
  );
}

/**
 * Bénéfice de la vente : montant, taux de marge et jauge.
 * Trois cas explicites plutôt qu'un chiffre trompeur : calculé, non calculable
 * (aucun prix d'achat connu), ou sous-estimé (certaines lignes sans prix d'achat).
 */
function SaleProfitCell({
  sale,
  agg,
  loading,
  compact,
}: {
  sale: SaleItem;
  agg: SaleCostAggregate | undefined;
  loading: boolean;
  /** Vue carte (mobile) : aligné à gauche, sans jauge. */
  compact?: boolean;
}) {
  if (!saleProfitCountable(sale)) {
    return <span className="text-neutral-400">—</span>;
  }
  const p = computeSaleProfit(sale, agg);
  if (!p) {
    return loading ? (
      <ProfitSkeleton compact={compact} />
    ) : (
      <span className="text-neutral-400">—</span>
    );
  }
  if (p.unknown) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-lg bg-neutral-400/15 px-2 py-1 text-[11px] font-semibold text-neutral-500"
        title="Prix d'achat non renseigné sur les articles de cette vente : le bénéfice ne peut pas être calculé."
      >
        <MdHelpOutline className="h-3.5 w-3.5 shrink-0" aria-hidden />
        n.c.
      </span>
    );
  }

  const tier = profitTier(p);
  const rate = Math.round(p.marginPercent);
  const barWidth = Math.max(0, Math.min(100, p.marginPercent));
  const title = [
    `Bénéfice = ${formatCurrency(p.revenue)} facturé − ${formatCurrency(p.cost)} d'achat`,
    p.understated
      ? `Prix d'achat manquant sur ${p.linesWithoutCost} ligne(s) : bénéfice surestimé.`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={cn(
        "inline-flex",
        // Carte mobile : tout sur une ligne, à côté du libellé « Bénéfice ».
        compact ? "items-baseline gap-1.5" : "flex-col items-end gap-0.5",
      )}
      title={title}
    >
      <span
        className={cn(
          "text-sm font-bold tabular-nums leading-tight",
          PROFIT_TIER_TEXT_CLASS[tier],
        )}
      >
        {p.profit > 0 ? "+" : ""}
        {formatCurrency(p.profit)}
      </span>
      <span className="flex items-center gap-1 leading-none">
        {!compact ? (
          <span className="h-1 w-8 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/15">
            <span
              className={cn("block h-full rounded-full", PROFIT_TIER_BAR_CLASS[tier])}
              style={{ width: `${barWidth}%` }}
            />
          </span>
        ) : null}
        <span className="text-[11px] font-semibold tabular-nums text-neutral-500">
          {rate} %
        </span>
        {p.understated ? (
          <MdWarningAmber
            className="h-3.5 w-3.5 shrink-0 text-amber-500"
            aria-label="Prix d'achat manquant sur certaines lignes"
          />
        ) : null}
      </span>
    </span>
  );
}

/**
 * Comment la vente a été encaissée : Espèces, Orange Money, Moov Money, Wave, Carte…
 * Un mobile money sans opérateur identifiable (paiement ancien) reste « Mobile Money ».
 */
function SalePaymentChips({ sale }: { sale: SaleItem }) {
  const displays = salePaymentDisplays(sale.sale_payments);
  if (displays.length === 0) return <span className="text-neutral-400">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {displays.map((d) => (
        <span
          key={d.kind}
          className={cn(
            "inline-block whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold",
            d.pillClass,
          )}
        >
          {d.label}
        </span>
      ))}
    </span>
  );
}

/** Payé · Payé partiellement · À crédit (aucun encaissement). */
function SaleSettlementChip({ sale }: { sale: SaleItem }) {
  const s = saleSettlement(sale);
  if (s.kind === "void") return <span className="text-neutral-400">—</span>;
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold",
        settlementPillClass(s.kind),
      )}
      title={
        s.kind === "paid"
          ? "Intégralement encaissée"
          : `Reste dû ${formatCurrency(s.remaining)}`
      }
    >
      {SETTLEMENT_LABELS[s.kind]}
    </span>
  );
}

export function SalesScreen({ preset = "default" }: { preset?: SalesPreset }) {
  const router = useRouter();
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { hasPermission, helpers, isLoading: permLoading } = usePermissions();
  const isOwner = helpers?.isOwner ?? false;
  const canCreateSale = hasPermission(P.salesCreate);
  const canInvoiceA4 = hasPermission(P.salesInvoiceA4);
  const canPosInvoiceA4 =
    hasPermission(P.salesInvoiceA4) || hasPermission(P.salesCreate);
  const canCancelSale = hasPermission(P.salesCancel);
  const canUpdateSale = hasPermission(P.salesUpdate);
  /**
   * Le bénéfice révèle les prix d'achat : réservé à qui voit déjà les marges
   * (propriétaire ou droit Rapports). Un caissier ne voit tout simplement pas la colonne.
   */
  const canSeeProfit = isOwner || (helpers?.canReports ?? false);

  const [status, setStatus] = useState<SaleStatus | "">("");
  const [storeFilter, setStoreFilter] = useState("");
  /** True si l’utilisateur a explicitement choisi « Toutes boutiques » (ne pas re-remplir par la boutique courante). */
  const allStoresChosen = useRef(false);
  const lastCompanyId = useRef<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [restaurantQuickStatus, setRestaurantQuickStatus] =
    useState<RestaurantQuickStatus>("all");
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  /** Filtre vendeur (client) : `created_by` de la vente ; vide = tous. */
  const [sellerId, setSellerId] = useState("");
  const [search, setSearch] = useState("");
  /** Affiche les deux champs date (période personnalisée). */
  const [customPeriodOpen, setCustomPeriodOpen] = useState(false);

  const companyId = ctx.data?.companyId ?? "";
  const stores = useMemo(() => ctx.data?.stores ?? [], [ctx.data?.stores]);
  const currentStoreId = ctx.data?.storeId ?? null;
  const uiTerms = activityUiTerms(ctx.data?.businessTypeSlug);
  const isRestaurant = ctx.data?.businessTypeSlug === "restaurant-fast-food";

  const peekInvoiceTable =
    companyId.length > 0 ? peekInvoiceTablePosEnabled(companyId) : undefined;
  const invoiceTableQ = useQuery({
    queryKey: queryKeys.invoiceTablePosEnabled(companyId),
    queryFn: () => fetchInvoiceTablePosEnabled(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    ...(peekInvoiceTable !== undefined ? { initialData: peekInvoiceTable } : {}),
  });
  const invoiceTablePosEnabled = invoiceTableQ.data ?? false;
  const canFactureTab =
    hasPermission(P.salesInvoiceA4Table) &&
    canPosInvoiceA4 &&
    invoiceTablePosEnabled;

  const searchParams = useSearchParams();
  /**
   * Dernière valeur de `?store=` réellement appliquée (lien depuis la caisse).
   * On mémorise la VALEUR et non un simple « déjà fait » : quand la barre
   * supérieure change de boutique, elle réécrit ce paramètre, et l'écran doit
   * suivre. Un booléen bloquerait la seconde application et figerait la page sur
   * la boutique d'origine.
   */
  const storeFromUrlRef = useRef<string | null>(null);

  const isWide = useMediaQuery("(min-width: 900px)");

  useEffect(() => {
    if (!companyId) {
      lastCompanyId.current = null;
      storeFromUrlRef.current = null;
      return;
    }
    const companyChanged = lastCompanyId.current !== companyId;
    if (companyChanged) {
      lastCompanyId.current = companyId;
      storeFromUrlRef.current = null;
      allStoresChosen.current = false;
      if (currentStoreId) setStoreFilter(currentStoreId);
      else setStoreFilter("");
      return;
    }
    if (storeFilter === "" && currentStoreId && !allStoresChosen.current) {
      setStoreFilter(currentStoreId);
    }
  }, [companyId, currentStoreId, storeFilter]);

  useEffect(() => {
    const sid = searchParams.get("store");
    if (!sid || stores.length === 0) return;
    if (sid === storeFromUrlRef.current) return;
    if (!stores.some((s) => s.id === sid)) return;
    storeFromUrlRef.current = sid;
    allStoresChosen.current = true;
    setStoreFilter(sid);
  }, [searchParams, stores]);

  const effectiveStoreId = storeFilter || null;

  /**
   * Boutique dans laquelle la caisse va s'ouvrir. Un employé affecté à plusieurs
   * boutiques choisit ici : le filtre de la liste et le bouton de vente doivent
   * désigner la MÊME boutique, sinon on encaisse dans celle qu'on ne regarde pas.
   */
  const posStoreId = effectiveStoreId ?? currentStoreId;
  const posStoreName = posStoreId
    ? (stores.find((s) => s.id === posStoreId)?.name ?? null)
    : null;

  const salesParams = useMemo(
    () => ({
      companyId,
      storeId: effectiveStoreId,
      status: status || null,
      from,
      to,
    }),
    [companyId, effectiveStoreId, status, from, to],
  );

  const salesQ = useQuery({
    queryKey: queryKeys.sales(salesParams),
    queryFn: () => listSales(salesParams),
    enabled: !!companyId,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  const cancelMut = useMutation({
    mutationFn: (saleId: string) => cancelSale(saleId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Vente annulée");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const purgeCancelledMut = useMutation({
    mutationFn: (p: { companyId: string; saleNumber: string }) => purgeCancelledSaleAsOwner(p),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["sales"] });
      await qc.invalidateQueries({ queryKey: ["credit-sales"] });
      toast.success("Vente retirée de l'historique.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Impossible de supprimer cette vente.")),
  });

  const sales = useMemo(() => salesQ.data ?? [], [salesQ.data]);
  const scopedSales = useMemo(() => {
    if (!isRestaurant || preset === "default") return sales;
    const isDelivery = (s: SaleItem) =>
      Boolean(s.customer?.address && s.customer.address.trim().length > 0);
    switch (preset) {
      case "new_order":
        return sales.filter((s) => s.status === "draft");
      case "dine_in":
        return sales.filter((s) => s.sale_mode === "invoice_pos");
      case "takeaway":
        return sales.filter((s) => s.sale_mode === "quick_pos" && !isDelivery(s));
      case "delivery":
        return sales.filter((s) => s.sale_mode === "quick_pos" && isDelivery(s));
      case "history":
        return sales.filter((s) => s.status !== "draft");
      default:
        return sales;
    }
  }, [isRestaurant, preset, sales]);
  const restaurantStatusCounts = useMemo(
    () => ({
      all: scopedSales.length,
      draft: scopedSales.filter((s) => s.status === "draft").length,
      completed: scopedSales.filter((s) => s.status === "completed").length,
      cancelled: scopedSales.filter((s) => s.status === "cancelled").length,
    }),
    [scopedSales],
  );
  /** Ventes de la période/boutique/statut — base du classement par vendeur. */
  const sellerScopeSales = useMemo(() => {
    if (!isRestaurant || restaurantQuickStatus === "all") return scopedSales;
    return scopedSales.filter((s) => s.status === restaurantQuickStatus);
  }, [isRestaurant, restaurantQuickStatus, scopedSales]);
  /** « Qui a vendu combien » sur la période — tous vendeurs, avant filtre vendeur. */
  const sellerStats = useMemo(
    () => groupSalesBySeller(sellerScopeSales, stores),
    [sellerScopeSales, stores],
  );
  /**
   * Un vendeur choisi puis absent de la nouvelle période ne doit pas vider
   * l'écran sans explication : on retombe alors sur « tous les vendeurs ».
   */
  const effectiveSellerId = sellerStats.some((s) => s.userId === sellerId)
    ? sellerId
    : "";

  const visibleSales = useMemo(() => {
    const term = search.trim();
    return sellerScopeSales.filter(
      (s) =>
        (!effectiveSellerId || s.created_by === effectiveSellerId) &&
        saleMatchesSearch(s, term),
    );
  }, [sellerScopeSales, effectiveSellerId, search]);

  const summary = useMemo(() => summarizeSales(visibleSales), [visibleSales]);
  const periodPreset = matchSalesPeriodPreset({ from, to });
  const periodLabel = salesRangeLabel({ from, to });
  const selectedSeller = effectiveSellerId
    ? sellerStats.find((s) => s.userId === effectiveSellerId) ?? null
    : null;
  const sellerTerm = isRestaurant ? "Serveur" : "Vendeur";
  const filtersActive =
    Boolean(from || to || status || effectiveSellerId || search.trim());

  const applyPeriod = (preset: Exclude<SalesPeriodPreset, "custom">) => {
    const r = salesPeriodRange(preset);
    setFrom(r.from);
    setTo(r.to);
    setCustomPeriodOpen(false);
    setPage(0);
  };

  const resetFilters = () => {
    setFrom("");
    setTo("");
    setStatus("");
    setSellerId("");
    setSearch("");
    setCustomPeriodOpen(false);
    setPage(0);
  };

  const pageCount =
    visibleSales.length === 0
      ? 0
      : Math.ceil(visibleSales.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const paged = visibleSales.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const rangeStart =
    visibleSales.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, visibleSales.length);

  /**
   * Bénéfice : coût d'achat des seules ventes de la page affichée. Même cadence de
   * rafraîchissement que la liste, pour que les deux colonnes racontent la même minute.
   */
  const pagedProfitIds = useMemo(
    () => paged.filter((s) => s.status === "completed").map((s) => s.id),
    [paged],
  );
  const salesCostQ = useQuery({
    queryKey: queryKeys.salesCost(pagedProfitIds),
    queryFn: () => fetchSalesCost(pagedProfitIds),
    enabled: canSeeProfit && pagedProfitIds.length > 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    // Le coût d'achat bouge rarement : la page précédente reste affichée pendant le fetch.
    placeholderData: (prev) => prev,
  });
  const costById = salesCostQ.data;
  /** Vrai tant que le coût des ventes de la page n'est pas arrivé (page suivante comprise). */
  const profitLoading = salesCostQ.isPending || salesCostQ.isFetching;

  const headerDescription = useMemo(() => {
    if (isRestaurant) {
      if (preset === "new_order") return "Commandes en brouillon a finaliser.";
      if (preset === "dine_in") return "Suivi des commandes en salle.";
      if (preset === "takeaway") return "Suivi des commandes a emporter.";
      if (preset === "delivery") return "Suivi des commandes en livraison.";
      if (preset === "history") return "Historique complet des commandes.";
    }
    if (!currentStoreId) return `Sélectionnez un ${uiTerms.storeSingular.toLowerCase()}`;
    const name = stores.find((s) => s.id === currentStoreId)?.name;
    return name
      ? `${isRestaurant ? "Commandes" : "Ventes"} — ${name}`
      : `Sélectionnez un ${uiTerms.storeSingular.toLowerCase()}`;
  }, [currentStoreId, isRestaurant, preset, stores, uiTerms.storeSingular]);

  const pageTitle = useMemo(() => {
    if (!isRestaurant) return uiTerms.salesHistoryTitle;
    if (preset === "new_order") return "Nouvelle commande";
    if (preset === "dine_in") return "Commandes en salle";
    if (preset === "takeaway") return "A emporter";
    if (preset === "delivery") return "Livraisons";
    if (preset === "history") return "Historique des commandes";
    return "Commandes";
  }, [isRestaurant, preset, uiTerms.salesHistoryTitle]);

  if (ctx.isLoading || permLoading) return <LoadingState />;
  if (!ctx.data) {
    return (
      <EmptyBlock text="Aucune entreprise disponible. Contactez l’administrateur." />
    );
  }
  if (helpers && !helpers.canSales) {
    const fallback = getSalesFallbackRoute(helpers);
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-fs-card p-6 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <MdLockPerson className="h-14 w-14 text-red-600" aria-hidden />
            <h2 className="mt-3 text-xl font-extrabold text-neutral-900">
              Accès restreint
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Vous n&apos;avez pas accès à cette page.
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

  const exportExcel = () => {
    const d = new Date().toISOString().slice(0, 10);
    void (async () => {
      try {
        // Le bénéfice n'est chargé que pour la page à l'écran : l'export, lui, le
        // calcule sur toute la sélection. Un échec ici n'annule pas l'export —
        // le fichier sort simplement sans les colonnes de marge.
        let costById: Record<string, SaleCostAggregate> | undefined;
        if (canSeeProfit) {
          try {
            costById = await fetchSalesCost(
              visibleSales.filter((s) => s.status === "completed").map((s) => s.id),
            );
          } catch {
            toast.info("Colonnes de bénéfice indisponibles : export sans la marge.");
          }
        }
        const { headers, rows } = salesToSpreadsheetMatrix(visibleSales, stores, {
          costById,
        });
        await downloadProSpreadsheet(
          `${isRestaurant ? "commandes" : "ventes"}-${d}.xlsx`,
          isRestaurant ? "Commandes" : "Ventes",
          headers,
          rows,
          {
            title: `FasoStock — ${isRestaurant ? "Commandes" : "Ventes"}`,
            // Le fichier doit rappeler le filtrage exact, sinon un export
            // « ventes de X hier » devient indistinguable d'un export global.
            subtitle: [
              selectedSeller ? `${sellerTerm} : ${selectedSeller.label}` : null,
              periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1),
              `${visibleSales.length} ligne(s)`,
              `généré le ${d}`,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        );
        toast.success("Excel enregistré");
      } catch (e) {
        toast.error(messageFromUnknownError(e, "Export Excel impossible."));
      }
    })();
  };

  const actionCards = (
    <>
      <ActionCard
        title="Caisse rapide"
        subtitle={
          stores.length > 1 && posStoreName ? posStoreName : "Ticket thermique"
        }
        icon={MdPointOfSale}
        accent
        enabled={!!(posStoreId && canCreateSale)}
        href={
          posStoreId && canCreateSale
            ? `${ROUTES.stores}/${posStoreId}/pos-quick`
            : null
        }
      />
      {canInvoiceA4 ? (
        <ActionCard
          title="Facture A4"
          subtitle={
            stores.length > 1 && posStoreName
              ? posStoreName
              : isRestaurant
                ? "Commande détaillée"
                : "Vente détaillée"
          }
          icon={MdDescription}
          accent
          enabled={!!posStoreId}
          href={posStoreId ? `${ROUTES.stores}/${posStoreId}/pos` : null}
        />
      ) : null}
      {canFactureTab ? (
        <ActionCard
          title="Facture A4 (tableau)"
          subtitle={
            stores.length > 1 && posStoreName ? posStoreName : "Bandeau + tableau"
          }
          icon={MdTableChart}
          accent
          enabled={!!posStoreId}
          href={posStoreId ? storeFactureTabPath(posStoreId) : null}
        />
      ) : null}
      <ActionCard
        title={uiTerms.salesHistoryTitle}
        subtitle={`${visibleSales.length} vente(s)`}
        icon={MdShoppingCart}
        accent={false}
        enabled
        href={null}
      />
    </>
  );

  const btnOutline =
    "touch-manipulation inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-black/10 bg-fs-card px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-50 disabled:opacity-40 min-[480px]:min-h-11 min-[480px]:w-auto";
  const btnPrimary =
    "touch-manipulation inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 text-sm font-semibold text-white shadow-sm active:opacity-95 min-[480px]:min-h-11 min-[480px]:w-auto";

  return (
    <FsPage className="flex min-h-0 flex-1 flex-col px-5 pt-4 sm:px-5 min-[900px]:px-7 min-[900px]:pt-7">
      {/*
       * Dégagement de la barre d'onglets mobile, posé UNE fois sur le conteneur :
       * sinon la fin de l'historique passe dessous. La barre mesure 8px (pt-2) +
       * 56px (min-h) + max(8px, zone sûre) ⇒ 5,5rem couvre la barre + ~16px d'air
       * sous la dernière carte. Ne pas le remettre bloc par bloc (cumul de marges).
       */}
      <div className="flex flex-col gap-6 pb-[calc(5.5rem+var(--fs-safe-bottom))] min-[1024px]:pb-0">
        {/* En-tête type Flutter : headlineSmall + actions ; mobile-first = colonne puis wrap ≥560px */}
        <div className="flex flex-col gap-4 min-[560px]:flex-row min-[560px]:items-start min-[560px]:justify-between min-[560px]:gap-6">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight tracking-[-0.4px] text-fs-text min-[900px]:text-2xl">
              {pageTitle}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600 min-[900px]:text-base">
              {headerDescription}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 min-[400px]:flex-row min-[400px]:flex-wrap min-[560px]:w-auto min-[560px]:max-w-none min-[560px]:justify-end">
            <button
              type="button"
              disabled={salesQ.isFetching}
              onClick={() => void salesQ.refetch()}
              className="touch-manipulation inline-flex min-h-12 shrink-0 items-center justify-center gap-2 self-start rounded-[10px] border border-black/10 bg-fs-card px-3 text-neutral-800 active:bg-neutral-50 disabled:opacity-40 min-[400px]:px-4"
              aria-label="Actualiser la liste"
            >
              <MdRefresh
                className={cn("h-5 w-5 shrink-0", salesQ.isFetching && "animate-spin")}
                aria-hidden
              />
              <span className="hidden text-sm font-semibold min-[400px]:inline">Actualiser</span>
            </button>
            <button
              type="button"
              disabled={visibleSales.length === 0 || salesQ.isFetching}
              onClick={exportExcel}
              className={btnOutline}
            >
              <MdDownload className="h-[18px] w-[18px] shrink-0" aria-hidden />
              Exporter Excel
            </button>
            {canCreateSale && posStoreId ? (
              <Link href={`${ROUTES.stores}/${posStoreId}/pos-quick`} className={btnPrimary}>
                <MdAdd className="h-5 w-5 shrink-0" aria-hidden />
                {isRestaurant ? "Nouvelle commande" : "Nouvelle vente"}
              </Link>
            ) : null}
          </div>
        </div>

      {isRestaurant ? (
        <>
          {/* Pas de « Remboursées » : une commande est servie ou annulée, et
              l'annulation vaut remboursement. Aucun code ne crée ce statut. */}
          <section className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-4 min-[560px]:gap-3">
            <StatusMiniCard label="Toutes" value={restaurantStatusCounts.all} tone="neutral" />
            <StatusMiniCard label="Nouvelles" value={restaurantStatusCounts.draft} tone="accent" />
            <StatusMiniCard label="Servies" value={restaurantStatusCounts.completed} tone="success" />
            <StatusMiniCard label="Annulees" value={restaurantStatusCounts.cancelled} tone="danger" />
          </section>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "Tous" },
                { id: "draft", label: "Nouvelles" },
                { id: "completed", label: "Servies" },
                { id: "cancelled", label: "Annulees" },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setRestaurantQuickStatus(chip.id);
                  setPage(0);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-[6px] border px-3 py-1.5 text-xs font-semibold transition-colors",
                  restaurantQuickStatus === chip.id
                    ? "border-fs-accent/35 bg-fs-accent/12 text-fs-accent"
                    : "border-black/10 bg-fs-card text-neutral-700 hover:bg-black/[0.03]",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* 2 colonnes dès le mobile : à 1 colonne, ces raccourcis repoussaient la
          synthèse et la liste hors du premier écran. */}
      <section
        className={cn(
          "grid grid-cols-2 gap-3 min-[600px]:gap-5",
          canInvoiceA4 && canFactureTab
            ? "min-[600px]:grid-cols-2 min-[1100px]:grid-cols-4"
            : canInvoiceA4 || canFactureTab
              ? "min-[600px]:grid-cols-3"
              : "min-[600px]:grid-cols-2",
        )}
      >
        {actionCards}
      </section>

      {/* Sans boutique désignée, les raccourcis de caisse sont inertes : on dit pourquoi. */}
      {!posStoreId && stores.length > 0 && canCreateSale ? (
        <p className="-mt-3 text-sm text-neutral-600">
          Choisissez une {uiTerms.storeSingular.toLowerCase()} dans les filtres ci-dessous pour
          ouvrir la caisse : la vente y sera enregistrée.
        </p>
      ) : null}

      <FsCard padding="p-3 min-[500px]:p-4">
        <div className="flex items-center justify-between gap-2">
          <FsSectionLabel>Période</FsSectionLabel>
          {filtersActive ? (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[6px] border border-black/10 px-2.5 text-[11px] font-bold text-neutral-700 active:bg-neutral-50"
            >
              <MdFilterAltOff className="h-4 w-4 shrink-0" aria-hidden />
              Réinitialiser
            </button>
          ) : null}
        </div>

        {/* Presets d'abord : dans 90 % des cas on veut « aujourd'hui » en un geste. */}
        <FsHorizontalScroll className="-mx-1 mt-2 px-1">
          <div className="flex gap-1.5">
            {SALES_PERIOD_PRESETS.map((p) => {
              const active = periodPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPeriod(p.id)}
                  className={cn(
                    "shrink-0 rounded-[6px] border px-3 py-2 text-xs font-semibold transition-colors min-[500px]:py-1.5",
                    active
                      ? "border-fs-accent/35 bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                      : "border-black/10 bg-fs-card text-neutral-700 hover:bg-black/[0.03]",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCustomPeriodOpen((v) => !v)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border px-3 py-2 text-xs font-semibold transition-colors min-[500px]:py-1.5",
                periodPreset === "custom"
                  ? "border-fs-accent/35 bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                  : "border-black/10 bg-fs-card text-neutral-700 hover:bg-black/[0.03]",
              )}
              aria-expanded={customPeriodOpen || periodPreset === "custom"}
            >
              <MdCalendarToday className="h-4 w-4 shrink-0" aria-hidden />
              Dates précises
            </button>
          </div>
        </FsHorizontalScroll>

        {customPeriodOpen || periodPreset === "custom" ? (
          <div className="mt-3 flex flex-col gap-3 min-[500px]:flex-row min-[500px]:gap-3">
            <div className="min-w-0 w-full min-[500px]:flex-1">
              <label className="mb-1.5 block text-xs font-medium text-neutral-600">
                Du
              </label>
              <div className="relative">
                <MdCalendarToday
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(0);
                  }}
                  max={to || undefined}
                  className={cn(fsInputClass("pl-10"), "min-h-12 rounded-[6px] sm:min-h-11")}
                />
              </div>
            </div>
            <div className="min-w-0 w-full min-[500px]:flex-1">
              <label className="mb-1.5 block text-xs font-medium text-neutral-600">
                Au
              </label>
              <div className="relative">
                <MdCalendarToday
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(0);
                  }}
                  min={from || undefined}
                  max={toIsoDate(new Date())}
                  className={cn(fsInputClass("pl-10"), "min-h-12 rounded-[6px] sm:min-h-11")}
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-3 border-t border-black/[0.06] pt-3">
          <div className="relative">
            <MdSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={`Rechercher un n° de vente, un client, un ${sellerTerm.toLowerCase()}…`}
              className={cn(fsInputClass("pl-10"), "min-h-12 rounded-[6px] sm:min-h-11")}
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(0);
                }}
                aria-label="Effacer la recherche"
                className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500"
              >
                <MdClose className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-4 min-[500px]:flex-row min-[500px]:flex-wrap min-[500px]:items-end min-[500px]:gap-3">
          <div className="w-full min-[500px]:w-[220px] min-[500px]:shrink-0">
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">
              {sellerTerm}
            </label>
            <select
              value={effectiveSellerId}
              onChange={(e) => {
                setSellerId(e.target.value);
                setPage(0);
              }}
              className={cn(fsInputClass(), "min-h-12 rounded-[6px] sm:min-h-11")}
            >
              <option value="">Tous les {sellerTerm.toLowerCase()}s</option>
              {sellerStats.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.label} ({s.count})
                </option>
              ))}
            </select>
          </div>
          <div className="w-full min-[500px]:w-[200px] min-[500px]:shrink-0">
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">
              {uiTerms.storeSingular}
            </label>
            <select
              value={storeFilter}
              onChange={(e) => {
                const v = e.target.value;
                allStoresChosen.current = v === "";
                setStoreFilter(v);
                setPage(0);
              }}
              className={cn(fsInputClass(), "min-h-12 rounded-[6px] sm:min-h-11")}
            >
              <option value="">Tous les {uiTerms.storesPlural.toLowerCase()}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full min-[500px]:w-[160px] min-[500px]:shrink-0">
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">
              Statut
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as SaleStatus | "");
                setPage(0);
              }}
              className={cn(fsInputClass(), "min-h-12 rounded-[6px] sm:min-h-11")}
            >
              {/* Une vente est complétée ou annulée — une annulation vaut
                  remboursement. « Brouillon » n'existe que côté restaurant
                  (commande en cours de saisie) ; « Remboursée » n'est plus
                  proposé, mais reste affiché sur d'anciennes ventes qui
                  porteraient ce statut. */}
              <option value="">Tous</option>
              <option value="completed">Complétée</option>
              <option value="cancelled">Annulée</option>
              {isRestaurant ? <option value="draft">Brouillon</option> : null}
            </select>
          </div>
        </div>
      </FsCard>

      <SalesSummaryBand
        summary={summary}
        periodLabel={periodLabel}
        sellerName={selectedSeller?.label ?? null}
        storeLabel={
          effectiveStoreId
            ? stores.find((s) => s.id === effectiveStoreId)?.name ?? null
            : null
        }
        loading={salesQ.isLoading}
      />

      {sellerStats.length > 0 ? (
        <SalesSellerBoard
          stats={sellerStats}
          selectedUserId={effectiveSellerId}
          onSelect={(id) => {
            setSellerId(id);
            setPage(0);
          }}
          periodLabel={periodLabel}
          sellerTerm={sellerTerm}
        />
      ) : null}

      {salesQ.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>
            {(salesQ.error as Error)?.message ??
              "Impossible de charger les ventes."}
          </p>
          <button
            type="button"
            onClick={() => void salesQ.refetch()}
            className="mt-2 font-semibold text-red-900 underline"
          >
            Réessayer
          </button>
        </div>
      ) : null}

      {salesQ.isLoading ? (
        <div className="py-16">
          <LoadingState />
        </div>
      ) : visibleSales.length === 0 ? (
        // Filtres actifs : ne pas dire « aucune vente, ouvrez la caisse » — la
        // vente existe peut-être hors de la période ou du vendeur sélectionné.
        filtersActive ? (
          <NoResultCard
            periodLabel={periodLabel}
            sellerName={selectedSeller?.label ?? null}
            onReset={resetFilters}
          />
        ) : (
          <EmptyStateCard currentStoreId={currentStoreId} storeLabel={uiTerms.storeSingular} />
        )
      ) : (
        <>
          {isWide ? (
            <FsHorizontalScroll className="rounded-xl border border-black/[0.06] bg-fs-card shadow-sm">
              <table className="min-w-full text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                <thead className="bg-neutral-100/80 text-left text-xs font-medium text-neutral-600">
                  <tr>
                    <th className="px-3 py-2.5">Numéro</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">{uiTerms.storeSingular}</th>
                    <th className="px-3 py-2.5">{isRestaurant ? "Commande par" : "Vente par"}</th>
                    <th className="px-3 py-2.5">Client</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    {canSeeProfit ? (
                      <th
                        className="px-3 py-2.5 text-right"
                        title="Total facturé moins le prix d'achat des articles vendus (remise comprise)"
                      >
                        Bénéfice
                      </th>
                    ) : null}
                    <th
                      className="px-3 py-2.5 text-right"
                      title="Encaissé au moment de la vente sur une vente à crédit"
                    >
                      Acompte
                    </th>
                    <th
                      className="px-3 py-2.5"
                      title="Espèces, Orange Money, Moov Money, Wave, carte…"
                    >
                      Paiement
                    </th>
                    <th className="px-3 py-2.5" title="Payé, payé partiellement, ou à crédit">
                      Règlement
                    </th>
                    <th className="px-3 py-2.5">Statut</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s) => (
                    <tr key={s.id} className="border-t border-black/[0.06]">
                      <td className="px-3 py-2 font-semibold">
                        {s.sale_number}
                        {s.prescription_number ? (
                          <span
                            className="ml-1.5 inline-flex items-center rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
                            title={`Ordonnance ${s.prescription_number}`}
                          >
                            Ord. {s.prescription_number}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <DocumentTypeChip sale={s} />
                      </td>
                      <td className="px-3 py-2">{formatDateTime(s.created_at)}</td>
                      <td className="px-3 py-2">{saleStoreLabel(s, stores)}</td>
                      <td className="px-3 py-2">{saleSellerLabel(s)}</td>
                      <td className="px-3 py-2">{s.customer?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatCurrency(s.total)}
                      </td>
                      {canSeeProfit ? (
                        <td className="px-3 py-2 text-right">
                          <SaleProfitCell
                            sale={s}
                            agg={costById?.[s.id]}
                            loading={profitLoading}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-right tabular-nums">
                        <SaleDownPaymentCell sale={s} />
                      </td>
                      <td className="px-3 py-2">
                        <SalePaymentChips sale={s} />
                      </td>
                      <td className="px-3 py-2">
                        <SaleSettlementChip sale={s} />
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-block rounded-lg px-2.5 py-1 text-xs font-semibold",
                            saleStatusPillClass(s.status),
                          )}
                        >
                          {statusLabel[s.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailId(s.id)}
                          className="mr-1 inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-fs-accent"
                          aria-label="Voir le détail"
                        >
                          <MdVisibility className="h-5 w-5" aria-hidden />
                        </button>
                        {s.status === "completed" && canUpdateSale ? (
                          <Link
                            href={saleEditHref(s.store_id, s)}
                            className="mr-1 inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-fs-accent"
                            aria-label="Modifier la vente"
                          >
                            <MdEdit className="h-5 w-5" aria-hidden />
                          </Link>
                        ) : null}
                        {s.status === "completed" && canCancelSale ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  "Annuler cette vente ? Le stock sera rétabli. Cette action est irréversible.",
                                )
                              ) {
                                cancelMut.mutate(s.id);
                              }
                            }}
                            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-[#DC2626]"
                            aria-label="Annuler la vente"
                          >
                            <MdCancel className="h-5 w-5" aria-hidden />
                          </button>
                        ) : null}
                        {s.status === "cancelled" && isOwner ? (
                          <button
                            type="button"
                            disabled={purgeCancelledMut.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `Retirer définitivement ${s.sale_number} de l'historique ? Vente déjà annulée — suppression irréversible.`,
                                )
                              ) {
                                purgeCancelledMut.mutate({
                                  companyId,
                                  saleNumber: s.sale_number,
                                });
                              }
                            }}
                            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-neutral-600 hover:text-red-600 disabled:opacity-50"
                            aria-label="Purger la vente annulée"
                            title="Purger (propriétaire)"
                          >
                            <MdDeleteOutline className="h-5 w-5" aria-hidden />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FsHorizontalScroll>
          ) : null}

          {!isWide ? (
            <div className="flex flex-col gap-3">
              {paged.map((s) => (
                <SaleCard
                  key={s.id}
                  sale={s}
                  stores={stores}
                  profitAgg={canSeeProfit ? costById?.[s.id] : undefined}
                  showProfit={canSeeProfit}
                  profitLoading={profitLoading}
                  canCancel={canCancelSale}
                  canEdit={canUpdateSale}
                  isOwner={isOwner}
                  companyId={companyId}
                  purgeBusy={purgeCancelledMut.isPending}
                  onDetail={() => setDetailId(s.id)}
                  onCancel={() => {
                    if (s.status !== "completed") return;
                    if (
                      confirm(
                        "Annuler cette vente ? Le stock sera rétabli. Cette action est irréversible.",
                      )
                    ) {
                      cancelMut.mutate(s.id);
                    }
                  }}
                  onPurgeCancelled={() => {
                    if (
                      confirm(
                        `Retirer définitivement ${s.sale_number} de l'historique ? Vente déjà annulée — suppression irréversible.`,
                      )
                    ) {
                      purgeCancelledMut.mutate({
                        companyId,
                        saleNumber: s.sale_number,
                      });
                    }
                  }}
                />
              ))}
            </div>
          ) : null}

          {pageCount > 1 ? (
            <div className="mt-2 rounded-xl border border-black/[0.06] bg-fs-card px-3 py-3 shadow-sm sm:px-4">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                <span className="order-2 hidden text-sm text-neutral-500 min-[500px]:order-none min-[500px]:inline">
                  {rangeStart} – {rangeEnd} sur {visibleSales.length}
                </span>
                <button
                  type="button"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className={cn(
                    "touch-manipulation inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-2 py-2 text-sm disabled:opacity-40",
                    safePage <= 0
                      ? "border-black/10 bg-fs-card text-neutral-500"
                      : "border-fs-accent bg-fs-accent text-white",
                  )}
                  aria-label="Précédent"
                >
                  <MdChevronLeft className="h-[26px] w-[26px]" aria-hidden />
                </button>
                <p className="order-1 w-full text-center text-sm font-semibold text-neutral-900 min-[500px]:order-none min-[500px]:w-auto">
                  Page {safePage + 1} / {pageCount}
                </p>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className={cn(
                    "touch-manipulation inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-2 py-2 text-sm disabled:opacity-40",
                    safePage >= pageCount - 1
                      ? "border-black/10 bg-fs-card text-neutral-500"
                      : "border-fs-accent bg-fs-accent text-white",
                  )}
                  aria-label="Suivant"
                >
                  <MdChevronRight className="h-[26px] w-[26px]" aria-hidden />
                </button>
                <span className="order-3 w-full text-center text-xs text-neutral-500 min-[500px]:hidden">
                  {rangeStart} – {rangeEnd} / {visibleSales.length}
                </span>
              </div>
            </div>
          ) : null}
        </>
      )}

      {detailId ? (
        <SaleDetailModal saleId={detailId} onClose={() => setDetailId(null)} />
      ) : null}
      </div>
    </FsPage>
  );
}

function StatusMiniCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "accent" | "success" | "danger" | "muted";
}) {
  const toneClass =
    tone === "accent"
      ? "bg-fs-accent/10 text-fs-accent"
      : tone === "success"
        ? "bg-emerald-500/12 text-emerald-700"
        : tone === "danger"
          ? "bg-red-500/12 text-red-700"
          : tone === "muted"
            ? "bg-neutral-500/10 text-neutral-600"
            : "bg-fs-surface-container text-fs-text";
  return (
    <div className="rounded-xl border border-black/6 bg-fs-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className={cn("mt-1 text-lg font-bold", toneClass)}>{value}</p>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="min-w-0 rounded-[6px] border border-black/[0.06] bg-fs-card p-2.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]",
            tone,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </p>
      </div>
      <p className="mt-1.5 truncate text-[15px] font-extrabold tabular-nums text-fs-text min-[900px]:text-base">
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 truncate text-[10px] text-neutral-500">{sub}</p>
      ) : null}
    </div>
  );
}

/**
 * Synthèse des ventes **affichées** (donc de tous les filtres actifs, vendeur
 * compris). Les montants sont des **totaux facturés** hors ventes annulées : le
 * CA encaissé et la marge relèvent de la page Rapports (encaissements + coûts).
 */
function SalesSummaryBand({
  summary,
  periodLabel,
  sellerName,
  storeLabel,
  loading,
}: {
  summary: SalesSummary;
  periodLabel: string;
  sellerName: string | null;
  storeLabel: string | null;
  loading: boolean;
}) {
  const scope = [sellerName ? `Ventes de ${sellerName}` : "Toutes les ventes", storeLabel]
    .filter(Boolean)
    .join(" · ");
  return (
    <FsCard padding="p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-[13px] font-bold text-fs-text">
          {scope}{" "}
          <span className="font-medium text-neutral-500">— {periodLabel}</span>
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {summary.cancelledCount > 0 ? (
            <span className="rounded-md bg-red-500/12 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400">
              {summary.cancelledCount} annulée{summary.cancelledCount > 1 ? "s" : ""}
            </span>
          ) : null}
          {summary.draftCount > 0 ? (
            <span className="rounded-md bg-neutral-500/12 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600">
              {summary.draftCount} brouillon{summary.draftCount > 1 ? "s" : ""}
            </span>
          ) : null}
          {summary.refundedCount > 0 ? (
            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
              {summary.refundedCount} remboursée{summary.refundedCount > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
      </div>
      {loading ? (
        <div className="mt-2 grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[72px] animate-pulse rounded-[6px] bg-fs-surface-container"
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
          <SummaryStat
            label="Ventes"
            value={String(summary.count)}
            sub={
              summary.sellerCount > 1
                ? `${summary.sellerCount} vendeurs`
                : "ventes complétées"
            }
            icon={MdReceiptLong}
            tone="bg-blue-500/15 text-blue-700 dark:text-blue-400"
          />
          <SummaryStat
            label="Total facturé"
            value={formatCurrency(summary.billed)}
            sub="hors ventes annulées"
            icon={MdPayments}
            tone="bg-fs-accent/15 text-fs-accent"
          />
          <SummaryStat
            label="Panier moyen"
            value={formatCurrency(summary.average)}
            icon={MdShoppingBag}
            tone="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          />
          <SummaryStat
            label="Remises"
            value={formatCurrency(summary.discount)}
            sub="accordées sur la période"
            icon={MdLocalOffer}
            tone="bg-violet-500/15 text-violet-700 dark:text-violet-400"
          />
        </div>
      )}
    </FsCard>
  );
}

function ActionCard({
  title,
  subtitle,
  href,
  accent,
  enabled,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  href: string | null;
  accent: boolean;
  enabled: boolean;
  icon: ComponentType<{ className?: string }>;
}) {
  const base =
    "touch-manipulation block min-h-[88px] rounded-xl border bg-fs-card shadow-sm transition-transform active:scale-[0.99] max-[599px]:p-4 min-[600px]:p-6";
  const border =
    accent && enabled
      ? "border-2 border-[color-mix(in_srgb,var(--fs-accent)_40%,transparent)]"
      : "border-black/[0.06]";
  const inner = (
    <div className="flex min-h-[88px] flex-col items-center justify-center text-center">
      <div
        className={cn(
          "mb-2.5 flex items-center justify-center rounded-xl max-[599px]:p-2.5 min-[600px]:mb-3.5 min-[600px]:p-3.5",
          accent && enabled
            ? "bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)] text-[var(--fs-accent)]"
            : "bg-neutral-500/10 text-neutral-500",
        )}
      >
        <Icon
          className="h-7 w-7 min-[600px]:h-8 min-[600px]:w-8"
          aria-hidden
        />
      </div>
      <h3
        className={cn(
          "text-sm font-semibold leading-tight min-[600px]:text-base",
          enabled ? "text-fs-text" : "text-neutral-500",
        )}
      >
        {title}
      </h3>
      <p className="mt-1 line-clamp-1 text-xs text-neutral-600">{subtitle}</p>
    </div>
  );
  if (href && enabled) {
    return (
      <Link href={href} className={cn(base, border)}>
        {inner}
      </Link>
    );
  }
  return <div className={cn(base, border, !enabled && "opacity-70")}>{inner}</div>;
}

function SaleCard({
  sale,
  stores,
  profitAgg,
  showProfit,
  profitLoading,
  canCancel,
  canEdit,
  isOwner,
  companyId,
  purgeBusy,
  onCancel,
  onDetail,
  onPurgeCancelled,
}: {
  sale: SaleItem;
  stores: { id: string; name: string }[];
  /** Coût d'achat de la vente — absent tant qu'il charge, ou si le bénéfice est masqué. */
  profitAgg?: SaleCostAggregate;
  showProfit: boolean;
  profitLoading: boolean;
  canCancel: boolean;
  canEdit: boolean;
  isOwner: boolean;
  companyId: string;
  purgeBusy: boolean;
  onCancel: () => void;
  onDetail: () => void;
  onPurgeCancelled: () => void;
}) {
  const subtitle = [
    saleStoreLabel(sale, stores),
    sale.created_by_label?.trim() ? `Par ${sale.created_by_label.trim()}` : null,
    sale.customer?.name?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const editHref =
    sale.status === "completed" && canEdit ? saleEditHref(sale.store_id, sale) : null;

  const iconRowBtn =
    "inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg p-2";

  return (
    <article
      className="touch-manipulation cursor-pointer rounded-xl border border-black/[0.06] bg-fs-card p-4 shadow-sm transition-colors active:bg-neutral-100/80 dark:active:bg-white/[0.06]"
      onClick={onDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDetail();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* même Row que Flutter : Expanded(numéro) | chip | 8px | statut */}
      <div className="flex min-w-0 flex-row items-center">
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-left text-sm font-bold leading-tight text-fs-text">
            {sale.sale_number}
          </p>
          {sale.prescription_number ? (
            <span className="mt-0.5 inline-flex items-center rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
              Ordonnance {sale.prescription_number}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DocumentTypeChip sale={sale} />
          <SaleSettlementChip sale={sale} />
          <span
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold leading-none",
              saleStatusPillClass(sale.status),
            )}
          >
            {statusLabel[sale.status]}
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-normal text-neutral-600">
        {formatDateTime(sale.created_at)}
      </p>
      <p className="mt-1 line-clamp-2 text-xs leading-normal text-neutral-800">
        {subtitle}
      </p>
      {salePaymentDisplays(sale.sale_payments).length > 0 ? (
        <div className="mt-2">
          <SalePaymentChips sale={sale} />
        </div>
      ) : null}
      <div
        className="mt-3 flex items-center"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className="min-w-0">
          <span className="block text-base font-bold text-fs-text">
            {formatCurrency(sale.total)}
          </span>
          {showProfit && saleProfitCountable(sale) ? (
            <span className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Bénéfice
              </span>
              <SaleProfitCell
                sale={sale}
                agg={profitAgg}
                loading={profitLoading}
                compact
              />
            </span>
          ) : null}
          {(() => {
            const st = saleSettlement(sale);
            if (!st.hasCredit || st.kind === "void") return null;
            return (
              <span className="mt-0.5 block text-[11px] text-neutral-600">
                {st.downPayment > SETTLEMENT_EPS
                  ? `Acompte ${formatCurrency(st.downPayment)} · reste ${formatCurrency(st.remaining)}`
                  : `Aucun acompte · reste ${formatCurrency(st.remaining)}`}
              </span>
            );
          })()}
        </span>
        <span className="ml-auto flex items-center">
          <button
            type="button"
            onClick={onDetail}
            className={cn(iconRowBtn, "text-fs-accent")}
            aria-label="Voir le détail"
          >
            <MdVisibility className="h-5 w-5 shrink-0" aria-hidden />
          </button>
          {editHref ? (
            <Link
              href={editHref}
              onClick={(e) => e.stopPropagation()}
              className={cn(iconRowBtn, "text-fs-accent")}
              aria-label="Modifier la vente"
            >
              <MdEdit className="h-5 w-5 shrink-0" aria-hidden />
            </Link>
          ) : null}
          {sale.status === "completed" && canCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className={cn(iconRowBtn, "text-[#DC2626]")}
              aria-label="Annuler la vente"
            >
              <MdCancel className="h-5 w-5 shrink-0" aria-hidden />
            </button>
          ) : null}
          {sale.status === "cancelled" && isOwner && companyId ? (
            <button
              type="button"
              disabled={purgeBusy}
              onClick={onPurgeCancelled}
              className={cn(iconRowBtn, "text-neutral-600 hover:text-red-600 disabled:opacity-50")}
              aria-label="Purger la vente annulée"
              title="Purger (propriétaire)"
            >
              <MdDeleteOutline className="h-5 w-5 shrink-0" aria-hidden />
            </button>
          ) : null}
        </span>
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
    </div>
  );
}

function EmptyStateCard({
  currentStoreId,
  storeLabel,
}: {
  currentStoreId: string | null;
  storeLabel: string;
}) {
  return (
    <FsCard
      className="py-14 text-center sm:py-16"
      padding="px-5 py-14 sm:px-6 sm:py-16"
    >
      <MdShoppingCart
        className="mx-auto h-14 w-14 text-neutral-300"
        aria-hidden
      />
      <h3 className="mt-4 text-base font-semibold leading-snug text-neutral-900">
        Aucune vente
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        {`Créez une vente depuis le POS en sélectionnant un ${storeLabel.toLowerCase()}.`}
      </p>
      {currentStoreId ? (
        <Link
          href={`${ROUTES.stores}/${currentStoreId}/pos-quick`}
          className="touch-manipulation mt-6 inline-flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-3 text-sm font-semibold text-white active:opacity-95 sm:w-auto"
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Ouvrir la caisse
        </Link>
      ) : null}
    </FsCard>
  );
}

/** Aucun résultat **à cause des filtres** — sortie explicite vers la remise à zéro. */
function NoResultCard({
  periodLabel,
  sellerName,
  onReset,
}: {
  periodLabel: string;
  sellerName: string | null;
  onReset: () => void;
}) {
  return (
    <FsCard
      className="text-center"
      padding="px-5 py-12 sm:px-6 sm:py-14"
    >
      <MdSearch className="mx-auto h-12 w-12 text-neutral-300" aria-hidden />
      <h3 className="mt-3 text-base font-semibold leading-snug text-neutral-900">
        Aucune vente ne correspond
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        {sellerName
          ? `${sellerName} n'a aucune vente ${periodLabel} avec ces filtres.`
          : `Aucune vente ${periodLabel} avec ces filtres.`}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="touch-manipulation mt-5 inline-flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl border border-black/10 bg-fs-card px-5 py-3 text-sm font-semibold text-neutral-800 active:bg-neutral-50 sm:w-auto"
      >
        <MdFilterAltOff className="h-5 w-5" aria-hidden />
        Réinitialiser les filtres
      </button>
    </FsCard>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-black/[0.12] bg-fs-card px-4 py-8 text-center text-sm text-neutral-600 sm:rounded-2xl">
      {text}
    </div>
  );
}
