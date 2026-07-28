"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdAddCard,
  MdBusinessCenter,
  MdChevronRight,
  MdDeleteOutline,
  MdDownload,
  MdEdit,
  MdErrorOutline,
  MdLock,
  MdPayments,
  MdReceiptLong,
  MdSearch,
  MdSpaceDashboard,
  MdTrendingDown,
  MdWarningAmber,
} from "react-icons/md";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { SupplierDebtDialog } from "@/components/suppliers/supplier-debt-dialog";
import { SupplierDetailPanel } from "@/components/suppliers/supplier-detail-panel";
import { SupplierFormDialog } from "@/components/suppliers/supplier-form-dialog";
import { SupplierPaymentDialog } from "@/components/suppliers/supplier-payment-dialog";
import { P } from "@/lib/constants/permissions";
import { activityUiTerms } from "@/lib/features/activity/activity-profiles";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  applySupplierCredit,
  cancelSupplierInvoice,
  createSupplier,
  deleteSupplier,
  deleteSupplierInvoice,
  deleteSupplierPayment,
  listSupplierAccounts,
  listSupplierInvoices,
  listSupplierPayments,
  recordSupplierPayment,
  saveSupplierInvoice,
  updateSupplier,
} from "@/lib/features/suppliers/api";
import {
  supplierAccountsToSpreadsheetMatrix,
  supplierInvoicesToSpreadsheetMatrix,
  supplierPaymentsToSpreadsheetMatrix,
} from "@/lib/features/suppliers/csv";
import {
  agingBuckets,
  cashOutSchedule,
  dueLabel,
  formatDateTimeFr,
  formatDayFr,
  invoiceDue,
  invoiceUrgency,
  payablesTotals,
  todayIso,
} from "@/lib/features/suppliers/payables-math";
import {
  SUPPLIER_INVOICE_SOURCE_LABELS,
  SUPPLIER_PAYMENT_METHOD_LABELS,
  type SupplierAccount,
  type SupplierInvoice,
  type SupplierPayment,
} from "@/lib/features/suppliers/types";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import { formatUnknownErrorMessage } from "@/lib/utils/format-unknown-error";
import { downloadProSpreadsheet } from "@/lib/utils/spreadsheet-export-pro";

type Tab = "dashboard" | "debts" | "suppliers" | "payments";
type DebtFilter = "open" | "overdue" | "soon" | "settled";
type SupplierFilter = "all" | "debt" | "overdue" | "clear" | "inactive";

const TABS: { key: Tab; label: string; short: string; icon: typeof MdSpaceDashboard }[] = [
  { key: "dashboard", label: "Tableau de bord", short: "Bord", icon: MdSpaceDashboard },
  { key: "debts", label: "Mes dettes", short: "Dettes", icon: MdReceiptLong },
  { key: "suppliers", label: "Fournisseurs", short: "Fiches", icon: MdBusinessCenter },
  { key: "payments", label: "Règlements", short: "Règlements", icon: MdPayments },
];

function periodStartIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Tuile d'indicateur — la lecture doit se faire d'un coup d'œil, sans clic. */
function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "danger" | "warning" | "success" | "info";
  icon?: typeof MdPayments;
  onClick?: () => void;
}) {
  const tones = {
    neutral: { text: "text-fs-text", chip: "bg-fs-surface-container text-neutral-500" },
    danger: { text: "text-red-600", chip: "bg-red-100 text-red-600 dark:bg-red-950/50" },
    warning: {
      text: "text-amber-600",
      chip: "bg-amber-100 text-amber-600 dark:bg-amber-950/50",
    },
    success: {
      text: "text-emerald-600",
      chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50",
    },
    info: { text: "text-sky-600", chip: "bg-sky-100 text-sky-600 dark:bg-sky-950/50" },
  }[tone];

  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "rounded-xl border border-black/[0.06] bg-fs-card p-3 text-left shadow-sm",
        onClick && "transition-transform active:scale-[0.99]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              tones.chip,
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className={cn("mt-1 text-lg font-bold leading-tight sm:text-xl", tones.text)}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-neutral-500">{hint}</p> : null}
    </Wrapper>
  );
}

/**
 * Espace Fournisseurs — carnet fournisseurs ET, surtout, gestion complète de
 * ce que l'entreprise DOIT à ses fournisseurs.
 *
 * Quatre onglets qui répondent chacun à une question du gérant :
 *   Tableau de bord → « combien je dois, et quand faut-il sortir l'argent ? »
 *   Mes dettes      → « quelle facture est en retard ? »
 *   Fournisseurs    → « qui je dois payer, et quel est mon encours chez lui ? »
 *   Règlements      → « qu'est-ce que j'ai déjà versé ? »
 *
 * Les dettes issues du module Achats remontent ici automatiquement : rien à
 * ressaisir, et un achat réglé dans Achats apparaît déjà soldé.
 */
