"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAccountBalance,
  MdAccountBalanceWallet,
  MdAdd,
  MdBolt,
  MdBuild,
  MdCampaign,
  MdDeleteOutline,
  MdDirectionsCar,
  MdDownload,
  MdEdit,
  MdGroups,
  MdHome,
  MdInventory2,
  MdLock,
  MdReceiptLong,
  MdSearch,
  MdStorefront,
  MdWifi,
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
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
} from "@/lib/features/expenses/api";
import {
  EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  expensePaymentLabel,
  type Expense,
  type ExpenseFormInput,
} from "@/lib/features/expenses/types";
import { expensesToSpreadsheetMatrix } from "@/lib/features/expenses/csv";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";
import { downloadProSpreadsheet } from "@/lib/utils/spreadsheet-export-pro";
import type { ComponentType } from "react";

type Period = "this_month" | "last_month" | "this_year" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "this_month", label: "Ce mois" },
  { key: "last_month", label: "Mois préc." },
  { key: "this_year", label: "Cette année" },
  { key: "all", label: "Tout" },
];

const CATEGORY_ICON: Record<string, ComponentType<{ className?: string }>> = {
  loyer: MdHome,
  salaires: MdGroups,
  electricite_eau: MdBolt,
  transport: MdDirectionsCar,
  fournitures: MdInventory2,
  marketing: MdCampaign,
  maintenance: MdBuild,
  telecom: MdWifi,
  taxes: MdAccountBalance,
  banque: MdAccountBalanceWallet,
  autre: MdReceiptLong,
};

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function periodRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case "this_month":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "last_month":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "this_year":
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    case "all":
    default:
      return { from: "2000-01-01", to: "2999-12-31" };
  }
}

function formatDmy(isoDate: string): string {
  const [yy, mm, dd] = isoDate.split("-");
  if (!yy || !mm || !dd) return isoDate;
  return `${dd}/${mm}/${yy}`;
}

