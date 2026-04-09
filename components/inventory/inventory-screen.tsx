"use client";

import { AdjustStockDialog } from "@/components/inventory/adjust-stock-dialog";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { StockRangeIndicator } from "@/components/products/stock-range-indicator";
import { FsPullToRefresh } from "@/components/ui/fs-pull-to-refresh";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { P } from "@/lib/constants/permissions";
import {
  adjustStockAtomic,
  fetchInventoryScreenData,
  listStockMovements,
  setDefaultStockAlertThreshold,
} from "@/lib/features/inventory/api";
import { inventoryRowsToCsv } from "@/lib/features/inventory/csv";
import type { InventoryRow, StockMovementRow } from "@/lib/features/inventory/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import type { ProductCategory } from "@/lib/features/products/types";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { downloadCsv } from "@/lib/utils/csv";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MdCancel,
  MdChevronLeft,
  MdChevronRight,
  MdDownload,
  MdEdit,
  MdHistory,
  MdInventory2,
  MdLockOutline,
  MdSearch,
  MdSettings,
  MdStorefront,
  MdTrendingUp,
  MdWarningAmber,
} from "react-icons/md";

const INVENTORY_PAGE_SIZE = 20;
const MOVEMENTS_PAGE_SIZE = 20;

type StockFilter = "all" | "low" | "out";

/** Filtre statut aligné Flutter `_filteredItems`. */
function matchesStockFilter(r: InventoryRow, status: StockFilter): boolean {
  if (status === "all") return true;
  if (status === "out") return r.availableQuantity <= 0;
  return r.alertThreshold > 0 && r.availableQuantity <= r.alertThreshold;
}

function MovementTypeLabel(t: string): string {
  switch (t) {
    case "purchase_in":
      return "Entrée achat";
    case "sale_out":
      return "Sortie vente";
    case "adjustment":
      return "Ajustement";
    case "transfer_out":
      return "Transfert sortie";
    case "transfer_in":
      return "Transfert entrée";
    case "return_in":
      return "Retour entrée";
    case "return_out":
      return "Retour sortie";
    case "loss":
      return "Perte";
    case "inventory_correction":
      return "Correction inventaire";
    default:
      return t;
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  colorClass,
  iconBgClass,
  accentLeft,
  accentBorderClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  colorClass: string;
  iconBgClass: string;
  accentLeft: boolean;
  accentBorderClass: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[72px] items-center gap-2.5 rounded-[14px] border border-black/[0.08] bg-fs-card px-3.5 py-3 shadow-sm",
        accentLeft && "border-l-4",
        accentLeft && accentBorderClass,
      )}
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]", iconBgClass)}>
        <Icon className={cn("h-5 w-5", colorClass)} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-tight text-neutral-600">{label}</p>
        <p className="mt-0.5 truncate text-base font-bold text-fs-text">{value}</p>
      </div>
    </div>
  );
}

/** Pagination alignée `TransfersPage` / Flutter `_buildInventoryPagination`. */
function InventoryPagination({
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  narrow,
}: {
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (p: number) => void;
  narrow: boolean;
}) {
  const pageCount = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const safePage = pageCount === 0 ? 0 : Math.min(Math.max(0, currentPage), pageCount - 1);
  const start = totalCount === 0 ? 0 : safePage * pageSize + 1;
  const end = Math.min((safePage + 1) * pageSize, totalCount);

  if (pageCount <= 1) return null;

  return (
    <FsCard padding="p-3 sm:p-4" className="mt-4">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {!narrow ? (
          <span className="mr-2 text-xs text-neutral-600 sm:mr-4">
            {start} – {end} sur {totalCount}
          </span>
        ) : null}
        <button
          type="button"
          disabled={safePage <= 0}
          onClick={() => onPageChange(safePage - 1)}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40",
            safePage > 0 ? "bg-fs-accent" : "bg-neutral-200 text-neutral-500",
          )}
          aria-label="Page précédente"
        >
          <MdChevronLeft className="h-7 w-7" aria-hidden />
        </button>
        <span className="text-sm font-semibold text-fs-text">
          Page {safePage + 1} / {pageCount}
        </span>
        <button
          type="button"
          disabled={safePage >= pageCount - 1}
          onClick={() => onPageChange(safePage + 1)}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40",
            safePage < pageCount - 1 ? "bg-fs-accent" : "bg-neutral-200 text-neutral-500",
          )}
          aria-label="Page suivante"
        >
          <MdChevronRight className="h-7 w-7" aria-hidden />
        </button>
        {narrow ? (
          <span className="w-full text-center text-xs text-neutral-600">
            {start} – {end} / {totalCount}
          </span>
        ) : null}
      </div>
    </FsCard>
  );
}

