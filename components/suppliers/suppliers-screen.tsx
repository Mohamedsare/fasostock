"use client";

import { SupplierFormDialog } from "@/components/suppliers/supplier-form-dialog";
import {
  FsCard,
  FsQueryErrorPanel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { P } from "@/lib/constants/permissions";
import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  updateSupplier,
} from "@/lib/features/suppliers/api";
import type { Supplier } from "@/lib/features/suppliers/types";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { queryKeys } from "@/lib/query/query-keys";
import { formatUnknownErrorMessage } from "@/lib/utils/format-unknown-error";
import { cn } from "@/lib/utils/cn";
import { toast, toastMutationError } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MdAdd,
  MdBusinessCenter,
  MdDeleteOutline,
  MdEdit,
  MdEmail,
  MdErrorOutline,
  MdLock,
  MdLocationOn,
  MdPersonOutline,
  MdPhone,
  MdChevronLeft,
  MdChevronRight,
} from "react-icons/md";

const PAGE_SIZE = 20;
const DESCRIPTION = "Gérer vos fournisseurs";

function DeleteSupplierDialog({
  open,
  name,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-supplier-title"
    >
      <FsCard className="w-full max-w-md shadow-xl" padding="p-4 sm:p-5">
        <h2 id="delete-supplier-title" className="text-base font-bold text-fs-text">
          Supprimer le fournisseur
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          Supprimer « {name} » ? Cette action est irréversible.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-neutral-800"
          >
            Annuler
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

function SupplierCard({
  supplier,
  canManage,
  onEdit,
  onDelete,
}: {
  supplier: Supplier;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <FsCard className="overflow-hidden p-0" padding="p-0">
      <div className="p-4">
        <div className="flex gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px]",
              "bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)]",
            )}
          >
            <MdBusinessCenter className="h-6 w-6 text-fs-accent" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-base font-bold text-fs-text">{supplier.name}</p>
          </div>
        </div>
        {supplier.contact ? (
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-600">
            <MdPersonOutline className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{supplier.contact}</span>
          </div>
        ) : null}
        {supplier.phone ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-600">
            <MdPhone className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{supplier.phone}</span>
          </div>
        ) : null}
        {supplier.email ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-600">
            <MdEmail className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{supplier.email}</span>
          </div>
        ) : null}
        {supplier.address ? (
          <div className="mt-1.5 flex items-start gap-1.5 text-xs text-neutral-600">
            <MdLocationOn className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-2">{supplier.address}</span>
          </div>
        ) : null}
        {canManage ? (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-fs-accent hover:bg-fs-surface-container"
            >
              <MdEdit className="h-[18px] w-[18px]" aria-hidden />
              Modifier
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-red-600 hover:bg-fs-surface-container"
            >
              <MdDeleteOutline className="h-[18px] w-[18px]" aria-hidden />
              Supprimer
            </button>
          </div>
        ) : null}
      </div>
    </FsCard>
  );
}

