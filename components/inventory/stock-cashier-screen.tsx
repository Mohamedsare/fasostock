"use client";

import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { StockRangeIndicator } from "@/components/products/stock-range-indicator";
import { FsPullToRefresh } from "@/components/ui/fs-pull-to-refresh";
import { FsCard, FsPage, FsQueryErrorPanel } from "@/components/ui/fs-screen-primitives";
import { P } from "@/lib/constants/permissions";
import { fetchInventoryScreenData } from "@/lib/features/inventory/api";
import type { InventoryRow } from "@/lib/features/inventory/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MdChevronLeft, MdChevronRight, MdInventory2, MdLockOutline, MdStorefront } from "react-icons/md";

const PAGE_SIZE = 20;

/** Aligné Flutter `stock_cashier_page` : rupture puis alertes (qty &gt; 0 et qty &lt; seuil). */
function sortByName(a: InventoryRow, b: InventoryRow): number {
  return a.name.localeCompare(b.name, "fr");
}

function StockCashierPagination({
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

  if (totalCount === 0 || totalCount <= pageSize) return null;

  return (
    <FsCard
      padding="px-4 py-3"
      className="mt-3 rounded-xl border border-black/6 shadow-none sm:rounded-xl"
    >
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
            "inline-flex h-11 min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-full text-white active:opacity-90 disabled:opacity-40",
            safePage > 0 ? "bg-fs-accent" : "bg-neutral-200 text-neutral-500",
          )}
          aria-label="Page précédente"
        >
          <MdChevronLeft className="h-7 w-7" aria-hidden />
        </button>
        <span className="text-sm font-semibold leading-none text-fs-text">
          Page {safePage + 1} / {pageCount}
        </span>
        <button
          type="button"
          disabled={safePage >= pageCount - 1}
          onClick={() => onPageChange(safePage + 1)}
          className={cn(
            "inline-flex h-11 min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-full text-white active:opacity-90 disabled:opacity-40",
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

/** `_SummaryChip` Flutter : Card élévation 0, rayon 12, bordure couleur @50 %. */
function SummaryChip({
  label,
  count,
  borderClass,
  textClass,
}: {
  label: string;
  count: number;
  borderClass: string;
  textClass: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[12px] border bg-fs-card px-3 py-3 shadow-none sm:px-4",
        borderClass,
      )}
    >
      <MdInventory2 className={cn("h-5 w-5 shrink-0", textClass)} aria-hidden />
      <span className="min-w-0 text-xs leading-snug text-neutral-600 sm:text-sm">
        {label} :{" "}
      </span>
      <span className={cn("text-sm font-bold tabular-nums leading-none sm:text-base", textClass)}>
        {count}
      </span>
    </div>
  );
}

/** `_ProductStockTile` Flutter : marge bas 8, padding H12 V10, image 44, titre titleSmall w600. */
function ProductStockTile({
  row,
  threshold,
}: {
  row: InventoryRow;
  threshold: number;
}) {
  const qty = row.availableQuantity;
  const t = threshold <= 0 ? 5 : threshold;
  return (
    <div className="mb-2 rounded-xl border border-black/6 bg-fs-card shadow-sm">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <ProductListThumbnail imageUrl={row.imageUrl} className="h-11 w-11 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-semibold leading-snug text-fs-text">{row.name}</p>
          <p className="mt-1 line-clamp-1 text-xs leading-snug text-neutral-600">
            {row.sku ?? "—"} · {formatCurrency(row.salePrice)}
          </p>
          <div className="mt-1.5 min-w-0">
            <StockRangeIndicator quantity={qty} alertThreshold={t} />
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 text-base font-bold tabular-nums leading-none",
            qty <= 0 ? "text-red-600" : "text-fs-accent",
          )}
        >
          {qty}
        </span>
      </div>
    </div>
  );
}

