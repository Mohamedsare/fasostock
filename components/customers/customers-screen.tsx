"use client";

import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import {
  FsCard,
  FsFab,
  FsPage,
  FsQueryErrorPanel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { P } from "@/lib/constants/permissions";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
} from "@/lib/features/customers/api";
import { customersToSpreadsheetMatrix } from "@/lib/features/customers/csv";
import type { Customer } from "@/lib/features/customers/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { queryKeys } from "@/lib/query/query-keys";
import { downloadProSpreadsheet } from "@/lib/utils/spreadsheet-export-pro";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  MdAdd,
  MdBusiness,
  MdChevronLeft,
  MdChevronRight,
  MdDeleteOutline,
  MdDownload,
  MdEdit,
  MdEmail,
  MdLocationOn,
  MdLock,
  MdPerson,
  MdPhone,
  MdSearch,
} from "react-icons/md";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";

const PAGE_SIZE = 20;

const DESCRIPTION = "Gérer vos clients (particuliers et entreprises)";

function typeLabel(t: Customer["type"]): string {
  return t === "company" ? "Entreprise" : "Particulier";
}

function DeleteCustomerDialog({
  open,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
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
      aria-labelledby="delete-customer-title"
    >
      <FsCard className="w-full max-w-md shadow-xl" padding="p-4 sm:p-5">
        <h2 id="delete-customer-title" className="text-base font-bold text-fs-text">
          Supprimer ce client ?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          Cette action est irréversible. Les ventes liées à ce client ne seront pas supprimées (le
          client sera simplement retiré).
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

function CustomerCard({
  customer,
  canDelete,
  onEdit,
  onDelete,
}: {
  customer: Customer;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCompany = customer.type === "company";
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
            {isCompany ? (
              <MdBusiness className="h-6 w-6 text-fs-accent" aria-hidden />
            ) : (
              <MdPerson className="h-6 w-6 text-fs-accent" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-base font-bold text-fs-text">{customer.name}</p>
            <span className="mt-0.5 inline-block rounded bg-fs-surface-container px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">
              {typeLabel(customer.type)}
            </span>
          </div>
        </div>
        {customer.phone ? (
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-600">
            <MdPhone className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{customer.phone}</span>
          </div>
        ) : null}
        {customer.email ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-600">
            <MdEmail className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{customer.email}</span>
          </div>
        ) : null}
        {customer.address ? (
          <div className="mt-1.5 flex items-start gap-1.5 text-xs text-neutral-600">
            <MdLocationOn className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-2">{customer.address}</span>
          </div>
        ) : null}
      </div>
      <div className="flex border-t border-black/[0.06]">
        <button
          type="button"
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold text-fs-accent active:bg-fs-surface-container"
        >
          <MdEdit className="h-5 w-5" aria-hidden />
          Modifier
        </button>
        {canDelete ? (
          <>
            <div className="w-px bg-black/[0.06]" aria-hidden />
            <button
              type="button"
              onClick={onDelete}
              className="flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold text-red-600 active:bg-fs-surface-container"
            >
              <MdDeleteOutline className="h-5 w-5" aria-hidden />
              Supprimer
            </button>
          </>
        ) : null}
      </div>
    </FsCard>
  );
}

export function CustomersScreen() {
  const qc = useQueryClient();
  const { data: ctx, isLoading: permLoading, hasPermission } = usePermissions();
  const companyId = ctx?.companyId ?? "";

  const canView = hasPermission(P.customersView) || hasPermission(P.customersManage);
  const canManage = hasPermission(P.customersManage);
  const canDeleteCustomer = canManage;

  const isWide = useMediaQuery("(min-width: 900px)");
  const isNarrowHeader = !useMediaQuery("(min-width: 560px)");
  const isPaginationNarrow = !useMediaQuery("(min-width: 500px)");

  const customersQ = useQuery({
    queryKey: queryKeys.customers(companyId),
    queryFn: () => listCustomers(companyId),
    enabled: Boolean(companyId) && canView,
    staleTime: 20_000,
  });

  const [q, setQ] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const rows = customersQ.data ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((c) => {
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.phone ?? "").toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle) ||
        (c.address ?? "").toLowerCase().includes(needle) ||
        (c.notes ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q]);

  const totalCount = filtered.length;
  const pageCount = totalCount === 0 ? 0 : Math.floor((totalCount - 1) / PAGE_SIZE) + 1;
  const safePage = pageCount > 0 ? Math.min(currentPage, pageCount - 1) : 0;
  const paginated = useMemo(() => {
    return filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setCurrentPage(0);
  }, [q]);

  useEffect(() => {
    if (pageCount > 0 && currentPage >= pageCount) {
      setCurrentPage(pageCount - 1);
    }
  }, [currentPage, pageCount]);

  const createMut = useMutation({
    mutationFn: async (payload: {
      name: string;
      type: "individual" | "company";
      phone: string;
      email: string;
      address: string;
      notes: string;
    }) =>
      createCustomer(companyId, {
        name: payload.name,
        type: payload.type,
        phone: payload.phone || null,
        email: payload.email || null,
        address: payload.address || null,
        notes: payload.notes || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.customers(companyId) });
      toast.success("Client créé");
    },
    onError: (e) => toastMutationError("customers", e),
  });

  const updateMut = useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      type: "individual" | "company";
      phone: string;
      email: string;
      address: string;
      notes: string;
    }) =>
      updateCustomer(payload.id, {
        name: payload.name,
        type: payload.type,
        phone: payload.phone || null,
        email: payload.email || null,
        address: payload.address || null,
        notes: payload.notes || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.customers(companyId) });
      toast.success("Client mis à jour");
    },
    onError: (e) => toastMutationError("customers", e),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteCustomer(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.customers(companyId) });
      toast.success("Client supprimé");
    },
    onError: (e) => toastMutationError("customers", e),
  });

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function exportExcel() {
    if (filtered.length === 0) return;
    void (async () => {
      try {
        const date = new Date().toISOString().slice(0, 10);
        const { headers, rows } = customersToSpreadsheetMatrix(filtered);
        await downloadProSpreadsheet(`clients-${date}.xlsx`, "Clients", headers, rows, {
          title: "FasoStock — Clients",
          subtitle: `${filtered.length} client(s) · ${date}`,
        });
        toast.success("Excel enregistré");
      } catch (e) {
        toast.error(messageFromUnknownError(e, "Export Excel impossible."));
      }
    })();
  }

  if (permLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if (!canView) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <MdLock className="h-16 w-16 text-red-500" aria-hidden />
          <p className="text-sm font-medium text-fs-text">Vous n&apos;avez pas accès à cette page.</p>
        </div>
      </FsPage>
    );
  }

  const showActionsRow = canManage || filtered.length > 0;

  return (
    <FsPage>
      {/* En-tête aligné Flutter : colonne &lt;560px, ligne sinon */}
      {isNarrowHeader ? (
        <div className="mb-6">
          <h1 className="text-[22px] font-bold tracking-tight text-fs-text sm:text-2xl">
            Clients
          </h1>
          <p className="mt-1 text-sm text-neutral-600">{DESCRIPTION}</p>
          {showActionsRow ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {filtered.length > 0 ? (
                <button
                  type="button"
                  onClick={exportExcel}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-fs-surface-container text-fs-text shadow-sm ring-1 ring-black/[0.06] active:scale-[0.98]"
                  aria-label="Exporter Excel"
                >
                  <MdDownload className="h-6 w-6" aria-hidden />
                </button>
              ) : null}
              {filtered.length > 0 && canManage ? <span className="w-2" aria-hidden /> : null}
              {canManage ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-fs-surface-container shadow-sm ring-1 ring-black/[0.06] active:scale-[0.98]"
                  style={{ color: "#FDBA74" }}
                  aria-label="Nouveau client"
                >
                  <MdAdd className="h-6 w-6" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mb-6 flex flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-fs-text min-[900px]:text-[22px]">
              Clients
            </h1>
            <p className="mt-1 text-sm text-neutral-600">{DESCRIPTION}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {filtered.length > 0 ? (
              <button
                type="button"
                onClick={exportExcel}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-fs-surface-container text-fs-text shadow-sm ring-1 ring-black/[0.06] active:scale-[0.98]"
                aria-label="Exporter Excel"
              >
                <MdDownload className="h-6 w-6" aria-hidden />
              </button>
            ) : null}
            {filtered.length > 0 && canManage ? <span className="w-0" aria-hidden /> : null}
            {canManage ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-fs-surface-container shadow-sm ring-1 ring-black/[0.06] active:scale-[0.98]"
                style={{ color: "#FDBA74" }}
                aria-label="Nouveau client"
              >
                <MdAdd className="h-6 w-6" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      )}

      {customersQ.isError ? (
        <div className="mb-6">
          <FsQueryErrorPanel error={customersQ.error} onRetry={() => void customersQ.refetch()} />
        </div>
      ) : null}

      <div className="relative mb-6">
        <MdSearch
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <input
          className={fsInputClass("rounded-xl pl-11")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par nom, téléphone, email..."
          aria-label="Rechercher des clients"
        />
      </div>

      {customersQ.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : null}

      {!customersQ.isLoading && !customersQ.isError && filtered.length === 0 ? (
        <FsCard padding="p-8 sm:p-16">
          <div className="flex flex-col items-center text-center">
            <div
              className={cn(
                "flex h-28 w-28 items-center justify-center rounded-full",
                "bg-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)]",
              )}
            >
              <MdPerson className="h-14 w-14 text-fs-accent" aria-hidden />
            </div>
            <p className="mt-6 text-lg font-bold text-fs-text">
              {q.trim() ? "Aucun résultat" : "Aucun client"}
            </p>
            <p className="mt-2 max-w-sm text-sm text-neutral-600">
              {q.trim()
                ? "Aucun client ne correspond à la recherche."
                : "Aucun client. Créez-en un pour commencer."}
            </p>
            {canManage && !q.trim() ? (
              <button
                type="button"
                onClick={openCreate}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-fs-accent px-5 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
              >
                <MdAdd className="h-5 w-5" aria-hidden />
                Créer un client
              </button>
            ) : null}
          </div>
        </FsCard>
      ) : null}

      {!customersQ.isLoading && !customersQ.isError && filtered.length > 0 ? (
        <>
          {isWide ? (
            <FsCard className="overflow-x-auto p-0" padding="p-0">
              <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] bg-fs-surface-container/80">
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-fs-text">Nom</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-fs-text">Type</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-fs-text">Tél.</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-fs-text">Email</th>
                    <th className="max-w-[180px] px-4 py-3 font-semibold text-fs-text">Adresse</th>
                    <th className="max-w-[160px] px-4 py-3 font-semibold text-fs-text">Notes</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-fs-text">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c) => (
                    <tr key={c.id} className="border-b border-black/[0.04] last:border-0">
                      <td className="max-w-[200px] truncate px-4 py-3 font-medium text-fs-text">
                        {c.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-700">{typeLabel(c.type)}</td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-neutral-700">
                        {c.phone ?? "—"}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-neutral-700">
                        {c.email ?? "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-xs text-neutral-600">
                        {c.address ?? "—"}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-xs text-neutral-500">
                        {c.notes ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(c);
                              setFormOpen(true);
                            }}
                            className="rounded-lg p-2 text-fs-accent hover:bg-fs-surface-container"
                            aria-label="Modifier"
                          >
                            <MdEdit className="h-5 w-5" aria-hidden />
                          </button>
                          {canDeleteCustomer ? (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(c)}
                              className="rounded-lg p-2 text-red-600 hover:bg-fs-surface-container"
                              aria-label="Supprimer"
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
            </FsCard>
          ) : (
            <div className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-2">
              {paginated.map((c) => (
                <CustomerCard
                  key={c.id}
                  customer={c}
                  canDelete={canDeleteCustomer}
                  onEdit={() => {
                    setEditing(c);
                    setFormOpen(true);
                  }}
                  onDelete={() => setDeleteTarget(c)}
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

      {canManage && rows.length > 0 ? (
        <FsFab
          ariaLabel="Nouveau client"
          onClick={openCreate}
          className="border border-black/[0.08] bg-fs-surface-container !text-[#FDBA74] shadow-lg"
        >
          <MdAdd className="h-7 w-7" aria-hidden />
        </FsFab>
      ) : null}

      <CustomerFormDialog
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
                type: editing.type,
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

      <DeleteCustomerDialog
        open={deleteTarget != null}
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
    </FsPage>
  );
}
