"use client";

import { CreatePurchaseDialog } from "@/components/purchases/create-purchase-dialog";
import type { CreatePurchasePayload } from "@/components/purchases/create-purchase-dialog";
import { PurchaseDetailDialog } from "@/components/purchases/purchase-detail-dialog";
import { FsCard, FsPage, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { FsPullToRefresh } from "@/components/ui/fs-pull-to-refresh";
import { P } from "@/lib/constants/permissions";
import {
  cancelPurchase,
  createDraftPurchase,
  deleteDraftPurchase,
  getPurchaseDetail,
  listProductsForPicker,
  listPurchases,
  listSuppliers,
  updatePurchaseDraftReference,
} from "@/lib/features/purchases/api";
import type { PurchaseDetail, PurchaseListItem, PurchaseStatus } from "@/lib/features/purchases/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MdAdd, MdChevronLeft, MdChevronRight, MdErrorOutline, MdLock } from "react-icons/md";
import { toast, toastMutationError } from "@/lib/toast";

const PURCHASES_PAGE_SIZE = 20;

function statusLabel(s: PurchaseStatus) {
  switch (s) {
    case "draft":
      return "Brouillon";
    case "confirmed":
      return "Confirmé";
    case "partially_received":
      return "Part. reçu";
    case "received":
      return "Reçu";
    case "cancelled":
      return "Annulé";
    default:
      return s;
  }
}

/** Équivalent `DateFormat('dd/MM/yyyy HH:mm', 'fr_FR')` (Flutter). */
function formatPurchaseDate(iso: string) {
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
    return iso.length >= 16 ? iso.slice(0, 16) : iso;
  }
}

function ConfirmCancelPurchaseDialog({
  open,
  referenceOrId,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  referenceOrId: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
    >
      <FsCard className="w-full max-w-md" padding="p-4 sm:p-5">
        <h2 className="text-base font-bold text-fs-text">Annuler l&apos;achat</h2>
        <p className="mt-3 text-sm text-neutral-600">
          Annuler l&apos;achat {referenceOrId} ?
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-fs-accent"
          >
            Non
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "…" : "Oui"}
          </button>
        </div>
      </FsCard>
    </div>
  );
}

function ConfirmDeletePurchaseDialog({
  open,
  referenceOrId,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  referenceOrId: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
    >
      <FsCard className="w-full max-w-md" padding="p-4 sm:p-5">
        <h2 className="text-base font-bold text-fs-text">Supprimer l&apos;achat</h2>
        <p className="mt-3 text-sm text-neutral-600">
          Supprimer définitivement l&apos;achat {referenceOrId} ?
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-fs-accent"
          >
            Non
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "…" : "Supprimer"}
          </button>
        </div>
      </FsCard>
    </div>
  );
}