export function InventoryScreen() {
  const qc = useQueryClient();
  const {
    data: ctx,
    isLoading: permLoading,
    isError: ctxIsError,
    error: ctxError,
    refetch: refetchCtx,
    hasPermission,
  } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const storeId = ctx?.storeId ?? null;
  const storeName = ctx?.stores?.find((s) => s.id === storeId)?.name ?? null;

  const isWide = useMediaQuery("(min-width: 900px)");
  const narrowHeader = useMediaQuery("(max-width: 559px)");
  const narrowFilters = useMediaQuery("(max-width: 559px)");
  const narrowPagination = useMediaQuery("(max-width: 499px)");

  const canAccessStock =
    hasPermission(P.stockView) || hasPermission(P.stockAdjust) || hasPermission(P.stockTransfer);
  const canAdjust = hasPermission(P.stockAdjust);

  const [tab, setTab] = useState<"stock" | "moves">("stock");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<StockFilter>("all");
  const [invPage, setInvPage] = useState(0);
  const [movPage, setMovPage] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsJustOpened, setSettingsJustOpened] = useState(false);
  const [thresholdInput, setThresholdInput] = useState("5");

  const dataQ = useQuery({
    queryKey: queryKeys.productInventory(storeId),
    queryFn: () => fetchInventoryScreenData({ companyId, storeId }),
    enabled: Boolean(companyId) && Boolean(storeId) && canAccessStock,
    staleTime: 20_000,
  });

  const defaultThreshold = dataQ.data?.defaultThreshold ?? 5;

  useEffect(() => {
    if (showSettings && settingsJustOpened && dataQ.data) {
      setThresholdInput(String(dataQ.data.defaultThreshold));
      setSettingsJustOpened(false);
    }
  }, [showSettings, settingsJustOpened, dataQ.data]);

  const movementsQ = useQuery({
    queryKey: ["stock-movements", storeId] as const,
    queryFn: () =>
      listStockMovements({
        storeId,
        limit: 10_000,
        offset: 0,
      }),
    enabled: tab === "moves" && Boolean(storeId) && canAccessStock,
    staleTime: 10_000,
  });

  const thresholdMut = useMutation({
    mutationFn: (value: number) => setDefaultStockAlertThreshold({ companyId, value }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.productInventory(storeId) });
      toast.success("Seuil d'alerte enregistré");
      setShowSettings(false);
    },
    onError: (e) => toastMutationError("inventory", e),
  });

  const rows = dataQ.data?.rows ?? [];
  const categories: ProductCategory[] = dataQ.data?.categories ?? [];

  /** Après recherche + catégorie uniquement (KPI Flutter lignes 578–580). */
  const itemsSearchCategory = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (!categoryId) return true;
        return r.categoryId === categoryId;
      })
      .filter((r) => {
        if (!needle) return true;
        return (
          r.name.toLowerCase().includes(needle) ||
          (r.sku ?? "").toLowerCase().includes(needle) ||
          (r.barcode ?? "").includes(needle)
        );
      });
  }, [rows, q, categoryId]);

  const kpiStats = useMemo(() => {
    const lowStockCount = itemsSearchCategory.filter(
      (r) => r.alertThreshold > 0 && r.availableQuantity <= r.alertThreshold,
    ).length;
    const outOfStockCount = itemsSearchCategory.filter((r) => r.availableQuantity <= 0).length;
    const stockValueSale = itemsSearchCategory.reduce((s, r) => s + r.salePrice * r.availableQuantity, 0);
    return {
      totalProducts: itemsSearchCategory.length,
      lowStockCount,
      outOfStockCount,
      stockValueSale,
    };
  }, [itemsSearchCategory]);

  const filteredForTable = useMemo(
    () => itemsSearchCategory.filter((r) => matchesStockFilter(r, status)),
    [itemsSearchCategory, status],
  );

  const invPageCount =
    filteredForTable.length === 0 ? 0 : Math.ceil(filteredForTable.length / INVENTORY_PAGE_SIZE);
  const invSafePage =
    invPageCount === 0 ? 0 : Math.min(Math.max(0, invPage), invPageCount - 1);
  const pagedStock = filteredForTable.slice(
    invSafePage * INVENTORY_PAGE_SIZE,
    (invSafePage + 1) * INVENTORY_PAGE_SIZE,
  );

  useEffect(() => {
    setInvPage(0);
  }, [q, categoryId, status]);

  useEffect(() => {
    if (invPageCount > 0 && invPage >= invPageCount) setInvPage(invPageCount - 1);
  }, [invPage, invPageCount]);

  const movementRowsAll = movementsQ.data?.rows ?? [];
  const movTotal = movementRowsAll.length;
  const movPageCount = movTotal === 0 ? 0 : Math.ceil(movTotal / MOVEMENTS_PAGE_SIZE);
  const movSafePage = movPageCount === 0 ? 0 : Math.min(Math.max(0, movPage), movPageCount - 1);
  const pagedMovements = movementRowsAll.slice(
    movSafePage * MOVEMENTS_PAGE_SIZE,
    (movSafePage + 1) * MOVEMENTS_PAGE_SIZE,
  );

  useEffect(() => {
    setMovPage(0);
  }, [tab, storeId]);

  useEffect(() => {
    if (movPageCount > 0 && movPage >= movPageCount) setMovPage(movPageCount - 1);
  }, [movPage, movPageCount]);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<InventoryRow | null>(null);

  const adjustMut = useMutation({
    mutationFn: async (payload: { productId: string; delta: number; reason: string }) => {
      if (!storeId) throw new Error("Aucune boutique sélectionnée.");
      await adjustStockAtomic({
        storeId,
        productId: payload.productId,
        delta: payload.delta,
        reason: payload.reason,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.productInventory(storeId) });
      await qc.invalidateQueries({ queryKey: ["stock-movements", storeId] });
      toast.success("Stock ajusté");
      setAdjustOpen(false);
      setAdjustTarget(null);
    },
    onError: (e) => toastMutationError("inventory", e),
  });

  const refreshAll = useCallback(async () => {
    await dataQ.refetch();
    if (tab === "moves") await movementsQ.refetch();
  }, [dataQ.refetch, movementsQ.refetch, tab]);

  if (permLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
        </div>
      </FsPage>
    );
  }

  if (ctxIsError) {
    return (
      <FsPage className={cn(isWide && "px-8 pt-7")}>
        <h1 className="text-[22px] font-bold text-fs-text min-[900px]:text-2xl">Stock</h1>
        <FsCard className="mt-4" padding="p-4">
          <FsQueryErrorPanel
            error={ctxError ?? new Error("Impossible de charger le profil ou l’entreprise.")}
            onRetry={() => void refetchCtx()}
          />
        </FsCard>
      </FsPage>
    );
  }

  if (ctx == null) {
    return (
      <FsPage className={cn(isWide && "px-8 pt-7")}>
        <h1 className="text-[22px] font-bold text-fs-text min-[900px]:text-2xl">Stock</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Session indisponible. Reconnectez-vous ou réessayez.
        </p>
        <FsCard className="mt-6" padding="p-6">
          <button
            type="button"
            onClick={() => void refetchCtx()}
            className="rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white"
          >
            Réessayer
          </button>
        </FsCard>
      </FsPage>
    );
  }

  if (ctx && !canAccessStock) {
    return (
      <FsPage className={cn(isWide && "px-8 pt-7")}>
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 py-12 text-center">
          <MdLockOutline className="h-16 w-16 text-red-600" aria-hidden />
          <p className="mt-4 text-sm font-medium text-neutral-700">Vous n&apos;avez pas accès à cette page.</p>
        </div>
      </FsPage>
    );
  }

  if (companyId && !storeId) {
    return (
      <FsPage className={cn(isWide && "px-8 pt-7")}>
        <h1 className="text-[22px] font-bold text-fs-text min-[900px]:text-2xl">Stock</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Sélectionnez une boutique dans le menu pour voir le stock et les mouvements.
        </p>
        <FsCard className="mt-6" padding="p-8">
          <div className="flex flex-col items-center text-center">
            <MdStorefront className="h-16 w-16 text-fs-accent/80" aria-hidden />
            <p className="mt-4 text-base font-semibold text-neutral-700">Choisissez une boutique</p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const loadingInventory = dataQ.isLoading || dataQ.isFetching;
  const loadingMovements = movementsQ.isLoading;

  return (
    <FsPage className={cn(isWide && "px-8 pt-7")}>
      <FsPullToRefresh onRefresh={refreshAll}>
        <div
          className={cn(
            "flex flex-col gap-3 sm:gap-4",
            !narrowHeader && "min-[560px]:flex-row min-[560px]:items-start min-[560px]:justify-between",
          )}
        >
          <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
            <MdInventory2 className="mt-0.5 h-[22px] w-[22px] shrink-0 text-fs-accent sm:h-7 sm:w-7" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold leading-tight tracking-tight text-fs-text min-[900px]:text-2xl">
                Stock
              </h1>
              <p className="mt-0.5 text-sm text-neutral-600 sm:mt-1">
                {storeName != null ? `Stock — ${storeName}` : "Stock"}
              </p>
            </div>
          </div>
          <div
            className={cn(
              "flex flex-wrap gap-2",
              narrowHeader ? "w-full" : "shrink-0 justify-end",
            )}
          >
            <button
              type="button"
              onClick={() => {
                const next = !showSettings;
                setShowSettings(next);
                if (next) {
                  setSettingsJustOpened(true);
                  if (dataQ.data) setThresholdInput(String(dataQ.data.defaultThreshold));
                }
              }}
              className="inline-flex items-center gap-2 rounded-[10px] bg-fs-surface-container px-3.5 py-2.5 text-sm font-semibold text-fs-text shadow-sm ring-1 ring-black/[0.06]"
            >
              <MdSettings className="h-5 w-5" aria-hidden />
              Paramètres
            </button>
            <button
              type="button"
              onClick={() => {
                if (filteredForTable.length === 0) return;
                const csv = inventoryRowsToCsv(filteredForTable);
                downloadCsv(`stock-${new Date().toISOString().slice(0, 10)}.csv`, csv);
              }}
              disabled={filteredForTable.length === 0}
              className="inline-flex items-center gap-2 rounded-[10px] bg-fs-surface-container px-3.5 py-2.5 text-sm font-semibold text-fs-text shadow-sm ring-1 ring-black/[0.06] disabled:opacity-40"
            >
              <MdDownload className="h-5 w-5" aria-hidden />
              Enregistrer CSV
            </button>
          </div>
        </div>

        {showSettings ? (
          <FsCard padding="p-5" className="mt-4">
            <h2 className="text-sm font-semibold text-fs-text">Seuil d&apos;alerte par défaut</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Utilisé pour les produits sans seuil défini. En dessous, le stock est en alerte.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className={fsInputClass("max-w-[200px]")}
                inputMode="numeric"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                placeholder="5"
              />
              <button
                type="button"
                disabled={thresholdMut.isPending}
                onClick={() => {
                  const n = parseInt(thresholdInput, 10);
                  if (Number.isNaN(n) || n < 0) {
                    toast.info("Saisissez un nombre ≥ 0");
                    return;
                  }
                  thresholdMut.mutate(n);
                }}
                className="rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </FsCard>
        ) : null}

        <div
          className={cn(
            "mt-4 grid gap-3",
            "grid-cols-1 min-[500px]:grid-cols-2 min-[900px]:grid-cols-4",
          )}
        >
          <StatCard
            icon={MdInventory2}
            label="Produits en stock"
            value={String(kpiStats.totalProducts)}
            colorClass="text-fs-accent"
            iconBgClass="bg-fs-accent/12"
            accentLeft
            accentBorderClass="border-l-fs-accent"
          />
          <StatCard
            icon={MdTrendingUp}
            label="Valeur totale"
            value={formatCurrency(kpiStats.stockValueSale)}
            colorClass="text-emerald-700"
            iconBgClass="bg-emerald-500/12"
            accentLeft={false}
            accentBorderClass=""
          />
          <StatCard
            icon={MdWarningAmber}
            label="Sous le minimum"
            value={String(kpiStats.lowStockCount)}
            colorClass="text-amber-700"
            iconBgClass="bg-amber-500/12"
            accentLeft={kpiStats.lowStockCount > 0}
            accentBorderClass="border-l-amber-600"
          />
          <StatCard
            icon={MdCancel}
            label="Rupture de stock"
            value={String(kpiStats.outOfStockCount)}
            colorClass="text-red-600"
            iconBgClass="bg-red-500/12"
            accentLeft={kpiStats.outOfStockCount > 0}
            accentBorderClass="border-l-red-600"
          />
        </div>

        <FsCard padding="p-0" className="mt-4 overflow-hidden">
          <div className="border-b border-black/[0.06] p-4 sm:p-5">
            {narrowFilters ? (
              <>
                <div className="relative">
                  <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
                  <input
                    className={fsInputClass("pl-10")}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Rechercher produit, SKU..."
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <select
                    className={fsInputClass()}
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    aria-label="Catégorie"
                  >
                    <option value="">Toutes</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className={fsInputClass()}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as StockFilter)}
                    aria-label="Statut"
                  >
                    <option value="all">Tous</option>
                    <option value="low">Sous minimum</option>
                    <option value="out">Rupture</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-start gap-3">
                <div className="relative min-w-0 flex-1 basis-[min(100%,280px)]">
                  <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
                  <input
                    className={fsInputClass("pl-10")}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Rechercher produit, SKU, code-barres..."
                  />
                </div>
                <select
                  className={cn(fsInputClass(), "w-[180px] shrink-0")}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  aria-label="Catégorie"
                >
                  <option value="">Toutes</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className={cn(fsInputClass(), "w-[160px] shrink-0")}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StockFilter)}
                  aria-label="Statut"
                >
                  <option value="all">Tous</option>
                  <option value="low">Sous minimum</option>
                  <option value="out">Rupture</option>
                </select>
              </div>
            )}

            <div className="mt-4 inline-flex rounded-xl border border-black/8 bg-fs-surface-container p-1">
              <button
                type="button"
                onClick={() => setTab("stock")}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-semibold",
                  tab === "stock" ? "bg-fs-card text-fs-text shadow-sm" : "text-neutral-600",
                )}
              >
                Stock
              </button>
              <button
                type="button"
                onClick={() => setTab("moves")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold",
                  tab === "moves" ? "bg-fs-card text-fs-text shadow-sm" : "text-neutral-600",
                )}
              >
                <MdHistory className="h-4 w-4 shrink-0" aria-hidden />
                <span className="hidden min-[400px]:inline">Historique mouvements</span>
                <span className="min-[400px]:hidden">Mouvements</span>
              </button>
            </div>

            <p className="mt-3 text-xs text-neutral-600 sm:text-sm">
              Inventaire physique : appuyez sur l&apos;icône d&apos;un produit pour ajuster le stock (variation ou
              quantité comptée).
            </p>
          </div>

          {tab === "stock" ? (
            <>
              {dataQ.isError ? (
                <div className="p-4">
                  <FsQueryErrorPanel error={dataQ.error} onRetry={() => dataQ.refetch()} />
                </div>
              ) : loadingInventory && rows.length === 0 ? (
                <div className="flex justify-center py-12">
                  <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
                </div>
              ) : filteredForTable.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-neutral-600 sm:px-5">
                  Aucun produit correspondant. Créez des produits ou ajustez les filtres.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06] bg-fs-surface-container/80">
                          <th className="px-4 py-3 font-semibold text-fs-text">Produit</th>
                          <th className="px-3 py-3 font-semibold text-fs-text">SKU</th>
                          <th className="px-3 py-3 text-right font-semibold tabular-nums text-fs-text">Qté</th>
                          <th className="px-3 py-3 text-right font-semibold tabular-nums text-fs-text">Réservé</th>
                          <th className="px-3 py-3 text-right font-semibold tabular-nums text-fs-text">Min</th>
                          <th className="px-3 py-3 font-semibold text-fs-text">Unité</th>
                          <th className="px-3 py-3 font-semibold text-fs-text">Niveau</th>
                          <th className="px-4 py-3 font-semibold text-fs-text">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedStock.map((r) => (
                            <tr key={r.productId} className="border-b border-black/[0.04]">
                              <td className="max-w-[240px] px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <ProductListThumbnail
                                    imageUrl={r.imageUrl}
                                    className="h-10 w-10 rounded-lg"
                                  />
                                  <span className="line-clamp-2 font-medium text-fs-text">{r.name}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-neutral-700">{r.sku ?? "—"}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium">{r.availableQuantity}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                                {r.reservedQuantity}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{r.alertThreshold}</td>
                              <td className="px-3 py-2 text-neutral-700">{r.unit}</td>
                              <td className="px-3 py-2">
                                <StockRangeIndicator
                                  quantity={r.availableQuantity}
                                  alertThreshold={r.alertThreshold > 0 ? r.alertThreshold : defaultThreshold}
                                />
                              </td>
                              <td className="px-4 py-2">
                                {canAdjust ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAdjustTarget(r);
                                      setAdjustOpen(true);
                                    }}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fs-accent hover:bg-fs-accent/10"
                                    aria-label="Ajuster"
                                  >
                                    <MdEdit className="h-5 w-5" aria-hidden />
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <InventoryPagination
                    totalCount={filteredForTable.length}
                    pageSize={INVENTORY_PAGE_SIZE}
                    currentPage={invSafePage}
                    onPageChange={setInvPage}
                    narrow={narrowPagination}
                  />
                </>
              )}
            </>
          ) : (
            <>
              {movementsQ.isError ? (
                <div className="p-4">
                  <FsQueryErrorPanel
                    error={movementsQ.error}
                    onRetry={() => movementsQ.refetch()}
                  />
                </div>
              ) : loadingMovements ? (
                <div className="flex justify-center py-12">
                  <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
                </div>
              ) : movementRowsAll.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-neutral-600">Aucun mouvement récent</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06] bg-fs-surface-container/80">
                          <th className="px-4 py-3 font-semibold text-fs-text">Date</th>
                          <th className="px-3 py-3 font-semibold text-fs-text">Produit</th>
                          <th className="px-3 py-3 font-semibold text-fs-text">Type</th>
                          <th className="px-3 py-3 text-right font-semibold text-fs-text">Quantité</th>
                          <th className="px-4 py-3 font-semibold text-fs-text">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedMovements.map((m) => (
                          <MovementTableRow key={m.id} row={m} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <InventoryPagination
                    totalCount={movTotal}
                    pageSize={MOVEMENTS_PAGE_SIZE}
                    currentPage={movSafePage}
                    onPageChange={setMovPage}
                    narrow={narrowPagination}
                  />
                </>
              )}
            </>
          )}
        </FsCard>
      </FsPullToRefresh>

      <AdjustStockDialog
        open={adjustOpen}
        onClose={() => {
          setAdjustOpen(false);
          setAdjustTarget(null);
        }}
        productName={adjustTarget?.name ?? ""}
        unit={adjustTarget?.unit ?? "pce"}
        currentQty={adjustTarget?.availableQuantity ?? 0}
        onConfirm={async ({ delta, reason }) => {
          if (!adjustTarget) return;
          await adjustMut.mutateAsync({
            productId: adjustTarget.productId,
            delta,
            reason,
          });
        }}
      />
    </FsPage>
  );
}

function MovementTableRow({ row }: { row: StockMovementRow }) {
  const q = row.quantity;
  const qTxt = q > 0 ? `+${q}` : String(q);
  const qCls = q > 0 ? "text-emerald-700" : "text-red-600";
  const dateStr = (() => {
    try {
      return new Date(row.createdAt).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return row.createdAt;
    }
  })();
  return (
    <tr className="border-b border-black/[0.04]">
      <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-700">{dateStr}</td>
      <td className="max-w-[200px] px-3 py-2 font-medium text-fs-text">{row.productName || "—"}</td>
      <td className="px-3 py-2 text-neutral-700">{MovementTypeLabel(row.type)}</td>
      <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", qCls)}>{qTxt}</td>
      <td className="max-w-[220px] px-4 py-2 text-xs text-neutral-600">{row.notes ?? "—"}</td>
    </tr>
  );
}
