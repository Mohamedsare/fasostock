"use client";

import { useMemo } from "react";
import { MdClose } from "react-icons/md";
import {
  CREDIT_AMOUNT_EPS,
  CREDIT_STATUS_LABELS,
  creditLineStatus,
  daysOverdue,
  effectiveDueDate,
  paidTotal,
  remainingTotal,
} from "@/lib/features/credit/credit-math";
import type { CreditLineStatus, CreditSaleRow } from "@/lib/features/credit/types";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOperationDateTime } from "@/lib/utils/operation-datetime";

function statusPillClass(s: CreditLineStatus): string {
  switch (s) {
    case "solde":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "en_retard":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "partiel":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "non_paye":
      return "bg-neutral-500/15 text-neutral-800 dark:text-neutral-200";
    default:
      return "bg-neutral-400/15 text-neutral-600";
  }
}

/**
 * Vue consolidée « tous les crédits d'un même client » : total dû, encaissé,
 * taux de recouvrement, plus la liste détaillée (ouverts + soldés) sur la période filtrée.
 * S'appuie sur les ventes déjà chargées (`allSales`) — aucune requête serveur supplémentaire.
 */
export function CustomerCreditPanel({
  customerId,
  allSales,
  onClose,
  onOpenSaleDetail,
  onPay,
  canRecordPayment,
}: {
  customerId: string | null;
  allSales: CreditSaleRow[];
  onClose: () => void;
  onOpenSaleDetail: (saleId: string) => void;
  onPay: (sale: CreditSaleRow) => void;
  canRecordPayment: boolean;
}) {
  const data = useMemo(() => {
    if (!customerId) return null;
    const rows = allSales.filter((s) => s.customer_id === customerId);
    if (rows.length === 0) return null;
    const customer = rows.find((s) => s.customer)?.customer ?? null;

    let totalDue = 0;
    let overdue = 0;
    let paidAll = 0;
    let saleTotal = 0;
    let openCount = 0;
    let nextDue: Date | null = null;
    for (const s of rows) {
      paidAll += paidTotal(s);
      saleTotal += Number(s.total);
      const rem = remainingTotal(s);
      if (rem > CREDIT_AMOUNT_EPS) {
        totalDue += rem;
        openCount += 1;
        if (daysOverdue(s) > 0) overdue += rem;
        const d = effectiveDueDate(s);
        if (!nextDue || d < nextDue) nextDue = d;
      }
    }
    const portfolio = totalDue + paidAll;
    const recoveryRate = portfolio > CREDIT_AMOUNT_EPS ? (paidAll / portfolio) * 100 : 100;
    const risk: "normal" | "attention" | "critique" =
      overdue <= CREDIT_AMOUNT_EPS
        ? "normal"
        : overdue >= totalDue * 0.5
          ? "critique"
          : "attention";

    // Ouverts (par retard puis reste) d'abord, soldés/annulés ensuite (par date récente).
    const sorted = rows.slice().sort((a, b) => {
      const ra = remainingTotal(a);
      const rb = remainingTotal(b);
      const aOpen = ra > CREDIT_AMOUNT_EPS ? 1 : 0;
      const bOpen = rb > CREDIT_AMOUNT_EPS ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      if (aOpen === 1) {
        const da = daysOverdue(a);
        const db = daysOverdue(b);
        if (da !== db) return db - da;
        return rb - ra;
      }
      return b.created_at.localeCompare(a.created_at);
    });

    return {
      customer,
      totalDue,
      overdue,
      paidAll,
      saleTotal,
      openCount,
      totalCount: rows.length,
      nextDue,
      recoveryRate,
      risk,
      rows: sorted,
    };
  }, [customerId, allSales]);

  if (!customerId) return null;

  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-black/40">
      <button
        type="button"
        className="min-w-0 flex-1 md:min-w-[120px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="flex h-dvh w-full max-w-2xl flex-col border-l border-black/10 bg-fs-card shadow-2xl dark:border-white/10">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <h3 className="text-base font-bold text-fs-text">Crédits du client</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!data ? (
            <p className="text-sm text-neutral-600">Client introuvable pour la période filtrée.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-black/10 bg-fs-surface-low/60 p-3 dark:border-white/10">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-fs-text">
                      {data.customer?.name ?? "Client non renseigné"}
                    </p>
                    {data.customer?.phone ? (
                      <a className="text-sm text-fs-accent hover:underline" href={`tel:${data.customer.phone}`}>
                        {data.customer.phone}
                      </a>
                    ) : null}
                    {data.customer?.address ? (
                      <p className="mt-0.5 text-xs text-neutral-600">{data.customer.address}</p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
                      data.risk === "critique"
                        ? "bg-red-500/20 text-red-800 dark:text-red-300"
                        : data.risk === "attention"
                          ? "bg-amber-500/20 text-amber-800 dark:text-amber-200"
                          : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                    )}
                  >
                    {data.risk === "critique" ? "Critique" : data.risk === "attention" ? "Attention" : "Normal"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-xl border-2 border-fs-accent/40 bg-fs-accent/5 px-3 py-2">
                  <p className="text-[11px] text-neutral-600">Total dû (reste)</p>
                  <p className="text-base font-bold text-fs-accent">{formatCurrency(data.totalDue)}</p>
                </div>
                <div className="rounded-xl border border-black/10 px-3 py-2 dark:border-white/10">
                  <p className="text-[11px] text-neutral-600">Déjà encaissé</p>
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(data.paidAll)}
                  </p>
                </div>
                <div className="rounded-xl border border-black/10 px-3 py-2 dark:border-white/10">
                  <p className="text-[11px] text-neutral-600">Crédit total</p>
                  <p className="text-base font-bold text-fs-text">{formatCurrency(data.saleTotal)}</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30">
                  <p className="text-[11px] text-red-700 dark:text-red-300">En retard</p>
                  <p className="text-base font-bold text-red-700 dark:text-red-300">{formatCurrency(data.overdue)}</p>
                </div>
                <div className="rounded-xl border border-black/10 px-3 py-2 dark:border-white/10">
                  <p className="text-[11px] text-neutral-600">Taux recouvrement</p>
                  <p className="text-base font-bold text-fs-text">
                    {Math.max(0, Math.min(100, Math.round(data.recoveryRate)))}%
                  </p>
                </div>
                <div className="rounded-xl border border-black/10 px-3 py-2 dark:border-white/10">
                  <p className="text-[11px] text-neutral-600">Proch. échéance</p>
                  <p className="text-sm font-semibold text-fs-text">
                    {data.nextDue ? formatOperationDateTime(data.nextDue.toISOString()) : "—"}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-neutral-600">
                  {data.rows.length} crédit(s) · {data.openCount} ouvert(s)
                </p>
                <ul className="space-y-2">
                  {data.rows.map((s) => {
                    const st = creditLineStatus(s);
                    const rem = remainingTotal(s);
                    const overdueDays = daysOverdue(s);
                    return (
                      <li
                        key={s.id}
                        className="rounded-xl border border-black/8 p-3 dark:border-white/10"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-sm font-semibold text-fs-text">
                              {s.sale_number}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {formatOperationDateTime(s.created_at)}
                              {s.store?.name ? ` · ${s.store.name}` : ""}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
                              statusPillClass(st),
                            )}
                          >
                            {CREDIT_STATUS_LABELS[st]}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                          <div>
                            <p className="text-neutral-500">Total</p>
                            <p className="font-semibold tabular-nums">{formatCurrency(s.total)}</p>
                          </div>
                          <div>
                            <p className="text-neutral-500">Encaissé</p>
                            <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(paidTotal(s))}
                            </p>
                          </div>
                          <div>
                            <p className="text-neutral-500">Reste</p>
                            <p className="font-bold tabular-nums text-fs-accent">{formatCurrency(rem)}</p>
                          </div>
                        </div>
                        {rem > CREDIT_AMOUNT_EPS ? (
                          <p className="mt-1.5 text-[11px] text-neutral-600">
                            Échéance : {formatOperationDateTime(effectiveDueDate(s).toISOString())}
                            {overdueDays > 0 ? (
                              <span className="ml-1 font-semibold text-red-600">(+{overdueDays} j)</span>
                            ) : null}
                          </p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenSaleDetail(s.id)}
                            className="whitespace-nowrap rounded-lg bg-fs-accent/15 px-2.5 py-1 text-xs font-bold text-fs-accent"
                          >
                            Voir
                          </button>
                          {canRecordPayment && rem > CREDIT_AMOUNT_EPS ? (
                            <button
                              type="button"
                              onClick={() => onPay(s)}
                              className="whitespace-nowrap rounded-lg bg-fs-accent px-2.5 py-1 text-xs font-bold text-white"
                            >
                              Encaisser
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
