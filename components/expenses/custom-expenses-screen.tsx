"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAccountBalanceWallet,
  MdAdd,
  MdDeleteOutline,
  MdDownload,
  MdEdit,
  MdLock,
  MdPerson,
  MdReceiptLong,
  MdSearch,
  MdTune,
} from "react-icons/md";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  FsStickyMobileActions,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { createClient } from "@/lib/supabase/client";
import {
  createExpense,
  createExpenseCategory,
  deleteExpense,
  listExpenseCategories,
  listExpenses,
  renameExpenseCategory,
  setExpenseCategoryActive,
  updateExpense,
} from "@/lib/features/expenses/api";
import {
  expenseCategoryDisplay,
  type Expense,
  type ExpenseFormInput,
} from "@/lib/features/expenses/types";
import { paymentDisplay } from "@/lib/features/payments/payment-display";
import { SimpleExpenseFormDialog } from "@/components/expenses/simple-expense-form-dialog";
import { ExpenseCategoriesDialog } from "@/components/expenses/expense-categories-dialog";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";
import { downloadProSpreadsheet } from "@/lib/utils/spreadsheet-export-pro";
import {
  PERIODS,
  formatDmy,
  periodRange,
  type ExpensePeriod,
} from "@/components/expenses/expenses-period";

/**
 * Page Dépenses en mode « Personnaliser mes dépenses ».
 *
 * Ce que ce mode change, et pourquoi :
 *   • les onze catégories livrées d'usine disparaissent — seuls les postes créés
 *     par le propriétaire sont proposés. Sans quoi tout finit dans « Autre » et la
 *     question « où part mon argent ? » n'a plus de réponse ;
 *   • la saisie tombe à cinq champs (montant, catégorie, date, règlement, note) ;
 *   • chaque ligne affiche QUI l'a enregistrée : le droit de noter une sortie
 *     d'argent peut être accordé à un caissier, la trace suit.
 *
 * Rien n'est perdu à la bascule : les dépenses saisies en mode standard restent
 * dans la liste avec leur ancienne catégorie.
 */

function expenseToFormInput(e: Expense): ExpenseFormInput {
  return {
    category: e.category,
    categoryId: e.category_id,
    label: e.label ?? "",
    amount: e.amount,
    paymentMethod: e.payment_method,
    payee: e.payee ?? "",
    reference: e.reference ?? "",
    expenseDate: e.expense_date,
    storeId: e.store_id,
    notes: e.notes ?? "",
  };
}

function DeleteExpenseDialog({
  open,
  label,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  label: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
    >
      <FsCard className="w-full max-w-md rounded-lg shadow-xl sm:rounded-lg" padding="p-4 sm:p-5">
        <h2 className="text-base font-bold text-fs-text">Supprimer la dépense</h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          Supprimer « {label} » ? Cette action est irréversible.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-neutral-800"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "…" : "Supprimer"}
          </button>
        </div>
      </FsCard>
    </div>
  );
}

