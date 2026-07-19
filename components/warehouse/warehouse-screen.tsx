"use client";

import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { ROUTES } from "@/lib/config/routes";
import { InvoicePdfPreviewDialog } from "@/components/invoices/invoice-pdf-preview-dialog";
import { P } from "@/lib/constants/permissions";
import { computeDashboardFromLists } from "@/lib/features/warehouse/dashboard";
import {
  getWarehouseDispatchInvoiceDetails,
  listWarehouseDispatchInvoices,
  listWarehouseInventory,
  listWarehouseMovements,
  listWarehouses,
  searchWarehouseDispatchLinesByProduct,
  warehouseUpdateDispatchInvoice,
  voidWarehouseDispatchInvoice,
} from "@/lib/features/warehouse/api";
import { listCustomers } from "@/lib/features/customers/api";
import { listProducts } from "@/lib/features/products/api";
import { listStores as listStoresFull } from "@/lib/features/stores/api";
import { downloadStoreProductsPdf } from "@/lib/features/stores/generate-store-products-pdf";
import type { Warehouse, WarehouseDispatchInvoiceSummary, WarehouseDispatchLineHit, WarehouseMovement, WarehouseStockLine } from "@/lib/features/warehouse/types";
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
import {
  downloadInvoicePdf,
  fetchLogoBytes,
  generateInvoicePdfBlob,
  printInvoicePdf,
} from "@/lib/features/invoices/generate-invoice-pdf";
import type { Store } from "@/lib/features/stores/types";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { cn } from "@/lib/utils/cn";
import { toast, toastMutationError } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  MdDownload,
  MdDeleteOutline,
  MdEdit,
  MdInventory2,
  MdLink,
  MdLocalShipping,
  MdLockOutline,
  MdNorthEast,
  MdPointOfSale,
  MdPictureAsPdf,
  MdPrint,
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

const DISPATCH_PAYMENT_NOTE_PREFIX = "__PAYMENT_INFO__:";
type DispatchPaymentMode = "cash" | "mobile_money" | "card" | "credit";
type DispatchMobileProvider = "orange_money" | "moov_money" | "wave";
type DispatchPaymentInfo = {
  mode: DispatchPaymentMode;
  paidAmount: number;
  mobileProvider: DispatchMobileProvider | null;
};

type DispatchEditLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