function expenseToFormInput(e: Expense): ExpenseFormInput {
  return {
    category: e.category,
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
      <FsCard className="w-full max-w-md shadow-xl" padding="p-4 sm:p-5">
        <h2 className="text-base font-bold text-fs-text">Supprimer la dépense</h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          Supprimer « {label} » ? Cette action est irréversible.
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

export function ExpensesScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h } = usePermissions();
  const companyId = ctx.data?.companyId ?? "";
  const ctxStoreId = ctx.data?.storeId ?? null;
  const stores = ctx.data?.stores;
  const storeList = useMemo(
    () => (stores ?? []).map((s) => ({ id: s.id, name: s.name })),
    [stores],
  );
  const storeName = useMemo(() => {
    const map = new Map((stores ?? []).map((s) => [s.id, s.name] as const));
    return (id: string | null) => (id ? (map.get(id) ?? null) : null);
  }, [stores]);

  const canView = h?.canExpenses ?? false;
  const canManage = h?.canManageExpenses ?? false;

  const [period, setPeriod] = useState<Period>("this_month");
  const [category, setCategory] = useState<string>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  // Positionne le filtre sur la boutique courante au premier chargement
  // (l'utilisateur reste libre de choisir « Toutes » ensuite).
  const storeFilterInitedRef = useRef(false);
  useEffect(() => {
    if (storeFilterInitedRef.current) return;
    if (!companyId) return;
    storeFilterInitedRef.current = true;
    if (ctxStoreId) setStoreFilter(ctxStoreId);
  }, [companyId, ctxStoreId]);

  const { from, to } = useMemo(() => periodRange(period), [period]);

  const listQ = useQuery({
    queryKey: queryKeys.expenses({ companyId, from, to }),
    queryFn: () => listExpenses(companyId, from, to),
    enabled: !!companyId && canView && !permLoading,
    staleTime: 20_000,
  });

  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return rows.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (storeFilter === "__none__") {
        if (e.store_id) return false;
      } else if (storeFilter !== "all" && e.store_id !== storeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (e.label ?? "").toLowerCase().includes(q) ||
        (e.payee ?? "").toLowerCase().includes(q) ||
        expenseCategoryLabel(e.category).toLowerCase().includes(q)
      );
    });
  }, [rows, category, storeFilter, deferredSearch]);

  const stats = useMemo(() => {
    const total = filtered.reduce((s, e) => s + e.amount, 0);
    const byCat = new Map<string, number>();
    for (const e of filtered) {
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
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
  }, [filtered]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["expenses"], exact: false });

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

  function exportExcel() {
    if (filtered.length === 0) return;
    void (async () => {
      try {
        const d = new Date().toISOString().slice(0, 10);
        const { headers, rows: matrix } = expensesToSpreadsheetMatrix(
          filtered,
          storeName,
        );
        await downloadProSpreadsheet(
          `depenses-${d}.xlsx`,
          "Dépenses",
          headers,
          matrix,
          {
            title: "FasoStock — Dépenses",
            subtitle: `${filtered.length} dépense(s) · total ${formatCurrency(stats.total)} · ${d}`,
          },
        );
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

  return (
    <FsPage>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 sm:mb-4">
        <FsScreenHeader
          className="mb-0"
          title="Dépenses"
          subtitle="Suivez et maîtrisez toutes vos charges (loyer, salaires, transport…)."
          titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
        />
        <div className="flex shrink-0 items-center gap-2">
          {filtered.length > 0 ? (
            <button
              type="button"
              onClick={exportExcel}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-black/[0.12] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800 shadow-sm active:scale-[0.99] sm:text-sm"
            >
              <MdDownload className="h-4 w-4 shrink-0" aria-hidden />
              Excel
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-fs-accent px-3 py-2 text-xs font-semibold text-white shadow-sm active:scale-[0.99] sm:text-sm"
            >
              <MdAdd className="h-4 w-4" aria-hidden />
              Nouvelle dépense
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 min-[900px]:grid-cols-3">
        <div className="col-span-2 rounded-xl border border-fs-accent/30 bg-fs-accent/[0.06] p-3 min-[900px]:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fs-accent">
            Total {PERIODS.find((p) => p.key === period)?.label.toLowerCase()}
          </p>
          <p className="mt-1 text-2xl font-bold leading-none text-fs-accent">
            {formatCurrency(stats.total)}
          </p>
        </div>
        <div className="rounded-xl border border-black/[0.06] bg-fs-surface-container p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Nombre
          </p>
          <p className="mt-1 text-2xl font-bold leading-none text-fs-text">
            {stats.count}
          </p>
        </div>
        <div className="rounded-xl border border-black/[0.06] bg-fs-surface-container p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Poste n°1
          </p>
          <p className="mt-1 truncate text-sm font-bold text-fs-text">
            {stats.topCat ? expenseCategoryLabel(stats.topCat) : "—"}
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
                placeholder="Rechercher (libellé, bénéficiaire…)"
                className={fsInputClass("pl-9")}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-none">
              {storeList.length > 0 ? (
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className={fsInputClass("sm:w-48")}
                  aria-label="Filtrer par boutique"
                >
                  <option value="all">Toutes les boutiques</option>
                  {storeList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="__none__">Sans boutique</option>
                </select>
              ) : null}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={fsInputClass("sm:w-56")}
                aria-label="Filtrer par catégorie"
              >
                <option value="all">Toutes les catégories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </FsStickyMobileActions>

      {/* Contenu */}
      {listQ.isError ? (
        <FsQueryErrorPanel error={listQ.error} onRetry={() => listQ.refetch()} />
      ) : listQ.isLoading || permLoading ? (
        <FsCard padding="p-8">
          <p className="text-center text-sm text-neutral-500">Chargement…</p>
        </FsCard>
      ) : filtered.length === 0 ? (
        <FsCard padding="py-14 px-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)]">
              <MdAccountBalanceWallet className="h-10 w-10 text-fs-accent" aria-hidden />
            </div>
            <p className="text-sm font-medium text-neutral-600">
              {rows.length === 0
                ? "Aucune dépense sur cette période."
                : "Aucune dépense ne correspond à ce filtre."}
            </p>
            {canManage && rows.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="mt-1 inline-flex items-center gap-1.5 rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white"
              >
                <MdAdd className="h-4 w-4" aria-hidden />
                Ajouter une dépense
              </button>
            ) : null}
          </div>
        </FsCard>
      ) : (
        <FsCard padding="p-0">
          <FsHorizontalScroll>
            <ul className="min-w-0 divide-y divide-black/[0.05]">
              {filtered.map((e) => {
                const Icon = CATEGORY_ICON[e.category] ?? MdReceiptLong;
                const store = storeName(e.store_id);
                const title = e.label?.trim() || expenseCategoryLabel(e.category);
                return (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)]">
                      <Icon className="h-5 w-5 text-fs-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fs-text">
                        {title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500">
                        <span>{expenseCategoryLabel(e.category)}</span>
                        <span>· {formatDmy(e.expense_date)}</span>
                        <span>· {expensePaymentLabel(e.payment_method)}</span>
                        {e.payee ? <span>· {e.payee}</span> : null}
                        {store ? (
                          <span className="inline-flex items-center gap-1">
                            · <MdStorefront className="h-3 w-3" aria-hidden />
                            {store}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="mr-1 text-sm font-bold text-fs-text">
                        {formatCurrency(e.amount)}
                      </span>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(e);
                              setFormOpen(true);
                            }}
                            className="rounded-lg p-2 text-fs-accent hover:bg-fs-surface-container"
                            aria-label="Modifier"
                          >
                            <MdEdit className="h-[18px] w-[18px]" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(e)}
                            className="rounded-lg p-2 text-red-600 hover:bg-fs-surface-container"
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

      <ExpenseFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        variant={editing ? "edit" : "create"}
        stores={storeList}
        initialValue={editing ? expenseToFormInput(editing) : null}
        onSubmit={async (value) => {
          if (!companyId) throw new Error("Entreprise manquante.");
          if (editing) {
            await updateMut.mutateAsync({ id: editing.id, input: value });
          } else {
            await createMut.mutateAsync(value);
          }
        }}
      />

      <DeleteExpenseDialog
        open={deleteTarget != null}
        label={
          deleteTarget?.label?.trim() ||
          (deleteTarget ? expenseCategoryLabel(deleteTarget.category) : "")
        }
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
