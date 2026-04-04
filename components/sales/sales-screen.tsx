"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { P } from "@/lib/constants/permissions";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import type { AccessHelpers } from "@/lib/features/permissions/access";
import { cancelSale, listSales, purgeCancelledSaleAsOwner } from "@/lib/features/sales/api";
import type { SaleItem, SaleStatus } from "@/lib/features/sales/types";
import { queryKeys } from "@/lib/query/query-keys";
import {
  fetchInvoiceTablePosEnabled,
  peekInvoiceTablePosEnabled,
} from "@/lib/features/settings/invoice-table-pos";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime, toIsoDate } from "@/lib/utils/date";
import { downloadCsv } from "@/lib/utils/csv";
import { salesToCsv } from "@/lib/features/sales/csv";
import { saleSellerLabel, saleStoreLabel } from "@/lib/features/sales/sale-display";
import { ROUTES, storeFactureTabPath } from "@/lib/config/routes";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { SaleDetailModal } from "./sale-detail-modal";
import { FsPage, FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  MdAdd,
  MdArrowBack,
  MdCalendarToday,
  MdCancel,
  MdDeleteOutline,
  MdChevronLeft,
  MdChevronRight,
  MdDescription,
  MdDownload,
  MdLockPerson,
  MdEdit,
  MdPointOfSale,
  MdReceiptLong,
  MdRefresh,
  MdShoppingCart,
  MdTableChart,
  MdVisibility,
} from "react-icons/md";

const PAGE_SIZE = 20;

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