function refLabel(m: WarehouseMovement): string {
  switch (m.referenceType) {
    case "sale":
      return "Vente POS";
    case "stock_transfer":
      return "Transfert boutique";
    case "warehouse_dispatch":
      return "Bon / facture dépôt";
    case "warehouse_dispatch_void":
      return "Annulation bon dépôt";
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

function parseDispatchPaymentInfo(raw: string | null): DispatchPaymentInfo {
  const note = (raw ?? "").trim();
  if (!note.startsWith(DISPATCH_PAYMENT_NOTE_PREFIX)) {
    return { mode: "credit", paidAmount: 0, mobileProvider: null };
  }
  const payloadRaw = note.slice(DISPATCH_PAYMENT_NOTE_PREFIX.length).trim();
  try {
    const payload = JSON.parse(payloadRaw) as {
      mode?: DispatchPaymentMode;
      paid_amount?: number;
      mobile_provider?: DispatchMobileProvider | null;
    };
    const mode = payload.mode;
    const paidAmount = Number(payload.paid_amount ?? 0);
    const mobileProvider = payload.mobile_provider ?? null;
    if (mode === "cash" || mode === "mobile_money" || mode === "card" || mode === "credit") {
      return {
        mode,
        paidAmount: Number.isFinite(paidAmount) ? Math.max(0, Math.round(paidAmount)) : 0,
        mobileProvider:
          mobileProvider === "orange_money" || mobileProvider === "moov_money" || mobileProvider === "wave"
            ? mobileProvider
            : null,
      };
    }
  } catch {
    // Support ancien format "__PAYMENT_MODE__:credit"
    const legacyMode = payloadRaw as DispatchPaymentMode;
    if (
      legacyMode === "cash" ||
      legacyMode === "mobile_money" ||
      legacyMode === "card" ||
      legacyMode === "credit"
    ) {
      return {
        mode: legacyMode,
        paidAmount: legacyMode === "credit" ? 0 : 0,
        mobileProvider: null,
      };
    }
  }
  return { mode: "credit", paidAmount: 0, mobileProvider: null };
}

function visibleDispatchNote(raw: string | null): string | null {
  const note = (raw ?? "").trim();
  if (!note || note.startsWith(DISPATCH_PAYMENT_NOTE_PREFIX)) return null;
  return note;
}

export function WarehouseScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: ctx, isLoading: permLoading, helpers, hasPermission } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const companyName = ctx?.companyName ?? "";
  const companyLogoUrl = ctx?.companyLogoUrl ?? null;
  const stores = ctx?.stores ?? [];
  const activeStoreId = ctx?.storeId ?? null;
  const canWarehouse = helpers?.canWarehouse ?? false;
  /** Aligné `TransfersScreen` — actions sur le flux transfert. */
  const canApproveTransfer = hasPermission(P.transfersApprove);
  const canOperateTransfers =
    hasPermission(P.transfersCreate) || hasPermission(P.transfersApprove) || hasPermission(P.stockTransfer);

  const [tab, setTab] = useState(0);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [pendingWarehouseId, setPendingWarehouseId] = useState<string | null>(null);
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
  const [movSearch, setMovSearch] = useState("");
  const [movSearchDebounced, setMovSearchDebounced] = useState("");
  const MOV_PAGE = 20;

  const [dispatchPage, setDispatchPage] = useState(0);
  const DISPATCH_PAGE = 20;
  const [dispatchProductSearch, setDispatchProductSearch] = useState("");
  const [dispatchProductSearchDebounced, setDispatchProductSearchDebounced] = useState("");
  const [exportingProductsPdf, setExportingProductsPdf] = useState(false);

  const [transferDetailId, setTransferDetailId] = useState<string | null>(null);
  const [dispatchDetailId, setDispatchDetailId] = useState<string | null>(null);
  const [dispatchDialogInvoiceId, setDispatchDialogInvoiceId] = useState<string | null>(null);
  const [dispatchEditId, setDispatchEditId] = useState<string | null>(null);
  const [dispatchEditCustomerId, setDispatchEditCustomerId] = useState<string>("");
  const [dispatchEditLines, setDispatchEditLines] = useState<DispatchEditLine[]>([]);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [dispatchPdfBusy, setDispatchPdfBusy] = useState<null | {
    id: string;
    mode: "view" | "print" | "download";
  }>(null);
  const [dispatchPreviewBlob, setDispatchPreviewBlob] = useState<Blob | null>(null);

  const warehousesQ = useQuery({
    queryKey: ["warehouses", companyId] as const,
    queryFn: () => listWarehouses(companyId),
    enabled: Boolean(companyId) && canWarehouse,
  });
  const warehouses: Warehouse[] = warehousesQ.data ?? [];
  const activeWarehouseId = selectedWarehouseId ?? warehouses.find((w) => w.isPrimary)?.id ?? warehouses[0]?.id ?? null;
  const activeWarehouseName = warehouses.find((w) => w.id === activeWarehouseId)?.name ?? "Principal";

  const invQ = useQuery({
    queryKey: [...queryKeys.warehouseInventory(companyId), activeWarehouseId],
    queryFn: () => listWarehouseInventory(companyId, activeWarehouseId),
    enabled: Boolean(companyId) && canWarehouse,
  });
  const movSearchTerm = movSearchDebounced.trim();
  const movQ = useQuery({
    queryKey: [...queryKeys.warehouseMovements(companyId), activeWarehouseId, movSearchTerm],
    queryFn: () =>
      listWarehouseMovements(
        companyId,
        movSearchTerm ? 2000 : 500,
        activeWarehouseId,
        movSearchTerm || undefined,
      ),
    enabled: Boolean(companyId) && canWarehouse,
  });
  const dispatchQ = useQuery({
    queryKey: [...queryKeys.warehouseDispatch(companyId), activeWarehouseId],
    queryFn: () => listWarehouseDispatchInvoices(companyId, 120, activeWarehouseId),
    enabled: Boolean(companyId) && canWarehouse,
  });
  const dispatchSearchTerm = dispatchProductSearchDebounced.trim();
  const dispatchSearchActive = dispatchSearchTerm.length >= 2;
  const dispatchLinesQ = useQuery({
    queryKey: [
      ...queryKeys.warehouseDispatch(companyId),
      activeWarehouseId,
      "lines-search",
      dispatchSearchTerm,
    ],
    queryFn: () =>
      searchWarehouseDispatchLinesByProduct(companyId, dispatchSearchTerm, activeWarehouseId),
    enabled: Boolean(companyId) && canWarehouse && dispatchSearchActive,
  });
  const whTransfersQ = useQuery({
    queryKey: queryKeys.warehouseTransfers(companyId),
    queryFn: () => listStockTransfers({ companyId, fromWarehouseOnly: true }),
    enabled: Boolean(companyId) && canWarehouse,
  });
  const storesQ = useQuery({
    queryKey: queryKeys.stores(companyId),
    queryFn: () => listStoresFull(companyId),
    enabled: Boolean(companyId) && canWarehouse,
  });
  const customersQ = useQuery({
    queryKey: queryKeys.customers(companyId),
    queryFn: () => listCustomers(companyId),
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
  const dispatchEditQ = useQuery({
    queryKey: dispatchEditId ? ["warehouse-dispatch-edit", dispatchEditId] : ["none-edit"],
    queryFn: () => getWarehouseDispatchInvoiceDetails(dispatchEditId as string),
    enabled: Boolean(dispatchEditId),
  });

  const inventory = useMemo(() => invQ.data ?? [], [invQ.data]);
  const movements = useMemo(() => movQ.data ?? [], [movQ.data]);
  const dispatchRows = useMemo(() => dispatchQ.data ?? [], [dispatchQ.data]);
  const warehouseTransfers = useMemo(() => whTransfersQ.data ?? [], [whTransfersQ.data]);
  const customers = useMemo(() => customersQ.data ?? [], [customersQ.data]);

  const warehouseQtyByProductId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of inventory) m[l.productId] = l.quantity;
    return m;
  }, [inventory]);

  const dashboard = useMemo(() => {
    if (!companyId) return null;
    return computeDashboardFromLists(inventory, movements);
  }, [companyId, inventory, movements]);

  const decisionPanel = useMemo(() => {
    const thresholdOf = (l: WarehouseStockLine) =>
      Math.max(0, l.stockMinWarehouse > 0 ? l.stockMinWarehouse : l.stockMin);
    const lowLines = inventory
      .map((l) => {
        const threshold = thresholdOf(l);
        const missingQty = Math.max(0, threshold - l.quantity);
        const estimatedRefillCost = missingQty * (l.avgUnitCost ?? l.purchasePrice);
        return { line: l, threshold, missingQty, estimatedRefillCost };
      })
      .filter((x) => x.missingQty > 0)
      .sort((a, b) => b.estimatedRefillCost - a.estimatedRefillCost);

    const now = Date.now();
    const days30 = 30 * 24 * 60 * 60 * 1000;
    const recentMovementsByProduct = new Set(
      movements
        .filter((m) => {
          if (!m.createdAt) return false;
          const dt = Date.parse(m.createdAt);
          return Number.isFinite(dt) && now - dt <= days30;
        })
        .map((m) => m.productId),
    );
    const dormantLines = inventory
      .filter((l) => !recentMovementsByProduct.has(l.productId) && l.quantity > 0)
      .sort((a, b) => b.quantity * b.salePrice - a.quantity * a.salePrice);

    const healthPct =
      inventory.length > 0
        ? Math.round(((inventory.length - lowLines.length) / inventory.length) * 100)
        : 100;
    const netFlow30 = (dashboard?.movementsEntries30d ?? 0) - (dashboard?.movementsExits30d ?? 0);

    const pendingTransfersCount = warehouseTransfers.filter((t) =>
      t.status === "draft" || t.status === "pending" || t.status === "approved" || t.status === "shipped",
    ).length;

    const from7 = now - 7 * 24 * 60 * 60 * 1000;
    const dispatch7d = dispatchRows.filter((d) => {
      const dt = Date.parse(d.createdAt);
      return Number.isFinite(dt) && dt >= from7;
    });
    const dispatchAmount7d = dispatch7d.reduce((s, d) => s + Number(d.totalAmount ?? 0), 0);
    const dispatchOutstandingTotal = dispatchRows.reduce((s, d) => {
      const total = Math.max(0, Math.round(Number(d.totalAmount ?? 0)));
      const paid = Math.min(total, Math.max(0, parseDispatchPaymentInfo(d.notes).paidAmount));
      return s + Math.max(0, total - paid);
    }, 0);
    const dispatchPaidTotal = dispatchRows.reduce((s, d) => {
      const total = Math.max(0, Math.round(Number(d.totalAmount ?? 0)));
      const paid = Math.min(total, Math.max(0, parseDispatchPaymentInfo(d.notes).paidAmount));
      return s + paid;
    }, 0);
    const dispatchOpenCount = dispatchRows.filter((d) => {
      const total = Math.max(0, Math.round(Number(d.totalAmount ?? 0)));
      const paid = Math.min(total, Math.max(0, parseDispatchPaymentInfo(d.notes).paidAmount));
      return total - paid > 0.005;
    }).length;
    const dispatchOpen7d = dispatch7d.reduce((s, d) => {
      const total = Math.max(0, Math.round(Number(d.totalAmount ?? 0)));
      const paid = Math.min(total, Math.max(0, parseDispatchPaymentInfo(d.notes).paidAmount));
      return s + Math.max(0, total - paid);
    }, 0);

    return {
      topLow: lowLines.slice(0, 5),
      dormantTop: dormantLines.slice(0, 3),
      lowCount: lowLines.length,
      healthPct,
      netFlow30,
      pendingTransfersCount,
      dispatch7dCount: dispatch7d.length,
      dispatchAmount7d,
      dispatchOutstandingTotal,
      dispatchPaidTotal,
      dispatchOpenCount,
      dispatchOpen7d,
    };
  }, [inventory, movements, dashboard, warehouseTransfers, dispatchRows]);

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
  const updateDispatchMut = useMutation({
    mutationFn: (payload: {
      invoiceId: string;
      customerId: string | null;
      notes: string | null;
      lines: DispatchEditLine[];
    }) =>
      warehouseUpdateDispatchInvoice({
        companyId,
        invoiceId: payload.invoiceId,
        customerId: payload.customerId,
        notes: payload.notes,
        lines: payload.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      }),
    onSuccess: async () => {
      toast.success("Bon de sortie modifié. Stock et mouvements mis à jour.");
      setDispatchEditId(null);
      setDispatchEditLines([]);
      setDispatchEditCustomerId("");
      await refreshAll();
    },
    onError: (e) => toastMutationError("dispatch-edit", e),
  });

  useEffect(() => {
    if (!dispatchEditQ.data) return;
    setDispatchEditCustomerId(dispatchEditQ.data.customerId ?? "");
    setDispatchEditLines(
      dispatchEditQ.data.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        quantity: Math.max(1, Math.floor(Number(l.quantity ?? 0))),
        unitPrice: Math.max(0, Math.round(Number(l.unitPrice ?? 0))),
      })),
    );
  }, [dispatchEditQ.data]);

  useEffect(() => {
    const t = setTimeout(() => setDispatchProductSearchDebounced(dispatchProductSearch.trim()), 280);
    return () => clearTimeout(t);
  }, [dispatchProductSearch]);

  useEffect(() => {
    const t = setTimeout(() => setMovSearchDebounced(movSearch.trim()), 280);
    return () => clearTimeout(t);
  }, [movSearch]);

  useEffect(() => {
    setMovPage(0);
  }, [movSearchTerm, activeWarehouseId]);

  function storeName(id: string | null) {
    if (!id) return "—";
    return stores.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  }

  async function exportWarehouseProductsPdf() {
    if (exportingProductsPdf || !companyId) return;
    setExportingProductsPdf(true);
    toast.info("Génération du PDF en cours…");
    try {
      const products = await listProducts(companyId);
      const depotStockByProductId = new Map<string, number>(
        inventory.map((line) => [line.productId, Math.max(0, Number(line.quantity ?? 0))]),
      );
      const items = products
        .filter((p) => (depotStockByProductId.get(p.id) ?? 0) > 0)
        .map((p) => ({
          name: p.name,
          imageUrl:
            p.product_images && p.product_images.length > 0
              ? p.product_images[0]?.url ?? null
              : null,
        }));
      await downloadStoreProductsPdf({
        companyId,
        storeId: null,
        companyName: companyName || "Entreprise",
        companyLogoUrl,
        storeName: "Depot Centrale",
        items,
      });
      toast.success("PDF des produits exporté.");
    } catch (e) {
      toastMutationError("warehouse-export-products-pdf", e);
    } finally {
      setExportingProductsPdf(false);
    }
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

  async function buildDispatchInvoiceBlob(params: {
    id: string;
    documentNumber: string;
    createdAt: string;
    customerName: string | null;
    customerPhone: string | null;
    notes: string | null;
    lines: Array<{ productName: string; quantity: number; unitPrice: number; productUnit?: string | null }>;
  }) {
    const storesFull = storesQ.data ?? [];
    const storeForA4 =
      storesFull.find((s) => s.is_primary) ??
      (activeStoreId ? storesFull.find((s) => s.id === activeStoreId) : null) ??
      storesFull[0] ??
      null;

    const defaultStore: Store = {
      id: activeStoreId ?? `${companyId}-warehouse`,
      company_id: companyId,
      name: companyName || "Magasin",
      code: null,
      address: null,
      logo_url: companyLogoUrl ?? null,
      phone: null,
      email: null,
      description: "Facture / Bon de sortie dépôt",
      is_active: true,
      is_primary: true,
      pos_discount_enabled: false,
      currency: "XOF",
      primary_color: "#F97316",
      secondary_color: null,
      invoice_prefix: null,
      footer_text: null,
      legal_info: null,
      signature_url: null,
      stamp_url: null,
      payment_terms: null,
      tax_label: null,
      tax_number: null,
      city: null,
      country: null,
      commercial_name: companyName || "Entreprise",
      slogan: null,
      activity: null,
      mobile_money: null,
      invoice_short_title: "Facture",
      invoice_signer_title: null,
      invoice_signer_name: null,
      engine_invoice_signatory: null,
      engine_invoice_extra_phones: null,
      invoice_template: "classic",
      receipt_paper_width_mm: null,
      shares_company_catalog: true,
    };

    const effectiveStore = storeForA4 ?? defaultStore;
    const logoBytes = await fetchLogoBytes(effectiveStore.logo_url ?? companyLogoUrl);
    const total = params.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const paymentInfo = parseDispatchPaymentInfo(params.notes);
    const paymentLabel =
      paymentInfo.mode === "cash"
        ? "Espèces"
        : paymentInfo.mode === "mobile_money"
          ? paymentInfo.mobileProvider === "moov_money"
            ? "Moov Money"
            : paymentInfo.mobileProvider === "wave"
              ? "Wave"
              : "Orange Money"
          : paymentInfo.mode === "card"
            ? "Virement bancaire"
            : "À crédit";
    const isImmediateEncaisse = paymentInfo.mode !== "credit";
    const encaisseAmount = isImmediateEncaisse
      ? (paymentInfo.mode === "cash"
          ? Math.min(total, Math.max(0, Math.round(paymentInfo.paidAmount)))
          : total)
      : 0;
    return generateInvoicePdfBlob(
      {
      store: effectiveStore,
      saleNumber: params.documentNumber,
      date: new Date(params.createdAt),
      items: params.lines.map((l) => ({
        description: l.productName,
        quantity: l.quantity,
        unit: l.productUnit ?? "u",
        unitPrice: l.unitPrice,
        total: l.quantity * l.unitPrice,
      })),
      subtotal: total,
      discount: 0,
      tax: 0,
      total,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerAddress: null,
      depositAmount: encaisseAmount,
      paymentLines: [{ label: paymentLabel, amount: encaisseAmount, isImmediateEncaisse }],
      amountInWords: null,
      logoBytes,
    },
      { warehouseDispatchId: params.id },
    );
  }

  async function handleDispatchInvoiceAction(
    mode: "view" | "print" | "download",
    params: {
      id: string;
      documentNumber: string;
      createdAt: string;
      customerName: string | null;
      customerPhone: string | null;
      notes: string | null;
      lines: Array<{ productName: string; quantity: number; unitPrice: number; productUnit?: string | null }>;
    },
  ) {
    if (dispatchPdfBusy) return;
    setDispatchPdfBusy({ id: params.id, mode });
    try {
      const blob = await buildDispatchInvoiceBlob(params);
      if (mode === "view") {
        setDispatchPreviewBlob(blob);
      } else if (mode === "print") {
        toast.info("Impression directe en cours…");
        printInvoicePdf(blob);
        window.setTimeout(
          () => toast.success("Fenêtre d’impression lancée. Si rien ne sort, utilisez Ctrl+P dans l’onglet PDF."),
          450,
        );
      } else {
        downloadInvoicePdf(blob, params.documentNumber);
        toast.success("Facture téléchargée.");
      }
    } catch (e) {
      toastMutationError("warehouse-dispatch-invoice-pdf", e);
    } finally {
      setDispatchPdfBusy(null);
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
    <FsPage>
      {/* Aligné AppBar Flutter : toolbarHeight 52, TabBar dessous (label 15px, indicateur #F97316) */}
      <div className="sticky top-0 z-30 -mx-3 border-b border-black/6 bg-fs-surface/95 backdrop-blur-lg sm:-mx-5">
        <div className="flex min-h-[38px] items-center justify-between gap-1.5 px-3 py-0.5 sm:px-0">
          <FsScreenHeader
            title="Magasin"
            className="mb-0 min-w-0 flex-1"
            titleClassName="text-[13px] font-semibold tracking-tight text-fs-text sm:text-[15px] sm:font-bold"
          />
          <button
            type="button"
            onClick={() => refreshAll()}
            disabled={invQ.isFetching}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-fs-surface-container text-neutral-600 transition-colors hover:bg-black/3 active:bg-black/5"
            aria-label="Actualiser"
          >
            <MdRefresh className={cn("h-4.5 w-4.5", invQ.isFetching && "animate-spin")} />
          </button>
        </div>

        <FsHorizontalScroll
          className="warehouse-tabbar-scroll flex gap-1 px-3 pb-1 pt-0.5 sm:px-0 sm:pb-1.5 sm:pt-1"
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
                "shrink-0 snap-start rounded-lg border px-2.5 py-1 text-left text-[12px] leading-tight transition-all sm:px-3 sm:text-[13px]",
                "min-h-[30px] min-w-0 max-w-[min(100%,11rem)] sm:min-h-[32px] sm:max-w-none",
                tab === i
                  ? "border-[#F97316] bg-[#F97316] font-bold text-white shadow-[0_2px_8px_rgba(249,115,22,0.28)]"
                  : "border-transparent bg-transparent font-semibold text-[#4A4643] hover:border-black/8 hover:bg-black/3 active:bg-neutral-100",
              )}
            >
              {label}
            </button>
          ))}
        </FsHorizontalScroll>
      </div>

      <div className="mt-3 rounded-md border border-black/6 bg-[color-mix(in_srgb,var(--fs-surface-container-highest)_55%,transparent)] px-3 py-1.5">
        {warehouses.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Dépôt actif
            </p>
            <div className="flex flex-wrap gap-1.5">
              {warehouses.map((wh) => (
                <button
                  key={wh.id}
                  type="button"
                  onClick={() => {
                    if (wh.id !== activeWarehouseId) setPendingWarehouseId(wh.id);
                  }}
                  className={cn(
                    "rounded-[4px] border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                    activeWarehouseId === wh.id
                      ? "border-[#F97316] bg-[#F97316] text-white"
                      : "border-black/15 bg-white text-fs-text hover:border-[#F97316]/50 hover:text-[#F97316]",
                  )}
                >
                  {wh.name}
                  {wh.isPrimary ? (
                    <span className="ml-1 text-[9px] opacity-60">principal</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Dépôt central
            </p>
            <p className="mt-0.5 truncate text-[13px] font-bold leading-tight text-fs-text">
              {activeWarehouseName}{companyName ? ` — ${companyName}` : ""}
            </p>
          </>
        )}
      </div>

      {/* Dialog de confirmation de changement de dépôt */}
      {pendingWarehouseId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-fs-surface p-5 shadow-xl">
            <p className="text-[15px] font-bold text-fs-text">Changer de dépôt ?</p>
            <p className="mt-1.5 text-[13px] text-neutral-500">
              Vous allez basculer vers{" "}
              <span className="font-semibold text-fs-text">
                {warehouses.find((w) => w.id === pendingWarehouseId)?.name ?? "ce dépôt"}
              </span>
              . Toutes les opérations (entrées, sorties, ajustements) s&apos;appliqueront à ce dépôt.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingWarehouseId(null)}
                className="rounded-[4px] border border-black/10 px-4 py-1.5 text-[13px] font-semibold text-fs-text hover:bg-black/5"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedWarehouseId(pendingWarehouseId);
                  setPendingWarehouseId(null);
                }}
                className="rounded-[4px] bg-[#F97316] px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-[#ea6c10]"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

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
                    className="inline-flex min-h-[36px] min-w-[44px] items-center gap-1.5 rounded-[12px] border-0 bg-[#F97316] px-3 py-1.5 text-[13px] font-bold text-white shadow-sm active:opacity-90 sm:min-h-[38px] sm:gap-2 sm:rounded-[14px] sm:px-4 sm:py-2 sm:text-sm"
                  >
                    <MdAddCircleOutline className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
                    Réception
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDispatchDialogInvoiceId(null);
                      setDispatchOpen(true);
                    }}
                    className="inline-flex min-h-[36px] min-w-[44px] items-center gap-1.5 rounded-[12px] border-0 bg-[#F97316] px-3 py-1.5 text-[13px] font-bold text-white shadow-sm active:opacity-90 sm:min-h-[38px] sm:gap-2 sm:rounded-[14px] sm:px-4 sm:py-2 sm:text-sm"
                  >
                    <MdReceiptLong className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
                    Facture / sortie
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab(1)}
                    className="inline-flex min-h-[36px] min-w-[44px] items-center gap-1.5 rounded-[12px] bg-[#E6DDF6] px-3 py-1.5 text-[13px] font-bold text-[#7C3AED] active:opacity-90 sm:min-h-[38px] sm:gap-2 sm:rounded-[14px] sm:px-4 sm:py-2 sm:text-sm"
                  >
                    <MdCategory className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
                    Produits
                  </button>
                  <button
                    type="button"
                    onClick={openTransferDialog}
                    className="inline-flex min-h-[36px] min-w-[44px] items-center gap-1.5 rounded-[12px] bg-[#DCE5F3] px-3 py-1.5 text-[13px] font-bold text-[#2563EB] active:opacity-90 sm:min-h-[38px] sm:gap-2 sm:rounded-[14px] sm:px-4 sm:py-2 sm:text-sm"
                  >
                    <MdSwapHoriz className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
                    Transferts
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportWarehouseProductsPdf()}
                    disabled={exportingProductsPdf}
                    className="inline-flex min-h-0 min-w-[38px] items-center gap-1 rounded-[11px] bg-[#FDECEC] px-2 py-0.5 text-[12px] font-bold leading-none text-[#B42318] active:opacity-90 disabled:opacity-60 sm:min-h-0 sm:gap-1.5 sm:rounded-[12px] sm:px-2.5 sm:py-1 sm:text-[13px]"
                  >
                    <MdPictureAsPdf className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
                    {exportingProductsPdf ? "Export…" : "Produits PDF"}
                  </button>
                </div>
              </FsCard>

              {dashboard ? (
                <>
                  <div className="grid auto-rows-fr grid-cols-1 gap-1.5 min-[340px]:grid-cols-2 min-[640px]:grid-cols-3 sm:gap-2">
                    {ctx?.warehouseKpiShowPurchaseValue !== false ? (
                      <Kpi
                        title="Valeur au prix d’achat"
                        value={formatCurrency(dashboard.valueAtPurchasePrice)}
                        color={ACCENT.emerald}
                        icon={<MdInventory2 className="h-5 w-5" />}
                      />
                    ) : null}
                    {ctx?.warehouseKpiShowSaleValue !== false ? (
                      <Kpi
                        title="Valeur au prix de vente"
                        value={formatCurrency(dashboard.valueAtSalePrice)}
                        color={ACCENT.blue}
                        icon={<MdBarChart className="h-5 w-5" />}
                      />
                    ) : null}
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
                    <div className="mt-2.5 h-[220px] sm:mt-3 sm:h-[250px]">
                      {dashboard.chartDayLabels.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-[13px] text-neutral-600 sm:text-sm">
                          Pas encore de mouvements sur la période
                        </p>
                      ) : (
                        <div className="grid h-full grid-cols-[auto_1fr] gap-2 rounded-xl border border-black/8 bg-fs-surface-low/40 px-2.5 py-2 sm:px-3 sm:py-2.5">
                          <div className="flex h-[170px] flex-col justify-between pb-5 text-right text-[10px] font-medium text-neutral-500 sm:h-[190px] sm:text-[11px]">
                            {[1, 0.75, 0.5, 0.25, 0].map((t) => (
                              <span key={t} className="tabular-nums">
                                {Math.round(maxY * t)}
                              </span>
                            ))}
                          </div>
                          <div className="relative h-[190px] sm:h-[210px]">
                            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-5">
                              {[0, 1, 2, 3, 4].map((idx) => (
                                <div key={idx} className="border-t border-dashed border-black/10" />
                              ))}
                            </div>
                            <div className="relative z-10 flex h-full items-end justify-around gap-1.5 border-b border-black/15 pb-5">
                              {dashboard.chartDayLabels.map((lab, i) => {
                                const inQ = dashboard.chartEntriesQty[i] ?? 0;
                                const outQ = dashboard.chartExitsQty[i] ?? 0;
                                const hIn = maxY > 0 ? (inQ / maxY) * 100 : 0;
                                const hOut = maxY > 0 ? (outQ / maxY) * 100 : 0;
                                return (
                                  <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                                    <div className="flex h-[140px] w-full items-end justify-center gap-1 sm:h-[158px]">
                                      <div
                                        className="w-[42%] max-w-[14px] rounded-t-[6px] bg-[#059669] shadow-[0_2px_10px_rgba(5,150,105,0.25)]"
                                        style={{ height: `${Math.max(hIn, 2)}%` }}
                                        title={`Entrées ${inQ}`}
                                      />
                                      <div
                                        className="w-[42%] max-w-[14px] rounded-t-[6px] bg-[#EA580C] shadow-[0_2px_10px_rgba(234,88,12,0.25)]"
                                        style={{ height: `${Math.max(hOut, 2)}%` }}
                                        title={`Sorties ${outQ}`}
                                      />
                                    </div>
                                    <span className="text-[10px] font-medium text-neutral-600">{lab}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </FsCard>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <FsCard padding="p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Santé stock</p>
                      <p className="mt-1 text-xl font-extrabold text-fs-text">{decisionPanel.healthPct}%</p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {decisionPanel.lowCount > 0
                          ? `${decisionPanel.lowCount} référence(s) sous seuil`
                          : "Aucune alerte de seuil"}
                      </p>
                    </FsCard>
                    <FsCard padding="p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Pression flux 30 j</p>
                      <p
                        className={cn(
                          "mt-1 text-xl font-extrabold",
                          decisionPanel.netFlow30 < 0 ? "text-red-600" : "text-emerald-700",
                        )}
                      >
                        {decisionPanel.netFlow30 > 0 ? "+" : ""}
                        {decisionPanel.netFlow30}
                      </p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {decisionPanel.netFlow30 < 0 ? "Sorties > entrées : risque rupture" : "Couverture stable"}
                      </p>
                    </FsCard>
                    <FsCard padding="p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Sorties 7 j</p>
                      <p className="mt-1 text-xl font-extrabold text-fs-text">{decisionPanel.dispatch7dCount}</p>
                      <p className="mt-1 text-xs text-neutral-600">{formatCurrency(decisionPanel.dispatchAmount7d)}</p>
                    </FsCard>
                  </div>

                  <FsCard padding="p-3.5 sm:p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-fs-text sm:text-sm">Crédit bons de sortie (Magasin)</p>
                      <button
                        type="button"
                        onClick={() => setTab(4)}
                        className="text-xs font-bold text-fs-accent"
                      >
                        Ouvrir Historique
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                        <p className="text-neutral-600">Restant à encaisser</p>
                        <p className="mt-1 text-sm font-extrabold text-orange-700">
                          {formatCurrency(decisionPanel.dispatchOutstandingTotal)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <p className="text-neutral-600">Déjà encaissé</p>
                        <p className="mt-1 text-sm font-extrabold text-emerald-700">
                          {formatCurrency(decisionPanel.dispatchPaidTotal)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                        <p className="text-neutral-600">Dossiers ouverts</p>
                        <p className="mt-1 text-sm font-extrabold text-blue-700">{decisionPanel.dispatchOpenCount}</p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-neutral-600">Reste 7 jours</p>
                        <p className="mt-1 text-sm font-extrabold text-amber-700">
                          {formatCurrency(decisionPanel.dispatchOpen7d)}
                        </p>
                      </div>
                    </div>
                  </FsCard>

                  <FsCard padding="p-3.5 sm:p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-fs-text sm:text-sm">Priorités de réapprovisionnement</p>
                      {decisionPanel.topLow.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setTab(1)}
                          className="text-xs font-bold text-fs-accent"
                        >
                          Voir stock dépôt
                        </button>
                      ) : null}
                    </div>
                    {decisionPanel.topLow.length === 0 ? (
                      <p className="text-xs text-neutral-600">Aucune priorité immédiate. Les seuils sont couverts.</p>
                    ) : (
                      <FsHorizontalScroll className="rounded-xl border border-black/8">
                        <table className="w-full min-w-[660px] text-left text-[12px] [&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap">
                          <thead>
                            <tr className="border-b border-black/10 bg-fs-surface-low/80 text-[10px] uppercase tracking-wide text-neutral-600">
                              <th className="px-2.5 py-2">Produit</th>
                              <th className="px-2.5 py-2 text-right">Qté</th>
                              <th className="px-2.5 py-2 text-right">Seuil</th>
                              <th className="px-2.5 py-2 text-right">Manquant</th>
                              <th className="px-2.5 py-2 text-right">Budget estimé</th>
                            </tr>
                          </thead>
                          <tbody>
                            {decisionPanel.topLow.map((x) => (
                              <tr key={x.line.productId} className="border-b border-black/6 last:border-b-0">
                                <td className="max-w-[240px] truncate px-2.5 py-2 font-semibold text-fs-text">{x.line.productName}</td>
                                <td className="px-2.5 py-2 text-right tabular-nums">{x.line.quantity}</td>
                                <td className="px-2.5 py-2 text-right tabular-nums">{x.threshold}</td>
                                <td className="px-2.5 py-2 text-right font-bold tabular-nums text-red-600">{x.missingQty}</td>
                                <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{formatCurrency(x.estimatedRefillCost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </FsHorizontalScroll>
                    )}
                  </FsCard>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FsCard padding="p-3.5 sm:p-4">
                      <p className="text-[13px] font-semibold text-fs-text sm:text-sm">Transferts à traiter</p>
                      <p className="mt-1 text-2xl font-extrabold text-fs-text">{decisionPanel.pendingTransfersCount}</p>
                      <p className="mt-1 text-xs text-neutral-600">Brouillons / en attente / approuvés / expédiés.</p>
                      <button
                        type="button"
                        onClick={() => setTab(3)}
                        className="mt-2 text-xs font-bold text-fs-accent"
                      >
                        Ouvrir Transfert
                      </button>
                    </FsCard>
                    <FsCard padding="p-3.5 sm:p-4">
                      <p className="text-[13px] font-semibold text-fs-text sm:text-sm">Stock dormant (30 j)</p>
                      {decisionPanel.dormantTop.length === 0 ? (
                        <p className="mt-2 text-xs text-neutral-600">Aucun article dormant significatif détecté.</p>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {decisionPanel.dormantTop.map((l) => (
                            <div key={l.productId} className="flex items-center justify-between gap-2 rounded-lg bg-fs-surface-container px-2.5 py-1.5">
                              <span className="truncate text-xs font-semibold text-fs-text">{l.productName}</span>
                              <span className="shrink-0 text-[11px] font-bold text-neutral-700">
                                {formatCurrency(l.quantity * l.salePrice)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </FsCard>
                  </div>
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
              search={movSearch}
              setSearch={setMovSearch}
              searching={movQ.isFetching || movSearch.trim() !== movSearchTerm}
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
              search={dispatchProductSearch}
              setSearch={setDispatchProductSearch}
              searchActive={dispatchSearchActive}
              searchPending={
                dispatchSearchActive &&
                (dispatchLinesQ.isLoading ||
                  dispatchProductSearch.trim() !== dispatchProductSearchDebounced.trim())
              }
              searchError={dispatchLinesQ.error}
              searchResults={dispatchLinesQ.data ?? []}
              onOpenInvoice={(invoiceId) => setDispatchDetailId(invoiceId)}
              onOpen={(r) => setDispatchDetailId(r.id)}
              onEdit={(r) => {
                setDispatchDialogInvoiceId(r.id);
                setDispatchOpen(true);
              }}
              onVoid={(r) => {
                if (!companyId) return;
                if (
                  !confirm(
                    `Annuler le bon « ${r.documentNumber} » ? Le stock au dépôt sera réintégré et l'opération sera tracée dans les mouvements.`,
                  )
                ) {
                  return;
                }
                setVoidingId(r.id);
                voidDispatchMut.mutate({ invoiceId: r.id });
              }}
              voidingId={voidingId}
              onPrint={async (r) => {
                try {
                  const d = await getWarehouseDispatchInvoiceDetails(r.id);
                  await handleDispatchInvoiceAction("print", {
                    id: d.id,
                    documentNumber: d.documentNumber,
                    createdAt: d.createdAt,
                    customerName: d.customerName,
                    customerPhone: d.customerPhone,
                    notes: d.notes,
                    lines: d.lines,
                  });
                } catch (e) {
                  toastMutationError("dispatch-details-for-print", e);
                }
              }}
              printingId={dispatchPdfBusy?.id ?? null}
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
          className="fixed inset-0 z-55 flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
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
                  setDispatchDialogInvoiceId(null);
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
                color="#B42318"
                icon={<MdPictureAsPdf className="h-6 w-6" />}
                title="Exporter produits (PDF)"
                subtitle="Miniature + nom, avec nom de l'entreprise"
                onClick={() => {
                  setActionMenuOpen(false);
                  void exportWarehouseProductsPdf();
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
        warehouseId={activeWarehouseId}
        onSuccess={refreshAll}
      />
      <WarehouseDispatchDialog
        open={dispatchOpen}
        onClose={() => {
          setDispatchOpen(false);
          setDispatchDialogInvoiceId(null);
        }}
        companyId={companyId}
        warehouseId={activeWarehouseId}
        warehouseQtyByProductId={warehouseQtyByProductId}
        editInvoiceId={dispatchDialogInvoiceId}
        onSuccess={refreshAll}
      />
      <WarehouseExitSaleDialog
        open={exitSaleOpen}
        onClose={() => setExitSaleOpen(false)}
        companyId={companyId}
        warehouseId={activeWarehouseId}
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
        warehouseId={activeWarehouseId}
        line={adjustLine}
        onSuccess={refreshAll}
      />
      <WarehouseThresholdDialog
        open={thresholdLine != null}
        onClose={() => setThresholdLine(null)}
        companyId={companyId}
        warehouseId={activeWarehouseId}
        line={thresholdLine}
        onSuccess={refreshAll}
      />

      {transferDetailId ? (
        <div className="fixed inset-0 z-56 flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4" role="dialog">
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

      {dispatchEditId ? (
        <div className="fixed inset-0 z-57 flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4" role="dialog">
          <div className="flex max-h-[min(90dvh,680px)] w-full flex-col rounded-t-2xl bg-fs-surface shadow-2xl sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
              <h2 className="text-base font-bold">Modifier bon de sortie</h2>
              <button
                type="button"
                onClick={() => setDispatchEditId(null)}
                className="p-2"
                aria-label="Fermer"
                disabled={updateDispatchMut.isPending}
              >
                <MdClose className="h-6 w-6" />
              </button>
            </div>
            {dispatchEditQ.isLoading ? (
              <div className="flex min-h-[180px] items-center justify-center">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
              </div>
            ) : null}
            {dispatchEditQ.isError ? (
              <div className="p-4">
                <FsQueryErrorPanel error={dispatchEditQ.error} onRetry={() => dispatchEditQ.refetch()} />
              </div>
            ) : null}
            {dispatchEditQ.data ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <p className="text-sm font-bold text-fs-text">{dispatchEditQ.data.documentNumber}</p>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold text-neutral-700">Client</label>
                  <select
                    className={fsInputClass("h-10")}
                    value={dispatchEditCustomerId}
                    onChange={(e) => setDispatchEditCustomerId(e.target.value)}
                    disabled={updateDispatchMut.isPending}
                  >
                    <option value="">Sans client</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <FsHorizontalScroll className="mt-4">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-black/8 bg-[#F5F5F5] text-[11px] font-bold uppercase tracking-wide text-neutral-700">
                        <th className="px-3 py-2">Produit</th>
                        <th className="w-[130px] px-3 py-2">Quantité</th>
                        <th className="w-[150px] px-3 py-2">P.U.</th>
                        <th className="w-[160px] px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatchEditLines.map((line) => (
                        <tr key={line.productId} className="border-b border-black/6">
                          <td className="px-3 py-2.5 font-medium">{line.productName}</td>
                          <td className="px-3 py-2.5">
                            <input
                              className={fsInputClass("h-9 text-sm")}
                              inputMode="numeric"
                              value={String(line.quantity)}
                              onChange={(e) => {
                                const q = Math.max(1, Math.floor(Number(e.target.value || 0)));
                                setDispatchEditLines((prev) =>
                                  prev.map((x) => (x.productId === line.productId ? { ...x, quantity: q } : x)),
                                );
                              }}
                              disabled={updateDispatchMut.isPending}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              className={fsInputClass("h-9 text-sm")}
                              inputMode="numeric"
                              value={String(Math.round(line.unitPrice))}
                              onChange={(e) => {
                                const pu = Math.max(0, Math.round(Number(e.target.value || 0)));
                                setDispatchEditLines((prev) =>
                                  prev.map((x) => (x.productId === line.productId ? { ...x, unitPrice: pu } : x)),
                                );
                              }}
                              disabled={updateDispatchMut.isPending}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#F97316]">
                            {formatCurrency(line.quantity * line.unitPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </FsHorizontalScroll>
                <p className="mt-4 text-right text-base font-extrabold text-fs-text">
                  Total {formatCurrency(dispatchEditLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0))}
                </p>
                <button
                  type="button"
                  disabled={updateDispatchMut.isPending || dispatchEditLines.length === 0}
                  onClick={() => {
                    void updateDispatchMut.mutate({
                      invoiceId: dispatchEditQ.data.id,
                      customerId: dispatchEditCustomerId.trim() || null,
                      notes: dispatchEditQ.data.notes,
                      lines: dispatchEditLines,
                    });
                  }}
                  className="fs-touch-target mt-4 w-full rounded-[10px] bg-[#F97316] py-3.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {updateDispatchMut.isPending ? "Mise à jour…" : "Enregistrer les modifications"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {dispatchDetailId ? (
        <div className="fixed inset-0 z-56 flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4" role="dialog">
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
                      {visibleDispatchNote(d.notes) ? (
                        <p className="mt-2 text-xs text-neutral-600">{visibleDispatchNote(d.notes)}</p>
                      ) : null}
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
                      <div className="mt-4 rounded-2xl bg-[#F5F5F5] px-3 py-3 sm:px-4 sm:py-3.5">
                        <p className="mb-3 text-[11px] font-bold tracking-[0.06em] text-neutral-700 sm:text-xs">
                          FACTURE A4
                        </p>
                        <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-3 sm:gap-3">
                          <DispatchInvoiceActionButton
                            icon={<MdPictureAsPdf className="h-5 w-5 shrink-0" aria-hidden />}
                            label="Voir le PDF"
                            loading={dispatchPdfBusy?.id === d.id && dispatchPdfBusy.mode === "view"}
                            disabled={dispatchPdfBusy != null}
                            onClick={() =>
                              void handleDispatchInvoiceAction("view", {
                                id: d.id,
                                documentNumber: d.documentNumber,
                                createdAt: d.createdAt,
                                customerName: d.customerName,
                                customerPhone: d.customerPhone,
                                notes: d.notes,
                                lines: d.lines,
                              })
                            }
                          />
                          <DispatchInvoiceActionButton
                            icon={<MdPrint className="h-5 w-5 shrink-0" aria-hidden />}
                            label="Réimprimer"
                            loading={dispatchPdfBusy?.id === d.id && dispatchPdfBusy.mode === "print"}
                            disabled={dispatchPdfBusy != null}
                            onClick={() =>
                              void handleDispatchInvoiceAction("print", {
                                id: d.id,
                                documentNumber: d.documentNumber,
                                createdAt: d.createdAt,
                                customerName: d.customerName,
                                customerPhone: d.customerPhone,
                                notes: d.notes,
                                lines: d.lines,
                              })
                            }
                          />
                          <DispatchInvoiceActionButton
                            icon={<MdDownload className="h-5 w-5 shrink-0" aria-hidden />}
                            label="Télécharger"
                            loading={dispatchPdfBusy?.id === d.id && dispatchPdfBusy.mode === "download"}
                            disabled={dispatchPdfBusy != null}
                            onClick={() =>
                              void handleDispatchInvoiceAction("download", {
                                id: d.id,
                                documentNumber: d.documentNumber,
                                createdAt: d.createdAt,
                                customerName: d.customerName,
                                customerPhone: d.customerPhone,
                                notes: d.notes,
                                lines: d.lines,
                              })
                            }
                          />
                        </div>
                      </div>
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
      {dispatchPreviewBlob ? (
        <InvoicePdfPreviewDialog
          blob={dispatchPreviewBlob}
          title="Facture / Bon de sortie dépôt"
          onClose={() => setDispatchPreviewBlob(null)}
        />
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
      className="min-h-[80px] border border-black/6 shadow-none sm:min-h-0 sm:rounded-2xl"
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
      className="mb-2 flex w-full items-start gap-3 rounded-2xl border border-black/6 p-3 text-left transition-colors active:bg-neutral-50"
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
          className={fsInputClass("w-full pl-10")}
          placeholder="Rechercher par nom ou SKU"
          value={stockQ}
          onChange={(e) => setStockQ(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="rounded-xl border border-black/8 bg-fs-surface-container px-3 py-2">
          <p className="text-xs font-semibold text-neutral-700">
            Produits: <span className="font-extrabold text-fs-text">{lines.length}</span>
            {filtered.length !== lines.length ? (
              <span className="ml-2 text-neutral-600">
                (affichés: <span className="font-bold text-fs-text">{filtered.length}</span>)
              </span>
            ) : null}
          </p>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun produit ne correspond au filtre.</p>
      ) : (
        <FsHorizontalScroll className="rounded-2xl border border-black/8 bg-fs-card">
          <table className="w-full min-w-[980px] border-collapse text-left text-[13px] [&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap">
            <thead>
              <tr className="border-b border-black/10 bg-fs-surface-low/80 text-[11px] uppercase tracking-wide text-neutral-700">
                <th className="px-3 py-2.5 font-bold">Produit</th>
                <th className="px-3 py-2.5 font-bold">SKU</th>
                <th className="px-3 py-2.5 text-right font-bold">Qté</th>
                <th className="px-3 py-2.5 text-right font-bold">Seuil</th>
                <th className="px-3 py-2.5 font-bold">Statut</th>
                <th className="px-3 py-2.5 text-right font-bold">Valeur PA</th>
                <th className="px-3 py-2.5 text-right font-bold">Valeur PV</th>
                <th className="px-3 py-2.5 text-center font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((l) => {
                const th = l.stockMinWarehouse > 0 ? l.stockMinWarehouse : l.stockMin;
                const low = l.quantity <= (l.stockMinWarehouse > 0 ? l.stockMinWarehouse : l.stockMin);
                const threshold = th < 0 ? 0 : th;
                const valueAtCost = l.quantity * (l.avgUnitCost ?? l.purchasePrice);
                const valueAtSale = l.quantity * l.salePrice;
                return (
                  <tr key={l.productId} className="border-b border-black/6 text-[13px] last:border-b-0 hover:bg-black/2">
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ProductListThumbnail imageUrl={l.imageUrl} className="h-9 w-9 shrink-0 rounded-lg" previewOnTap />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-fs-text">{l.productName}</p>
                          <p className="text-xs text-neutral-500">{l.unit}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-neutral-700">{l.sku || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{l.quantity}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{threshold}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                          low ? "bg-red-500/15 text-red-700" : "bg-emerald-500/15 text-emerald-700",
                        )}
                      >
                        {low ? <MdWarningAmber className="h-3.5 w-3.5" /> : <MdCheckCircle className="h-3.5 w-3.5" />}
                        {low ? "Alerte" : "OK"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatCurrency(valueAtCost)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-700">{formatCurrency(valueAtSale)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onAdjust(l)}
                          className={cn(
                            "inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl border transition-all duration-150",
                            "border-[#F97316]/35 bg-[#FFF7ED] text-[#C2410C] shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
                            "hover:-translate-y-px hover:bg-[#FFEDD5] hover:shadow-[0_4px_10px_rgba(249,115,22,0.2)] active:translate-y-0",
                            "dark:border-orange-400/40 dark:bg-orange-950/40 dark:text-orange-200",
                          )}
                          title="Ajuster le stock"
                          aria-label="Ajuster le stock"
                        >
                          <MdBalance className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onThreshold(l)}
                          className={cn(
                            "inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl border transition-all duration-150",
                            "border-[#0EA5E9]/35 bg-[#F0F9FF] text-[#0369A1] shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
                            "hover:-translate-y-px hover:bg-[#E0F2FE] hover:shadow-[0_4px_10px_rgba(14,165,233,0.22)] active:translate-y-0",
                            "dark:border-sky-400/40 dark:bg-sky-950/40 dark:text-sky-200",
                          )}
                          title="Seuil magasin"
                          aria-label="Modifier le seuil magasin"
                        >
                          <MdTune className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </FsHorizontalScroll>
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
        "min-h-[38px] rounded-xl border px-3 py-1.5 text-xs font-bold",
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
  search,
  setSearch,
  searching,
  companyId,
  voidingId,
  onVoid,
}: {
  movSlice: WarehouseMovement[];
  movSafePage: number;
  movTotalPages: number;
  setMovPage: (n: number | ((p: number) => number)) => void;
  movementsLen: number;
  search: string;
  setSearch: (v: string) => void;
  searching: boolean;
  companyId: string;
  voidingId: string | null;
  onVoid: (m: WarehouseMovement) => void;
}) {
  const hasSearch = search.trim().length > 0;
  const searchBar = (
    <div className="group relative">
      <MdSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400 transition-colors group-focus-within:text-fs-accent" />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un produit (toutes ses entrées/sorties du magasin)…"
        aria-label="Rechercher un produit dans les mouvements du magasin"
        className="h-11 w-full rounded-xl border border-black/10 bg-fs-card pl-11 pr-10 text-sm text-fs-text outline-none focus:border-fs-accent"
      />
      {search ? (
        <button
          type="button"
          onClick={() => setSearch("")}
          aria-label="Effacer la recherche"
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5"
        >
          <MdClose className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );

  // Aucun mouvement du tout (hors recherche) : conserver l'état vide d'origine.
  if (movementsLen === 0 && !hasSearch) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="pb-8 pt-12 text-center sm:pt-16">
          <MdSwapHoriz className="mx-auto h-12 w-12 text-neutral-300" />
          <p className="mt-4 font-semibold">Aucun mouvement</p>
          <p className="mt-2 text-sm text-neutral-600">
            Les entrées, sorties et ajustements apparaîtront ici.
          </p>
        </div>
      </div>
    );
  }

  if (movementsLen === 0) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="pb-8 pt-10 text-center">
          <MdSearch className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 font-semibold">
            {searching ? "Recherche…" : `Aucun mouvement pour « ${search.trim()} »`}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Essayez un autre nom de produit ou vérifiez l&apos;orthographe.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {searchBar}
      <FsHorizontalScroll className="rounded-2xl border border-black/6 bg-fs-card">
        <table className="w-full min-w-[980px] border-collapse text-left text-[13px] [&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap">
          <thead>
            <tr className="border-b border-black/10 bg-fs-surface-low/80 text-[11px] uppercase tracking-wide text-neutral-700">
              <th className="px-3 py-2.5 font-bold">Produit</th>
              <th className="px-3 py-2.5 font-bold">Date</th>
              <th className="px-3 py-2.5 font-bold">Type</th>
              <th className="px-3 py-2.5 text-right font-bold">Qté</th>
              <th className="px-3 py-2.5 font-bold">Conditionnement</th>
              <th className="px-3 py-2.5 text-right font-bold">PU</th>
              <th className="px-3 py-2.5 font-bold">Référence</th>
              <th className="px-3 py-2.5 text-center font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            {movSlice.map((m) => {
              const kind = m.movementKind === "entry";
              const kindColor = kind ? ACCENT.emerald : ACCENT.orange;
              const pack = WAREHOUSE_PACKAGING_LABELS[m.packagingType] ?? m.packagingType;
              const unitPriceLabel =
                m.unitCost != null
                  ? formatCurrency(m.unitCost)
                  : "—";
              const canVoid = m.referenceType === "warehouse_dispatch" && m.referenceId && companyId;

              return (
                <tr key={m.id} className="border-b border-black/6 text-[13px] last:border-b-0 hover:bg-black/2">
                  <td className="max-w-[240px] truncate px-3 py-2.5 font-semibold text-fs-text">{m.productName ?? "Produit"}</td>
                  <td className="px-3 py-2.5 text-neutral-700">{m.createdAt ? formatDt(m.createdAt) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ backgroundColor: `${kindColor}22`, color: kindColor }}
                    >
                      {kind ? <MdSouthWest className="h-3.5 w-3.5" /> : <MdNorthEast className="h-3.5 w-3.5" />}
                      {kind ? "Entrée" : "Sortie"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{m.quantity}</td>
                  <td className="px-3 py-2.5 text-neutral-700">
                    {pack}
                    {m.packsQuantity !== 1 ? ` ×${m.packsQuantity}` : ""}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-700">{unitPriceLabel}</td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-neutral-700" title={refLabel(m)}>
                    {refLabel(m)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {canVoid ? (
                      <button
                        type="button"
                        disabled={voidingId === m.referenceId}
                        onClick={() => onVoid(m)}
                        className="inline-flex min-h-[34px] items-center rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 disabled:opacity-50"
                      >
                        {voidingId === m.referenceId ? "…" : "Annuler"}
                      </button>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </FsHorizontalScroll>
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
      <FsHorizontalScroll className="rounded-2xl border border-black/6 bg-fs-card">
        <table className="w-full min-w-[940px] border-collapse text-left text-[13px] [&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap">
          <thead>
            <tr className="border-b border-black/10 bg-fs-surface-low/80 text-[11px] uppercase tracking-wide text-neutral-700">
              <th className="px-3 py-2.5 font-bold">N° Transfert</th>
              <th className="px-3 py-2.5 font-bold">Date</th>
              <th className="px-3 py-2.5 font-bold">Destination</th>
              <th className="px-3 py-2.5 font-bold">Statut</th>
              <th className="px-3 py-2.5 text-center font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const toName = storeName(t.toStoreId);
              const col = statusColor(t.status);
              return (
                <tr key={t.id} className="border-b border-black/6 text-[13px] last:border-b-0 hover:bg-black/2">
                  <td className="px-3 py-2.5 font-semibold text-fs-text">TR-{t.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-3 py-2.5 text-neutral-700">{formatDt(t.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 font-medium text-neutral-800">
                      <MdLocalShipping className="h-4 w-4 text-[#F97316]" />
                      {toName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ background: `${col}20`, color: col }}
                    >
                      {statusLabel(t.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpen(t)}
                        className="inline-flex min-h-[34px] items-center rounded-lg border border-[#F97316]/35 bg-[#FFF7ED] px-3 py-1 text-xs font-bold text-[#C2410C]"
                      >
                        Ouvrir
                      </button>
                      {canDeleteTransfer(t) ? (
                        <button
                          type="button"
                          onClick={() => onDelete(t)}
                          className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700"
                          aria-label="Supprimer"
                          title="Supprimer"
                        >
                          <MdDeleteOutline className="h-4.5 w-4.5" />
                        </button>
                      ) : (
                        <span className="inline-flex min-h-[34px] items-center px-1 text-xs text-neutral-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </FsHorizontalScroll>
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
  search,
  setSearch,
  searchActive,
  searchPending,
  searchError,
  searchResults,
  onOpenInvoice,
  onOpen,
  onEdit,
  onVoid,
  voidingId,
  onPrint,
  printingId,
  onRetry,
}: {
  rows: WarehouseDispatchInvoiceSummary[];
  allRows: WarehouseDispatchInvoiceSummary[];
  page: number;
  totalPages: number;
  setPage: (n: number | ((p: number) => number)) => void;
  loading: boolean;
  error: unknown;
  search: string;
  setSearch: (v: string) => void;
  searchActive: boolean;
  searchPending: boolean;
  searchError: unknown;
  searchResults: WarehouseDispatchLineHit[];
  onOpenInvoice: (invoiceId: string) => void;
  onOpen: (r: WarehouseDispatchInvoiceSummary) => void;
  onEdit: (r: WarehouseDispatchInvoiceSummary) => void;
  onVoid: (r: WarehouseDispatchInvoiceSummary) => void;
  voidingId: string | null;
  onPrint: (r: WarehouseDispatchInvoiceSummary) => void | Promise<void>;
  printingId: string | null;
  onRetry: () => void;
}) {
  const searchBar = (
    <div className="space-y-1.5">
      <div className="group relative">
        <MdSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400 transition-colors group-focus-within:text-fs-accent" />
        <input
          type="search"
          inputMode="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un produit…"
          aria-label="Rechercher un produit dans l'historique des sorties"
          className={fsInputClass(
            "h-12 rounded-2xl border-black/[0.08] pl-11 pr-11 shadow-sm sm:h-12 [&::-webkit-search-cancel-button]:hidden",
          )}
        />
        {searchPending ? (
          <span
            className="absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
            aria-hidden
          />
        ) : search.length > 0 ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-black/5 hover:text-neutral-700"
            aria-label="Effacer la recherche"
          >
            <MdClose className="h-4.5 w-4.5" />
          </button>
        ) : null}
      </div>
      {!searchActive ? (
        <p className="px-1 text-[11px] leading-snug text-neutral-500">
          Saisissez un nom (ou SKU) pour voir toutes les sorties de ce produit, avec le détail.
        </p>
      ) : null}
    </div>
  );

  if (searchActive) {
    return (
      <div className="space-y-3 pb-6">
        {searchBar}
        <DispatchLinesSearchResults
          term={search.trim()}
          pending={searchPending}
          error={searchError}
          results={searchResults}
          onOpenInvoice={onOpenInvoice}
        />
      </div>
    );
  }

  if (loading && allRows.length === 0) {
    return (
      <div className="space-y-3 pb-6">
        {searchBar}
        <div className="flex justify-center py-20">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 pb-6">
        {searchBar}
        <div className="py-8 text-center">
          <p className="text-sm text-red-600">Erreur de chargement</p>
          <button type="button" onClick={onRetry} className="mt-2 text-sm font-semibold text-fs-accent">
            Réessayer
          </button>
        </div>
      </div>
    );
  }
  if (allRows.length === 0) {
    return (
      <div className="space-y-3 pb-6">
        {searchBar}
        <p className="py-16 text-center text-sm text-neutral-600">Aucun bon de sortie enregistré.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-6">
      {searchBar}
      <FsHorizontalScroll className="rounded-xl border border-black/6 bg-[color-mix(in_srgb,var(--fs-surface-container-low)_100%,transparent)]">
        <table className="w-full min-w-[980px] border-collapse text-left [&_thead_th]:whitespace-nowrap">
          <thead>
            <tr className="border-b border-black/8 bg-[#F5F5F5] text-[11px] font-bold uppercase tracking-wide text-neutral-700">
              <th className="px-3 py-2">N° Bon</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2 text-right">Somme</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Déjà encaissé</th>
              <th className="px-3 py-2 text-right">Reste</th>
              <th className="px-3 py-2 text-center">Action</th>
              <th className="px-3 py-2 text-center">Annuler</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = Math.max(0, Math.round(Number(r.totalAmount ?? 0)));
              const paid = Math.min(total, Math.max(0, parseDispatchPaymentInfo(r.notes).paidAmount));
              const remaining = Math.max(0, total - paid);
              return (
                <tr key={r.id} className="border-b border-black/6 text-sm last:border-b-0">
                  <td className="px-3 py-2.5 font-bold text-fs-text">{r.documentNumber}</td>
                  <td className="px-3 py-2.5 text-neutral-700">{formatDt(r.createdAt)}</td>
                  <td className="px-3 py-2.5 text-neutral-700">{r.customerName ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatCurrency(total)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-700">{formatCurrency(paid)}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#F97316]">{formatCurrency(remaining)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(r)}
                        className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border border-[#2563EB]/35 bg-[#EFF6FF] text-[#1D4ED8]"
                        aria-label="Modifier"
                        title="Modifier"
                      >
                        <MdEdit className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpen(r)}
                        className="inline-flex min-h-[32px] items-center rounded-lg border border-[#F97316]/30 bg-white px-3 py-1 text-xs font-bold text-[#F97316]"
                      >
                        Voir
                      </button>
                      <button
                        type="button"
                        disabled={printingId === r.id}
                        onClick={() => void onPrint(r)}
                        className="inline-flex min-h-[32px] items-center rounded-lg bg-[#F97316] px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {printingId === r.id ? "Impression…" : "Imprimer direct"}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        disabled={voidingId === r.id}
                        onClick={() => onVoid(r)}
                        className="inline-flex min-h-[32px] items-center rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 disabled:opacity-50"
                      >
                        {voidingId === r.id ? "…" : "Annuler"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </FsHorizontalScroll>
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 py-2">
          <span className="w-full text-center text-xs text-neutral-600">
            {allRows.length === 0
              ? "0"
              : `${page * 20 + 1}–${Math.min((page + 1) * 20, allRows.length)} sur ${allRows.length}`}
          </span>
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

function DispatchLinesSearchResults({
  term,
  pending,
  error,
  results,
  onOpenInvoice,
}: {
  term: string;
  pending: boolean;
  error: unknown;
  results: WarehouseDispatchLineHit[];
  onOpenInvoice: (invoiceId: string) => void;
}) {
  if (pending) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="py-10 text-center text-sm text-red-600">
        Erreur lors de la recherche des sorties.
      </p>
    );
  }
  if (results.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-600">
        Aucune sortie trouvée pour « {term} ».
      </p>
    );
  }

  const totalQty = results.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = results.reduce((s, r) => s + r.lineTotal, 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-neutral-600">
        <span>
          <strong className="font-bold text-fs-text">{results.length}</strong> sortie
          {results.length > 1 ? "s" : ""}
        </span>
        <span>
          Quantité totale :{" "}
          <strong className="font-bold tabular-nums text-fs-text">{totalQty}</strong>
        </span>
        <span>
          Montant total :{" "}
          <strong className="font-bold tabular-nums text-[#F97316]">{formatCurrency(totalAmount)}</strong>
        </span>
      </div>
      <FsHorizontalScroll className="rounded-xl border border-black/6 bg-[color-mix(in_srgb,var(--fs-surface-container-low)_100%,transparent)]">
        <table className="w-full min-w-[860px] border-collapse text-left [&_thead_th]:whitespace-nowrap">
          <thead>
            <tr className="border-b border-black/8 bg-[#F5F5F5] text-[11px] font-bold uppercase tracking-wide text-neutral-700">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">N° Bon</th>
              <th className="px-3 py-2">Client</th>
              <th className="min-w-[240px] px-3 py-2">Produit</th>
              <th className="px-3 py-2 text-right">Qté</th>
              <th className="px-3 py-2 text-right">Prix U.</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-center">Bon</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr
                key={`${r.invoiceId}-${r.productId}-${i}`}
                className="border-b border-black/6 text-sm last:border-b-0"
              >
                <td className="px-3 py-2.5 whitespace-nowrap text-neutral-700">{formatDt(r.createdAt)}</td>
                <td className="px-3 py-2.5 font-bold text-fs-text">{r.documentNumber}</td>
                <td className="px-3 py-2.5 text-neutral-700">{r.customerName ?? "—"}</td>
                <td className="min-w-[240px] px-3 py-2.5 text-fs-text">
                  <span className="font-semibold leading-snug">
                    {r.productName}
                    {r.productSku ? (
                      <span className="ml-1 font-normal text-xs text-neutral-500">({r.productSku})</span>
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                  {r.quantity}
                  <span className="ml-1 text-xs font-normal text-neutral-500">{r.productUnit}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-neutral-700">{formatCurrency(r.unitPrice)}</td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#F97316]">{formatCurrency(r.lineTotal)}</td>
                <td className="px-3 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => onOpenInvoice(r.invoiceId)}
                    className="inline-flex min-h-[32px] items-center rounded-lg border border-[#F97316]/30 bg-white px-3 py-1 text-xs font-bold text-[#F97316]"
                  >
                    Voir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </FsHorizontalScroll>
    </div>
  );
}

function DispatchInvoiceActionButton({
  icon,
  label,
  loading,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "touch-manipulation inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-2 rounded-2xl bg-[#F97316] px-4 text-[15px] font-bold text-white shadow-sm transition-colors hover:bg-[#ea580c] disabled:opacity-50 sm:min-h-11 sm:rounded-xl sm:px-3 sm:text-sm sm:font-semibold",
      )}
    >
      {loading ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        icon
      )}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
