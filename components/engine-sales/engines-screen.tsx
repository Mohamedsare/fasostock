"use client";

import { EngineSaleDetailDialog } from "@/components/engine-sales/engine-sale-detail-dialog";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { FsCard, FsPage } from "@/components/ui/fs-screen-primitives";
import { P } from "@/lib/constants/permissions";
import { storeEngineSalePath, engineSaleVerifyPath } from "@/lib/config/routes";
import { deleteEngineSale, listEngineSales } from "@/lib/features/engine-sales/api";
import {
  downloadEngineInvoice,
  printEngineInvoice,
} from "@/lib/features/engine-sales/invoice-actions";
import { cancelSale } from "@/lib/features/sales/api";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  MdDeleteOutline,
  MdDescription,
  MdDownload,
  MdOutlineBlock,
  MdOutlineVisibility,
  MdPrint,
  MdTwoWheeler,
  MdVerified,
} from "react-icons/md";

function formatDate(iso: string): string {
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
    return iso.slice(0, 16);
  }
}

function StatusBadge({ status }: { status: string }) {
  const cancelled = status === "cancelled";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        cancelled
          ? "bg-neutral-100 text-neutral-500"
          : "bg-emerald-50 text-emerald-700",
      )}
    >
      {cancelled ? "Annulée" : "Validée"}
    </span>
  );
}

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 transition-colors";