export function SalesScreen() {
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

  const [status, setStatus] = useState<SaleStatus | "">("");
  const [storeFilter, setStoreFilter] = useState("");
  /** True si l’utilisateur a explicitement choisi « Toutes boutiques » (ne pas re-remplir par la boutique courante). */
  const allStoresChosen = useRef(false);
  const lastCompanyId = useRef<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);

  const companyId = ctx.data?.companyId ?? "";
  const stores = ctx.data?.stores ?? [];
  const currentStoreId = ctx.data?.storeId ?? null;

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
  /** Appliquer une seule fois `?store=` (ex. lien depuis la caisse rapide). */
  const storeFromUrlAppliedRef = useRef(false);

  const isWide = useMediaQuery("(min-width: 900px)");

  useEffect(() => {
    if (!companyId) {
      lastCompanyId.current = null;
      storeFromUrlAppliedRef.current = false;
      return;
    }
    const companyChanged = lastCompanyId.current !== companyId;
    if (companyChanged) {
      lastCompanyId.current = companyId;
      storeFromUrlAppliedRef.current = false;
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
    if (storeFromUrlAppliedRef.current) return;
    const sid = searchParams.get("store");
    if (!sid || stores.length === 0) return;
    if (!stores.some((s) => s.id === sid)) return;
    storeFromUrlAppliedRef.current = true;
    allStoresChosen.current = true;
    setStoreFilter(sid);
  }, [searchParams, stores]);

  const effectiveStoreId = storeFilter || null;

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

  const sales = salesQ.data ?? [];
  const pageCount = sales.length === 0 ? 0 : Math.ceil(sales.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const paged = sales.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const rangeStart = sales.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, sales.length);

  const headerDescription = useMemo(() => {
    if (!currentStoreId) return "Sélectionnez une boutique";
    const name = stores.find((s) => s.id === currentStoreId)?.name;
    return name ? `Ventes — ${name}` : "Sélectionnez une boutique";
  }, [currentStoreId, stores]);

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

  const exportCsv = () => {
    const d = new Date().toISOString().slice(0, 10);
    downloadCsv(`ventes-${d}.csv`, salesToCsv(sales, stores));
    toast.success("CSV enregistré");
  };

  const actionCards = (
    <>
      <ActionCard
        title="Caisse rapide"
        subtitle="Ticket thermique"
        icon={MdPointOfSale}
        accent
        enabled={!!(currentStoreId && canCreateSale)}
        href={
          currentStoreId && canCreateSale
            ? `${ROUTES.stores}/${currentStoreId}/pos-quick`
            : null
        }
      />
      {canInvoiceA4 ? (
        <ActionCard
          title="Facture A4"
          subtitle="Vente détaillée"
          icon={MdDescription}
          accent
          enabled={!!currentStoreId}
          href={
            currentStoreId ? `${ROUTES.stores}/${currentStoreId}/pos` : null
          }
        />
      ) : null}
      {canFactureTab ? (
        <ActionCard
          title="Facture A4 (tableau)"
          subtitle="Bandeau + tableau"
          icon={MdTableChart}
          accent
          enabled={!!currentStoreId}
          href={
            currentStoreId ? storeFactureTabPath(currentStoreId) : null
          }
        />
      ) : null}
      <ActionCard
        title="Historique des ventes"
        subtitle={`${sales.length} vente(s)`}
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
    <FsPage className="flex min-h-0 flex-1 flex-col px-5 pt-4 pb-28 sm:px-5 sm:pb-10 min-[900px]:px-7 min-[900px]:pt-7">
      <div className="flex flex-col gap-6">
        {/* En-tête type Flutter : headlineSmall + actions ; mobile-first = colonne puis wrap ≥560px */}
        <div className="flex flex-col gap-4 min-[560px]:flex-row min-[560px]:items-start min-[560px]:justify-between min-[560px]:gap-6">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight tracking-[-0.4px] text-fs-text min-[900px]:text-2xl">
              Ventes
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
              disabled={sales.length === 0 || salesQ.isFetching}
              onClick={exportCsv}
              className={btnOutline}
            >
              <MdDownload className="h-[18px] w-[18px] shrink-0" aria-hidden />
              Enregistrer CSV
            </button>
            {canCreateSale && currentStoreId ? (
              <Link href={`${ROUTES.stores}/${currentStoreId}/pos-quick`} className={btnPrimary}>
                <MdAdd className="h-5 w-5 shrink-0" aria-hidden />
                Nouvelle vente
              </Link>
            ) : null}
          </div>
        </div>

      <section
        className={cn(
          "grid gap-3 min-[600px]:gap-5",
          canInvoiceA4 && canFactureTab
            ? "grid-cols-1 min-[600px]:grid-cols-2 min-[1100px]:grid-cols-4"
            : canInvoiceA4 || canFactureTab
              ? "grid-cols-1 min-[600px]:grid-cols-3"
              : "grid-cols-1 min-[600px]:grid-cols-2",
        )}
      >
        {actionCards}
      </section>

      <FsCard padding="p-4 min-[500px]:p-5">
        <p className="mb-4 text-sm font-medium text-neutral-600">Filtres</p>
        <div className="flex flex-col gap-4 min-[500px]:flex-row min-[500px]:flex-wrap min-[500px]:items-end min-[500px]:gap-3">
          <div className="w-full min-[500px]:w-[200px] min-[500px]:shrink-0">
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">
              Boutique
            </label>
            <select
              value={storeFilter}
              onChange={(e) => {
                const v = e.target.value;
                allStoresChosen.current = v === "";
                setStoreFilter(v);
                setPage(0);
              }}
              className={cn(fsInputClass(), "min-h-12 sm:min-h-11")}
            >
              <option value="">Toutes boutiques</option>
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
              className={cn(fsInputClass(), "min-h-12 sm:min-h-11")}
            >
              <option value="">Tous</option>
              <option value="draft">Brouillon</option>
              <option value="completed">Complétée</option>
              <option value="cancelled">Annulée</option>
              <option value="refunded">Remboursée</option>
            </select>
          </div>
          <div className="flex min-w-0 w-full flex-1 flex-col gap-3 min-[500px]:flex-row min-[500px]:flex-wrap min-[500px]:gap-3">
            <div className="min-w-0 w-full min-[500px]:min-w-[160px] min-[500px]:flex-1">
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
                  className={cn(fsInputClass("pl-10"), "min-h-12 sm:min-h-11")}
                />
              </div>
            </div>
            <div className="min-w-0 w-full min-[500px]:min-w-[160px] min-[500px]:flex-1">
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
                  className={cn(fsInputClass("pl-10"), "min-h-12 sm:min-h-11")}
                />
              </div>
            </div>
          </div>
        </div>
      </FsCard>

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
      ) : sales.length === 0 ? (
        <EmptyStateCard currentStoreId={currentStoreId} />
      ) : (
        <>
          {isWide ? (
            <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-fs-card shadow-sm">
              <table className="min-w-full text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                <thead className="bg-neutral-100/80 text-left text-xs font-medium text-neutral-600">
                  <tr>
                    <th className="px-3 py-2.5">Numéro</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Boutique</th>
                    <th className="px-3 py-2.5">Vente par</th>
                    <th className="px-3 py-2.5">Client</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5">Statut</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s) => (
                    <tr key={s.id} className="border-t border-black/[0.06]">
                      <td className="px-3 py-2 font-semibold">{s.sale_number}</td>
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
            </div>
          ) : null}

          {!isWide ? (
            <div className="flex flex-col gap-3">
              {paged.map((s) => (
                <SaleCard
                  key={s.id}
                  sale={s}
                  stores={stores}
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
                  {rangeStart} – {rangeEnd} sur {sales.length}
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
                  {rangeStart} – {rangeEnd} / {sales.length}
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
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DocumentTypeChip sale={sale} />
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
      <div
        className="mt-3 flex items-center"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className="text-base font-bold text-fs-text">
          {formatCurrency(sale.total)}
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

function EmptyStateCard({ currentStoreId }: { currentStoreId: string | null }) {
  return (
    <FsCard className="py-14 text-center sm:py-16" padding="px-5 py-14 sm:px-6 sm:py-16">
      <MdShoppingCart
        className="mx-auto h-14 w-14 text-neutral-300"
        aria-hidden
      />
      <h3 className="mt-4 text-base font-semibold leading-snug text-neutral-900">
        Aucune vente
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Créez une vente depuis le POS en sélectionnant une boutique.
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

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-black/[0.12] bg-fs-card px-4 py-8 text-center text-sm text-neutral-600 sm:rounded-2xl">
      {text}
    </div>
  );
}