export function SuppliersScreen() {
  const qc = useQueryClient();
  const appCtx = useAppContext();
  const { hasPermission } = usePermissions();

  const canView = hasPermission(P.suppliersView) || hasPermission(P.suppliersManage);
  const canManage = hasPermission(P.suppliersManage);

  const companyId = appCtx.data?.companyId ?? "";
  const ctxLoading = appCtx.isLoading;
  const ctxError = appCtx.isError;
  const ctxErr = appCtx.error;

  const isWide = useMediaQuery("(min-width: 900px)");
  const isNarrowHeader = !useMediaQuery("(min-width: 560px)");
  const isPaginationNarrow = !useMediaQuery("(min-width: 500px)");

  const suppliersQ = useQuery({
    queryKey: queryKeys.suppliers(companyId),
    queryFn: () => listSuppliers(companyId),
    enabled: Boolean(companyId) && canView && !ctxLoading,
    staleTime: 20_000,
  });

  const rows = suppliersQ.data ?? [];
  const [currentPage, setCurrentPage] = useState(0);
  const syncOnceRef = useRef(false);

  const totalCount = rows.length;
  const pageCount = totalCount === 0 ? 0 : Math.floor((totalCount - 1) / PAGE_SIZE) + 1;
  const safePage = pageCount > 0 ? Math.min(currentPage, pageCount - 1) : 0;

  const paginated = useMemo(() => {
    return rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  }, [rows, safePage]);

  useEffect(() => {
    if (pageCount > 0 && currentPage >= pageCount) {
      setCurrentPage(pageCount - 1);
    }
  }, [currentPage, pageCount]);

  const refetchSuppliers = suppliersQ.refetch;
  useEffect(() => {
    if (!companyId || suppliersQ.isLoading || rows.length > 0 || syncOnceRef.current) return;
    syncOnceRef.current = true;
    void refetchSuppliers();
  }, [companyId, suppliersQ.isLoading, rows.length, refetchSuppliers]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const createMut = useMutation({
    mutationFn: async (payload: {
      name: string;
      contact: string;
      phone: string;
      email: string;
      address: string;
      notes: string;
    }) =>
      createSupplier(companyId, {
        name: payload.name,
        contact: payload.contact || null,
        phone: payload.phone || null,
        email: payload.email || null,
        address: payload.address || null,
        notes: payload.notes || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.suppliers(companyId) });
      toast.success("Fournisseur créé");
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  const updateMut = useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      contact: string;
      phone: string;
      email: string;
      address: string;
      notes: string;
    }) =>
      updateSupplier(payload.id, {
        name: payload.name,
        contact: payload.contact || null,
        phone: payload.phone || null,
        email: payload.email || null,
        address: payload.address || null,
        notes: payload.notes || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.suppliers(companyId) });
      toast.success("Fournisseur mis à jour");
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteSupplier(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.suppliers(companyId) });
      toast.success("Fournisseur supprimé");
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  if (ctxLoading && !appCtx.data) {
    return (
      <div className="min-w-0 px-5 pt-5 max-[1023px]:pb-6 min-[900px]:px-8 min-[1024px]:pb-10 min-[900px]:pt-7">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="min-w-0 px-5 pt-5 max-[1023px]:pb-6 min-[900px]:px-8 min-[1024px]:pb-10 min-[900px]:pt-7">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <MdLock className="h-16 w-16 text-red-500" aria-hidden />
          <p className="text-sm font-medium text-fs-text">Vous n&apos;avez pas accès à cette page.</p>
        </div>
      </div>
    );
  }

  if (ctxError) {
    return (
      <div className="min-w-0 px-5 pt-5 max-[1023px]:pb-6 min-[900px]:px-8 min-[1024px]:pb-10 min-[900px]:pt-7">
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
          <FsQueryErrorPanel error={ctxErr} onRetry={() => void appCtx.refetch()} />
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="min-w-0 px-5 pt-5 max-[1023px]:pb-6 min-[900px]:px-8 min-[1024px]:pb-10 min-[900px]:pt-7">
        <div className="flex min-h-[40vh] items-center justify-center px-4 text-center">
          <p className="text-sm text-fs-text">
            Aucune entreprise. Contactez l&apos;administrateur.
          </p>
        </div>
      </div>
    );
  }

  const streamError =
    suppliersQ.isError && suppliersQ.error
      ? formatUnknownErrorMessage(suppliersQ.error)
      : null;

  return (
    <div className="min-w-0 px-5 pt-5 max-[1023px]:pb-6 min-[900px]:px-8 min-[1024px]:pb-10 min-[900px]:pt-7">
      {isNarrowHeader ? (
        <div className="mb-6">
          <h1 className="text-[22px] font-bold tracking-tight text-fs-text sm:text-2xl">
            Fournisseurs
          </h1>
          <p className="mt-1 text-sm text-neutral-600">{DESCRIPTION}</p>
          {canManage ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
            >
              <MdAdd className="h-5 w-5" aria-hidden />
              Nouveau fournisseur
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mb-6 flex flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-fs-text min-[900px]:text-[22px]">
              Fournisseurs
            </h1>
            <p className="mt-1 text-sm text-neutral-600">{DESCRIPTION}</p>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
            >
              <MdAdd className="h-5 w-5" aria-hidden />
              Nouveau fournisseur
            </button>
          ) : null}
        </div>
      )}

      {streamError ? (
        <div className="mb-6">
          <div
            className="rounded-xl border border-red-500/50 bg-red-500/10 p-4 dark:bg-red-950/30"
            role="alert"
          >
            <div className="flex gap-3">
              <MdErrorOutline className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-red-900 dark:text-red-100">{streamError}</p>
            </div>
          </div>
        </div>
      ) : null}

      {suppliersQ.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : null}

      {!suppliersQ.isLoading && !suppliersQ.isError && rows.length === 0 ? (
        <FsCard padding="py-16 px-6 sm:py-16">
          <div className="flex flex-col items-center text-center">
            <div
              className={cn(
                "flex h-28 w-28 items-center justify-center rounded-full",
                "bg-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)]",
              )}
            >
              <MdBusinessCenter className="h-14 w-14 text-fs-accent" aria-hidden />
            </div>
            <p className="mt-6 text-base text-neutral-600">Aucun fournisseur.</p>
          </div>
        </FsCard>
      ) : null}

      {!suppliersQ.isLoading && !suppliersQ.isError && rows.length > 0 ? (
        <>
          {isWide ? (
            <FsCard className="overflow-x-auto p-0" padding="p-0">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] bg-fs-surface-container/80">
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-fs-text">Nom</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-fs-text">Contact</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-fs-text">
                      Téléphone
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-fs-text">Email</th>
                    {canManage ? (
                      <th className="whitespace-nowrap px-4 py-3 font-semibold text-fs-text">
                        Actions
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((s) => (
                    <tr key={s.id} className="border-b border-black/[0.04] last:border-0">
                      <td className="max-w-[220px] truncate px-4 py-3 font-medium text-fs-text">
                        {s.name}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-neutral-700">
                        {s.contact ?? "—"}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-neutral-700">
                        {s.phone ?? "—"}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-neutral-700">
                        {s.email ?? "—"}
                      </td>
                      {canManage ? (
                        <td className="whitespace-nowrap px-4 py-2">
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(s);
                                setFormOpen(true);
                              }}
                              className="rounded-lg p-2 text-fs-accent hover:bg-fs-surface-container"
                              aria-label="Modifier"
                            >
                              <MdEdit className="h-5 w-5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(s)}
                              className="rounded-lg p-2 text-red-600 hover:bg-fs-surface-container"
                              aria-label="Supprimer"
                            >
                              <MdDeleteOutline className="h-5 w-5" aria-hidden />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </FsCard>
          ) : (
            <div className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-2">
              {paginated.map((s) => (
                <SupplierCard
                  key={s.id}
                  supplier={s}
                  canManage={canManage}
                  onEdit={() => {
                    setEditing(s);
                    setFormOpen(true);
                  }}
                  onDelete={() => setDeleteTarget(s)}
                />
              ))}
            </div>
          )}

          {pageCount > 1 ? (
            <FsCard className="mt-4" padding="px-4 py-3 sm:py-3">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                {!isPaginationNarrow ? (
                  <span className="mr-2 text-xs text-neutral-600">
                    {safePage * PAGE_SIZE + 1} –{" "}
                    {Math.min((safePage + 1) * PAGE_SIZE, totalCount)} sur {totalCount}
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={safePage <= 0}
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
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
                  onClick={() => setCurrentPage((p) => Math.min(pageCount - 1, p + 1))}
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
                    {safePage * PAGE_SIZE + 1} – {Math.min((safePage + 1) * PAGE_SIZE, totalCount)}
                    {" / "}
                    {totalCount}
                  </span>
                ) : null}
              </div>
            </FsCard>
          ) : null}
        </>
      ) : null}

      <SupplierFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        variant={editing ? "edit" : "create"}
        initialValue={
          editing
            ? {
                name: editing.name,
                contact: editing.contact ?? "",
                phone: editing.phone ?? "",
                email: editing.email ?? "",
                address: editing.address ?? "",
                notes: editing.notes ?? "",
              }
            : null
        }
        onSubmit={async (value) => {
          if (!companyId) throw new Error("Entreprise manquante.");
          if (editing) {
            await updateMut.mutateAsync({ id: editing.id, ...value });
          } else {
            await createMut.mutateAsync(value);
          }
        }}
      />

      <DeleteSupplierDialog
        open={deleteTarget != null}
        name={deleteTarget?.name ?? ""}
        busy={deleteMut.isPending}
        onCancel={() => {
          if (!deleteMut.isPending) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          deleteMut.mutate(id, {
            onSuccess: () => setDeleteTarget(null),
          });
        }}
      />
    </div>
  );
}
