"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { P } from "@/lib/constants/permissions";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import type { AccessHelpers } from "@/lib/features/permissions/access";
import { cancelSale, listSales } from "@/lib/features/sales/api";
import type { SaleItem, SaleStatus } from "@/lib/features/sales/types";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime, toIsoDate } from "@/lib/utils/date";
import { downloadCsv } from "@/lib/utils/csv";
import { salesToCsv } from "@/lib/features/sales/csv";
import { ROUTES } from "@/lib/config/routes";
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
  MdChevronLeft,
  MdChevronRight,
  MdDescription,
  MdDownload,
  MdLockPerson,
  MdOpenInNew,
  MdPointOfSale,
  MdReceiptLong,
  MdRefresh,
  MdShoppingCart,
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

function statusColorClass(status: SaleStatus): string {
  switch (status) {
    case "completed":
      return "text-emerald-700";
    case "cancelled":
    case "refunded":
      return "text-red-700";
    default:
      return "text-neutral-700";
  }
}

function statusBgClass(status: SaleStatus): string {
  switch (status) {
    case "completed":
      return "bg-emerald-50";
    case "cancelled":
    case "refunded":
      return "bg-red-50";
    default:
      return "bg-neutral-100";
  }
}

function DocumentTypeChip({ sale }: { sale: SaleItem }) {
  const a4 = isA4Invoice(sale);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-semibold leading-none",
        a4
          ? "bg-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)] text-[var(--fs-accent)]"
          : "bg-fs-surface-container text-neutral-600",
      )}
    >
      {a4 ? (
        <MdDescription className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <MdReceiptLong className="h-3.5 w-3.5 shrink-0" aria-hidden />
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
  const canCreateSale = hasPermission(P.salesCreate);
  const canInvoiceA4 = hasPermission(P.salesInvoiceA4);
  const canCancelSale = hasPermission(P.salesCancel);

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
  });

  const cancelMut = useMutation({
    mutationFn: (saleId: string) => cancelSale(saleId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Vente annulée");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
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
    downloadCsv(`ventes-${d}.csv`, salesToCsv(sales));
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
          canInvoiceA4
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
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-100/80 text-left text-xs font-medium text-neutral-600">
                  <tr>
                    <th className="px-3 py-2.5">Numéro</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Boutique</th>
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
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDateTime(s.created_at)}
                      </td>
                      <td className="px-3 py-2">{s.store?.name ?? "—"}</td>
                      <td className="px-3 py-2">{s.customer?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatCurrency(s.total)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-block rounded-lg px-2.5 py-1 text-xs font-semibold",
                            statusBgClass(s.status),
                            statusColorClass(s.status),
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
                            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-red-600"
                            aria-label="Annuler la vente"
                          >
                            <MdCancel className="h-5 w-5" aria-hidden />
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
                  canCancel={canCancelSale}
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
  canCancel,
  onCancel,
  onDetail,
}: {
  sale: SaleItem;
  canCancel: boolean;
  onCancel: () => void;
  onDetail: () => void;
}) {
  return (
    <article
      className="touch-manipulation cursor-pointer rounded-xl border border-black/[0.06] bg-fs-card p-4 shadow-sm transition-colors active:bg-neutral-100/80"
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
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <h3 className="text-base font-bold leading-tight text-fs-text">{sale.sale_number}</h3>
            <DocumentTypeChip sale={sale} />
            <span
              className={cn(
                "ml-auto shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold max-[360px]:ml-0",
                statusBgClass(sale.status),
                statusColorClass(sale.status),
              )}
            >
              {statusLabel[sale.status]}
            </span>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {formatDateTime(sale.created_at)}
          </p>
          {(sale.store?.name || sale.customer?.name) ? (
            <p className="mt-1 truncate text-sm text-neutral-800">
              {[sale.store?.name, sale.customer?.name].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <div
        className="mt-3 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className="text-lg font-bold text-fs-text">
          {formatCurrency(sale.total)}
        </span>
        <span className="ml-auto flex items-center gap-0">
          <button
            type="button"
            onClick={onDetail}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-fs-accent"
            aria-label="Voir le détail"
          >
            <MdOpenInNew className="h-5 w-5 shrink-0" aria-hidden />
          </button>
          {sale.status === "completed" && canCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-red-600"
              aria-label="Annuler la vente"
            >
              <MdCancel className="h-5 w-5" aria-hidden />
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
