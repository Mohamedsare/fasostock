"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MdAccountBalanceWallet,
  MdAddCard,
  MdArrowDownward,
  MdArrowUpward,
  MdBlock,
  MdCallMade,
  MdDeleteOutline,
  MdDownload,
  MdEdit,
  MdEmail,
  MdLocationOn,
  MdPayments,
  MdPhone,
  MdReceiptLong,
  MdRestore,
  MdWarningAmber,
} from "react-icons/md";
import { FsCard } from "@/components/ui/fs-screen-primitives";
import { SupplierDialogShell } from "@/components/suppliers/supplier-dialog-shell";
import {
  listSupplierInvoices,
  listSupplierPayments,
} from "@/lib/features/suppliers/api";
import {
  agingBuckets,
  dueLabel,
  formatDateTimeFr,
  formatDayFr,
  invoiceDue,
  invoiceUrgency,
} from "@/lib/features/suppliers/payables-math";
import {
  SUPPLIER_INVOICE_SOURCE_LABELS,
  SUPPLIER_INVOICE_STATUS_LABELS,
  SUPPLIER_PAYMENT_METHOD_LABELS,
  type SupplierAccount,
  type SupplierInvoice,
  type SupplierPayment,
} from "@/lib/features/suppliers/types";
import { queryKeys } from "@/lib/query/query-keys";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

type LedgerRow =
  | { kind: "invoice"; at: string; invoice: SupplierInvoice }
  | { kind: "payment"; at: string; payment: SupplierPayment };

function StatTile({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "warning" | "success" | "info";
  hint?: string;
}) {
  const toneClass = {
    neutral: "text-fs-text",
    danger: "text-red-600",
    warning: "text-amber-600",
    success: "text-emerald-600",
    info: "text-sky-600",
  }[tone];
  return (
    <div className="rounded-xl border border-black/[0.06] bg-fs-surface-container px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className={cn("mt-0.5 text-base font-bold leading-tight", toneClass)}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-neutral-500">{hint}</p> : null}
    </div>
  );
}

/**
 * Relevé de compte d'un fournisseur : sa situation, l'ancienneté de ce qu'on
 * lui doit, et l'historique complet dettes / règlements dans l'ordre réel.
 * C'est l'écran qu'on ouvre quand le fournisseur appelle pour réclamer.
 */
