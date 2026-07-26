"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MdCheckCircle,
  MdClose,
  MdDelete,
  MdEdit,
  MdEventBusy,
  MdPayments,
  MdPrint,
  MdReceiptLong,
  MdRestartAlt,
  MdWarningAmber,
} from "react-icons/md";
import { listRentalPayments, listRentalSchedule } from "@/lib/features/rental/api";
import {
  RENTAL_HEALTH_LABELS,
  balanceLabel,
  formatDateFr,
  leaseHealth,
  toIsoDate,
} from "@/lib/features/rental/rental-format";
import {
  RENTAL_FREQUENCY_LABELS,
  RENTAL_LEASE_STATUS_LABELS,
  RENTAL_METHOD_LABELS,
  RENTAL_PAYMENT_KIND_LABELS,
  type RentalLease,
} from "@/lib/features/rental/types";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

type Tab = "schedule" | "payments" | "info";

/**
 * Fiche complète d'un bail : situation, échéancier mois par mois, historique des
 * encaissements (avec réimpression de chaque quittance) et actions du bailleur.
 */
export function RentalLeaseDetail({
  lease,
  isOwner,
  onClose,
  onPay,
  onEdit,
  onEndLease,
  onReopen,
  onDelete,
  onReprint,
}: {
  lease: RentalLease;
  isOwner: boolean;
  onClose: () => void;
  onPay: () => void;
  onEdit: () => void;
  onEndLease: () => void;
  onReopen: () => void;
  onDelete?: () => void;
  onReprint: (paymentId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("schedule");
  // Figé au montage : le rendu reste pur et le marquage « en retard » stable.
  const [todayIso] = useState(() => toIsoDate(new Date()));

  const scheduleQ = useQuery({
    queryKey: queryKeys.rentalSchedule(lease.id),
    queryFn: () => listRentalSchedule(lease.id),
    staleTime: 10_000,
  });
  const paymentsQ = useQuery({
    queryKey: queryKeys.rentalPayments(lease.id),
    queryFn: () => listRentalPayments(lease.id),
    staleTime: 10_000,
  });

  const health = leaseHealth(lease);
  const isActive = lease.status === "active";

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/45 p-0 min-[700px]:items-center min-[700px]:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-3xl flex-col rounded-t-2xl bg-fs-card shadow-2xl min-[700px]:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Bail ${lease.leaseNumber}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête : qui, où, et la situation d'argent en un coup d'œil. */}
        <div className="shrink-0 border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-fs-text">{lease.tenantName}</h2>
              <p className="truncate text-xs text-neutral-500">
                {lease.propertyName} — {lease.unitLabel} · {lease.leaseNumber}
                {lease.tenantPhone ? ` · ${lease.tenantPhone}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Fermer"
            >
              <MdClose className="h-6 w-6 text-fs-text" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
            <MiniStat label="Loyer" value={formatCurrency(lease.rentAmount)} />
            <MiniStat
              label={lease.balance >= 0 ? "Reste dû" : "Avance"}
              value={formatCurrency(Math.abs(lease.balance))}
              tone={lease.balance > 0.5 ? "danger" : lease.balance < -0.5 ? "info" : "success"}
            />
            <MiniStat label="À jour jusqu'au" value={formatDateFr(lease.paidThrough)} />
            <MiniStat label="Caution détenue" value={formatCurrency(lease.depositPaid)} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                health === "late"
                  ? "bg-red-500/15 text-red-700 dark:text-red-300"
                  : health === "due"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : health === "advance"
                      ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                      : health === "closed"
                        ? "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300"
                        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {health === "late" ? (
                <MdWarningAmber className="h-3.5 w-3.5" aria-hidden />
              ) : health === "current" ? (
                <MdCheckCircle className="h-3.5 w-3.5" aria-hidden />
              ) : null}
              {RENTAL_HEALTH_LABELS[health]}
            </span>
            <span className="text-[11px] text-neutral-500">{balanceLabel(lease)}</span>
            {lease.nextDueDate && isActive ? (
              <span className="text-[11px] text-neutral-500">
                · prochaine échéance {formatDateFr(lease.nextDueDate)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Onglets */}
        <div className="flex shrink-0 gap-1 border-b border-black/[0.07] px-3 pt-2 dark:border-white/10">
          {(
            [
              { key: "schedule" as const, label: "Échéancier" },
              { key: "payments" as const, label: "Encaissements" },
              { key: "info" as const, label: "Contrat" },
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-t-lg px-3 py-2 text-xs font-bold transition-colors",
                tab === t.key
                  ? "border-b-2 border-fs-accent text-fs-accent"
                  : "text-neutral-500 hover:text-fs-text",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "schedule" ? (
            scheduleQ.isLoading ? (
              <Spinner />
            ) : (scheduleQ.data ?? []).length === 0 ? (
              <Empty text="Aucune échéance générée pour l'instant." />
            ) : (
              <ul className="space-y-1.5">
                {(scheduleQ.data ?? []).map((inv) => {
                  const late = inv.status === "open" && inv.dueDate < todayIso;
                  const partial = inv.status === "open" && inv.amountPaid > 0.5;
                  return (
                    <li
                      key={inv.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5",
                        inv.status === "paid"
                          ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                          : inv.status === "cancelled"
                            ? "border-black/[0.06] bg-black/[0.02] opacity-60 dark:border-white/10 dark:bg-white/[0.03]"
                            : late
                              ? "border-red-500/30 bg-red-500/[0.06]"
                              : "border-black/[0.07] dark:border-white/10",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold capitalize text-fs-text">
                          {inv.label ?? formatDateFr(inv.periodStart)}
                        </p>
                        <p className="truncate text-[11px] text-neutral-500">
                          {formatDateFr(inv.periodStart)} → {formatDateFr(inv.periodEnd)} ·
                          échéance {formatDateFr(inv.dueDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold tabular-nums text-fs-text">
                          {formatCurrency(inv.amountDue)}
                        </p>
                        <p
                          className={cn(
                            "text-[11px] font-bold",
                            inv.status === "paid"
                              ? "text-emerald-600"
                              : inv.status === "cancelled"
                                ? "text-neutral-500"
                                : late
                                  ? "text-red-600"
                                  : "text-amber-600",
                          )}
                        >
                          {inv.status === "paid"
                            ? "Payé"
                            : inv.status === "cancelled"
                              ? "Annulé"
                              : partial
                                ? `Partiel — ${formatCurrency(inv.amountPaid)} reçus`
                                : late
                                  ? "En retard"
                                  : "À payer"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : tab === "payments" ? (
            paymentsQ.isLoading ? (
              <Spinner />
            ) : (paymentsQ.data ?? []).length === 0 ? (
              <Empty text="Aucun encaissement enregistré sur ce bail." />
            ) : (
              <ul className="space-y-1.5">
                {(paymentsQ.data ?? []).map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[0.07] px-3 py-2.5 dark:border-white/10"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fs-text">
                        {formatCurrency(p.amount)}
                        <span className="ml-2 text-[11px] font-medium text-neutral-500">
                          {RENTAL_PAYMENT_KIND_LABELS[p.kind]}
                        </span>
                      </p>
                      <p className="truncate text-[11px] text-neutral-500">
                        {formatDateFr(p.paidAt)}
                        {p.method ? ` · ${RENTAL_METHOD_LABELS[p.method]}` : ""}
                        {p.receiptNumber ? ` · ${p.receiptNumber}` : ""}
                        {p.createdByName ? ` · ${p.createdByName}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onReprint(p.id)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-black/10 px-3 text-xs font-bold text-neutral-700 hover:border-fs-accent hover:text-fs-accent dark:border-white/10 dark:text-neutral-200"
                    >
                      <MdPrint className="h-4 w-4" aria-hidden />
                      Quittance
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-2">
              <InfoRow k="Statut" v={RENTAL_LEASE_STATUS_LABELS[lease.status]} />
              <InfoRow k="Bien" v={`${lease.propertyName} — ${lease.unitLabel}`} />
              {lease.propertyAddress ? (
                <InfoRow k="Adresse" v={lease.propertyAddress} />
              ) : null}
              <InfoRow k="Début" v={formatDateFr(lease.startDate)} />
              <InfoRow k="Fin prévue" v={lease.endDate ? formatDateFr(lease.endDate) : "Reconduction tacite"} />
              {lease.endedAt ? <InfoRow k="Sortie effective" v={formatDateFr(lease.endedAt)} /> : null}
              {lease.endReason ? <InfoRow k="Motif de sortie" v={lease.endReason} /> : null}
              <InfoRow k="Périodicité" v={RENTAL_FREQUENCY_LABELS[lease.frequency]} />
              <InfoRow k="Tolérance" v={`${lease.graceDays} jour(s)`} />
              <InfoRow k="Caution convenue" v={formatCurrency(lease.depositAmount)} />
              <InfoRow k="Caution détenue" v={formatCurrency(lease.depositPaid)} />
              <InfoRow k="Total facturé" v={formatCurrency(lease.totalDue)} />
              <InfoRow k="Total encaissé" v={formatCurrency(lease.totalPaid)} />
              <InfoRow
                k="Échéances"
                v={`${lease.invoiceCount} émises · ${lease.unpaidCount} non soldées · ${lease.lateCount} en retard`}
              />
              {lease.notes ? <InfoRow k="Notes" v={lease.notes} /> : null}
            </div>
          )}
        </div>

        {/* Actions du bailleur */}
        <div className="shrink-0 border-t border-black/[0.07] p-3 dark:border-white/10">
          <div className="flex flex-wrap gap-2">
            {isActive ? (
              <button
                type="button"
                onClick={onPay}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm"
              >
                <MdPayments className="h-5 w-5" aria-hidden />
                Encaisser un règlement
              </button>
            ) : (
              <button
                type="button"
                onClick={onReopen}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-black/10 px-4 text-sm font-bold text-fs-text dark:border-white/10"
              >
                <MdRestartAlt className="h-5 w-5" aria-hidden />
                Réactiver le bail
              </button>
            )}
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-black/10 px-3 text-xs font-bold text-neutral-700 dark:border-white/10 dark:text-neutral-200"
            >
              <MdEdit className="h-4 w-4" aria-hidden />
              Modifier
            </button>
            {isActive ? (
              <button
                type="button"
                onClick={onEndLease}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-amber-600/40 px-3 text-xs font-bold text-amber-700 dark:text-amber-300"
              >
                <MdEventBusy className="h-4 w-4" aria-hidden />
                Fin de bail
              </button>
            ) : null}
            {isOwner && onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-red-600/40 px-3 text-xs font-bold text-red-600"
              >
                <MdDelete className="h-4 w-4" aria-hidden />
                Supprimer
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "success" | "info";
}) {
  return (
    <div className="rounded-xl bg-black/[0.03] px-2.5 py-2 dark:bg-white/[0.05]">
      <p className="truncate text-[10px] font-medium text-neutral-500">{label}</p>
      <p
        className={cn(
          "truncate text-sm font-extrabold tabular-nums",
          tone === "danger"
            ? "text-red-600"
            : tone === "success"
              ? "text-emerald-600"
              : tone === "info"
                ? "text-sky-600"
                : "text-fs-text",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/[0.05] pb-1.5 dark:border-white/[0.07]">
      <span className="text-xs text-neutral-500">{k}</span>
      <span className="text-sm font-semibold text-fs-text">{v}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-[160px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-center">
      <MdReceiptLong className="h-10 w-10 text-neutral-300" aria-hidden />
      <p className="text-sm text-neutral-500">{text}</p>
    </div>
  );
}