export function EnginesScreen() {
  const qc = useQueryClient();
  const { data: ctx, helpers, hasPermission, isLoading } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const currentStoreId = ctx?.storeId ?? null;
  const stores = useMemo(() => ctx?.stores ?? [], [ctx?.stores]);
  const canCancel = hasPermission(P.salesCancel) || Boolean(helpers?.isOwner);
  const canEdit = hasPermission(P.salesUpdate) || Boolean(helpers?.isOwner);
  const canDelete = Boolean(helpers?.isOwner);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ number: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<{ id: string; kind: "print" | "download" } | null>(
    null,
  );

  async function doPrint(saleId: string) {
    try {
      setActionBusy({ id: saleId, kind: "print" });
      await printEngineInvoice(saleId);
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Impression impossible."));
    } finally {
      setActionBusy(null);
    }
  }
  async function doDownload(saleId: string, label: string) {
    try {
      setActionBusy({ id: saleId, kind: "download" });
      await downloadEngineInvoice(saleId, label);
      toast.success("Téléchargement lancé");
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Téléchargement impossible."));
    } finally {
      setActionBusy(null);
    }
  }

  // La boutique courante doit avoir le module activé (sinon vue « toutes »
  // n'autorise que si au moins une l'a — cf. helpers.canEngineSales).
  const activeStore = stores.find((s) => s.id === currentStoreId);
  const storeEngineOn = currentStoreId
    ? activeStore?.engineSalesEnabled === true
    : stores.some((s) => s.engineSalesEnabled === true);

  const canCreate =
    hasPermission(P.salesInvoiceA4) || hasPermission(P.salesCreate) || hasPermission(P.salesUpdate);

  const listQ = useQuery({
    queryKey: queryKeys.engineSales({ companyId, storeId: currentStoreId }),
    queryFn: () => listEngineSales({ companyId, storeId: currentStoreId }),
    enabled: Boolean(companyId) && storeEngineOn,
    refetchInterval: 15_000,
  });

  const cancelMut = useMutation({
    mutationFn: (saleId: string) => cancelSale(saleId),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: queryKeys.engineSales({ companyId, storeId: currentStoreId }),
      });
      // Le stock est restitué à l'annulation.
      if (currentStoreId) {
        await qc.invalidateQueries({ queryKey: queryKeys.productInventory(currentStoreId) });
      }
      toast.success("Vente annulée · stock restitué");
      setCancelTarget(null);
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Annulation impossible.")),
  });

  const deleteMut = useMutation({
    mutationFn: (saleNumber: string) => deleteEngineSale({ companyId, saleNumber }),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: queryKeys.engineSales({ companyId, storeId: currentStoreId }),
      });
      toast.success("Vente supprimée définitivement");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Suppression impossible.")),
  });

  if (isLoading) {
    return (
      <FsPage className="flex min-h-0 flex-1 flex-col px-5 pt-4 sm:px-5 min-[900px]:px-7 min-[900px]:pt-7">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if (!helpers?.canEngineSales || !storeEngineOn) {
    return (
      <FsPage className="flex min-h-0 flex-1 flex-col px-5 pt-4 sm:px-5 min-[900px]:px-7 min-[900px]:pt-7">
        <FsCard className="mt-6" padding="p-8">
          <p className="text-center text-base text-neutral-600">
            Le module « Vente Engins » n&apos;est pas activé pour cette boutique.
          </p>
        </FsCard>
      </FsPage>
    );
  }

  const rows = listQ.data ?? [];
  const createHref = currentStoreId && canCreate ? storeEngineSalePath(currentStoreId) : null;

  return (
    <FsPage className="flex min-h-0 flex-1 flex-col px-5 pt-4 sm:px-5 min-[900px]:px-7 min-[900px]:pt-7">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <MdTwoWheeler className="h-7 w-7 text-fs-accent" aria-hidden />
          <h1 className="text-xl font-bold text-fs-text min-[900px]:text-2xl">Vente Engins</h1>
        </div>

        <div className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3 min-[900px]:grid-cols-4">
          {createHref ? (
            <Link
              href={createHref}
              className="touch-manipulation block min-h-[88px] rounded-xl border-2 border-[color-mix(in_srgb,var(--fs-accent)_40%,transparent)] bg-fs-card shadow-sm transition-transform active:scale-[0.99] max-[599px]:p-4 min-[600px]:p-6"
            >
              <div className="flex min-h-[88px] flex-col items-center justify-center text-center">
                <div className="mb-2.5 flex items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)] p-2.5 text-[var(--fs-accent)] min-[600px]:mb-3.5 min-[600px]:p-3.5">
                  <MdDescription className="h-7 w-7 min-[600px]:h-8 min-[600px]:w-8" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold leading-tight text-fs-text min-[600px]:text-base">
                  Facture A4
                </h3>
                <p className="mt-1 line-clamp-1 text-xs text-neutral-600">Vente d&apos;engin</p>
              </div>
            </Link>
          ) : (
            <div className="min-h-[88px] rounded-xl border border-black/[0.06] bg-fs-card p-6 opacity-70">
              <p className="text-center text-xs text-neutral-500">
                Sélectionnez une boutique pour enregistrer une vente.
              </p>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-fs-text">Historique des ventes d&apos;engins</h2>
          {listQ.isLoading ? (
            <FsCard padding="p-8">
              <div className="flex justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
              </div>
            </FsCard>
          ) : rows.length === 0 ? (
            <FsCard padding="px-4 py-12">
              <p className="text-center text-base text-neutral-600">Aucune vente d&apos;engin.</p>
            </FsCard>
          ) : (
            <FsCard className="overflow-hidden p-0" padding="p-0">
              <FsHorizontalScroll className="touch-pan-x">
                <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/6 bg-fs-surface-container/80">
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Réf.</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Date</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Client</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Engin</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Statut</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Total</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.saleId} className="border-b border-black/4 last:border-0">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-fs-text">
                          {r.saleNumber}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                          {formatDate(r.createdAt)}
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-3">
                          {r.clientName || "—"}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3">
                          {r.engineDesignation || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-4 py-3 text-right font-bold",
                            r.status === "cancelled"
                              ? "text-neutral-400 line-through"
                              : "text-fs-accent",
                          )}
                        >
                          {formatCurrency(r.total)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailId(r.saleId)}
                              title="Voir le détail"
                              aria-label="Voir le détail"
                              className={cn(iconBtn, "hover:bg-fs-accent/10 hover:text-fs-accent")}
                            >
                              <MdOutlineVisibility className="h-5 w-5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => doPrint(r.saleId)}
                              disabled={actionBusy !== null}
                              title="Imprimer"
                              aria-label="Imprimer la facture"
                              className={cn(iconBtn, "hover:bg-fs-accent/10 hover:text-fs-accent disabled:opacity-50")}
                            >
                              {actionBusy?.id === r.saleId && actionBusy.kind === "print" ? (
                                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
                              ) : (
                                <MdPrint className="h-5 w-5" aria-hidden />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => doDownload(r.saleId, r.saleNumber)}
                              disabled={actionBusy !== null}
                              title="Télécharger"
                              aria-label="Télécharger la facture"
                              className={cn(iconBtn, "hover:bg-fs-accent/10 hover:text-fs-accent disabled:opacity-50")}
                            >
                              {actionBusy?.id === r.saleId && actionBusy.kind === "download" ? (
                                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
                              ) : (
                                <MdDownload className="h-5 w-5" aria-hidden />
                              )}
                            </button>
                            {r.verificationToken ? (
                              <Link
                                href={engineSaleVerifyPath(r.verificationToken)}
                                target="_blank"
                                title="Page de vérification"
                                className={cn(iconBtn, "hover:bg-emerald-50 hover:text-emerald-600")}
                              >
                                <MdVerified className="h-5 w-5" aria-hidden />
                              </Link>
                            ) : null}
                            {r.status !== "cancelled" && canCancel ? (
                              <button
                                type="button"
                                onClick={() => setCancelTarget({ id: r.saleId, label: r.saleNumber })}
                                title="Annuler la vente"
                                aria-label="Annuler la vente"
                                className={cn(iconBtn, "hover:bg-amber-50 hover:text-amber-600")}
                              >
                                <MdOutlineBlock className="h-5 w-5" aria-hidden />
                              </button>
                            ) : null}
                            {r.status === "cancelled" && canDelete ? (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ number: r.saleNumber })}
                                title="Supprimer définitivement"
                                aria-label="Supprimer définitivement"
                                className={cn(iconBtn, "hover:bg-red-50 hover:text-red-600")}
                              >
                                <MdDeleteOutline className="h-5 w-5" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </FsHorizontalScroll>
            </FsCard>
          )}
        </div>
      </div>

      {cancelTarget ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !cancelMut.isPending) setCancelTarget(null);
          }}
        >
          <FsCard className="w-full max-w-md" padding="p-4 sm:p-5">
            <h2 className="text-base font-bold text-fs-text">Annuler la vente</h2>
            <p className="mt-3 text-sm text-neutral-600">
              Annuler la vente {cancelTarget.label} ? Le stock de l&apos;engin sera restitué. Cette
              action est définitive.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!cancelMut.isPending) setCancelTarget(null);
                }}
                disabled={cancelMut.isPending}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-fs-accent"
              >
                Non
              </button>
              <button
                type="button"
                onClick={() => cancelMut.mutate(cancelTarget.id)}
                disabled={cancelMut.isPending}
                className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {cancelMut.isPending ? "…" : "Oui, annuler"}
              </button>
            </div>
          </FsCard>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleteMut.isPending) setDeleteTarget(null);
          }}
        >
          <FsCard className="w-full max-w-md" padding="p-4 sm:p-5">
            <h2 className="text-base font-bold text-fs-text">Supprimer la vente</h2>
            <p className="mt-3 text-sm text-neutral-600">
              Supprimer définitivement la vente annulée {deleteTarget.number} ? Cette action est
              irréversible.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!deleteMut.isPending) setDeleteTarget(null);
                }}
                disabled={deleteMut.isPending}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-fs-accent"
              >
                Non
              </button>
              <button
                type="button"
                onClick={() => deleteMut.mutate(deleteTarget.number)}
                disabled={deleteMut.isPending}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleteMut.isPending ? "…" : "Supprimer"}
              </button>
            </div>
          </FsCard>
        </div>
      ) : null}

      <EngineSaleDetailDialog
        open={detailId != null}
        saleId={detailId}
        companyId={companyId}
        currentStoreFilterId={currentStoreId}
        canEdit={canEdit}
        onClose={() => setDetailId(null)}
      />
    </FsPage>
  );
}