export function SupplierDetailPanel({
  account,
  companyId,
  canManage,
  onClose,
  onEdit,
  onPay,
  onAddDebt,
  onEditInvoice,
  onCancelInvoice,
  onDeleteInvoice,
  onDeletePayment,
  onApplyCredit,
  onExport,
}: {
  account: SupplierAccount;
  companyId: string;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onPay: (invoiceId?: string) => void;
  onAddDebt: () => void;
  onEditInvoice: (invoice: SupplierInvoice) => void;
  onCancelInvoice: (invoice: SupplierInvoice, cancel: boolean) => void;
  onDeleteInvoice: (invoice: SupplierInvoice) => void;
  onDeletePayment: (payment: SupplierPayment) => void;
  onApplyCredit: () => void;
  onExport: (invoices: SupplierInvoice[], payments: SupplierPayment[]) => void;
}) {
  const [filter, setFilter] = useState<"all" | "debts" | "payments" | "open">("all");

  const invoicesQ = useQuery({
    queryKey: queryKeys.supplierInvoices({
      companyId,
      supplierId: account.id,
      settled: true,
    }),
    queryFn: () =>
      listSupplierInvoices({
        companyId,
        supplierId: account.id,
        includeSettled: true,
        includeCancelled: true,
      }),
    staleTime: 15_000,
  });

  const paymentsQ = useQuery({
    queryKey: queryKeys.supplierPayments({
      companyId,
      supplierId: account.id,
      from: null,
      to: null,
    }),
    queryFn: () => listSupplierPayments({ companyId, supplierId: account.id }),
    staleTime: 15_000,
  });

  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);
  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);
  const aging = useMemo(() => agingBuckets(invoices), [invoices]);

  const ledger = useMemo<LedgerRow[]>(() => {
    const rows: LedgerRow[] = [
      ...invoices.map((i) => ({ kind: "invoice" as const, at: i.invoiceDate, invoice: i })),
      ...payments.map((p) => ({ kind: "payment" as const, at: p.paidAt, payment: p })),
    ];
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }, [invoices, payments]);

  const visible = useMemo(() => {
    if (filter === "debts") return ledger.filter((r) => r.kind === "invoice");
    if (filter === "payments") return ledger.filter((r) => r.kind === "payment");
    if (filter === "open")
      return ledger.filter((r) => r.kind === "invoice" && invoiceDue(r.invoice) > 0);
    return ledger;
  }, [ledger, filter]);

  const agingTotal =
    aging.notDue + aging.d1to30 + aging.d31to60 + aging.d61to90 + aging.d90plus;

  const AGING_ROWS: { label: string; value: number; className: string }[] = [
    { label: "Pas encore dû", value: aging.notDue, className: "bg-emerald-500" },
    { label: "1 – 30 j", value: aging.d1to30, className: "bg-amber-400" },
    { label: "31 – 60 j", value: aging.d31to60, className: "bg-orange-500" },
    { label: "61 – 90 j", value: aging.d61to90, className: "bg-red-500" },
    { label: "+ 90 j", value: aging.d90plus, className: "bg-red-800" },
  ];

  return (
    <SupplierDialogShell
      title={account.name}
      subtitle={[account.code, account.category, account.city].filter(Boolean).join(" · ")}
      icon={<MdAccountBalanceWallet className="h-5 w-5 text-fs-accent" aria-hidden />}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        canManage ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onAddDebt}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-black/[0.1] bg-fs-card text-sm font-bold text-fs-text"
            >
              <MdAddCard className="h-5 w-5" aria-hidden />
              Ajouter une dette
            </button>
            <button
              type="button"
              onClick={() => onPay()}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm"
            >
              <MdPayments className="h-5 w-5" aria-hidden />
              Payer
            </button>
          </div>
        ) : null
      }
    >
      {/* Situation */}
      <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
        <StatTile
          label="Reste à payer"
          value={formatCurrency(account.stats.balance)}
          tone={account.stats.balance > 0 ? "danger" : "success"}
          hint={`${account.stats.openInvoices} dette(s) ouverte(s)`}
        />
        <StatTile
          label="En retard"
          value={formatCurrency(account.stats.overdueAmount)}
          tone={account.stats.overdueAmount > 0 ? "danger" : "neutral"}
          hint={account.daysLate > 0 ? `${account.daysLate} j de retard` : "À jour"}
        />
        <StatTile
          label="Sous 7 jours"
          value={formatCurrency(account.stats.dueSoonAmount)}
          tone={account.stats.dueSoonAmount > 0 ? "warning" : "neutral"}
          hint={
            account.stats.nextDueDate
              ? `Prochaine : ${formatDayFr(account.stats.nextDueDate)}`
              : "Rien à venir"
          }
        />
        <StatTile
          label="Avance versée"
          value={formatCurrency(account.stats.creditAvailable)}
          tone={account.stats.creditAvailable > 0 ? "info" : "neutral"}
          hint={`Réglé au total : ${formatCurrency(account.stats.totalPaid)}`}
        />
      </div>

      {account.overLimit ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
          <MdWarningAmber className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            Encours de {formatCurrency(account.stats.balance)} au-dessus du plafond fixé à{" "}
            {formatCurrency(account.credit_limit)}.
          </p>
        </div>
      ) : null}

      {canManage && account.stats.creditAvailable > 0 && account.stats.balance > 0 ? (
        <button
          type="button"
          onClick={onApplyCredit}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2.5 text-left dark:border-sky-900 dark:bg-sky-950/40"
        >
          <span className="min-w-0 text-xs text-sky-900 dark:text-sky-200">
            Une avance de {formatCurrency(account.stats.creditAvailable)} peut être imputée
            sur les dettes ouvertes.
          </span>
          <span className="shrink-0 text-xs font-bold text-sky-700 dark:text-sky-300">
            Imputer
          </span>
        </button>
      ) : null}

      {/* Coordonnées */}
      <FsCard padding="p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-600">
          {account.phone ? (
            <a href={`tel:${account.phone}`} className="inline-flex items-center gap-1.5 font-medium text-fs-accent">
              <MdPhone className="h-4 w-4" aria-hidden />
              {account.phone}
            </a>
          ) : null}
          {account.email ? (
            <a href={`mailto:${account.email}`} className="inline-flex items-center gap-1.5 font-medium text-fs-accent">
              <MdEmail className="h-4 w-4" aria-hidden />
              {account.email}
            </a>
          ) : null}
          {account.address ? (
            <span className="inline-flex items-center gap-1.5">
              <MdLocationOn className="h-4 w-4" aria-hidden />
              {account.address}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <MdCallMade className="h-4 w-4" aria-hidden />
            {account.payment_terms_days > 0
              ? `${account.payment_terms_days} j de délai`
              : "Paiement comptant"}
          </span>
          {canManage ? (
            <button
              type="button"
              onClick={onEdit}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold text-fs-accent hover:bg-fs-surface-container"
            >
              <MdEdit className="h-4 w-4" aria-hidden />
              Modifier la fiche
            </button>
          ) : null}
        </div>
        {account.bank_details ? (
          <p className="mt-2 whitespace-pre-line rounded-lg bg-fs-surface-container px-2.5 py-2 text-xs text-neutral-700">
            {account.bank_details}
          </p>
        ) : null}
      </FsCard>

      {/* Balance âgée */}
      {agingTotal > 0 ? (
        <FsCard padding="p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-fs-text">Ancienneté de la dette</p>
            <p className="text-xs font-bold text-red-600">{formatCurrency(agingTotal)}</p>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-fs-surface-container">
            {AGING_ROWS.filter((r) => r.value > 0).map((r) => (
              <div
                key={r.label}
                className={r.className}
                style={{ width: `${(r.value / agingTotal) * 100}%` }}
                title={`${r.label} — ${formatCurrency(r.value)}`}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 min-[560px]:grid-cols-5">
            {AGING_ROWS.map((r) => (
              <div key={r.label} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", r.className)} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-600">
                  {r.label}
                </span>
                <span className="text-[11px] font-semibold text-fs-text">
                  {r.value > 0 ? formatCurrency(r.value) : "—"}
                </span>
              </div>
            ))}
          </div>
        </FsCard>
      ) : null}

      {/* Relevé */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold text-fs-text">Relevé de compte</p>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {(
              [
                { key: "all", label: "Tout" },
                { key: "open", label: "À payer" },
                { key: "debts", label: "Dettes" },
                { key: "payments", label: "Règlements" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold",
                  filter === f.key
                    ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-fs-accent"
                    : "border-black/[0.08] bg-fs-card text-neutral-700",
                )}
              >
                {f.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onExport(invoices, payments)}
              className="inline-flex items-center gap-1 rounded-lg border border-black/[0.08] bg-fs-card px-2.5 py-1.5 text-[11px] font-semibold text-neutral-700"
            >
              <MdDownload className="h-4 w-4" aria-hidden />
              Excel
            </button>
          </div>
        </div>

        {invoicesQ.isLoading || paymentsQ.isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-black/[0.08] bg-fs-surface-container px-3 py-6 text-center text-xs text-neutral-500">
            Aucun mouvement.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((row) =>
              row.kind === "invoice" ? (
                <InvoiceRow
                  key={`i-${row.invoice.id}`}
                  invoice={row.invoice}
                  canManage={canManage}
                  onPay={() => onPay(row.invoice.id)}
                  onEdit={() => onEditInvoice(row.invoice)}
                  onCancel={(cancel) => onCancelInvoice(row.invoice, cancel)}
                  onDelete={() => onDeleteInvoice(row.invoice)}
                />
              ) : (
                <PaymentRow
                  key={`p-${row.payment.id}`}
                  payment={row.payment}
                  canManage={canManage}
                  onDelete={() => onDeletePayment(row.payment)}
                />
              ),
            )}
          </ul>
        )}
      </div>
    </SupplierDialogShell>
  );
}

function InvoiceRow({
  invoice,
  canManage,
  onPay,
  onEdit,
  onCancel,
  onDelete,
}: {
  invoice: SupplierInvoice;
  canManage: boolean;
  onPay: () => void;
  onEdit: () => void;
  onCancel: (cancel: boolean) => void;
  onDelete: () => void;
}) {
  const due = invoiceDue(invoice);
  const urgency = invoiceUrgency(invoice);
  const fromPurchase = invoice.source === "purchase";

  return (
    <li
      className={cn(
        "rounded-xl border bg-fs-card px-3 py-2.5",
        invoice.status === "cancelled"
          ? "border-black/[0.06] opacity-60"
          : urgency === "overdue"
            ? "border-red-500/40"
            : "border-black/[0.08]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            urgency === "overdue"
              ? "bg-red-100 text-red-600 dark:bg-red-950/50"
              : "bg-fs-surface-container text-neutral-500",
          )}
        >
          <MdArrowUpward className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fs-text">
            {invoice.label || invoice.invoiceNumber || "Dette"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500">
            <span>{SUPPLIER_INVOICE_SOURCE_LABELS[invoice.source]}</span>
            <span aria-hidden>·</span>
            <span>{formatDayFr(invoice.invoiceDate)}</span>
            <span aria-hidden>·</span>
            <span className={urgency === "overdue" ? "font-semibold text-red-600" : undefined}>
              échéance {formatDayFr(invoice.dueDate)}
              {due > 0 ? ` (${dueLabel(invoice.dueDate)})` : ""}
            </span>
          </p>
          {invoice.notes ? (
            <p className="mt-1 line-clamp-2 text-[11px] text-neutral-500">{invoice.notes}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-fs-text">{formatCurrency(invoice.amount)}</p>
          <p
            className={cn(
              "text-[11px] font-semibold",
              due > 0 ? "text-red-600" : "text-emerald-600",
            )}
          >
            {due > 0
              ? `reste ${formatCurrency(due)}`
              : SUPPLIER_INVOICE_STATUS_LABELS[invoice.status]}
          </p>
        </div>
      </div>

      {canManage ? (
        <div className="mt-2 flex flex-wrap justify-end gap-1">
          {due > 0 && invoice.status !== "cancelled" ? (
            <button
              type="button"
              onClick={onPay}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-fs-surface-container dark:text-emerald-400"
            >
              <MdPayments className="h-4 w-4" aria-hidden />
              Payer
            </button>
          ) : null}
          {!fromPurchase && invoice.status !== "cancelled" ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-fs-accent hover:bg-fs-surface-container"
            >
              <MdEdit className="h-4 w-4" aria-hidden />
              Modifier
            </button>
          ) : null}
          {invoice.status === "cancelled" ? (
            <button
              type="button"
              onClick={() => onCancel(false)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-fs-surface-container"
            >
              <MdRestore className="h-4 w-4" aria-hidden />
              Rétablir
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onCancel(true)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-fs-surface-container dark:text-amber-400"
            >
              <MdBlock className="h-4 w-4" aria-hidden />
              Annuler
            </button>
          )}
          {!fromPurchase && invoice.paidAmount === 0 ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-fs-surface-container"
            >
              <MdDeleteOutline className="h-4 w-4" aria-hidden />
              Supprimer
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function PaymentRow({
  payment,
  canManage,
  onDelete,
}: {
  payment: SupplierPayment;
  canManage: boolean;
  onDelete: () => void;
}) {
  const unallocated = Math.max(0, payment.amount - payment.allocatedAmount);
  return (
    <li className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 px-3 py-2.5 dark:bg-emerald-950/20">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60">
          <MdArrowDownward className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fs-text">
            Règlement · {SUPPLIER_PAYMENT_METHOD_LABELS[payment.method]}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-500">
            <span>{formatDateTimeFr(payment.paidAt)}</span>
            {payment.reference ? (
              <>
                <span aria-hidden>·</span>
                <span>réf. {payment.reference}</span>
              </>
            ) : null}
            {payment.source === "purchase" ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <MdReceiptLong className="h-3.5 w-3.5" aria-hidden />
                  saisi dans Achats
                </span>
              </>
            ) : null}
          </p>
          {unallocated > 0 ? (
            <p className="mt-0.5 text-[11px] font-semibold text-sky-600">
              dont {formatCurrency(unallocated)} en avance
            </p>
          ) : null}
        </div>
        <p className="shrink-0 text-sm font-bold text-emerald-700 dark:text-emerald-400">
          − {formatCurrency(payment.amount)}
        </p>
      </div>
      {canManage && payment.source === "manual" ? (
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-fs-surface-container"
          >
            <MdDeleteOutline className="h-4 w-4" aria-hidden />
            Supprimer
          </button>
        </div>
      ) : null}
    </li>
  );
}