export function StockCashierScreen() {
  const { data: ctx, isLoading: permLoading, helpers, hasPermission } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const storeId = ctx?.storeId ?? null;
  const storeName = ctx?.stores?.find((s) => s.id === storeId)?.name ?? null;

  const narrowPagination = useMediaQuery("(max-width: 499px)");

  const canInventory =
    hasPermission(P.stockView) || hasPermission(P.stockAdjust) || hasPermission(P.stockTransfer);
  const canStockCashier = Boolean(helpers && canInventory && !helpers.isOwner);

  const [rupturePage, setRupturePage] = useState(0);
  const [alertesPage, setAlertesPage] = useState(0);

  const dataQ = useQuery({
    queryKey: queryKeys.productInventory(storeId),
    queryFn: () => fetchInventoryScreenData({ companyId, storeId }),
    enabled: Boolean(companyId) && Boolean(storeId) && canStockCashier,
    staleTime: 20_000,
  });

  const rows = dataQ.data?.rows ?? [];
  const defaultThreshold = dataQ.data?.defaultThreshold ?? 5;

  const rupture = useMemo(() => {
    return rows.filter((r) => r.availableQuantity <= 0).sort(sortByName);
  }, [rows]);

  /** Aligné Flutter : qty &gt; 0 et qty &lt; seuil (strict). */
  const alertes = useMemo(() => {
    return rows
      .filter((r) => {
        if (r.availableQuantity <= 0) return false;
        const min = r.alertThreshold > 0 ? r.alertThreshold : defaultThreshold;
        return r.availableQuantity < min;
      })
      .sort(sortByName);
  }, [rows, defaultThreshold]);

  const rupturePageCount = rupture.length === 0 ? 1 : Math.ceil(rupture.length / PAGE_SIZE);
  const alertesPageCount = alertes.length === 0 ? 1 : Math.ceil(alertes.length / PAGE_SIZE);

  useEffect(() => {
    if (rupturePage >= rupturePageCount) setRupturePage(Math.max(0, rupturePageCount - 1));
  }, [rupturePage, rupturePageCount]);

  useEffect(() => {
    if (alertesPage >= alertesPageCount) setAlertesPage(Math.max(0, alertesPageCount - 1));
  }, [alertesPage, alertesPageCount]);

  const paginatedRupture = useMemo(() => {
    if (rupture.length === 0) return [];
    return rupture.slice(rupturePage * PAGE_SIZE, rupturePage * PAGE_SIZE + PAGE_SIZE);
  }, [rupture, rupturePage]);

  const paginatedAlertes = useMemo(() => {
    if (alertes.length === 0) return [];
    return alertes.slice(alertesPage * PAGE_SIZE, alertesPage * PAGE_SIZE + PAGE_SIZE);
  }, [alertes, alertesPage]);

  const refresh = useCallback(async () => {
    await dataQ.refetch();
  }, [dataQ.refetch]);

  /** Padding écran Flutter `fromLTRB(20,20,20,16)` + mobile first. */
  const pageShell = cn(
    "!px-5 !pt-5 pb-28 min-[900px]:!px-8 min-[900px]:!pt-7 min-[900px]:pb-10",
  );

  if (permLoading) {
    return (
      <FsPage className={pageShell}>
        <div className="flex min-h-[50dvh] items-center justify-center px-1">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
            aria-hidden
          />
        </div>
      </FsPage>
    );
  }

  if (ctx && !canStockCashier) {
    return (
      <FsPage className={pageShell}>
        <div className="flex min-h-[50dvh] flex-col items-center justify-center px-1 py-12 text-center">
          <MdLockOutline className="h-16 w-16 text-red-600" aria-hidden />
          <p className="mt-4 max-w-sm text-base font-medium leading-relaxed text-neutral-700">
            Vous n&apos;avez pas accès à cette page.
          </p>
        </div>
      </FsPage>
    );
  }

  if (companyId && !storeId) {
    return (
      <FsPage className={pageShell}>
        <h1 className="text-xl font-bold leading-tight tracking-tight text-fs-text min-[900px]:text-2xl">
          Stock
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-neutral-600">
          Sélectionnez une boutique pour voir les ruptures et alertes.
        </p>
        <FsCard className="mt-6 rounded-2xl border border-black/6 shadow-none" padding="p-8">
          <div className="flex flex-col items-center text-center">
            <MdStorefront className="h-16 w-16 text-fs-accent/80" aria-hidden />
            <p className="mt-4 text-base font-semibold text-neutral-700">Choisissez une boutique</p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const loading = dataQ.isLoading || dataQ.isFetching;
  const showInitialSpinner = loading && rows.length === 0;

  return (
    <FsPage className={pageShell}>
      <FsPullToRefresh onRefresh={refresh}>
        <div className="pb-10">
          {/* En-tête : headlineSmall + bodyMedium (Flutter). */}
          <header className="pb-4">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-fs-text min-[900px]:text-2xl">
              Stock
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              {storeName != null ? `Ruptures et alertes — ${storeName}` : "Ruptures et alertes"}
            </p>
          </header>

          {dataQ.isError ? (
            <div className="mt-3">
              <FsQueryErrorPanel
                className="rounded-xl border border-red-200/70 bg-red-600/8 shadow-none"
                error={dataQ.error}
                onRetry={() => dataQ.refetch()}
              />
            </div>
          ) : showInitialSpinner ? (
            <div className="flex min-h-[50dvh] items-center justify-center py-16">
              <div
                className="h-10 w-10 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
                aria-hidden
              />
            </div>
          ) : (
            <>
              {/* Chips : Row + gap 12 (Flutter) ; grille 2 colonnes sur mobile pour lisibilité. */}
              <div className="grid grid-cols-2 items-stretch gap-3">
                <SummaryChip
                  label="Rupture"
                  count={rupture.length}
                  borderClass="border-red-600/50"
                  textClass="text-red-600"
                />
                <SummaryChip
                  label="Sous le min."
                  count={alertes.length}
                  borderClass="border-amber-700/50"
                  textClass="text-amber-700"
                />
              </div>

              {/* 24px avant 1re section (Flutter Sliver gap). */}
              <h2 className="mt-6 text-base font-semibold leading-snug text-red-600">Rupture de stock</h2>
              {rupture.length === 0 ? (
                <FsCard
                  className="mt-2 rounded-xl border border-black/6 shadow-none"
                  padding="p-4"
                >
                  <p className="text-center text-sm leading-relaxed text-neutral-800">
                    Aucun produit en rupture
                  </p>
                </FsCard>
              ) : (
                <>
                  <div className="mt-2 space-y-0">
                    {paginatedRupture.map((r) => (
                      <ProductStockTile key={r.productId} row={r} threshold={5} />
                    ))}
                  </div>
                  <StockCashierPagination
                    totalCount={rupture.length}
                    pageSize={PAGE_SIZE}
                    currentPage={rupturePage}
                    onPageChange={setRupturePage}
                    narrow={narrowPagination}
                  />
                </>
              )}

              <h2 className="mt-6 text-base font-semibold leading-snug text-amber-800">
                Sous le minimum (alertes)
              </h2>
              {alertes.length === 0 ? (
                <FsCard
                  className="mt-2 rounded-xl border border-black/6 shadow-none"
                  padding="p-4"
                >
                  <p className="text-center text-sm leading-relaxed text-neutral-800">Aucune alerte</p>
                </FsCard>
              ) : (
                <>
                  <div className="mt-2 space-y-0">
                    {paginatedAlertes.map((r) => (
                      <ProductStockTile
                        key={r.productId}
                        row={r}
                        threshold={r.alertThreshold > 0 ? r.alertThreshold : defaultThreshold}
                      />
                    ))}
                  </div>
                  <StockCashierPagination
                    totalCount={alertes.length}
                    pageSize={PAGE_SIZE}
                    currentPage={alertesPage}
                    onPageChange={setAlertesPage}
                    narrow={narrowPagination}
                  />
                </>
              )}
            </>
          )}
        </div>
      </FsPullToRefresh>
    </FsPage>
  );
}