export function PurchasesScreen() {
  const qc = useQueryClient();
  const {
    data: ctx,
    helpers,
    hasPermission,
    isLoading: permLoading,
  } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const ctxStoreId = ctx?.storeId ?? null;
  const stores = ctx?.stores ?? [];

  /** Aligné `PurchasesPage` Flutter (l.216–219) — pas de cas super-admin séparé. */
  const canAccess =
    hasPermission(P.purchasesView) ||
    hasPermission(P.purchasesCreate) ||
    hasPermission(P.purchasesCancel) ||
    Boolean(helpers?.isOwner);

  const canCreate = Boolean(helpers?.isOwner) || hasPermission(P.purchasesCreate);

  const canManage =
    Boolean(helpers?.isOwner) ||
    hasPermission(P.purchasesUpdate) ||
    hasPermission(P.purchasesCancel) ||
    hasPermission(P.purchasesDelete);

  const [filterStoreId, setFilterStoreId] = useState<string | null>(null);
  const [filterSupplierId, setFilterSupplierId] = useState<string | null>(null);
  const [status, setStatus] = useState<PurchaseStatus | "all">("all");
  const [page, setPage] = useState(0);

  const isPaginationNarrow = useMediaQuery("(max-width: 499px)");

  const params = useMemo(
    () => ({
      companyId,
      storeId: filterStoreId,
      supplierId: filterSupplierId,
      status: status === "all" ? null : status,
    }),
    [companyId, filterStoreId, filterSupplierId, status],
  );

  const filterKey = `${filterStoreId}|${filterSupplierId}|${status}`;
  useEffect(() => {
    setPage(0);
  }, [filterKey]);

  const purchasesQ = useQuery({
    queryKey: queryKeys.purchases({
      companyId: params.companyId,
      storeId: params.storeId,
      supplierId: params.supplierId,
      status: params.status,
    }),
    queryFn: () => listPurchases(params),
    enabled: Boolean(companyId) && canAccess,
    staleTime: 15_000,
  });

  const suppliersQ = useQuery({
    queryKey: queryKeys.suppliers(companyId),
    queryFn: () => listSuppliers(companyId),
    enabled: Boolean(companyId) && canAccess,
    staleTime: 60_000,
  });

  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProductsForPicker(companyId),
    enabled: Boolean(companyId) && canCreate,
    staleTime: 60_000,
  });

  const rows = purchasesQ.data ?? [];
  const totalCount = rows.length;
  const pageCount = totalCount === 0 ? 0 : Math.floor((totalCount - 1) / PURCHASES_PAGE_SIZE) + 1;

  useEffect(() => {
    if (pageCount > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  const safePage = pageCount === 0 ? 0 : Math.min(Math.max(0, page), pageCount - 1);
  const paginatedRows = rows.slice(
    safePage * PURCHASES_PAGE_SIZE,
    safePage * PURCHASES_PAGE_SIZE + PURCHASES_PAGE_SIZE,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const detailQ = useQuery({
    queryKey: ["purchase-detail", detailId] as const,
    queryFn: () => getPurchaseDetail(detailId as string),
    enabled: Boolean(detailId) && detailOpen,
    staleTime: 0,
  });

  const invalidatePurchases = useCallback(async () => {
    await qc.invalidateQueries({
      queryKey: queryKeys.purchases({
        companyId: params.companyId,
        storeId: params.storeId,
        supplierId: params.supplierId,
        status: params.status,
      }),
    });
  }, [qc, params]);

  const createMut = useMutation({
    mutationFn: async (payload: CreatePurchasePayload) => {
      if (!companyId) throw new Error("Entreprise manquante.");
      await createDraftPurchase({
        companyId,
        storeId: payload.storeId,
        supplierId: payload.supplierId,
        reference: payload.reference,
        items: payload.items,
        payments: payload.payments,
      });
    },
    onSuccess: async () => {
      await invalidatePurchases();
      toast.success("Achat créé (brouillon)");
    },
    onError: (e) => toastMutationError("purchases", e),
  });

  const cancelMut = useMutation({
    mutationFn: async (purchaseId: string) => cancelPurchase(purchaseId),
    onSuccess: async () => {
      await invalidatePurchases();
      if (detailId) await qc.invalidateQueries({ queryKey: ["purchase-detail", detailId] });
      toast.success("Achat annulé");
    },
    onError: (e) => toastMutationError("purchases", e),
  });

  const deleteMut = useMutation({
    mutationFn: async (purchaseId: string) => deleteDraftPurchase(purchaseId),
    onSuccess: async () => {
      await invalidatePurchases();
      if (detailId) await qc.invalidateQueries({ queryKey: ["purchase-detail", detailId] });
      toast.success("Achat supprimé");
    },
    onError: (e) => toastMutationError("purchases", e),
  });

  const saveRefMut = useMutation({
    mutationFn: async ({ id, reference }: { id: string; reference: string | null }) => {
      await updatePurchaseDraftReference(id, reference);
    },
    onSuccess: async (_, v) => {
      await invalidatePurchases();
      await qc.invalidateQueries({ queryKey: ["purchase-detail", v.id] });
      toast.success("Référence mise à jour");
    },
    onError: (e) => toastMutationError("purchases", e),
  });

  const refreshAll = useCallback(async () => {
    await purchasesQ.refetch();
  }, [purchasesQ]);

  const openCreate = () => {
    if (stores.length === 0) {
      toast.info("Aucune boutique.");
      return;
    }
    if (!canCreate) {
      toast.info("Vous n'avez pas le droit de créer des achats.");
      return;
    }
    setCreateOpen(true);
  };

  const errMsg = purchasesQ.isError
    ? purchasesQ.error instanceof Error
      ? purchasesQ.error.message
      : "Erreur de chargement"
    : null;

  if (permLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if (!canAccess) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <MdLock className="h-16 w-16 text-red-500" aria-hidden />
          <p className="text-base text-fs-text">Vous n&apos;avez pas accès à cette page.</p>
        </div>
      </FsPage>
    );
  }

  if (!companyId) {
    return (
      <FsPage>
        <h1 className="text-[22px] font-bold tracking-[-0.4px] text-fs-text min-[700px]:text-2xl">
          Achats
        </h1>
        <p className="mt-6 text-center text-base text-neutral-600">Sélectionnez une entreprise.</p>
      </FsPage>
    );
  }

  return (
    <FsPage className="px-5 pt-5 min-[700px]:px-8 min-[700px]:pt-7">
      {/* Flutter : Row titre + FilledButton, puis 8px, puis sous-titre, puis 20px, puis Wrap filtres (spacing 12, runSpacing 8). */}
      <div className="mb-5 space-y-2">
        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <h1 className="min-w-0 text-[22px] font-bold tracking-[-0.4px] text-fs-text min-[700px]:text-2xl">
            Achats
          </h1>
          {canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99] min-[420px]:w-auto"
            >
              <MdAdd className="h-[18px] w-[18px]" aria-hidden />
              Nouveau achat
            </button>
          ) : null}
        </div>
        <p className="text-sm leading-relaxed text-neutral-600">
          Voir, modifier, annuler ou supprimer les achats.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-x-3 gap-y-2">
        <div className="w-full min-[480px]:min-w-[11rem] min-[480px]:max-w-[min(100%,14rem)] min-[480px]:flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Boutique</label>
          <select
            className={fsInputClass("min-h-[44px] rounded-[10px]")}
            aria-label="Boutique"
            value={filterStoreId ?? ""}
            onChange={(e) => setFilterStoreId(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">Toutes</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full min-[480px]:min-w-[11rem] min-[480px]:max-w-[min(100%,14rem)] min-[480px]:flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Fournisseur</label>
          <select
            className={fsInputClass("min-h-[44px] rounded-[10px]")}
            aria-label="Fournisseur"
            value={filterSupplierId ?? ""}
            onChange={(e) => setFilterSupplierId(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">Tous</option>
            {(suppliersQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full min-[480px]:min-w-[11rem] min-[480px]:max-w-[min(100%,14rem)] min-[480px]:flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Statut</label>
          <select
            className={fsInputClass("min-h-[44px] rounded-[10px]")}
            aria-label="Statut"
            value={status}
            onChange={(e) => setStatus(e.target.value as PurchaseStatus | "all")}
          >
            <option value="all">Tous</option>
            <option value="draft">Brouillon</option>
            <option value="confirmed">Confirmé</option>
            <option value="partially_received">Part. reçu</option>
            <option value="received">Reçu</option>
            <option value="cancelled">Annulé</option>
          </select>
        </div>
      </div>

      <FsPullToRefresh onRefresh={refreshAll}>
        {errMsg ? (
          <FsCard className="mb-6 rounded-xl border border-red-300/60 bg-red-50/80 dark:bg-red-950/30" padding="p-4">
            <div className="flex gap-3">
              <MdErrorOutline className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
              <p className="text-sm text-red-900 dark:text-red-100">{errMsg}</p>
            </div>
          </FsCard>
        ) : null}

        {purchasesQ.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          </div>
        ) : null}

        {!purchasesQ.isLoading && !purchasesQ.isError && rows.length === 0 ? (
          <FsCard padding="px-4 py-12 sm:px-6 sm:py-16">
            <p className="text-center text-base text-neutral-600">Aucun achat.</p>
          </FsCard>
        ) : null}

        {!purchasesQ.isLoading && !purchasesQ.isError && rows.length > 0 ? (
          <>
            <FsCard className="overflow-hidden p-0" padding="p-0">
              <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] touch-pan-x">
                <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/6 bg-fs-surface-container/80">
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Réf.</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Date</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Boutique</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Fournisseur</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Total</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Statut</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((r: PurchaseListItem) => (
                      <tr key={r.id} className="border-b border-black/4 last:border-0">
                        <td className="max-w-[140px] truncate px-4 py-3">{r.reference ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                          {formatPurchaseDate(r.createdAt)}
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-3">{r.storeName || "—"}</td>
                        <td className="max-w-[180px] truncate px-4 py-3">{r.supplierName}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium">
                          {formatCurrency(r.total)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">{statusLabel(r.status)}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setDetailId(r.id);
                                setDetailOpen(true);
                              }}
                              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-2 text-xs font-semibold text-fs-accent hover:bg-fs-accent/10 active:bg-fs-accent/15 sm:text-sm"
                            >
                              Voir
                            </button>
                            {r.status === "draft" && canManage ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDetailId(r.id);
                                    setDetailOpen(true);
                                  }}
                                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-2 text-xs font-semibold text-fs-accent hover:bg-fs-accent/10 active:bg-fs-accent/15 sm:text-sm"
                                >
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCancelTarget({
                                      id: r.id,
                                      label: r.reference ?? r.id,
                                    })
                                  }
                                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-2 text-xs font-semibold text-fs-accent hover:bg-fs-surface-container sm:text-sm"
                                >
                                  Annuler
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteTarget({
                                      id: r.id,
                                      label: r.reference ?? r.id,
                                    })
                                  }
                                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-2 text-xs font-semibold text-red-600 hover:bg-red-50 sm:text-sm"
                                >
                                  Supprimer
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FsCard>

            {pageCount > 1 ? (
              <FsCard className="mt-4" padding="px-4 py-3">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                  {!isPaginationNarrow ? (
                    <span className="mr-2 text-xs text-neutral-600">
                      {safePage * PURCHASES_PAGE_SIZE + 1} –{" "}
                      {Math.min((safePage + 1) * PURCHASES_PAGE_SIZE, totalCount)} sur {totalCount}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={safePage <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40",
                      safePage > 0 ? "bg-fs-accent" : "bg-neutral-300 dark:bg-neutral-600",
                    )}
                    aria-label="Page précédente"
                  >
                    <MdChevronLeft className="h-7 w-7" aria-hidden />
                  </button>
                  <span className="text-sm font-semibold text-fs-text">
                    Page {safePage + 1}
                    {" / "}
                    {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40",
                      safePage < pageCount - 1 ? "bg-fs-accent" : "bg-neutral-300 dark:bg-neutral-600",
                    )}
                    aria-label="Page suivante"
                  >
                    <MdChevronRight className="h-7 w-7" aria-hidden />
                  </button>
                  {isPaginationNarrow ? (
                    <span className="w-full text-center text-xs text-neutral-600 sm:w-auto">
                      {safePage * PURCHASES_PAGE_SIZE + 1} –{" "}
                      {Math.min((safePage + 1) * PURCHASES_PAGE_SIZE, totalCount)}
                      {" / "}
                      {totalCount}
                    </span>
                  ) : null}
                </div>
              </FsCard>
            ) : null}
          </>
        ) : null}
      </FsPullToRefresh>

      <CreatePurchaseDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        stores={stores}
        initialStoreId={ctxStoreId}
        suppliers={suppliersQ.data ?? []}
        products={productsQ.data ?? []}
        productsLoading={productsQ.isLoading}
        productsError={productsQ.isError ? productsQ.error : undefined}
        onCreate={async (payload: CreatePurchasePayload) => {
          await createMut.mutateAsync(payload);
        }}
      />

      <PurchaseDetailDialog
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailId(null);
        }}
        detail={(detailQ.data ?? null) as PurchaseDetail | null}
        canManage={detailQ.data?.status === "draft" && canManage}
        onSaveReference={async (reference) => {
          if (!detailId) return;
          await saveRefMut.mutateAsync({ id: detailId, reference });
        }}
        onCancelDraft={async () => {
          const id = detailId;
          const label =
            detailQ.data?.reference ??
            rows.find((x) => x.id === id)?.reference ??
            id ??
            "";
          setDetailOpen(false);
          setDetailId(null);
          if (id) setCancelTarget({ id, label });
        }}
        onDeleteDraft={async () => {
          const id = detailId;
          const label =
            detailQ.data?.reference ??
            rows.find((x) => x.id === id)?.reference ??
            id ??
            "";
          setDetailOpen(false);
          setDetailId(null);
          if (id) setDeleteTarget({ id, label });
        }}
      />

      <ConfirmCancelPurchaseDialog
        open={cancelTarget != null}
        referenceOrId={cancelTarget?.label ?? ""}
        busy={cancelMut.isPending}
        onCancel={() => {
          if (!cancelMut.isPending) setCancelTarget(null);
        }}
        onConfirm={() => {
          if (!cancelTarget) return;
          cancelMut.mutate(cancelTarget.id, { onSuccess: () => setCancelTarget(null) });
        }}
      />

      <ConfirmDeletePurchaseDialog
        open={deleteTarget != null}
        referenceOrId={deleteTarget?.label ?? ""}
        busy={deleteMut.isPending}
        onCancel={() => {
          if (!deleteMut.isPending) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMut.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
      />
    </FsPage>
  );
}
