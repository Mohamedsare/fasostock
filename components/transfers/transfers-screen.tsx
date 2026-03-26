"use client";

import { CreateTransferDialog } from "@/components/transfers/create-transfer-dialog";
import { FsPullToRefresh } from "@/components/ui/fs-pull-to-refresh";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { P } from "@/lib/constants/permissions";
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
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MdAdd,
  MdCheckCircle,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdDeleteOutline,
  MdErrorOutline,
  MdFilterList,
  MdInventory2,
  MdLockOutline,
  MdSwapHoriz,
} from "react-icons/md";

const TRANSFERS_PAGE_SIZE = 20;

const ALL_STATUSES: TransferStatus[] = [
  "draft",
  "pending",
  "approved",
  "shipped",
  "received",
  "rejected",
  "cancelled",
];

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
      return "Réceptionné";
    case "rejected":
      return "Rejeté";
    case "cancelled":
      return "Annulé";
    default:
      return s;
  }
}

function formatTransferDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.length >= 10 ? iso.slice(0, 10) : iso;
  }
}

export function TransfersScreen() {
  const qc = useQueryClient();
  const {
    data: ctx,
    helpers,
    hasPermission,
    isLoading: permLoading,
  } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const stores = ctx?.stores ?? [];

  const isWide = useMediaQuery("(min-width: 900px)");
  const narrowFilters = useMediaQuery("(max-width: 519px)");
  const narrowPagination = useMediaQuery("(max-width: 499px)");

  const canView = helpers?.canTransfers ?? false;
  /** Aligné Flutter : `Permissions.stockTransfer` pour créer. */
  const canCreate = hasPermission(P.stockTransfer);
  const canApprove = hasPermission(P.transfersApprove);
  const canOperate =
    hasPermission(P.transfersCreate) ||
    hasPermission(P.transfersApprove) ||
    hasPermission(P.stockTransfer);

  const [filterStatus, setFilterStatus] = useState<TransferStatus | null>(null);
  const [filterFromStoreId, setFilterFromStoreId] = useState<string | null>(null);
  const [filterToStoreId, setFilterToStoreId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: queryKeys.stockTransfers(companyId),
    queryFn: () => listStockTransfers({ companyId, boutiqueToBoutiqueOnly: true }),
    enabled: Boolean(companyId) && canView,
    staleTime: 15_000,
  });

  const detailQ = useQuery({
    queryKey: detailId ? queryKeys.stockTransferDetail(detailId) : ["stock-transfer", "none"],
    queryFn: () => getStockTransferDetail(detailId as string),
    enabled: Boolean(detailId),
    staleTime: 10_000,
  });

  const storeName = (id: string | null) => {
    if (!id) return "—";
    return stores.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  };

  const rows = listQ.data ?? [];

  /** Uniquement boutique → boutique (origine et destination boutiques différentes). */
  const allBoutique = useMemo(
    () =>
      rows.filter((t) => {
        const from = (t.fromStoreId ?? "").trim();
        const to = (t.toStoreId ?? "").trim();
        return (
          !t.fromWarehouse &&
          from.length > 0 &&
          to.length > 0 &&
          from !== to
        );
      }),
    [rows],
  );

  const transfers = useMemo(() => {
    return allBoutique.filter((t) => {
      if (filterStatus != null && t.status !== filterStatus) return false;
      if (filterFromStoreId != null && t.fromStoreId !== filterFromStoreId) return false;
      if (filterToStoreId != null && t.toStoreId !== filterToStoreId) return false;
      return true;
    });
  }, [allBoutique, filterStatus, filterFromStoreId, filterToStoreId]);

  const sorted = useMemo(() => {
    return [...transfers].sort((a, b) => {
      const da = Date.parse(a.createdAt) || 0;
      const db = Date.parse(b.createdAt) || 0;
      return db - da;
    });
  }, [transfers]);

  const totalCount = sorted.length;
  const pageCount = totalCount === 0 ? 0 : Math.ceil(totalCount / TRANSFERS_PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [filterStatus, filterFromStoreId, filterToStoreId]);

  useEffect(() => {
    if (pageCount > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  const safePage = pageCount === 0 ? 0 : Math.min(Math.max(0, page), pageCount - 1);
  const paginated = sorted.slice(
    safePage * TRANSFERS_PAGE_SIZE,
    (safePage + 1) * TRANSFERS_PAGE_SIZE,
  );

  const loadingList = listQ.isLoading && allBoutique.length === 0;

  const refreshTransfers = useCallback(async () => {
    await listQ.refetch();
  }, [listQ.refetch]);

  const approveMut = useMutation({
    mutationFn: approveStockTransfer,
    onSuccess: async (_, id) => {
      await qc.invalidateQueries({ queryKey: queryKeys.stockTransfers(companyId) });
      await qc.invalidateQueries({ queryKey: queryKeys.stockTransferDetail(id) });
      toast.success("Transfert approuvé");
    },
    onError: (e) => toastMutationError("transfers-approve", e),
  });

  const shipMut = useMutation({
    mutationFn: shipStockTransfer,
    onSuccess: async (_, id) => {
      await qc.invalidateQueries({ queryKey: queryKeys.stockTransfers(companyId) });
      await qc.invalidateQueries({ queryKey: queryKeys.stockTransferDetail(id) });
      toast.success("Expédition enregistrée");
    },
    onError: (e) => toastMutationError("transfers-ship", e),
  });

  const receiveMut = useMutation({
    mutationFn: receiveStockTransfer,
    onSuccess: async (_, id) => {
      await qc.invalidateQueries({ queryKey: queryKeys.stockTransfers(companyId) });
      await qc.invalidateQueries({ queryKey: queryKeys.stockTransferDetail(id) });
      toast.success("Réception enregistrée");
    },
    onError: (e) => toastMutationError("transfers-receive", e),
  });

  const cancelMut = useMutation({
    mutationFn: cancelStockTransfer,
    onSuccess: async (_, id) => {
      await qc.invalidateQueries({ queryKey: queryKeys.stockTransfers(companyId) });
      await qc.invalidateQueries({ queryKey: queryKeys.stockTransferDetail(id) });
      setDetailId((cur) => (cur === id ? null : cur));
      toast.success("Transfert annulé");
    },
    onError: (e) => toastMutationError("transfers-cancel", e),
  });

  const deleteMut = useMutation({
    mutationFn: deleteStockTransfer,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.stockTransfers(companyId) });
      setDetailId(null);
      toast.success("Transfert supprimé");
    },
    onError: (e) => toastMutationError("transfers-delete", e),
  });

  function resetFilters() {
    setFilterStatus(null);
    setFilterFromStoreId(null);
    setFilterToStoreId(null);
    setPage(0);
  }

  function handleCancelOrDeleteRow(e: React.MouseEvent, t: StockTransferListItem) {
    e.stopPropagation();
    const isPendingLocal = t.id.startsWith("pending:");
    const ok = window.confirm(
      isPendingLocal
        ? "Supprimer ce brouillon ? Ce transfert n'a pas encore été synchronisé."
        : t.status === "draft"
          ? "Supprimer ce brouillon ? Il sera définitivement supprimé."
          : "Annuler ce transfert ? Le transfert passera au statut « Annulé ».",
    );
    if (!ok) return;
    if (isPendingLocal) {
      toast.error("Suppression locale non disponible sur le web.");
      return;
    }
    cancelMut.mutate(t.id);
  }

  if (permLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
        </div>
      </FsPage>
    );
  }

  if (!canView) {
    return (
      <FsPage className={cn(isWide && "px-8 pt-7")}>
        <FsScreenHeader
          title="Transferts"
          subtitle="Uniquement d’une boutique vers une autre (pas depuis le dépôt magasin)."
        />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <MdLockOutline className="h-16 w-16 text-red-600" aria-hidden />
            <p className="text-sm text-neutral-700">Vous n&apos;avez pas accès à cette page.</p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  if (!companyId) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-neutral-700">Aucune entreprise. Sélectionnez une entreprise.</p>
        </div>
      </FsPage>
    );
  }

  const selectClass = cn(fsInputClass(), "text-sm");

  return (
    <FsPage className={cn(isWide && "px-8 pt-7")}>
      <FsPullToRefresh onRefresh={refreshTransfers}>
        <div
          className={cn(
            "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
            isWide && "gap-4",
          )}
        >
          <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
            <MdSwapHoriz className="mt-0.5 h-[22px] w-[22px] shrink-0 text-fs-accent sm:h-7 sm:w-7" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold leading-tight tracking-tight text-fs-text min-[900px]:text-2xl">
                Transferts
              </h1>
              <p className="mt-0.5 text-sm text-neutral-600 sm:mt-1">
                Uniquement d’une boutique vers une autre (pas depuis le dépôt magasin).
              </p>
            </div>
          </div>
          {canCreate && stores.length > 0 ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm min-[400px]:w-auto sm:py-2.5"
            >
              <MdAdd className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
              Nouveau transfert
            </button>
          ) : null}
        </div>

        {listQ.isError ? (
          <div
            className={cn(
              "mt-3 flex items-start gap-3 rounded-[10px] border border-red-200/80 bg-red-50/80 p-3 sm:mt-4 sm:p-4",
            )}
            role="alert"
          >
            <MdErrorOutline className="mt-0.5 h-[18px] w-[18px] shrink-0 text-red-600 sm:h-[22px] sm:w-[22px]" aria-hidden />
            <div className="min-w-0 flex-1 text-sm text-red-950">
              <p>{(listQ.error as Error)?.message ?? "Erreur de chargement."}</p>
              <button
                type="button"
                onClick={() => void listQ.refetch()}
                className="mt-2 text-sm font-semibold text-red-900 underline"
              >
                Réessayer
              </button>
            </div>
          </div>
        ) : null}

        {!canCreate && listQ.error == null ? (
          <p className="mt-3 text-xs text-neutral-600 sm:text-sm">
            {stores.length < 2
              ? "Il faut au moins deux boutiques pour créer un transfert."
              : "Vous n'avez pas le droit de créer des transferts."}
          </p>
        ) : null}

        {allBoutique.length > 0 ? (
          <FsCard padding={narrowFilters ? "p-3" : "p-4"} className="mt-3 sm:mt-4">
            <div className="flex items-center gap-2">
              <MdFilterList className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
              <span className="text-sm font-semibold text-fs-text">Filtres</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-sm font-semibold text-fs-accent"
              >
                Réinitialiser
              </button>
            </div>
            <div className={cn("mt-3 gap-2.5", narrowFilters ? "flex flex-col" : "grid grid-cols-3 gap-3")}>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Statut</span>
                <select
                  className={selectClass}
                  value={filterStatus ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFilterStatus(v === "" ? null : (v as TransferStatus));
                    setPage(0);
                  }}
                >
                  <option value="">Tous</option>
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Boutique origine</span>
                <select
                  className={selectClass}
                  value={filterFromStoreId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFilterFromStoreId(v === "" ? null : v);
                    setPage(0);
                  }}
                >
                  <option value="">Toutes</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Boutique destination</span>
                <select
                  className={selectClass}
                  value={filterToStoreId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFilterToStoreId(v === "" ? null : v);
                    setPage(0);
                  }}
                >
                  <option value="">Toutes</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {totalCount !== allBoutique.length ? (
              <p className="mt-2.5 text-xs text-neutral-600">
                {totalCount} transfert(s) sur {allBoutique.length}
              </p>
            ) : null}
          </FsCard>
        ) : null}

        {loadingList ? (
          <div className="flex min-h-[40vh] items-center justify-center py-16">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center">
            <MdInventory2 className="h-16 w-16 text-neutral-300" aria-hidden />
            <p className="mt-4 text-base font-semibold text-fs-text">
              {allBoutique.length === 0 ? "Aucun transfert" : "Aucun résultat"}
            </p>
            <p className="mt-2 max-w-sm text-sm text-neutral-600">
              {allBoutique.length === 0
                ? canCreate && stores.length > 0
                  ? "Appuyez sur « Nouveau transfert » pour en créer un."
                  : "Créez des transferts depuis l'app web ou ajoutez une boutique."
                : "Modifiez les filtres ou réinitialisez-les."}
            </p>
          </div>
        ) : (
          <>
            <ul className={cn("mt-3 space-y-2 sm:mt-4 sm:space-y-3", isWide && "mt-4")}>
              {paginated.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(row.id)}
                    className="flex w-full items-stretch gap-2 rounded-xl border border-black/[0.08] bg-fs-card text-left shadow-sm transition-colors active:bg-fs-surface-container sm:gap-3"
                  >
                    <div className="flex shrink-0 items-center self-center pl-2 sm:pl-3">
                      <div
                        className={cn(
                          "flex items-center justify-center rounded-full bg-fs-accent/15",
                          "h-9 w-9 sm:h-11 sm:w-11",
                        )}
                      >
                        <MdSwapHoriz className="h-[18px] w-[18px] text-fs-accent sm:h-[22px] sm:w-[22px]" aria-hidden />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 py-2.5 pr-2 sm:py-3 sm:pr-3">
                      <p className="text-sm font-semibold text-fs-text">
                        {storeName(row.fromStoreId)} → {storeName(row.toStoreId)}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-600">
                        {formatTransferDate(row.createdAt)} · {statusLabel(row.status)}
                      </p>
                      {row.id.startsWith("pending:") ? (
                        <p className="mt-1 text-[11px] font-semibold text-violet-700">Non synchronisé</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 pr-1 sm:pr-2">
                      {row.status === "draft" || row.status === "pending" || row.id.startsWith("pending:") ? (
                        <button
                          type="button"
                          onClick={(e) => handleCancelOrDeleteRow(e, row)}
                          className="fs-touch-target rounded-lg p-2 text-red-600"
                          aria-label={
                            row.id.startsWith("pending:")
                              ? "Supprimer le brouillon"
                              : row.status === "draft"
                                ? "Supprimer le brouillon"
                                : "Annuler le transfert"
                          }
                        >
                          <MdDeleteOutline className="h-5 w-5" aria-hidden />
                        </button>
                      ) : null}
                      <MdChevronRight className="h-6 w-6 text-neutral-400" aria-hidden />
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {pageCount > 1 ? (
              <FsCard padding="p-3 sm:p-4" className="mt-4 sm:mt-5">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                  {!narrowPagination ? (
                    <span className="mr-2 text-xs text-neutral-600 sm:mr-4">
                      {safePage * TRANSFERS_PAGE_SIZE + 1} –{" "}
                      {Math.min((safePage + 1) * TRANSFERS_PAGE_SIZE, totalCount)} sur {totalCount}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={safePage <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
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
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    className={cn(
                      "inline-flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40",
                      safePage < pageCount - 1 ? "bg-fs-accent" : "bg-neutral-200 text-neutral-500",
                    )}
                    aria-label="Page suivante"
                  >
                    <MdChevronRight className="h-7 w-7" aria-hidden />
                  </button>
                  {narrowPagination ? (
                    <span className="w-full text-center text-xs text-neutral-600">
                      {safePage * TRANSFERS_PAGE_SIZE + 1} –{" "}
                      {Math.min((safePage + 1) * TRANSFERS_PAGE_SIZE, totalCount)} / {totalCount}
                    </span>
                  ) : null}
                </div>
              </FsCard>
            ) : null}
          </>
        )}
      </FsPullToRefresh>

      <CreateTransferDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        companyId={companyId}
        stores={stores}
        onCreated={async () => {
          await qc.invalidateQueries({ queryKey: queryKeys.stockTransfers(companyId) });
          toast.success("Transfert créé");
        }}
      />

      {detailId ? (
        <div
          className="fixed inset-0 z-[55] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[min(88dvh,640px)] w-full flex-col rounded-t-2xl bg-fs-surface shadow-2xl sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
              <h2 className="pr-2 text-base font-bold text-fs-text">Détail transfert</h2>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="fs-touch-target rounded-xl p-2 text-neutral-600"
                aria-label="Fermer"
              >
                <MdClose className="h-6 w-6" />
              </button>
            </div>
            {detailQ.isLoading ? (
              <div className="flex min-h-[200px] items-center justify-center p-8">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
              </div>
            ) : null}
            {detailQ.isError ? (
              <div className="p-4">
                <FsQueryErrorPanel error={detailQ.error} onRetry={() => detailQ.refetch()} />
              </div>
            ) : null}
            {detailQ.data ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  {(() => {
                    const d = detailQ.data;
                    const canShipNow = d.status === "draft" || d.status === "approved";
                    const needsApproval = d.status === "pending";
                    return (
                      <>
                        <p className="text-[11px] font-semibold uppercase text-neutral-500">Statut</p>
                        <p className="mt-1 text-sm font-bold text-fs-text">{statusLabel(d.status)}</p>
                        <p className="mt-3 text-[11px] font-semibold uppercase text-neutral-500">Flux</p>
                        <p className="mt-1 text-sm text-fs-text">
                          {d.fromWarehouse ? "Dépôt magasin" : storeName(d.fromStoreId)} → {storeName(d.toStoreId)}
                        </p>
                        <p className="mt-4 text-[11px] font-semibold uppercase text-neutral-500">Lignes</p>
                        <div className="mt-2 space-y-2">
                          {d.items.map((it) => (
                            <div
                              key={it.id}
                              className="flex flex-col gap-1 rounded-[10px] border border-black/6 bg-fs-card px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                            >
                              <span className="min-w-0 font-semibold text-fs-text">
                                {it.productName ?? it.productId.slice(0, 8)}
                              </span>
                              <span className="shrink-0 text-neutral-600">
                                {it.quantityRequested} req. / {it.quantityShipped} exp. / {it.quantityReceived} réc.
                              </span>
                            </div>
                          ))}
                        </div>
                        {canOperate ? (
                          <div className="mt-4 space-y-2 border-t border-black/6 pt-4">
                            {needsApproval && canApprove ? (
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
                            {needsApproval && !canApprove ? (
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
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </FsPage>
  );
}
