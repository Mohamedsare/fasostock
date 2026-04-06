"use client";

import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { ROUTES } from "@/lib/config/routes";
import { P } from "@/lib/constants/permissions";
import { computeDashboardFromLists } from "@/lib/features/warehouse/dashboard";
import {
  getWarehouseDispatchInvoiceDetails,
  listWarehouseDispatchInvoices,
  listWarehouseInventory,
  listWarehouseMovements,
  voidWarehouseDispatchInvoice,
} from "@/lib/features/warehouse/api";
import type { WarehouseDispatchInvoiceSummary, WarehouseMovement, WarehouseStockLine } from "@/lib/features/warehouse/types";
import { WAREHOUSE_PACKAGING_LABELS } from "@/lib/features/warehouse/types";
import {
  approveStockTransfer,
  cancelStockTransfer,
  deleteStockTransfer,
  getStockTransferDetail,
  listStockTransfers,
  receiveStockTransfer,
  shipStockTransfer,
} from "@/lib/features/transfers/api";
import type { StockTransferListItem, TransferStatus } from "@/lib/features/transfers/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { toast, toastMutationError } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  MdAdd,
  MdAddCircleOutline,
  MdArticle,
  MdBalance,
  MdBarChart,
  MdCategory,
  MdCheckCircle,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdDeleteOutline,
  MdInventory2,
  MdLink,
  MdLocalShipping,
  MdLockOutline,
  MdNorthEast,
  MdPointOfSale,
  MdReceiptLong,
  MdRefresh,
  MdSearch,
  MdSouthWest,
  MdSwapHoriz,
  MdTune,
  MdWarningAmber,
} from "react-icons/md";
import { FsPullToRefresh } from "@/components/ui/fs-pull-to-refresh";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import {
  WarehouseAdjustmentDialog,
  WarehouseCreateTransferFromDepotDialog,
  WarehouseDispatchDialog,
  WarehouseEntryDialog,
  WarehouseExitSaleDialog,
  WarehouseThresholdDialog,
} from "./warehouse-dialogs";
import "./warehouse-magasin.css";

const TAB_LABELS = [
  "Tableau de bord",
  "Stock dépôt",
  "Mouvements",
  "Transfert",
  "Historiques des bons",
] as const;

const STOCK_PAGE = 20;

type StockFilter = "all" | "low" | "ok";

const ACCENT = {
  emerald: "#059669",
  orange: "#EA580C",
  teal: "#0D9488",
  rose: "#DB2777",
  blue: "#2563EB",
  violet: "#7C3AED",
};

function refLabel(m: WarehouseMovement): string {
  switch (m.referenceType) {
    case "sale":
      return "Vente POS";
    case "stock_transfer":
      return "Transfert boutique";
    case "warehouse_dispatch":
      return "Bon / facture dépôt";
    case "adjustment":
      return "Ajustement inventaire";
    case "manual":
      return "Manuel";
    default:
      return m.referenceType;
  }
}

function statusLabel(s: TransferStatus): string {
  switch (s) {
    case "draft":
      return "Brouillon";
    case "pending":
      return "En attente";
    case "approved":
      return "Approuvé";
    case "shipped":
      return "Expédié";
    case "received":
      return "Reçu";
    case "rejected":
      return "Rejeté";
    case "cancelled":
      return "Annulé";
    default:
      return s;
  }
}