export function SuppliersScreen() {
  const qc = useQueryClient();
  const appCtx = useAppContext();
  const { hasPermission } = usePermissions();
  const terms = activityUiTerms(appCtx.data?.businessTypeSlug);
  const sTitle = terms.suppliersTitle ?? "Fournisseurs";
  const sCreateLabel = terms.suppliersCreateLabel ?? "Nouveau fournisseur";

  const canView = hasPermission(P.suppliersView) || hasPermission(P.suppliersManage);
  const canManage = hasPermission(P.suppliersManage);

  const companyId = appCtx.data?.companyId ?? "";
  const storeId = appCtx.data?.storeId ?? null;
  const isWide = useMediaQuery("(min-width: 900px)");

  const [tab, setTab] = useState<Tab>("dashboard");
  const [search, setSearch] = useState("");
  const [debtFilter, setDebtFilter] = useState<DebtFilter>("open");
  const [supplierFilter, setSupplierFilter] = useState<SupplierFilter>("all");
  const [paymentDays, setPaymentDays] = useState(30);

  // ── Données ───────────────────────────────────────────────────────────────
  const accountsQ = useQuery({
    queryKey: queryKeys.supplierAccounts(companyId),
    queryFn: () => listSupplierAccounts(companyId),
    enabled: Boolean(companyId) && canView && !appCtx.isLoading,
    staleTime: 15_000,
  });

  const invoicesQ = useQuery({
    queryKey: queryKeys.supplierInvoices({
      companyId,
      supplierId: null,
      settled: debtFilter === "settled",
    }),
    queryFn: () =>
      listSupplierInvoices({ companyId, includeSettled: debtFilter === "settled" }),
    enabled: Boolean(companyId) && canView && !appCtx.isLoading,
    staleTime: 15_000,
  });

  const paymentsFrom = periodStartIso(paymentDays);
  const paymentsQ = useQuery({
    queryKey: queryKeys.supplierPayments({
      companyId,
      supplierId: null,
      from: paymentsFrom,
      to: null,
    }),
    queryFn: () => listSupplierPayments({ companyId, from: paymentsFrom }),
    enabled: Boolean(companyId) && canView && !appCtx.isLoading && tab === "payments",
    staleTime: 15_000,
  });

  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);
  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);
  const totals = useMemo(() => payablesTotals(accounts), [accounts]);

  /** L'échéancier ne dépend que des dettes non soldées : on le calcule à part. */
  const openInvoices = useMemo(
    () => invoices.filter((i) => invoiceDue(i) > 0),
    [invoices],
  );
  const aging = useMemo(() => agingBuckets(openInvoices), [openInvoices]);
  const schedule = useMemo(() => cashOutSchedule(openInvoices), [openInvoices]);

  // ── Dialogues ─────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierAccount | null>(null);
  const [debtOpen, setDebtOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SupplierInvoice | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payPreset, setPayPreset] = useState<{ supplierId: string | null; invoiceId: string | null }>(
    { supplierId: null, invoiceId: null },
  );
  const [detailId, setDetailId] = useState<string | null>(null);
  const [presetSupplierId, setPresetSupplierId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: "deleteSupplier"; account: SupplierAccount }
    | { kind: "deleteInvoice"; invoice: SupplierInvoice }
    | { kind: "cancelInvoice"; invoice: SupplierInvoice; cancel: boolean }
    | { kind: "deletePayment"; payment: SupplierPayment }
    | null
  >(null);

  const detail = useMemo(
    () => accounts.find((a) => a.id === detailId) ?? null,
    [accounts, detailId],
  );

  async function refreshAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.supplierAccounts(companyId) }),
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] }),
      qc.invalidateQueries({ queryKey: ["supplier-payments"] }),
      qc.invalidateQueries({ queryKey: queryKeys.suppliers(companyId) }),
    ]);
  }

  const supplierMut = useMutation({
    mutationFn: async (payload: {
      id: string | null;
      value: Parameters<typeof createSupplier>[1];
    }) =>
      payload.id
        ? updateSupplier(payload.id, payload.value)
        : createSupplier(companyId, payload.value),
    onSuccess: async (_d, vars) => {
      await refreshAll();
      toast.success(vars.id ? "Fournisseur mis à jour" : "Fournisseur créé");
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  const deleteSupplierMut = useMutation({
    mutationFn: async (id: string) => deleteSupplier(id),
    onSuccess: async () => {
      await refreshAll();
      setDetailId(null);
      toast.success("Fournisseur supprimé");
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  const invoiceMut = useMutation({
    mutationFn: async (input: Parameters<typeof saveSupplierInvoice>[1]) =>
      saveSupplierInvoice(companyId, input),
    onSuccess: async () => {
      await refreshAll();
      toast.success("Dette enregistrée");
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  const invoiceCancelMut = useMutation({
    mutationFn: async (p: { id: string; cancel: boolean }) =>
      cancelSupplierInvoice(p.id, p.cancel),
    onSuccess: async (_d, p) => {
      await refreshAll();
      toast.success(p.cancel ? "Dette annulée" : "Dette rétablie");
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  const invoiceDeleteMut = useMutation({
    mutationFn: async (id: string) => deleteSupplierInvoice(id),
    onSuccess: async () => {
      await refreshAll();
      toast.success("Dette supprimée");
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  const paymentMut = useMutation({
    mutationFn: async (input: Parameters<typeof recordSupplierPayment>[1]) =>
      recordSupplierPayment(companyId, input),
    onSuccess: async () => {
      await refreshAll();
      toast.success("Règlement enregistré");
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  const paymentDeleteMut = useMutation({
    mutationFn: async (id: string) => deleteSupplierPayment(id),
    onSuccess: async () => {
      await refreshAll();
      toast.success("Règlement supprimé");
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  const applyCreditMut = useMutation({
    mutationFn: async (supplierId: string) => applySupplierCredit(companyId, supplierId),
    onSuccess: async (applied) => {
      await refreshAll();
      toast.success(
        applied > 0
          ? `${formatCurrency(applied)} imputés sur les dettes`
          : "Aucune dette à imputer",
      );
    },
    onError: (e) => toastMutationError("suppliers", e),
  });

  // ── Filtres ───────────────────────────────────────────────────────────────
  const needle = search.trim().toLowerCase();

  const filteredAccounts = useMemo(() => {
    let rows = accounts;
    if (supplierFilter === "debt") rows = rows.filter((a) => a.stats.balance > 0);
    else if (supplierFilter === "overdue") rows = rows.filter((a) => a.stats.overdueAmount > 0);
    else if (supplierFilter === "clear")
      rows = rows.filter((a) => a.stats.balance <= 0 && a.is_active);
    else if (supplierFilter === "inactive") rows = rows.filter((a) => !a.is_active);
    else rows = rows.filter((a) => a.is_active || a.stats.balance > 0);

    if (needle) {
      rows = rows.filter((a) =>
        [a.name, a.code, a.contact, a.phone, a.email, a.city, a.category]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(needle)),
      );
    }
    // Le plus urgent d'abord : retard, puis encours, puis alphabétique.
    return [...rows].sort((a, b) => {
      if (a.stats.overdueAmount !== b.stats.overdueAmount)
        return b.stats.overdueAmount - a.stats.overdueAmount;
      if (a.stats.balance !== b.stats.balance) return b.stats.balance - a.stats.balance;
      return a.name.localeCompare(b.name, "fr");
    });
  }, [accounts, supplierFilter, needle]);

  const filteredInvoices = useMemo(() => {
    let rows = invoices;
    if (debtFilter === "overdue")
      rows = rows.filter((i) => invoiceUrgency(i) === "overdue");
    else if (debtFilter === "soon")
      rows = rows.filter((i) => ["today", "soon"].includes(invoiceUrgency(i)));
    else if (debtFilter === "settled") rows = rows.filter((i) => invoiceDue(i) <= 0);
    else rows = rows.filter((i) => invoiceDue(i) > 0);

    if (needle) {
      rows = rows.filter((i) =>
        [i.supplierName, i.invoiceNumber, i.label, i.notes]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(needle)),
      );
    }
    return [...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [invoices, debtFilter, needle]);

  const filteredPayments = useMemo(() => {
    if (!needle) return payments;
    return payments.filter((p) =>
      [p.supplierName, p.reference, p.notes]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(needle)),
    );
  }, [payments, needle]);

  const paymentsTotal = useMemo(
    () => filteredPayments.reduce((acc, p) => acc + p.amount, 0),
    [filteredPayments],
  );

  const priorityAccounts = useMemo(
    () => filteredAccounts.filter((a) => a.stats.balance > 0).slice(0, 6),
    [filteredAccounts],
  );

  /** La recherche n'a pas le même sens d'un onglet à l'autre : on repart propre. */
  function goToTab(next: Tab) {
    setTab(next);
    setSearch("");
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  function exportSheet(
    fileBase: string,
    sheet: string,
    built: { headers: string[]; rows: (string | number)[][] },
    subtitle: string,
  ) {
    void (async () => {
      try {
        const d = todayIso();
        await downloadProSpreadsheet(
          `${fileBase}-${d}.xlsx`,
          sheet,
          built.headers,
          built.rows,
          { title: `FasoStock — ${sheet}`, subtitle },
        );
        toast.success("Excel enregistré");
      } catch (e) {
        toast.error(messageFromUnknownError(e, "Export Excel impossible."));
      }
    })();
  }

  // ── États bloquants ───────────────────────────────────────────────────────
  if (appCtx.isLoading && !appCtx.data) {
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
          <p className="text-sm font-medium text-fs-text">
            Vous n&apos;avez pas accès à cette page.
          </p>
        </div>
      </FsPage>
    );
  }

  if (appCtx.isError) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
          <FsQueryErrorPanel error={appCtx.error} onRetry={() => void appCtx.refetch()} />
        </div>
      </FsPage>
    );
  }

  if (!companyId) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center px-4 text-center">
          <p className="text-sm text-fs-text">
            Aucune entreprise. Contactez l&apos;administrateur.
          </p>
        </div>
      </FsPage>
    );
  }

  const loadError =
    accountsQ.isError && accountsQ.error
      ? formatUnknownErrorMessage(accountsQ.error)
      : invoicesQ.isError && invoicesQ.error
        ? formatUnknownErrorMessage(invoicesQ.error)
        : null;

  const loading = accountsQ.isLoading || invoicesQ.isLoading;

  return (
    <FsPage>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          className="mb-0"
          title={sTitle}
          subtitle="Vos fournisseurs et tout ce que vous leur devez"
        />
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingInvoice(null);
                setPresetSupplierId(null);
                setDebtOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-black/[0.12] bg-fs-card px-3 py-2.5 text-xs font-semibold text-neutral-800 shadow-sm active:scale-[0.99] sm:text-sm"
            >
              <MdAddCard className="h-5 w-5" aria-hidden />
              Nouvelle dette
            </button>
            <button
              type="button"
              onClick={() => {
                setPayPreset({ supplierId: null, invoiceId: null });
                setPayOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm active:scale-[0.99] sm:text-sm"
            >
              <MdPayments className="h-5 w-5" aria-hidden />
              Payer
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingSupplier(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-fs-accent px-3 py-2.5 text-xs font-semibold text-white shadow-sm active:scale-[0.99] sm:text-sm"
            >
              <MdAdd className="h-5 w-5" aria-hidden />
              <span className="hidden min-[420px]:inline">{sCreateLabel}</span>
              <span className="min-[420px]:hidden">Fournisseur</span>
            </button>
          </div>
        ) : null}
      </div>

      {/* Onglets */}
      <FsHorizontalScroll className="mb-3">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => goToTab(t.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold sm:text-sm",
                tab === t.key
                  ? "border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)] text-fs-accent"
                  : "border-black/[0.08] bg-fs-card text-neutral-700",
              )}
            >
              <t.icon className="h-[18px] w-[18px]" aria-hidden />
              <span className="hidden min-[560px]:inline">{t.label}</span>
              <span className="min-[560px]:hidden">{t.short}</span>
            </button>
          ))}
        </div>
      </FsHorizontalScroll>

      {loadError ? (
        <FsCard className="mb-3 border-red-500/50 bg-red-500/10" padding="p-3">
          <div className="flex gap-2.5">
            <MdErrorOutline className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-red-900 dark:text-red-100">{loadError}</p>
          </div>
        </FsCard>
      ) : null}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : null}

      {!loading && !loadError ? (
        <>
          {/* ═════════ Tableau de bord ═════════ */}
          {tab === "dashboard" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 min-[900px]:grid-cols-4">
                <Kpi
                  label="Total que je dois"
                  value={formatCurrency(totals.balance)}
                  hint={`${totals.suppliersWithDebt} fournisseur(s) · ${totals.openInvoices} dette(s)`}
                  tone={totals.balance > 0 ? "danger" : "success"}
                  icon={MdTrendingDown}
                  onClick={() => goToTab("debts")}
                />
                <Kpi
                  label="En retard"
                  value={formatCurrency(totals.overdue)}
                  hint={
                    totals.overdue > 0
                      ? `${totals.suppliersOverdue} fournisseur(s) · jusqu'à ${totals.worstDaysLate} j`
                      : "Tout est à jour"
                  }
                  tone={totals.overdue > 0 ? "danger" : "success"}
                  icon={MdWarningAmber}
                  onClick={() => {
                    setDebtFilter("overdue");
                    goToTab("debts");
                  }}
                />
                <Kpi
                  label="À payer sous 7 j"
                  value={formatCurrency(totals.dueSoon)}
                  hint="Argent à préparer cette semaine"
                  tone={totals.dueSoon > 0 ? "warning" : "neutral"}
                  icon={MdReceiptLong}
                  onClick={() => {
                    setDebtFilter("soon");
                    goToTab("debts");
                  }}
                />
                <Kpi
                  label="Avances versées"
                  value={formatCurrency(totals.credit)}
                  hint="Payé sans facture en face"
                  tone={totals.credit > 0 ? "info" : "neutral"}
                  icon={MdPayments}
                />
              </div>

              {/* Échéancier de trésorerie */}
              <FsCard padding="p-3">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-fs-text">Sorties à prévoir</p>
                    <p className="text-[11px] text-neutral-500">
                      Ce qu&apos;il faut sortir, semaine par semaine
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-red-600">
                    {formatCurrency(totals.balance)}
                  </p>
                </div>
                <CashOutChart slots={schedule} />
              </FsCard>

              {/* Ancienneté */}
              <FsCard padding="p-3">
                <p className="mb-2 text-sm font-bold text-fs-text">Ancienneté de la dette</p>
                <AgingBar
                  rows={[
                    { label: "Pas encore dû", value: aging.notDue, className: "bg-emerald-500" },
                    { label: "1 – 30 j", value: aging.d1to30, className: "bg-amber-400" },
                    { label: "31 – 60 j", value: aging.d31to60, className: "bg-orange-500" },
                    { label: "61 – 90 j", value: aging.d61to90, className: "bg-red-500" },
                    { label: "+ 90 j", value: aging.d90plus, className: "bg-red-800" },
                  ]}
                />
              </FsCard>

              {/* À payer en priorité */}
              <FsCard padding="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold text-fs-text">À payer en priorité</p>
                  <button
                    type="button"
                    onClick={() => goToTab("suppliers")}
                    className="text-xs font-semibold text-fs-accent"
                  >
                    Tout voir
                  </button>
                </div>
                {priorityAccounts.length === 0 ? (
                  <p className="py-6 text-center text-xs text-neutral-500">
                    Vous ne devez rien à personne. 🎉
                  </p>
                ) : (
                  <ul className="divide-y divide-black/[0.05]">
                    {priorityAccounts.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setDetailId(a.id)}
                          className="flex w-full items-center gap-2.5 py-2.5 text-left"
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                              a.stats.overdueAmount > 0
                                ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                                : "bg-fs-surface-container text-neutral-600",
                            )}
                          >
                            {a.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-fs-text">
                              {a.name}
                            </span>
                            <span
                              className={cn(
                                "block text-[11px]",
                                a.stats.overdueAmount > 0 ? "text-red-600" : "text-neutral-500",
                              )}
                            >
                              {a.stats.overdueAmount > 0
                                ? `${formatCurrency(a.stats.overdueAmount)} en retard · ${a.daysLate} j`
                                : a.stats.nextDueDate
                                  ? `Échéance ${formatDayFr(a.stats.nextDueDate)}`
                                  : `${a.stats.openInvoices} dette(s)`}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-sm font-bold text-red-600">
                              {formatCurrency(a.stats.balance)}
                            </span>
                          </span>
                          <MdChevronRight className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </FsCard>
            </div>
          ) : null}

          {/* ═════════ Mes dettes ═════════ */}
          {tab === "debts" ? (
            <div className="space-y-3">
              <FilterBar
                search={search}
                onSearch={setSearch}
                placeholder="Rechercher une dette, un fournisseur…"
                onExport={
                  filteredInvoices.length > 0
                    ? () =>
                        exportSheet(
                          "dettes-fournisseurs",
                          "Dettes fournisseurs",
                          supplierInvoicesToSpreadsheetMatrix(filteredInvoices) as {
                            headers: string[];
                            rows: (string | number)[][];
                          },
                          `${filteredInvoices.length} dette(s) · ${todayIso()}`,
                        )
                    : undefined
                }
                chips={[
                  { key: "open", label: "À payer" },
                  { key: "overdue", label: "En retard" },
                  { key: "soon", label: "Sous 7 j" },
                  { key: "settled", label: "Soldées" },
                ]}
                active={debtFilter}
                onChip={(k) => setDebtFilter(k as DebtFilter)}
              />

              {filteredInvoices.length === 0 ? (
                <EmptyState
                  icon={MdReceiptLong}
                  title={
                    debtFilter === "settled" ? "Aucune dette soldée" : "Aucune dette à payer"
                  }
                  hint={
                    debtFilter === "open"
                      ? "Les achats validés arrivent ici automatiquement."
                      : undefined
                  }
                />
              ) : isWide ? (
                <FsCard className="p-0" padding="p-0">
                  <FsHorizontalScroll>
                    <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06] bg-fs-surface-container/80 text-xs">
                          <th className="px-3 py-2.5 font-semibold text-fs-text">Fournisseur</th>
                          <th className="px-3 py-2.5 font-semibold text-fs-text">Pièce</th>
                          <th className="px-3 py-2.5 font-semibold text-fs-text">Origine</th>
                          <th className="px-3 py-2.5 font-semibold text-fs-text">Échéance</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-fs-text">
                            Montant
                          </th>
                          <th className="px-3 py-2.5 text-right font-semibold text-fs-text">
                            Réglé
                          </th>
                          <th className="px-3 py-2.5 text-right font-semibold text-fs-text">
                            Reste
                          </th>
                          {canManage ? <th className="px-3 py-2.5" /> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInvoices.map((inv) => {
                          const due = invoiceDue(inv);
                          const late = invoiceUrgency(inv) === "overdue";
                          return (
                            <tr
                              key={inv.id}
                              className="border-b border-black/[0.04] last:border-0 hover:bg-fs-surface-container/50"
                            >
                              <td className="max-w-[190px] truncate px-3 py-2.5 font-medium text-fs-text">
                                <button
                                  type="button"
                                  onClick={() => setDetailId(inv.supplierId)}
                                  className="truncate hover:text-fs-accent"
                                >
                                  {inv.supplierName}
                                </button>
                              </td>
                              <td className="max-w-[170px] truncate px-3 py-2.5 text-neutral-700">
                                {inv.label || inv.invoiceNumber || "—"}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-500">
                                {SUPPLIER_INVOICE_SOURCE_LABELS[inv.source]}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5">
                                <span
                                  className={cn(
                                    "text-sm",
                                    late ? "font-semibold text-red-600" : "text-neutral-700",
                                  )}
                                >
                                  {formatDayFr(inv.dueDate)}
                                </span>
                                {due > 0 ? (
                                  <span
                                    className={cn(
                                      "block text-[11px]",
                                      late ? "text-red-600" : "text-neutral-500",
                                    )}
                                  >
                                    {dueLabel(inv.dueDate)}
                                  </span>
                                ) : null}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-right text-neutral-700">
                                {formatCurrency(inv.amount)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-right text-emerald-600">
                                {formatCurrency(inv.paidAmount)}
                              </td>
                              <td
                                className={cn(
                                  "whitespace-nowrap px-3 py-2.5 text-right font-bold",
                                  due > 0 ? "text-red-600" : "text-emerald-600",
                                )}
                              >
                                {due > 0 ? formatCurrency(due) : "Soldée"}
                              </td>
                              {canManage ? (
                                <td className="whitespace-nowrap px-3 py-2">
                                  {due > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPayPreset({
                                          supplierId: inv.supplierId,
                                          invoiceId: inv.id,
                                        });
                                        setPayOpen(true);
                                      }}
                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                                    >
                                      Payer
                                    </button>
                                  ) : null}
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </FsHorizontalScroll>
                </FsCard>
              ) : (
                <div className="space-y-2">
                  {filteredInvoices.map((inv) => (
                    <DebtCard
                      key={inv.id}
                      invoice={inv}
                      canManage={canManage}
                      onOpenSupplier={() => setDetailId(inv.supplierId)}
                      onPay={() => {
                        setPayPreset({ supplierId: inv.supplierId, invoiceId: inv.id });
                        setPayOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* ═════════ Fournisseurs ═════════ */}
          {tab === "suppliers" ? (
            <div className="space-y-3">
              <FilterBar
                search={search}
                onSearch={setSearch}
                placeholder="Rechercher un fournisseur…"
                onExport={
                  filteredAccounts.length > 0
                    ? () =>
                        exportSheet(
                          "balance-fournisseurs",
                          "Balance fournisseurs",
                          supplierAccountsToSpreadsheetMatrix(filteredAccounts) as {
                            headers: string[];
                            rows: (string | number)[][];
                          },
                          `${filteredAccounts.length} fournisseur(s) · dette ${formatCurrency(totals.balance)}`,
                        )
                    : undefined
                }
                chips={[
                  { key: "all", label: "Tous" },
                  { key: "debt", label: "Avec dette" },
                  { key: "overdue", label: "En retard" },
                  { key: "clear", label: "À jour" },
                  { key: "inactive", label: "Inactifs" },
                ]}
                active={supplierFilter}
                onChip={(k) => setSupplierFilter(k as SupplierFilter)}
              />

              {filteredAccounts.length === 0 ? (
                <EmptyState icon={MdBusinessCenter} title="Aucun fournisseur" />
              ) : isWide ? (
                <FsCard className="p-0" padding="p-0">
                  <FsHorizontalScroll>
                    <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-black/[0.06] bg-fs-surface-container/80 text-xs">
                          <th className="px-3 py-2.5 font-semibold text-fs-text">Fournisseur</th>
                          <th className="px-3 py-2.5 font-semibold text-fs-text">Contact</th>
                          <th className="px-3 py-2.5 font-semibold text-fs-text">Délai</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-fs-text">
                            Reste à payer
                          </th>
                          <th className="px-3 py-2.5 text-right font-semibold text-fs-text">
                            En retard
                          </th>
                          <th className="px-3 py-2.5 font-semibold text-fs-text">
                            Prochaine échéance
                          </th>
                          {canManage ? <th className="px-3 py-2.5" /> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAccounts.map((a) => (
                          <tr
                            key={a.id}
                            className="border-b border-black/[0.04] last:border-0 hover:bg-fs-surface-container/50"
                          >
                            <td className="max-w-[220px] px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => setDetailId(a.id)}
                                className="block max-w-full truncate text-left font-semibold text-fs-text hover:text-fs-accent"
                              >
                                {a.name}
                              </button>
                              <span className="block truncate text-[11px] text-neutral-500">
                                {[a.code, a.category, a.city].filter(Boolean).join(" · ") ||
                                  (a.is_active ? "—" : "Inactif")}
                              </span>
                            </td>
                            <td className="max-w-[170px] truncate px-3 py-2.5 text-neutral-700">
                              {a.phone ?? a.contact ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-neutral-700">
                              {a.payment_terms_days > 0 ? `${a.payment_terms_days} j` : "Comptant"}
                            </td>
                            <td
                              className={cn(
                                "whitespace-nowrap px-3 py-2.5 text-right font-bold",
                                a.stats.balance > 0 ? "text-red-600" : "text-emerald-600",
                              )}
                            >
                              {a.stats.balance > 0 ? formatCurrency(a.stats.balance) : "À jour"}
                              {a.overLimit ? (
                                <span className="ml-1 inline-flex items-center rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60">
                                  plafond
                                </span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right">
                              {a.stats.overdueAmount > 0 ? (
                                <span className="font-semibold text-red-600">
                                  {formatCurrency(a.stats.overdueAmount)}
                                  <span className="block text-[11px] font-normal">
                                    {a.daysLate} j
                                  </span>
                                </span>
                              ) : (
                                <span className="text-neutral-400">—</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-neutral-700">
                              {a.stats.nextDueDate ? formatDayFr(a.stats.nextDueDate) : "—"}
                            </td>
                            {canManage ? (
                              <td className="whitespace-nowrap px-3 py-2">
                                <div className="flex items-center justify-end gap-1">
                                  {a.stats.balance > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPayPreset({ supplierId: a.id, invoiceId: null });
                                        setPayOpen(true);
                                      }}
                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                                    >
                                      Payer
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingSupplier(a);
                                      setFormOpen(true);
                                    }}
                                    className="rounded-lg p-2 text-fs-accent hover:bg-fs-surface-container"
                                    aria-label="Modifier"
                                  >
                                    <MdEdit className="h-5 w-5" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirm({ kind: "deleteSupplier", account: a })}
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
                  </FsHorizontalScroll>
                </FsCard>
              ) : (
                <div className="grid grid-cols-1 gap-2 min-[600px]:grid-cols-2">
                  {filteredAccounts.map((a) => (
                    <SupplierAccountCard
                      key={a.id}
                      account={a}
                      canManage={canManage}
                      onOpen={() => setDetailId(a.id)}
                      onPay={() => {
                        setPayPreset({ supplierId: a.id, invoiceId: null });
                        setPayOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* ═════════ Règlements ═════════ */}
          {tab === "payments" ? (
            <div className="space-y-3">
              <FilterBar
                search={search}
                onSearch={setSearch}
                placeholder="Rechercher un règlement…"
                onExport={
                  filteredPayments.length > 0
                    ? () =>
                        exportSheet(
                          "reglements-fournisseurs",
                          "Règlements fournisseurs",
                          supplierPaymentsToSpreadsheetMatrix(filteredPayments) as {
                            headers: string[];
                            rows: (string | number)[][];
                          },
                          `${filteredPayments.length} règlement(s) · ${formatCurrency(paymentsTotal)}`,
                        )
                    : undefined
                }
                chips={[
                  { key: "7", label: "7 jours" },
                  { key: "30", label: "30 jours" },
                  { key: "90", label: "90 jours" },
                  { key: "365", label: "1 an" },
                ]}
                active={String(paymentDays)}
                onChip={(k) => setPaymentDays(Number(k))}
              />

              <FsCard padding="p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Total versé sur la période
                  </p>
                  <p className="text-lg font-bold text-emerald-600">
                    {formatCurrency(paymentsTotal)}
                  </p>
                </div>
              </FsCard>

              {paymentsQ.isLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
                </div>
              ) : filteredPayments.length === 0 ? (
                <EmptyState icon={MdPayments} title="Aucun règlement sur la période" />
              ) : (
                <ul className="space-y-2">
                  {filteredPayments.map((p) => {
                    const advance = Math.max(0, p.amount - p.allocatedAmount);
                    return (
                      <li key={p.id}>
                        <FsCard padding="p-3">
                          <div className="flex items-start gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50">
                              <MdPayments className="h-5 w-5" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => setDetailId(p.supplierId)}
                                className="block max-w-full truncate text-left text-sm font-semibold text-fs-text hover:text-fs-accent"
                              >
                                {p.supplierName}
                              </button>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-500">
                                <span>{formatDateTimeFr(p.paidAt)}</span>
                                <span aria-hidden>·</span>
                                <span>{SUPPLIER_PAYMENT_METHOD_LABELS[p.method]}</span>
                                {p.reference ? (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>réf. {p.reference}</span>
                                  </>
                                ) : null}
                                {p.source === "purchase" ? (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>saisi dans Achats</span>
                                  </>
                                ) : null}
                              </p>
                              {advance > 0 ? (
                                <p className="mt-0.5 text-[11px] font-semibold text-sky-600">
                                  dont {formatCurrency(advance)} en avance
                                </p>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold text-emerald-600">
                                {formatCurrency(p.amount)}
                              </p>
                              {canManage && p.source === "manual" ? (
                                <button
                                  type="button"
                                  onClick={() => setConfirm({ kind: "deletePayment", payment: p })}
                                  className="mt-1 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-fs-surface-container"
                                >
                                  <MdDeleteOutline className="h-4 w-4" aria-hidden />
                                  Supprimer
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </FsCard>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {/* ═════════ Dialogues ═════════ */}
      <SupplierFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingSupplier(null);
        }}
        variant={editingSupplier ? "edit" : "create"}
        openingLocked={
          editingSupplier != null &&
          editingSupplier.opening_balance > 0 &&
          editingSupplier.stats.totalPaid > 0
        }
        initialValue={
          editingSupplier
            ? {
                name: editingSupplier.name,
                contact: editingSupplier.contact ?? "",
                phone: editingSupplier.phone ?? "",
                email: editingSupplier.email ?? "",
                address: editingSupplier.address ?? "",
                notes: editingSupplier.notes ?? "",
                code: editingSupplier.code ?? "",
                city: editingSupplier.city ?? "",
                taxId: editingSupplier.tax_id ?? "",
                bankDetails: editingSupplier.bank_details ?? "",
                category: editingSupplier.category ?? "",
                isActive: editingSupplier.is_active,
                paymentTermsDays: String(editingSupplier.payment_terms_days),
                creditLimit: editingSupplier.credit_limit
                  ? String(editingSupplier.credit_limit)
                  : "",
                openingBalance: editingSupplier.opening_balance
                  ? String(editingSupplier.opening_balance)
                  : "",
              }
            : null
        }
        onSubmit={async (v) => {
          await supplierMut.mutateAsync({
            id: editingSupplier?.id ?? null,
            value: {
              name: v.name,
              contact: v.contact || null,
              phone: v.phone || null,
              email: v.email || null,
              address: v.address || null,
              notes: v.notes || null,
              code: v.code || null,
              city: v.city || null,
              taxId: v.taxId || null,
              bankDetails: v.bankDetails || null,
              category: v.category || null,
              isActive: v.isActive,
              paymentTermsDays: Number(v.paymentTermsDays) || 0,
              creditLimit: Number(v.creditLimit.replace(",", ".")) || 0,
              openingBalance: Number(v.openingBalance.replace(",", ".")) || 0,
            },
          });
        }}
      />

      <SupplierDebtDialog
        open={debtOpen}
        onClose={() => {
          setDebtOpen(false);
          setEditingInvoice(null);
          setPresetSupplierId(null);
        }}
        suppliers={accounts}
        editing={editingInvoice}
        presetSupplierId={presetSupplierId}
        onSubmit={async (v) => {
          await invoiceMut.mutateAsync({
            id: editingInvoice?.id ?? null,
            supplierId: v.supplierId,
            storeId,
            invoiceNumber: v.invoiceNumber,
            label: v.label,
            invoiceDate: v.invoiceDate,
            dueDate: v.dueDate,
            amount: v.amount,
            notes: v.notes,
          });
        }}
      />

      <SupplierPaymentDialog
        open={payOpen}
        onClose={() => {
          setPayOpen(false);
          setPayPreset({ supplierId: null, invoiceId: null });
        }}
        suppliers={accounts}
        invoices={openInvoices}
        presetSupplierId={payPreset.supplierId}
        presetInvoiceId={payPreset.invoiceId}
        onSubmit={async (v) => {
          await paymentMut.mutateAsync({
            supplierId: v.supplierId,
            storeId,
            amount: v.amount,
            method: v.method,
            paidAt: v.paidAt,
            reference: v.reference,
            notes: v.notes,
            allocations: v.allocations,
          });
        }}
      />

      {detail ? (
        <SupplierDetailPanel
          account={detail}
          companyId={companyId}
          canManage={canManage}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setEditingSupplier(detail);
            setFormOpen(true);
          }}
          onPay={(invoiceId) => {
            setPayPreset({ supplierId: detail.id, invoiceId: invoiceId ?? null });
            setPayOpen(true);
          }}
          onAddDebt={() => {
            setEditingInvoice(null);
            setPresetSupplierId(detail.id);
            setDebtOpen(true);
          }}
          onEditInvoice={(inv) => {
            setEditingInvoice(inv);
            setPresetSupplierId(inv.supplierId);
            setDebtOpen(true);
          }}
          onCancelInvoice={(inv, cancel) =>
            setConfirm({ kind: "cancelInvoice", invoice: inv, cancel })
          }
          onDeleteInvoice={(inv) => setConfirm({ kind: "deleteInvoice", invoice: inv })}
          onDeletePayment={(p) => setConfirm({ kind: "deletePayment", payment: p })}
          onApplyCredit={() => applyCreditMut.mutate(detail.id)}
          onExport={(invs, pays) =>
            exportSheet(
              `releve-${detail.name.toLowerCase().replace(/\s+/g, "-")}`,
              "Relevé fournisseur",
              {
                headers: [
                  ...supplierInvoicesToSpreadsheetMatrix(invs).headers,
                ],
                rows: supplierInvoicesToSpreadsheetMatrix(invs).rows as (string | number)[][],
              },
              `${detail.name} · dette ${formatCurrency(detail.stats.balance)} · ${pays.length} règlement(s)`,
            )
          }
        />
      ) : null}

      <FsConfirmDialog
        open={confirm != null}
        tone={confirm?.kind === "cancelInvoice" && !confirm.cancel ? "default" : "danger"}
        busy={
          deleteSupplierMut.isPending ||
          invoiceDeleteMut.isPending ||
          invoiceCancelMut.isPending ||
          paymentDeleteMut.isPending
        }
        title={
          confirm?.kind === "deleteSupplier"
            ? "Supprimer le fournisseur"
            : confirm?.kind === "deleteInvoice"
              ? "Supprimer la dette"
              : confirm?.kind === "cancelInvoice"
                ? confirm.cancel
                  ? "Annuler la dette"
                  : "Rétablir la dette"
                : "Supprimer le règlement"
        }
        message={
          confirm?.kind === "deleteSupplier"
            ? `Supprimer « ${confirm.account.name} » ? Tout son historique de dettes et de règlements sera supprimé avec lui.`
            : confirm?.kind === "deleteInvoice"
              ? "Cette dette sera définitivement supprimée."
              : confirm?.kind === "cancelInvoice"
                ? confirm.cancel
                  ? "La dette ne sera plus comptée dans ce que vous devez."
                  : "La dette sera de nouveau comptée dans ce que vous devez."
                : "Le règlement sera supprimé et les dettes qu'il soldait redeviendront dues."
        }
        confirmLabel={
          confirm?.kind === "cancelInvoice" && !confirm.cancel ? "Rétablir" : "Supprimer"
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const done = () => setConfirm(null);
          if (confirm.kind === "deleteSupplier")
            deleteSupplierMut.mutate(confirm.account.id, { onSuccess: done });
          else if (confirm.kind === "deleteInvoice")
            invoiceDeleteMut.mutate(confirm.invoice.id, { onSuccess: done });
          else if (confirm.kind === "cancelInvoice")
            invoiceCancelMut.mutate(
              { id: confirm.invoice.id, cancel: confirm.cancel },
              { onSuccess: done },
            );
          else paymentDeleteMut.mutate(confirm.payment.id, { onSuccess: done });
        }}
      />
    </FsPage>
  );
}

// ─────────────────────────── Sous-composants ───────────────────────────

function FilterBar({
  search,
  onSearch,
  placeholder,
  chips,
  active,
  onChip,
  onExport,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  chips: { key: string; label: string }[];
  active: string;
  onChip: (key: string) => void;
  onExport?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <MdSearch
            className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            className={fsInputClass("pl-9")}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </div>
        {onExport ? (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-black/[0.12] bg-fs-card px-3 text-xs font-semibold text-neutral-800"
          >
            <MdDownload className="h-5 w-5" aria-hidden />
            <span className="hidden min-[420px]:inline">Excel</span>
          </button>
        ) : null}
      </div>
      <FsHorizontalScroll>
        <div className="flex gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onChip(c.key)}
              className={cn(
                "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold",
                active === c.key
                  ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-fs-accent"
                  : "border-black/[0.08] bg-fs-card text-neutral-700",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </FsHorizontalScroll>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof MdReceiptLong;
  title: string;
  hint?: string;
}) {
  return (
    <FsCard padding="py-12 px-6">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)]">
          <Icon className="h-10 w-10 text-fs-accent" aria-hidden />
        </div>
        <p className="mt-4 text-sm font-semibold text-fs-text">{title}</p>
        {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
      </div>
    </FsCard>
  );
}

/** Barre horizontale des sorties de trésorerie par semaine. */
function CashOutChart({
  slots,
}: {
  slots: { key: string; label: string; amount: number; overdue: boolean }[];
}) {
  const max = Math.max(...slots.map((s) => s.amount), 1);
  const visible = slots.filter((s, i) => s.amount > 0 || i <= 4);
  if (visible.every((s) => s.amount === 0)) {
    return (
      <p className="py-4 text-center text-xs text-neutral-500">
        Aucune sortie prévue : vous ne devez rien.
      </p>
    );
  }
  return (
    <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: 132 }}>
      {visible.map((s) => (
        <div key={s.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span
            className={cn(
              "text-[10px] font-bold leading-none",
              s.overdue ? "text-red-600" : "text-neutral-600",
            )}
          >
            {s.amount > 0 ? formatCurrency(s.amount).replace(/\s?FCFA| F/g, "") : ""}
          </span>
          <div
            className={cn(
              "w-full rounded-t-md",
              s.overdue ? "bg-red-600" : "bg-fs-accent",
              s.amount === 0 && "bg-fs-surface-container",
            )}
            style={{ height: `${Math.max(4, (s.amount / max) * 88)}px` }}
            title={`${s.label} — ${formatCurrency(s.amount)}`}
          />
          <span
            className={cn(
              "w-full truncate text-center text-[10px]",
              s.overdue ? "font-bold text-red-600" : "text-neutral-500",
            )}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function AgingBar({
  rows,
}: {
  rows: { label: string; value: number; className: string }[];
}) {
  const total = rows.reduce((acc, r) => acc + r.value, 0);
  if (total <= 0) {
    return <p className="py-3 text-center text-xs text-neutral-500">Aucune dette en cours.</p>;
  }
  return (
    <>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-fs-surface-container">
        {rows
          .filter((r) => r.value > 0)
          .map((r) => (
            <div
              key={r.label}
              className={r.className}
              style={{ width: `${(r.value / total) * 100}%` }}
              title={`${r.label} — ${formatCurrency(r.value)}`}
            />
          ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 min-[700px]:grid-cols-5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", r.className)} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-600">{r.label}</span>
            <span className="text-[11px] font-semibold text-fs-text">
              {r.value > 0 ? formatCurrency(r.value) : "—"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function DebtCard({
  invoice,
  canManage,
  onOpenSupplier,
  onPay,
}: {
  invoice: SupplierInvoice;
  canManage: boolean;
  onOpenSupplier: () => void;
  onPay: () => void;
}) {
  const due = invoiceDue(invoice);
  const late = invoiceUrgency(invoice) === "overdue";
  return (
    <FsCard
      className={cn(late ? "border-red-500/40" : undefined)}
      padding="p-3"
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenSupplier}
            className="block max-w-full truncate text-left text-sm font-bold text-fs-text"
          >
            {invoice.supplierName}
          </button>
          <p className="mt-0.5 truncate text-xs text-neutral-600">
            {invoice.label || invoice.invoiceNumber || SUPPLIER_INVOICE_SOURCE_LABELS[invoice.source]}
          </p>
          <p
            className={cn(
              "mt-1 text-[11px]",
              late ? "font-semibold text-red-600" : "text-neutral-500",
            )}
          >
            Échéance {formatDayFr(invoice.dueDate)}
            {due > 0 ? ` · ${dueLabel(invoice.dueDate)}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-base font-bold", due > 0 ? "text-red-600" : "text-emerald-600")}>
            {due > 0 ? formatCurrency(due) : "Soldée"}
          </p>
          {invoice.paidAmount > 0 && due > 0 ? (
            <p className="text-[11px] text-neutral-500">
              sur {formatCurrency(invoice.amount)}
            </p>
          ) : null}
        </div>
      </div>
      {canManage && due > 0 ? (
        <button
          type="button"
          onClick={onPay}
          className="mt-2.5 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-xs font-bold text-white"
        >
          <MdPayments className="h-4 w-4" aria-hidden />
          Payer cette dette
        </button>
      ) : null}
    </FsCard>
  );
}

function SupplierAccountCard({
  account,
  canManage,
  onOpen,
  onPay,
}: {
  account: SupplierAccount;
  canManage: boolean;
  onOpen: () => void;
  onPay: () => void;
}) {
  const late = account.stats.overdueAmount > 0;
  return (
    <FsCard className={cn(late ? "border-red-500/40" : undefined)} padding="p-3">
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-2.5 text-left">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
            late
              ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
              : "bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-fs-accent",
          )}
        >
          {account.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-fs-text">
            {account.name}
            {!account.is_active ? (
              <span className="ml-1.5 rounded bg-neutral-200 px-1 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                inactif
              </span>
            ) : null}
          </span>
          <span className="block truncate text-[11px] text-neutral-500">
            {account.phone ?? account.contact ?? account.city ?? "—"}
            {account.payment_terms_days > 0 ? ` · ${account.payment_terms_days} j` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cn(
              "block text-base font-bold",
              account.stats.balance > 0 ? "text-red-600" : "text-emerald-600",
            )}
          >
            {account.stats.balance > 0 ? formatCurrency(account.stats.balance) : "À jour"}
          </span>
          {late ? (
            <span className="block text-[11px] font-semibold text-red-600">
              {account.daysLate} j de retard
            </span>
          ) : account.stats.nextDueDate ? (
            <span className="block text-[11px] text-neutral-500">
              {formatDayFr(account.stats.nextDueDate)}
            </span>
          ) : null}
        </span>
      </button>
      {account.overLimit ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Encours au-dessus du plafond ({formatCurrency(account.credit_limit)})
        </p>
      ) : null}
      {canManage && account.stats.balance > 0 ? (
        <button
          type="button"
          onClick={onPay}
          className="mt-2.5 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-xs font-bold text-white"
        >
          <MdPayments className="h-4 w-4" aria-hidden />
          Payer
        </button>
      ) : null}
    </FsCard>
  );
}