export function CustomExpensesScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h } = usePermissions();
  const companyId = ctx.data?.companyId ?? "";
  const ctxStoreId = ctx.data?.storeId ?? null;

  const canView = h?.canExpenses ?? false;
  const canManage = h?.canManageExpenses ?? false;
  const isOwner = h?.isOwner ?? false;

  const meQ = useQuery({
    queryKey: ["me-user-id"] as const,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    },
    staleTime: 60_000,
  });
  const myUserId = meQ.data ?? null;

  const [period, setPeriod] = useState<ExpensePeriod>("this_month");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const { from, to } = useMemo(() => periodRange(period), [period]);

  const listQ = useQuery({
    queryKey: queryKeys.expenses({ companyId, from, to }),
    queryFn: () => listExpenses(companyId, from, to),
    enabled: !!companyId && canView && !permLoading,
    staleTime: 20_000,
  });

  /** Tous les postes, archivés compris : l'historique doit rester lisible. */
  const categoriesQ = useQuery({
    queryKey: queryKeys.expenseCategories(companyId, true),
    queryFn: () => listExpenseCategories(companyId, { includeArchived: true }),
    enabled: !!companyId && canView && !permLoading,
    staleTime: 60_000,
  });

  const allCategories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const activeCategories = useMemo(
    () => allCategories.filter((c) => c.isActive),
    [allCategories],
  );
  const nameById = useMemo(
    () => new Map(allCategories.map((c) => [c.id, c.name] as const)),
    [allCategories],
  );

  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return rows.filter((e) => {
      if (categoryFilter === "__legacy__") {
        if (e.category_id) return false;
      } else if (categoryFilter !== "all" && e.category_id !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        expenseCategoryDisplay(e, nameById).toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q) ||
        (e.created_by_label ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, categoryFilter, deferredSearch, nameById]);

  const stats = useMemo(() => {
    const total = filtered.reduce((s, e) => s + e.amount, 0);
    const byCat = new Map<string, number>();
    for (const e of filtered) {
      const key = expenseCategoryDisplay(e, nameById);
      byCat.set(key, (byCat.get(key) ?? 0) + e.amount);
    }
    let topCat: string | null = null;
    let topAmount = 0;
    for (const [k, amt] of byCat) {
      if (amt > topAmount) {
        topAmount = amt;
        topCat = k;
      }
    }
    return { total, count: filtered.length, topCat, topAmount };
  }, [filtered, nameById]);

  /** Des dépenses d'avant la bascule (catégorie standard) sont-elles présentes ? */
  const hasLegacyRows = useMemo(() => rows.some((e) => !e.category_id), [rows]);

  const [formOpen, setFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["expenses"], exact: false });
  const invalidateCategories = () =>
    qc.invalidateQueries({ queryKey: ["expense-categories"], exact: false });

  const createMut = useMutation({
    mutationFn: (input: ExpenseFormInput) => createExpense(companyId, input),
    onSuccess: async () => {
      await invalidate();
      toast.success("Dépense ajoutée");
    },
    onError: (e) => toastMutationError("expenses", e),
  });

  const updateMut = useMutation({
    mutationFn: (params: { id: string; input: ExpenseFormInput }) =>
      updateExpense(params.id, companyId, params.input),
    onSuccess: async () => {
      await invalidate();
      toast.success("Dépense mise à jour");
    },
    onError: (e) => toastMutationError("expenses", e),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Dépense supprimée");
    },
    onError: (e) => toastMutationError("expenses", e),
  });

  const categoryMut = useMutation({
    mutationFn: async (
      action:
        | { kind: "create"; name: string }
        | { kind: "rename"; id: string; name: string }
        | { kind: "active"; id: string; isActive: boolean },
    ) => {
      if (action.kind === "create") {
        const nextPosition =
          allCategories.reduce((max, c) => Math.max(max, c.position), 0) + 1;
        await createExpenseCategory({
          companyId,
          name: action.name,
          position: nextPosition,
        });
        return;
      }
      if (action.kind === "rename") {
        await renameExpenseCategory(action.id, action.name);
        return;
      }
      await setExpenseCategoryActive(action.id, action.isActive);
    },
    onSuccess: async (_d, action) => {
      await invalidateCategories();
      // Le nom d'un poste s'affiche sur les lignes : la liste doit suivre.
      await invalidate();
      toast.success(
        action.kind === "create"
          ? "Catégorie ajoutée"
          : action.kind === "rename"
            ? "Catégorie renommée"
            : action.isActive
              ? "Catégorie remise dans la liste"
              : "Catégorie retirée de la liste",
      );
    },
    onError: (e) => toastMutationError("expenses", e),
  });

  /** Modifier / supprimer : le propriétaire partout, l'employé sur SES lignes (miroir RLS). */
  function canEditRow(e: Expense): boolean {
    if (!canManage) return false;
    if (isOwner) return true;
    return e.created_by == null || e.created_by === myUserId;
  }

  function exportExcel() {
    if (filtered.length === 0) return;
    void (async () => {
      try {
        const d = new Date().toISOString().slice(0, 10);
        const headers = ["Date", "Catégorie", "Règlement", "Note", "Par qui", "Montant"];
        const matrix = filtered.map((e) => [
          e.expense_date,
          expenseCategoryDisplay(e, nameById),
          paymentDisplay({ method: e.payment_method, reference: e.reference }).label,
          e.notes ?? "",
          e.created_by_label ?? "",
          e.amount,
        ]);
        await downloadProSpreadsheet(`depenses-${d}.xlsx`, "Dépenses", headers, matrix, {
          title: "FasoStock — Dépenses",
          subtitle: `${filtered.length} dépense(s) · total ${formatCurrency(stats.total)} · ${d}`,
        });
        toast.success("Excel enregistré");
      } catch (e) {
        toast.error(messageFromUnknownError(e, "Export Excel impossible."));
      }
    })();
  }

  // ---------- Accès réservé ----------
  if (!permLoading && (!h || !canView)) {
    return (
      <FsPage>
        <FsScreenHeader title="Dépenses" subtitle="Gestion des charges" />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              Vous n&apos;avez pas accès à cette section.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const noCategoriesYet = !categoriesQ.isLoading && activeCategories.length === 0;

  return (
    <FsPage>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 sm:mb-4">
        <FsScreenHeader
          className="mb-0"
          title="Dépenses"
          subtitle="Vos propres postes de dépense, et rien d'autre."
          titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
        />
        <div className="flex shrink-0 items-center gap-2">
          {filtered.length > 0 ? (
            <button
              type="button"
              onClick={exportExcel}
              className="inline-flex items-center gap-1.5 rounded-md border border-black/[0.12] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800 shadow-sm active:scale-[0.99] sm:text-sm"
            >
              <MdDownload className="h-4 w-4 shrink-0" aria-hidden />
              Excel
            </button>
          ) : null}
          {isOwner ? (
            <button
              type="button"
              onClick={() => setCategoriesOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-black/[0.12] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800 shadow-sm active:scale-[0.99] sm:text-sm"
            >
              <MdTune className="h-4 w-4 shrink-0" aria-hidden />
              Mes catégories
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              disabled={noCategoriesYet}
              className="inline-flex items-center gap-1.5 rounded-md bg-fs-accent px-3 py-2 text-xs font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-50 sm:text-sm"
            >
              <MdAdd className="h-4 w-4" aria-hidden />
              Nouvelle dépense
            </button>
          ) : null}
        </div>
      </div>

      {/* Aucune catégorie : la saisie n'a pas de sens tant que les postes n'existent pas. */}
      {noCategoriesYet ? (
        <FsCard className="mb-4 rounded-md border-fs-accent/30 bg-fs-accent/[0.06] sm:rounded-lg" padding="p-4">
          <p className="text-sm font-semibold text-fs-text">
            Commencez par créer vos catégories
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600">
            {isOwner
              ? "Aucun poste de dépense n'existe encore. Ouvrez « Mes catégories » et ajoutez ceux qui correspondent vraiment à vos sorties d'argent (carburant, gardien, douane…)."
              : "Aucun poste de dépense n'a encore été créé. Demandez au propriétaire de les définir dans Dépenses › Mes catégories."}
          </p>
          {isOwner ? (
            <button
              type="button"
              onClick={() => setCategoriesOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-fs-accent px-3 py-2 text-xs font-semibold text-white sm:text-sm"
            >
              <MdTune className="h-4 w-4" aria-hidden />
              Ouvrir mes catégories
            </button>
          ) : null}
        </FsCard>
      ) : null}

      {/* KPI */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 min-[900px]:grid-cols-3">
        <div className="col-span-2 rounded-md border border-fs-accent/30 bg-fs-accent/[0.06] p-3 min-[900px]:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fs-accent">
            Total {PERIODS.find((p) => p.key === period)?.label.toLowerCase()}
          </p>
          <p className="mt-1 text-2xl font-bold leading-none text-fs-accent">
            {formatCurrency(stats.total)}
          </p>
        </div>
        <div className="rounded-md border border-black/[0.06] bg-fs-surface-container p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Nombre
          </p>
          <p className="mt-1 text-2xl font-bold leading-none text-fs-text">
            {stats.count}
          </p>
        </div>
        <div className="rounded-md border border-black/[0.06] bg-fs-surface-container p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Poste n°1
          </p>
          <p className="mt-1 truncate text-sm font-bold text-fs-text">
            {stats.topCat ?? "—"}
          </p>
          {stats.topCat ? (
            <p className="text-[11px] text-neutral-500">
              {formatCurrency(stats.topAmount)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Filtres */}
      <FsStickyMobileActions className="mb-3">
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <FsFilterChip
                key={p.key}
                icon={MdReceiptLong}
                label={p.label}
                selected={period === p.key}
                onClick={() => setPeriod(p.key)}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <MdSearch
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher (catégorie, note, auteur…)"
                className={fsInputClass("rounded-md pl-9")}
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={fsInputClass("rounded-md sm:w-56")}
              aria-label="Filtrer par catégorie"
            >
              <option value="all">Toutes les catégories</option>
              {allCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isActive ? "" : " (retiré)"}
                </option>
              ))}
              {hasLegacyRows ? (
                <option value="__legacy__">Avant personnalisation</option>
              ) : null}
            </select>
          </div>
        </div>
      </FsStickyMobileActions>

      {/* Contenu */}
      {listQ.isError ? (
        <FsQueryErrorPanel error={listQ.error} onRetry={() => listQ.refetch()} />
      ) : listQ.isLoading || permLoading ? (
        <FsCard className="rounded-md sm:rounded-lg" padding="p-8">
          <p className="text-center text-sm text-neutral-500">Chargement…</p>
        </FsCard>
      ) : filtered.length === 0 ? (
        <FsCard className="rounded-md sm:rounded-lg" padding="py-14 px-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)]">
              <MdAccountBalanceWallet className="h-10 w-10 text-fs-accent" aria-hidden />
            </div>
            <p className="text-sm font-medium text-neutral-600">
              {rows.length === 0
                ? "Aucune dépense sur cette période."
                : "Aucune dépense ne correspond à ce filtre."}
            </p>
            {canManage && rows.length === 0 && !noCategoriesYet ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white"
              >
                <MdAdd className="h-4 w-4" aria-hidden />
                Ajouter une dépense
              </button>
            ) : null}
          </div>
        </FsCard>
      ) : (
        <FsCard className="rounded-md sm:rounded-lg" padding="p-0">
          <FsHorizontalScroll>
            <ul className="min-w-0 divide-y divide-black/[0.05]">
              {filtered.map((e) => {
                const pay = paymentDisplay({
                  method: e.payment_method,
                  reference: e.reference,
                });
                const editable = canEditRow(e);
                return (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fs-text">
                        {expenseCategoryDisplay(e, nameById)}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
                        <span>{formatDmy(e.expense_date)}</span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 font-semibold",
                            pay.pillClass,
                          )}
                        >
                          {pay.label}
                        </span>
                        {e.created_by_label ? (
                          <span className="inline-flex items-center gap-1">
                            <MdPerson className="h-3 w-3" aria-hidden />
                            {e.created_by_label}
                          </span>
                        ) : null}
                      </p>
                      {e.notes ? (
                        <p className="mt-0.5 truncate text-[11px] italic text-neutral-500">
                          {e.notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="mr-1 text-sm font-bold text-fs-text">
                        {formatCurrency(e.amount)}
                      </span>
                      {editable ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(e);
                              setFormOpen(true);
                            }}
                            className="rounded-md p-2 text-fs-accent hover:bg-fs-surface-container"
                            aria-label="Modifier"
                          >
                            <MdEdit className="h-[18px] w-[18px]" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(e)}
                            className="rounded-md p-2 text-red-600 hover:bg-fs-surface-container"
                            aria-label="Supprimer"
                          >
                            <MdDeleteOutline className="h-[18px] w-[18px]" aria-hidden />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </FsHorizontalScroll>
        </FsCard>
      )}

      {filtered.length > 0 ? (
        <p className="mt-3 text-center text-[11px] text-neutral-400">
          {filtered.length} dépense(s) · total {formatCurrency(stats.total)}
        </p>
      ) : null}

      <SimpleExpenseFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        variant={editing ? "edit" : "create"}
        categories={activeCategories}
        initialValue={
          editing
            ? expenseToFormInput(editing)
            : { storeId: ctxStoreId, categoryId: null }
        }
        onSubmit={async (value) => {
          if (!companyId) throw new Error("Entreprise manquante.");
          if (editing) {
            await updateMut.mutateAsync({ id: editing.id, input: value });
          } else {
            await createMut.mutateAsync(value);
          }
        }}
      />

      {/* Monté seulement à l'ouverture : la fermeture emporte l'état de saisie. */}
      {categoriesOpen ? (
        <ExpenseCategoriesDialog
          open
          onClose={() => setCategoriesOpen(false)}
          categories={allCategories}
          busy={categoryMut.isPending}
          onCreate={(name) => categoryMut.mutateAsync({ kind: "create", name })}
          onRename={(id, name) => categoryMut.mutateAsync({ kind: "rename", id, name })}
          onSetActive={async (id, isActive) => {
            await categoryMut.mutateAsync({ kind: "active", id, isActive });
          }}
        />
      ) : null}

      <DeleteExpenseDialog
        open={deleteTarget != null}
        label={deleteTarget ? expenseCategoryDisplay(deleteTarget, nameById) : ""}
        busy={deleteMut.isPending}
        onCancel={() => {
          if (!deleteMut.isPending) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMut.mutate(deleteTarget.id, {
            onSuccess: () => setDeleteTarget(null),
          });
        }}
      />
    </FsPage>
  );
}