function statusColor(s: TransferStatus): string {
  switch (s) {
    case "draft":
      return "#64748b";
    case "pending":
      return "#ea580c";
    case "approved":
      return "#4f46e5";
    case "shipped":
      return "#2563eb";
    case "received":
      return "#16a34a";
    case "rejected":
      return "#dc2626";
    case "cancelled":
      return "#9ca3af";
    default:
      return "#64748b";
  }
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

export function WarehouseScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: ctx, isLoading: permLoading, helpers, hasPermission } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const companyName = ctx?.companyName ?? "";
  const stores = ctx?.stores ?? [];
  const activeStoreId = ctx?.storeId ?? null;
  const canWarehouse = helpers?.canWarehouse ?? false;
  /** Aligné `TransfersScreen` — actions sur le flux transfert. */
  const canApproveTransfer = hasPermission(P.transfersApprove);
  const canOperateTransfers =
    hasPermission(P.transfersCreate) || hasPermission(P.transfersApprove) || hasPermission(P.stockTransfer);

  const [tab, setTab] = useState(0);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [exitSaleOpen, setExitSaleOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustLine, setAdjustLine] = useState<WarehouseStockLine | null>(null);
  const [thresholdLine, setThresholdLine] = useState<WarehouseStockLine | null>(null);

  const [stockQ, setStockQ] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [stockPage, setStockPage] = useState(0);

  const [movPage, setMovPage] = useState(0);
  const MOV_PAGE = 20;

  const [dispatchPage, setDispatchPage] = useState(0);
  const DISPATCH_PAGE = 20;

  const [transferDetailId, setTransferDetailId] = useState<string | null>(null);
  const [dispatchDetailId, setDispatchDetailId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const invQ = useQuery({
    queryKey: queryKeys.warehouseInventory(companyId),
    queryFn: () => listWarehouseInventory(companyId),
    enabled: Boolean(companyId) && canWarehouse,
  });
  const movQ = useQuery({
    queryKey: queryKeys.warehouseMovements(companyId),
    queryFn: () => listWarehouseMovements(companyId, 500),
    enabled: Boolean(companyId) && canWarehouse,
  });
  const dispatchQ = useQuery({
    queryKey: queryKeys.warehouseDispatch(companyId),
    queryFn: () => listWarehouseDispatchInvoices(companyId),
    enabled: Boolean(companyId) && canWarehouse,
  });
  const whTransfersQ = useQuery({
    queryKey: queryKeys.warehouseTransfers(companyId),
    queryFn: () => listStockTransfers({ companyId, fromWarehouseOnly: true }),
    enabled: Boolean(companyId) && canWarehouse,
  });

  const detailTransferQ = useQuery({
    queryKey: transferDetailId ? queryKeys.stockTransferDetail(transferDetailId) : ["none"],
    queryFn: () => getStockTransferDetail(transferDetailId as string),
    enabled: Boolean(transferDetailId),
  });

  const dispatchDetailQ = useQuery({
    queryKey: dispatchDetailId ? ["warehouse-dispatch-detail", dispatchDetailId] : ["none"],
    queryFn: () => getWarehouseDispatchInvoiceDetails(dispatchDetailId as string),
    enabled: Boolean(dispatchDetailId),
  });

  const inventory = invQ.data ?? [];
  const movements = movQ.data ?? [];
  const dispatchRows = dispatchQ.data ?? [];
  const warehouseTransfers = whTransfersQ.data ?? [];

  const warehouseQtyByProductId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of inventory) m[l.productId] = l.quantity;
    return m;
  }, [inventory]);

  const dashboard = useMemo(() => {
    if (!companyId) return null;
    return computeDashboardFromLists(inventory, movements);
  }, [companyId, inventory, movements]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["warehouse", companyId] }),
      qc.invalidateQueries({ queryKey: queryKeys.stockTransfers(companyId) }),
    ]);
  }, [qc, companyId]);

  const openTransferDialog = useCallback(() => {
    if (stores.length === 0) {
      toast.info("Aucune boutique disponible pour recevoir le transfert.");
      return;
    }
    setTransferOpen(true);
  }, [stores.length]);

  const listLoading =
    (invQ.isLoading || movQ.isLoading) && inventory.length === 0 && movements.length === 0;
  const streamErr = invQ.error ?? movQ.error;

  const invalidateTransferAndWarehouse = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.stockTransfers(companyId) });
    await qc.invalidateQueries({ queryKey: queryKeys.warehouseTransfers(companyId) });
    await qc.invalidateQueries({ queryKey: ["warehouse", companyId] });
  }, [qc, companyId]);

  const approveMut = useMutation({
    mutationFn: approveStockTransfer,
    onSuccess: async () => {
      toast.success("Transfert approuvé");
      await invalidateTransferAndWarehouse();
      detailTransferQ.refetch();
    },
    onError: (e) => toastMutationError("transfer-approve", e),
  });
  const shipMut = useMutation({
    mutationFn: shipStockTransfer,
    onSuccess: async () => {
      toast.success("Expédié");
      await invalidateTransferAndWarehouse();
      detailTransferQ.refetch();
    },
    onError: (e) => toastMutationError("transfer-ship", e),
  });
  const receiveMut = useMutation({
    mutationFn: receiveStockTransfer,
    onSuccess: async () => {
      toast.success("Réceptionné");
      await invalidateTransferAndWarehouse();
      detailTransferQ.refetch();
    },
    onError: (e) => toastMutationError("transfer-receive", e),
  });
  const cancelMut = useMutation({
    mutationFn: cancelStockTransfer,
    onSuccess: async () => {
      toast.success("Annulé");
      await invalidateTransferAndWarehouse();
      setTransferDetailId(null);
    },
    onError: (e) => toastMutationError("transfer-cancel", e),
  });
  const deleteMut = useMutation({
    mutationFn: deleteStockTransfer,
    onSuccess: async () => {
      toast.success("Supprimé");
      await invalidateTransferAndWarehouse();
      setTransferDetailId(null);
    },
    onError: (e) => toastMutationError("transfer-delete", e),
  });

  const voidDispatchMut = useMutation({
    mutationFn: (p: { invoiceId: string }) =>
      voidWarehouseDispatchInvoice({ companyId, invoiceId: p.invoiceId }),
    onSuccess: async () => {
      toast.success("Bon annulé. Stock dépôt mis à jour.");
      setVoidingId(null);
      setDispatchDetailId(null);
      await refreshAll();
    },
    onError: (e) => toastMutationError("dispatch-void", e),
  });

  function storeName(id: string | null) {
    if (!id) return "—";
    return stores.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  }

  const sortedStock = useMemo(() => {
    return [...inventory].sort((a, b) => a.productName.localeCompare(b.productName, "fr"));
  }, [inventory]);

  const filteredStock = useMemo(() => {
    const q = stockQ.trim().toLowerCase();
    return sortedStock.filter((l) => {
      const low = l.quantity <= (l.stockMinWarehouse > 0 ? l.stockMinWarehouse : l.stockMin);
      if (stockFilter === "low" && !low) return false;
      if (stockFilter === "ok" && low) return false;
      if (!q) return true;
      return l.productName.toLowerCase().includes(q) || (l.sku ?? "").toLowerCase().includes(q);
    });
  }, [sortedStock, stockQ, stockFilter]);

  const stockTotalPages = filteredStock.length === 0 ? 1 : Math.ceil(filteredStock.length / STOCK_PAGE);
  const stockSafePage = Math.min(stockPage, stockTotalPages - 1);
  const stockSlice = filteredStock.slice(stockSafePage * STOCK_PAGE, stockSafePage * STOCK_PAGE + STOCK_PAGE);

  const movTotalPages = movements.length === 0 ? 1 : Math.ceil(movements.length / MOV_PAGE);
  const movSafePage = Math.min(movPage, movTotalPages - 1);
  const movSlice = movements.slice(movSafePage * MOV_PAGE, movSafePage * MOV_PAGE + MOV_PAGE);

  const dispatchTotalPages = dispatchRows.length === 0 ? 1 : Math.ceil(dispatchRows.length / DISPATCH_PAGE);
  const dispatchSafePage = Math.min(dispatchPage, dispatchTotalPages - 1);
  const dispatchSlice = dispatchRows.slice(
    dispatchSafePage * DISPATCH_PAGE,
    dispatchSafePage * DISPATCH_PAGE + DISPATCH_PAGE,
  );

  const maxChart = dashboard
    ? [...dashboard.chartEntriesQty, ...dashboard.chartExitsQty].reduce((a, b) => Math.max(a, b), 0)
    : 0;
  const maxY = Math.max(maxChart * 1.2, 4);

  async function confirmVoidFromMovement(m: WarehouseMovement) {
    const invoiceId = m.referenceId;
    if (!invoiceId || m.referenceType !== "warehouse_dispatch") return;
    if (
      !confirm(
        "Annuler ce bon de sortie ? Le stock au dépôt sera réintégré et le bon sera supprimé. Cette action est définitive.",
      )
    ) {
      return;
    }
    setVoidingId(invoiceId);
    try {
      await voidWarehouseDispatchInvoice({ companyId, invoiceId });
      toast.success("Bon annulé. Stock dépôt mis à jour.");
      await refreshAll();
    } catch (e) {
      toastMutationError("void-dispatch-mov", e);
    } finally {
      setVoidingId(null);
    }
  }

  if (permLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  const couldAccessMagasinByRole =
    ctx?.roleSlug === "owner" || hasPermission(P.warehouseManage);
  if (couldAccessMagasinByRole && ctx?.warehouseFeatureEnabled === false) {
    return (
      <FsPage>
        <FsScreenHeader title="Magasin" />
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
          <MdLockOutline className="h-14 w-14 text-neutral-400" aria-hidden />
          <p className="mt-4 text-base font-bold text-fs-text">Module indisponible</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-600">
            Le module Magasin a été désactivé pour votre entreprise. Contactez l&apos;administrateur de la plateforme.
          </p>
        </div>
      </FsPage>
    );
  }

  if (!canWarehouse) {
    return (
      <FsPage>
        <FsScreenHeader title="Magasin" />
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
          <MdLockOutline className="h-14 w-14 text-neutral-400" aria-hidden />
          <p className="mt-4 text-base font-bold text-fs-text">Accès réservé</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-600">
            Ce module dépôt central est réservé au propriétaire ou aux utilisateurs avec le rôle Magasinier.
          </p>
        </div>
      </FsPage>
    );
  }

  return (
    <FsPage className="pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] min-[900px]:pb-10">
      {/* Aligné AppBar Flutter : toolbarHeight 52, TabBar dessous (label 15px, indicateur #F97316) */}
      <div className="sticky top-0 z-30 -mx-3 border-b border-black/6 bg-fs-surface/98 backdrop-blur-md sm:-mx-5">
        <div className="flex min-h-[52px] items-center justify-between gap-2 px-3 sm:px-0">
          <FsScreenHeader
            title="Magasin"
            className="mb-0 min-w-0 flex-1"
            titleClassName="text-base font-semibold tracking-tight text-fs-text sm:text-xl sm:font-bold"
          />
          <button
            type="button"
            onClick={() => refreshAll()}
            disabled={invQ.isFetching}
            className="fs-touch-target shrink-0 rounded-full p-2.5 text-neutral-600 active:bg-black/5"
            aria-label="Actualiser"
          >
            <MdRefresh className={cn("h-6 w-6", invQ.isFetching && "animate-spin")} />
          </button>
        </div>

        <div
          className="warehouse-tabbar-scroll flex gap-0 overflow-x-auto overscroll-x-contain px-3 pb-1.5 pt-1 sm:px-0 sm:pb-2 sm:pt-1.5"
          style={{ WebkitOverflowScrolling: "touch" }}
          role="tablist"
          aria-label="Sections Magasin"
        >
          {TAB_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={tab === i}
              onClick={() => setTab(i)}
              className={cn(
                "shrink-0 snap-start px-2 py-2 text-left text-[14px] leading-tight transition-colors sm:px-2.5 sm:py-2.5 sm:text-[15px]",
                "min-h-[42px] min-w-0 max-w-[min(100%,11rem)] sm:min-h-[44px] sm:max-w-none",
                tab === i
                  ? "bg-[#F97316] font-bold text-white"
                  : "bg-transparent font-semibold text-[#4A4643] active:bg-neutral-100",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {companyName ? (
        <div className="mt-3 rounded-xl border border-black/6 bg-[color-mix(in_srgb,var(--fs-surface-container-highest)_55%,transparent)] px-3 py-1.5 sm:rounded-2xl sm:py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 sm:text-[11px]">
            Dépôt central
          </p>
          <p className="mt-0.5 truncate text-[13px] font-bold leading-tight text-fs-text sm:text-sm">
            {companyName}
          </p>
        </div>
      ) : null}

      {listLoading ? (
        <div className="mt-3 flex min-h-[40vh] items-center justify-center py-16">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
        </div>
      ) : streamErr ? (
        <div className="mt-3">
          <FsQueryErrorPanel error={streamErr} onRetry={() => refreshAll()} />
        </div>
      ) : (
        <FsPullToRefresh onRefresh={refreshAll}>
          {tab === 0 ? (
            <div className="mt-3 space-y-3.5 sm:space-y-4">
              <FsCard padding="p-3.5 sm:p-4">
                <p className="text-[13px] font-semibold leading-snug text-fs-text sm:text-sm">
                  Tout gérer depuis le dépôt
                </p>
                <p className="mt-1 text-[11px] leading-[1.35] text-neutral-600 sm:text-xs">
                  Réceptions, factures de sortie, catalogue, transferts vers les boutiques.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setEntryOpen(true)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-[12px] border-0 bg-[#F97316] px-3 py-2.5 text-[13px] font-bold text-white shadow-sm active:opacity-90 sm:min-h-[48px] sm:gap-2 sm:rounded-[14px] sm:px-4 sm:py-3.5 sm:text-sm"
                  >
                    <MdAddCircleOutline className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
                    Réception
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchOpen(true)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-[12px] border-0 bg-[#F97316] px-3 py-2.5 text-[13px] font-bold text-white shadow-sm active:opacity-90 sm:min-h-[48px] sm:gap-2 sm:rounded-[14px] sm:px-4 sm:py-3.5 sm:text-sm"
                  >
                    <MdReceiptLong className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
                    Facture / sortie
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab(1)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-[12px] bg-[#E6DDF6] px-3 py-2.5 text-[13px] font-bold text-[#7C3AED] active:opacity-90 sm:min-h-[48px] sm:gap-2 sm:rounded-[14px] sm:px-4 sm:py-3.5 sm:text-sm"
                  >
                    <MdCategory className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
                    Produits
                  </button>
                  <button
                    type="button"
                    onClick={openTransferDialog}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-[12px] bg-[#DCE5F3] px-3 py-2.5 text-[13px] font-bold text-[#2563EB] active:opacity-90 sm:min-h-[48px] sm:gap-2 sm:rounded-[14px] sm:px-4 sm:py-3.5 sm:text-sm"
                  >
                    <MdSwapHoriz className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
                    Transferts
                  </button>
                </div>
              </FsCard>

              {dashboard ? (
                <>
                  <div className="grid auto-rows-fr grid-cols-1 gap-1.5 min-[340px]:grid-cols-2 min-[640px]:grid-cols-3 sm:gap-2">
                    <Kpi
                      title="Valeur au prix d’achat"
                      value={formatCurrency(dashboard.valueAtPurchasePrice)}
                      color={ACCENT.emerald}
                      icon={<MdInventory2 className="h-5 w-5" />}
                    />
                    <Kpi
                      title="Valeur au prix de vente"
                      value={formatCurrency(dashboard.valueAtSalePrice)}
                      color={ACCENT.blue}
                      icon={<MdBarChart className="h-5 w-5" />}
                    />
                    <Kpi
                      title="Références en stock"
                      value={`${dashboard.skuCount}`}
                      color={ACCENT.violet}
                      icon={<MdCategory className="h-5 w-5" />}
                    />
                    <Kpi
                      title="En alerte (≤ seuil)"
                      value={`${dashboard.lowStockCount}`}
                      color={dashboard.lowStockCount > 0 ? ACCENT.orange : "#9ca3af"}
                      icon={<MdWarningAmber className="h-5 w-5" />}
                    />
                    <Kpi
                      title="Entrées (30 j.)"
                      value={`${dashboard.movementsEntries30d}`}
                      subtitle="lignes"
                      color={ACCENT.teal}
                      icon={<MdSouthWest className="h-5 w-5" />}
                    />
                    <Kpi
                      title="Sorties (30 j.)"
                      value={`${dashboard.movementsExits30d}`}
                      subtitle="lignes"
                      color={ACCENT.rose}
                      icon={<MdNorthEast className="h-5 w-5" />}
                    />
                  </div>

                  <FsCard padding="p-3.5 sm:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <MdBarChart className="h-[18px] w-[18px] text-[#F97316] sm:h-5 sm:w-5" aria-hidden />
                      <p className="text-[13px] font-semibold leading-snug text-fs-text sm:text-sm">
                        Entrées / sorties (7 jours)
                      </p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] sm:mt-2 sm:gap-4 sm:text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCENT.emerald }} />
                        Entrées
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCENT.orange }} />
                        Sorties
                      </span>
                    </div>
                    <div className="mt-2.5 h-[200px] sm:mt-3 sm:h-[220px]">
                      {dashboard.chartDayLabels.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-[13px] text-neutral-600 sm:text-sm">
                          Pas encore de mouvements sur la période
                        </p>
                      ) : (
                        <div className="flex h-full items-end justify-around gap-1 border-b border-black/10 pb-1 pt-1.5 sm:pt-2">
                          {dashboard.chartDayLabels.map((lab, i) => {
                            const inQ = dashboard.chartEntriesQty[i] ?? 0;
                            const outQ = dashboard.chartExitsQty[i] ?? 0;
                            const hIn = maxY > 0 ? (inQ / maxY) * 100 : 0;
                            const hOut = maxY > 0 ? (outQ / maxY) * 100 : 0;
                            return (
                              <div key={i} className="flex flex-1 flex-col items-center gap-0.5 sm:gap-1">
                                <div className="flex h-[158px] w-full items-end justify-center gap-0.5 sm:h-[180px]">
                                  <div
                                    className="w-[40%] max-w-[10px] rounded-t bg-[#059669]"
                                    style={{ height: `${Math.max(hIn, 2)}%` }}
                                    title={`Entrées ${inQ}`}
                                  />
                                  <div
                                    className="w-[40%] max-w-[10px] rounded-t bg-[#EA580C]"
                                    style={{ height: `${Math.max(hOut, 2)}%` }}
                                    title={`Sorties ${outQ}`}
                                  />
                                </div>
                                <span className="text-[9px] text-neutral-600 sm:text-[10px]">{lab}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </FsCard>
                </>
              ) : null}

              <Link
                href={ROUTES.purchases}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-black/10 py-2.5 text-[13px] font-semibold text-fs-text active:bg-neutral-50 sm:min-h-[48px] sm:gap-2 sm:py-3 sm:text-sm sm:w-auto"
              >
                <MdLocalShipping className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
                Voir les achats fournisseurs
              </Link>
            </div>
          ) : null}

          {tab === 1 ? (
            <div className="mt-3">
            <StockDepotTab
              lines={inventory}
              filtered={filteredStock}
              slice={stockSlice}
              stockQ={stockQ}
              setStockQ={(v) => {
                setStockQ(v);
                setStockPage(0);
              }}
              stockFilter={stockFilter}
              setStockFilter={(f) => {
                setStockFilter(f);
                setStockPage(0);
              }}
              stockSafePage={stockSafePage}
              stockTotalPages={stockTotalPages}
              setStockPage={setStockPage}
              filteredLen={filteredStock.length}
              onAdjust={(l) => setAdjustLine(l)}
              onThreshold={(l) => setThresholdLine(l)}
            />
            </div>
          ) : null}

          {tab === 2 ? (
            <div className="mt-3">
            <MouvementsTab
              movSlice={movSlice}
              movSafePage={movSafePage}
              movTotalPages={movTotalPages}
              setMovPage={setMovPage}
              movementsLen={movements.length}
              companyId={companyId}
              voidingId={voidingId}
              onVoid={confirmVoidFromMovement}
            />
            </div>
          ) : null}

          {tab === 3 ? (
            <div className="mt-3">
            <TransfertTab
              transfers={warehouseTransfers}
              storeName={storeName}
              onCreate={openTransferDialog}
              onOpen={(t) => setTransferDetailId(t.id)}
              onDelete={async (t) => {
                const pending = t.id.startsWith("pending:");
                const title = pending
                  ? "Supprimer ce brouillon ?"
                  : t.status === "cancelled"
                    ? "Supprimer ce transfert ?"
                    : "Supprimer ce transfert ?";
                const body = pending
                  ? "Ce transfert n’a pas encore été synchronisé. Il sera définitivement retiré."
                  : t.status === "cancelled"
                    ? "Le transfert annulé sera définitivement supprimé de l’historique."
                    : "Le brouillon sera définitivement supprimé.";
                if (!confirm(`${title}\n\n${body}`)) return;
                try {
                  await deleteStockTransfer(t.id);
                  toast.success(pending ? "Brouillon supprimé" : "Transfert supprimé");
                  await invalidateTransferAndWarehouse();
                } catch (e) {
                  toastMutationError("wh-transfer-del", e);
                }
              }}
            />
            </div>
          ) : null}

          {tab === 4 ? (
            <div className="mt-3">
            <HistoriquesTab
              rows={dispatchSlice}
              allRows={dispatchRows}
              page={dispatchSafePage}
              totalPages={dispatchTotalPages}
              setPage={setDispatchPage}
              loading={dispatchQ.isLoading}
              error={dispatchQ.error}
              onOpen={(r) => setDispatchDetailId(r.id)}
              onRetry={() => dispatchQ.refetch()}
            />
            </div>
          ) : null}
        </FsPullToRefresh>
      )}

      {/* Mobile FAB */}
      {!listLoading && !streamErr ? (
        <>
          <button
            type="button"
            onClick={() => setActionMenuOpen(true)}
            aria-label="Gérer le dépôt"
            className="fixed bottom-[calc(4.75rem+var(--fs-safe-bottom)+0.5rem)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#F97316] text-white shadow-[0_4px_5px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] min-[900px]:hidden"
          >
            <MdAdd className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={() => setActionMenuOpen(true)}
            className="fixed bottom-8 right-8 z-40 hidden items-center gap-2 rounded-2xl bg-[#F97316] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_4px_5px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] min-[900px]:inline-flex"
          >
            <MdAdd className="h-5 w-5" />
            Gérer le dépôt
          </button>
        </>
      ) : null}

      {actionMenuOpen ? (
        <div
          className="fixed inset-0 z-[55] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[92dvh] w-full overflow-hidden rounded-t-3xl bg-fs-surface shadow-2xl sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl">
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-neutral-300 min-[900px]:hidden" />
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
              <h2 className="text-base font-bold">Actions dépôt</h2>
              <button
                type="button"
                onClick={() => setActionMenuOpen(false)}
                className="rounded-xl p-2"
                aria-label="Fermer"
              >
                <MdClose className="h-6 w-6" />
              </button>
            </div>
            <div className="max-h-[min(72vh,520px)] overflow-y-auto px-3 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <ActionRow
                color="#059669"
                icon={<MdAddCircleOutline className="h-6 w-6" />}
                title="Réception au dépôt"
                subtitle="Arrivées, quantités, prix d’achat"
                onClick={() => {
                  setActionMenuOpen(false);
                  setEntryOpen(true);
                }}
              />
              <ActionRow
                color="#7C3AED"
                icon={<MdCategory className="h-6 w-6" />}
                title="Catalogue produits"
                subtitle="Créer ou modifier des articles (dépôt et boutiques)"
                onClick={() => {
                  setActionMenuOpen(false);
                  router.push(ROUTES.products);
                }}
              />
              <ActionRow
                color="#2563EB"
                icon={<MdSwapHoriz className="h-6 w-6" />}
                title="Transfert vers une boutique"
                subtitle="Envoyer du stock du dépôt vers une boutique"
                onClick={() => {
                  setActionMenuOpen(false);
                  openTransferDialog();
                }}
              />
              <ActionRow
                color="#EA580C"
                icon={<MdPointOfSale className="h-6 w-6" />}
                title="Ventes en caisse"
                subtitle="Nouvelles ventes en boutique"
                onClick={() => {
                  setActionMenuOpen(false);
                  router.push(ROUTES.sales);
                }}
              />
              <ActionRow
                color="#0D9488"
                icon={<MdReceiptLong className="h-6 w-6" />}
                title="Facture / bon de sortie dépôt"
                subtitle="Sortie de produits avec document"
                onClick={() => {
                  setActionMenuOpen(false);
                  setDispatchOpen(true);
                }}
              />
              <ActionRow
                color="#2563EB"
                icon={<MdArticle className="h-6 w-6" />}
                title="Historique des bons"
                subtitle="Voir les bons/factures"
                onClick={() => {
                  setActionMenuOpen(false);
                  setTab(4);
                }}
              />
              <ActionRow
                color="#DB2777"
                icon={<MdLink className="h-6 w-6" />}
                title="Rattacher une vente déjà validée"
                subtitle="Cas exceptionnel : sortie dépôt après coup"
                onClick={() => {
                  setActionMenuOpen(false);
                  setExitSaleOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <WarehouseEntryDialog
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        companyId={companyId}
        onSuccess={refreshAll}
      />
      <WarehouseDispatchDialog
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        companyId={companyId}
        warehouseQtyByProductId={warehouseQtyByProductId}
        onSuccess={refreshAll}
      />
      <WarehouseExitSaleDialog
        open={exitSaleOpen}
        onClose={() => setExitSaleOpen(false)}
        companyId={companyId}
        onSuccess={refreshAll}
      />
      <WarehouseCreateTransferFromDepotDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        companyId={companyId}
        stores={stores}
        warehouseQtyByProductId={warehouseQtyByProductId}
        initialToStoreId={activeStoreId}
        onSuccess={refreshAll}
      />
      <WarehouseAdjustmentDialog
        open={adjustLine != null}
        onClose={() => setAdjustLine(null)}
        companyId={companyId}
        line={adjustLine}
        onSuccess={refreshAll}
      />
      <WarehouseThresholdDialog
        open={thresholdLine != null}
        onClose={() => setThresholdLine(null)}
        companyId={companyId}
        line={thresholdLine}
        onSuccess={refreshAll}
      />

      {transferDetailId ? (
        <div className="fixed inset-0 z-[56] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4" role="dialog">
          <div className="flex max-h-[min(88dvh,640px)] w-full flex-col rounded-t-2xl bg-fs-surface shadow-2xl sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
              <h2 className="text-base font-bold">Détail transfert</h2>
              <button type="button" onClick={() => setTransferDetailId(null)} className="p-2" aria-label="Fermer">
                <MdClose className="h-6 w-6" />
              </button>
            </div>
            {detailTransferQ.isLoading ? (
              <div className="flex min-h-[200px] items-center justify-center p-8">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
              </div>
            ) : null}
            {detailTransferQ.isError ? (
              <div className="p-4">
                <FsQueryErrorPanel error={detailTransferQ.error} onRetry={() => detailTransferQ.refetch()} />
              </div>
            ) : null}
            {detailTransferQ.data ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {(() => {
                  const d = detailTransferQ.data;
                  const canShipNow = d.status === "draft" || d.status === "approved";
                  const needsApproval = d.status === "pending";
                  return (
                    <>
                      <p className="text-[11px] font-semibold uppercase text-neutral-500">Statut</p>
                      <p className="mt-1 text-sm font-bold">{statusLabel(d.status)}</p>
                      <p className="mt-3 text-[11px] font-semibold uppercase text-neutral-500">Flux</p>
                      <p className="mt-1 text-sm">
                        {d.fromWarehouse ? "Dépôt magasin" : storeName(d.fromStoreId)} → {storeName(d.toStoreId)}
                      </p>
                      <p className="mt-4 text-[11px] font-semibold uppercase text-neutral-500">Lignes</p>
                      <div className="mt-2 space-y-2">
                        {d.items.map((it) => (
                          <div
                            key={it.id}
                            className="flex flex-col gap-1 rounded-[10px] border border-black/6 bg-fs-card px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span className="font-semibold">{it.productName ?? it.productId.slice(0, 8)}</span>
                            <span className="text-neutral-600">
                              {it.quantityRequested} req. / {it.quantityShipped} exp. / {it.quantityReceived} réc.
                            </span>
                          </div>
                        ))}
                      </div>
                      {canOperateTransfers ? (
                        <div className="mt-4 space-y-2 border-t border-black/6 pt-4">
                          {needsApproval && canApproveTransfer ? (
                            <button
                              type="button"
                              disabled={approveMut.isPending}
                              onClick={() => approveMut.mutate(d.id)}
                              className="fs-touch-target inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-violet-600 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              <MdCheckCircle className="h-5 w-5" aria-hidden />
                              Approuver
                            </button>
                          ) : null}
                          {needsApproval && !canApproveTransfer ? (
                            <p className="rounded-[10px] border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                              En attente d&apos;approbation par un utilisateur autorisé.
                            </p>
                          ) : null}
                          {canShipNow ? (
                            <button
                              type="button"
                              disabled={shipMut.isPending}
                              onClick={() => shipMut.mutate(d.id)}
                              className="fs-touch-target w-full rounded-[10px] bg-fs-accent py-3.5 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              Expédier
                            </button>
                          ) : null}
                          {d.status === "shipped" ? (
                            <button
                              type="button"
                              disabled={receiveMut.isPending}
                              onClick={() => receiveMut.mutate(d.id)}
                              className="fs-touch-target w-full rounded-[10px] bg-emerald-600 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              Réceptionner
                            </button>
                          ) : null}
                          {d.status === "draft" || d.status === "pending" ? (
                            <button
                              type="button"
                              disabled={cancelMut.isPending}
                              onClick={() => cancelMut.mutate(d.id)}
                              className="fs-touch-target w-full rounded-[10px] border border-amber-300 bg-amber-50 py-3 text-sm font-semibold text-amber-900"
                            >
                              Annuler
                            </button>
                          ) : null}
                          {d.status === "draft" || d.status === "cancelled" ? (
                            <button
                              type="button"
                              disabled={deleteMut.isPending}
                              onClick={() => {
                                if (confirm("Supprimer définitivement ce transfert ?")) deleteMut.mutate(d.id);
                              }}
                              className="fs-touch-target inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-800"
                            >
                              <MdDeleteOutline className="h-5 w-5" />
                              Supprimer
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {dispatchDetailId ? (
        <div className="fixed inset-0 z-[56] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4" role="dialog">
          <div className="flex max-h-[min(88dvh,640px)] w-full flex-col rounded-t-2xl bg-fs-surface shadow-2xl sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
              <h2 className="text-base font-bold">Bon de sortie</h2>
              <button type="button" onClick={() => setDispatchDetailId(null)} className="p-2" aria-label="Fermer">
                <MdClose className="h-6 w-6" />
              </button>
            </div>
            {dispatchDetailQ.isLoading ? (
              <div className="flex min-h-[160px] items-center justify-center">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
              </div>
            ) : null}
            {dispatchDetailQ.data ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {(() => {
                  const d = dispatchDetailQ.data;
                  const sub = d.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
                  return (
                    <>
                      <p className="text-lg font-bold">{d.documentNumber}</p>
                      <p className="mt-1 text-sm text-neutral-600">{formatDt(d.createdAt)}</p>
                      <p className="mt-2 text-sm">
                        Client : {d.customerName ?? "—"}
                        {d.customerPhone ? ` · ${d.customerPhone}` : ""}
                      </p>
                      {d.notes ? <p className="mt-2 text-xs text-neutral-600">{d.notes}</p> : null}
                      <div className="mt-4 space-y-2">
                        {d.lines.map((l, i) => (
                          <div key={i} className="flex justify-between gap-2 rounded-lg border border-black/6 px-3 py-2 text-sm">
                            <span className="min-w-0 font-medium">{l.productName}</span>
                            <span className="shrink-0 text-neutral-600">
                              {l.quantity} × {formatCurrency(l.unitPrice)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 text-right text-base font-bold">Total {formatCurrency(sub)}</p>
                      <button
                        type="button"
                        disabled={voidDispatchMut.isPending}
                        onClick={() => {
                          if (
                            !confirm(
                              `Annuler le bon « ${d.documentNumber} » ? Le stock au dépôt sera réintégré. Définitif.`,
                            )
                          ) {
                            return;
                          }
                          voidDispatchMut.mutate({ invoiceId: d.id });
                        }}
                        className="fs-touch-target mt-4 w-full rounded-[10px] bg-red-600 py-3.5 text-sm font-semibold text-white"
                      >
                        Annuler le bon
                      </button>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </FsPage>
  );
}

function Kpi({
  title,
  value,
  subtitle,
  color,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  color: string;
  icon: ReactNode;
}) {
  return (
    <FsCard
      padding="px-2 py-1.5 sm:p-3"
      className="min-h-[80px] border border-black/[0.06] shadow-none sm:min-h-0 sm:rounded-2xl"
    >
      <div
        className="[&>svg]:h-[18px] [&>svg]:w-[18px] sm:[&>svg]:h-5 sm:[&>svg]:w-5"
        style={{ color }}
      >
        {icon}
      </div>
      <p className="mt-1 text-[10px] font-medium leading-[1.2] text-neutral-600 sm:mt-1.5 sm:text-[11px]">
        {title}
      </p>
      <p className="mt-0.5 text-[13px] font-bold tracking-[-0.03em] text-fs-text sm:text-sm">
        {value}
      </p>
      {subtitle ? (
        <p className="text-[10px] text-neutral-500 sm:text-[11px]">{subtitle}</p>
      ) : null}
    </FsCard>
  );
}

function ActionRow({
  title,
  subtitle,
  icon,
  color,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 flex w-full items-start gap-3 rounded-2xl border border-black/[0.06] p-3 text-left transition-colors active:bg-neutral-50"
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ backgroundColor: color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-fs-text">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{subtitle}</p>
      </div>
    </button>
  );
}

function StockDepotTab({
  lines,
  filtered,
  slice,
  stockQ,
  setStockQ,
  stockFilter,
  setStockFilter,
  stockSafePage,
  stockTotalPages,
  setStockPage,
  filteredLen,
  onAdjust,
  onThreshold,
}: {
  lines: WarehouseStockLine[];
  filtered: WarehouseStockLine[];
  slice: WarehouseStockLine[];
  stockQ: string;
  setStockQ: (v: string) => void;
  stockFilter: StockFilter;
  setStockFilter: (f: StockFilter) => void;
  stockSafePage: number;
  stockTotalPages: number;
  setStockPage: (n: number | ((p: number) => number)) => void;
  filteredLen: number;
  onAdjust: (l: WarehouseStockLine) => void;
  onThreshold: (l: WarehouseStockLine) => void;
}) {
  if (lines.length === 0) {
    return (
      <div className="pb-8 pt-12 text-center sm:pt-16">
        <MdInventory2 className="mx-auto h-12 w-12 text-neutral-300" />
        <p className="mt-4 font-semibold text-fs-text">Aucun stock au dépôt</p>
        <p className="mt-2 px-4 text-sm text-neutral-600">
          Enregistrez une réception ou vérifiez la synchronisation. Ce stock est indépendant des boutiques.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="relative">
        <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
        <input
          className={fsInputClass + " w-full pl-10"}
          placeholder="Rechercher par nom ou SKU"
          value={stockQ}
          onChange={(e) => setStockQ(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <FilterChip sel={stockFilter === "all"} onClick={() => setStockFilter("all")} label="Tous" variant="primary" />
        <FilterChip sel={stockFilter === "low"} onClick={() => setStockFilter("low")} label="En alerte" variant="error" />
        <FilterChip sel={stockFilter === "ok"} onClick={() => setStockFilter("ok")} label="Stock OK" variant="tertiary" />
        {(stockQ || stockFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setStockQ("");
              setStockFilter("all");
            }}
            className="text-xs font-semibold text-fs-accent"
          >
            Réinitialiser
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun produit ne correspond au filtre.</p>
      ) : (
        <div className="space-y-1.5">
        {slice.map((l) => {
          const th = l.stockMinWarehouse > 0 ? l.stockMinWarehouse : l.stockMin;
          const thLabel =
            l.stockMinWarehouse > 0 ? `Seuil magasin ${l.stockMinWarehouse}` : `Seuil produit ${l.stockMin}`;
          const low = l.quantity <= (l.stockMinWarehouse > 0 ? l.stockMinWarehouse : l.stockMin);
          const threshold = th < 0 ? 0 : th;
          const valueAtCost = l.quantity * (l.avgUnitCost ?? l.purchasePrice);
          const valueAtSale = l.quantity * l.salePrice;
          return (
            <div
              key={l.productId}
              className={cn(
                "rounded-xl border bg-fs-card pl-[10px] pr-[6px] pt-[10px] pb-[10px]",
                "border-neutral-200/90 shadow-none dark:border-white/[0.12]",
              )}
            >
              {/* Ligne 1 — aligné `warehouse_page.dart` Card (thumbnail + titre + icônes) */}
              <div className="flex items-start gap-2.5">
                <ProductListThumbnail
                  imageUrl={l.imageUrl}
                  className="h-12 w-12 shrink-0 rounded-[10px]"
                />
                <div className="min-w-0 flex-1 pr-1">
                  <p className="text-[17px] font-bold leading-tight text-fs-text">{l.productName}</p>
                  <p className="mt-1 text-[12px] leading-snug text-neutral-600 dark:text-neutral-400">
                    {l.quantity} {l.unit}
                    {l.sku ? ` · SKU ${l.sku}` : ""} · {thLabel}
                  </p>
                </div>
                <div className="flex shrink-0 items-start">
                  <button
                    type="button"
                    onClick={() => onAdjust(l)}
                    className="fs-touch-target -mr-1 rounded-lg p-2 text-neutral-800 dark:text-neutral-200"
                    title="Ajuster le stock"
                  >
                    <MdBalance className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onThreshold(l)}
                    className="fs-touch-target rounded-lg p-2 text-neutral-800 dark:text-neutral-200"
                    title="Seuil magasin"
                  >
                    <MdTune className="h-5 w-5" />
                  </button>
                </div>
              </div>
              {/* Ligne 2 — badge + PA / PV (comme Flutter) */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div
                  className={cn(
                    "inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border px-2 py-1",
                    low
                      ? "border-[#F5B2B2] bg-[#FDECEC]"
                      : "border-[#A8DBB0] bg-[#EAF7EC]",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {low ? (
                      <MdWarningAmber className="h-4 w-4 shrink-0 text-[#B42318]" />
                    ) : (
                      <MdCheckCircle className="h-4 w-4 shrink-0 text-[#1E7D34]" />
                    )}
                    <span
                      className={cn(
                        "text-[11px] font-bold",
                        low ? "text-[#7A271A]" : "text-[#14532D]",
                      )}
                    >
                      {low ? "Alerte stock" : "Stock OK"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold",
                      low ? "text-[#9A3412]" : "text-[#166534]",
                    )}
                  >
                    {l.quantity} / seuil {threshold}
                  </span>
                </div>
                <div className="min-w-0 shrink text-right">
                  <p className="text-base font-extrabold leading-tight text-fs-text">{formatCurrency(valueAtCost)}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                    PV {formatCurrency(valueAtSale)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}
      {filteredLen > 0 && stockTotalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 py-2">
          <button
            type="button"
            disabled={stockSafePage <= 0}
            onClick={() => setStockPage((p) => Math.max(0, p - 1))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F97316] text-white disabled:opacity-40"
          >
            <MdChevronLeft className="h-7 w-7" />
          </button>
          <span className="text-sm font-semibold">
            Page {stockSafePage + 1} / {stockTotalPages}
          </span>
          <button
            type="button"
            disabled={stockSafePage >= stockTotalPages - 1}
            onClick={() => setStockPage((p) => Math.min(stockTotalPages - 1, p + 1))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F97316] text-white disabled:opacity-40"
          >
            <MdChevronRight className="h-7 w-7" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  sel,
  label,
  onClick,
  variant,
}: {
  sel: boolean;
  label: string;
  onClick: () => void;
  variant: "primary" | "error" | "tertiary";
}) {
  const ring =
    variant === "primary"
      ? "border-[#F97316] bg-[color-mix(in_srgb,#F97316_20%,transparent)] text-[#4A4643]"
      : variant === "error"
        ? "border-red-400 bg-red-50"
        : "border-teal-400 bg-teal-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[44px] rounded-full border px-3 py-2 text-xs font-bold",
        sel ? ring : "border-black/10 bg-neutral-100 text-neutral-800",
      )}
    >
      {label}
    </button>
  );
}

function MouvementsTab({
  movSlice,
  movSafePage,
  movTotalPages,
  setMovPage,
  movementsLen,
  companyId,
  voidingId,
  onVoid,
}: {
  movSlice: WarehouseMovement[];
  movSafePage: number;
  movTotalPages: number;
  setMovPage: (n: number | ((p: number) => number)) => void;
  movementsLen: number;
  companyId: string;
  voidingId: string | null;
  onVoid: (m: WarehouseMovement) => void;
}) {
  if (movementsLen === 0) {
    return (
      <div className="pb-8 pt-12 text-center sm:pt-16">
        <MdSwapHoriz className="mx-auto h-12 w-12 text-neutral-300" />
        <p className="mt-4 font-semibold">Aucun mouvement</p>
        <p className="mt-2 text-sm text-neutral-600">
          Les entrées, sorties et ajustements apparaîtront ici.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-6">
      {movSlice.map((m) => {
        const kind = m.movementKind === "entry";
        const kindColor = kind ? ACCENT.emerald : ACCENT.orange;
        const pack = WAREHOUSE_PACKAGING_LABELS[m.packagingType] ?? m.packagingType;
        const unitExtra =
          m.unitCost != null
            ? kind
              ? ` · PA ${formatCurrency(m.unitCost)}`
              : m.referenceType === "warehouse_dispatch"
                ? ` · PU ${formatCurrency(m.unitCost)}`
                : ""
            : "";
        const line2 = `${m.createdAt ? formatDt(m.createdAt) : "—"} · ${kind ? "Entrée" : "Sortie"} · ${m.quantity} u. · ${pack}${m.packsQuantity !== 1 ? ` ×${m.packsQuantity}` : ""}`;
        const line3 = `${refLabel(m)}${unitExtra}`;
        const canVoid = m.referenceType === "warehouse_dispatch" && m.referenceId && companyId;

        return (
          <FsCard key={m.id} padding="p-3" className="border border-black/[0.06] shadow-sm">
            <div className="flex gap-3">
              <div
                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${kindColor}24` }}
              >
                {kind ? (
                  <MdSouthWest className="h-5 w-5" style={{ color: kindColor }} />
                ) : (
                  <MdNorthEast className="h-5 w-5" style={{ color: kindColor }} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-snug text-fs-text">{m.productName ?? "Produit"}</p>
                <p className="mt-1 text-[12px] leading-snug text-neutral-600">{line2}</p>
                <p className="mt-0.5 text-[12px] text-neutral-700">{line3}</p>
                {canVoid ? (
                  <button
                    type="button"
                    disabled={voidingId === m.referenceId}
                    onClick={() => onVoid(m)}
                    className="mt-2 text-xs font-bold text-red-600"
                  >
                    {voidingId === m.referenceId ? "…" : "Annuler le bon"}
                  </button>
                ) : null}
              </div>
            </div>
          </FsCard>
        );
      })}
      {movTotalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 py-2">
          <button
            type="button"
            disabled={movSafePage <= 0}
            onClick={() => setMovPage((p) => Math.max(0, p - 1))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F97316] text-white disabled:opacity-40"
          >
            <MdChevronLeft className="h-7 w-7" />
          </button>
          <span className="text-sm font-semibold">
            Page {movSafePage + 1} / {movTotalPages}
          </span>
          <button
            type="button"
            disabled={movSafePage >= movTotalPages - 1}
            onClick={() => setMovPage((p) => Math.min(movTotalPages - 1, p + 1))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F97316] text-white disabled:opacity-40"
          >
            <MdChevronRight className="h-7 w-7" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TransfertTab({
  transfers,
  storeName,
  onCreate,
  onOpen,
  onDelete,
}: {
  transfers: StockTransferListItem[];
  storeName: (id: string | null) => string;
  onCreate: () => void;
  onOpen: (t: StockTransferListItem) => void;
  onDelete: (t: StockTransferListItem) => void;
}) {
  if (transfers.length === 0) {
    return (
      <div className="pb-8">
        <FsCard padding="p-4">
          <p className="text-sm font-semibold text-fs-text">Transfert dépôt → boutique</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Aucun transfert enregistré pour le moment.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 inline-flex min-h-[48px] min-w-[44px] items-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 text-sm font-semibold text-white shadow-sm active:opacity-90"
          >
            <MdSwapHoriz className="h-5 w-5" />
            Nouveau transfert
          </button>
        </FsCard>
      </div>
    );
  }

  const sorted = [...transfers].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <div className="space-y-3 pb-6">
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex min-h-[48px] min-w-[44px] items-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 text-sm font-semibold text-white shadow-sm active:opacity-90"
      >
        <MdAdd className="h-5 w-5" />
        Nouveau transfert
      </button>
      {sorted.map((t) => {
        const toName = storeName(t.toStoreId);
        const col = statusColor(t.status);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpen(t)}
            className="flex w-full min-h-[56px] items-stretch gap-2 rounded-xl border border-black/[0.08] bg-fs-card text-left shadow-sm active:bg-neutral-50"
          >
            <div className="flex shrink-0 items-center pl-3">
              <MdLocalShipping className="h-6 w-6 text-[#F97316]" />
            </div>
            <div className="min-w-0 flex-1 py-3 pr-2">
              <p className="text-sm font-semibold leading-snug">Dépôt magasin → {toName}</p>
              <p className="mt-0.5 text-xs text-neutral-600">Créé le {formatDt(t.createdAt)}</p>
            </div>
            <div className="flex items-center gap-1 pr-2">
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ background: `${col}20`, color: col }}
              >
                {statusLabel(t.status)}
              </span>
              {canDeleteTransfer(t) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(t);
                  }}
                  className="p-2 text-red-600"
                  aria-label="Supprimer"
                >
                  <MdDeleteOutline className="h-5 w-5" />
                </button>
              ) : null}
              <MdChevronRight className="h-6 w-6 text-neutral-400" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function canDeleteTransfer(t: StockTransferListItem) {
  if (t.id.startsWith("pending:")) return true;
  return t.status === "draft" || t.status === "cancelled";
}

function HistoriquesTab({
  rows,
  allRows,
  page,
  totalPages,
  setPage,
  loading,
  error,
  onOpen,
  onRetry,
}: {
  rows: WarehouseDispatchInvoiceSummary[];
  allRows: WarehouseDispatchInvoiceSummary[];
  page: number;
  totalPages: number;
  setPage: (n: number | ((p: number) => number)) => void;
  loading: boolean;
  error: unknown;
  onOpen: (r: WarehouseDispatchInvoiceSummary) => void;
  onRetry: () => void;
}) {
  if (loading && allRows.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-600">Erreur de chargement</p>
        <button type="button" onClick={onRetry} className="mt-2 text-sm font-semibold text-fs-accent">
          Réessayer
        </button>
      </div>
    );
  }
  if (allRows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-neutral-600">Aucun bon de sortie enregistré.</p>
    );
  }

  return (
    <div className="space-y-2 pb-6">
      {rows.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onOpen(r)}
          className="flex min-h-[52px] w-full flex-col justify-center rounded-[10px] border border-black/[0.06] bg-[color-mix(in_srgb,var(--fs-surface-container-low)_100%,transparent)] px-3 py-3 text-left active:bg-black/[0.03]"
        >
          <span className="text-sm font-bold leading-tight">{r.documentNumber}</span>
          <span className="mt-1 text-xs text-neutral-600">
            {formatDt(r.createdAt)} · {r.customerName ?? "—"}
          </span>
        </button>
      ))}
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 py-2">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F97316] text-white disabled:opacity-40"
          >
            <MdChevronLeft className="h-7 w-7" />
          </button>
          <span className="text-sm font-semibold">
            Page {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F97316] text-white disabled:opacity-40"
          >
            <MdChevronRight className="h-7 w-7" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
