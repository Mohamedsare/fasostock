"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { fetchCreditSaleDetail, updateSaleCreditMeta } from "@/lib/features/credit/api";
import {
  CREDIT_AMOUNT_EPS,
  creditLineStatus,
  CREDIT_STATUS_LABELS,
  daysOverdue,
  effectiveDueDate,
  paidTotal,
  remainingTotal,
} from "@/lib/features/credit/credit-math";
import { paymentMethodLabel } from "@/lib/features/receipt/build-receipt-ticket-data";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";
import { P } from "@/lib/constants/permissions";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { MdClose } from "react-icons/md";
import { useEffect, useState } from "react";
import { CreditQuickPayDialog } from "./credit-quick-pay-dialog";
import type { CreditSaleRow } from "@/lib/features/credit/types";

function isoDateInput(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function CreditDetailPanel({
  saleId,
  onClose,
  creditQueryKey: cq,
}: {
  saleId: string | null;
  onClose: () => void;
  creditQueryKey: readonly unknown[];
}) {
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canPay = hasPermission(P.salesUpdate);

  const [payOpen, setPayOpen] = useState(false);
  const [dueStr, setDueStr] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const q = useQuery({
    queryKey: ["credit-sale-detail", saleId],
    queryFn: () => fetchCreditSaleDetail(saleId!),
    enabled: !!saleId,
  });

  const sale = q.data;

  useEffect(() => {
    if (!sale) {
      setDueStr("");
      setInternalNote("");
      return;
    }
    setDueStr(isoDateInput(effectiveDueDate(sale)));
    setInternalNote(sale.credit_internal_note ?? "");
  }, [sale]);

  const metaMut = useMutation({
    mutationFn: () =>
      updateSaleCreditMeta({
        saleId: saleId!,
        creditDueAt: dueStr ? new Date(`${dueStr}T12:00:00`).toISOString() : null,
        creditInternalNote: internalNote,
      }),
    onSuccess: async () => {
      toast.success("Échéance / notes enregistrées.");
      await qc.invalidateQueries({ queryKey: cq });
      await q.refetch();
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  if (!saleId) return null;

  return (
    <>
      <div className="fixed inset-0 z-[75] flex justify-end bg-black/40">
        <button type="button" className="min-w-0 flex-1 md:min-w-[120px]" aria-label="Fermer" onClick={onClose} />
        <div className="flex h-dvh w-full max-w-lg flex-col border-l border-black/10 bg-fs-card shadow-2xl dark:border-white/10">
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
            <h3 className="text-base font-bold text-fs-text">Détail crédit</h3>
            <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/10">
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {q.isLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
              </div>
            ) : !sale ? (
              <p className="text-sm text-neutral-600">Vente introuvable.</p>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="rounded-2xl border border-black/10 bg-fs-surface-low/60 p-3 dark:border-white/10">
                  <p className="font-bold text-fs-text">{sale.sale_number}</p>
                  <p className="text-neutral-600">{sale.customer?.name ?? "—"}</p>
                  {sale.customer?.phone ? (
                    <a className="text-fs-accent hover:underline" href={`tel:${sale.customer.phone}`}>
                      {sale.customer.phone}
                    </a>
                  ) : null}
                  {sale.customer?.address ? (
                    <p className="mt-1 text-neutral-600">{sale.customer.address}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-neutral-500">
                    {format(new Date(sale.created_at), "dd MMM yyyy HH:mm", { locale: fr })} ·{" "}
                    {sale.store?.name ?? "—"} · {sale.created_by_label ?? "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-black/10 p-3 dark:border-white/10">
                  <p className="text-xs font-semibold text-neutral-600">Montants</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <span>Total TTC</span>
                    <span className="text-right font-semibold">{formatCurrency(sale.total)}</span>
                    <span>Encaissé</span>
                    <span className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(paidTotal(sale))}
                    </span>
                    <span>Reste</span>
                    <span className="text-right font-bold text-fs-accent">
                      {formatCurrency(remainingTotal(sale))}
                    </span>
                  </div>
                  <p className="mt-2 text-xs">
                    Statut :{" "}
                    <span className="font-semibold">
                      {CREDIT_STATUS_LABELS[creditLineStatus(sale)]}
                    </span>
                    {daysOverdue(sale) > 0 ? (
                      <span className="text-red-600"> · Retard {daysOverdue(sale)} j</span>
                    ) : null}
                  </p>
                </div>
                <div className="rounded-2xl border border-black/10 p-3 dark:border-white/10">
                  <p className="text-xs font-semibold text-neutral-600">Échéance & notes internes</p>
                  <label className="mt-2 block text-xs text-neutral-500">Date d&apos;échéance</label>
                  <input
                    type="date"
                    className={fsInputClass("mt-1 w-full")}
                    value={dueStr}
                    onChange={(e) => setDueStr(e.target.value)}
                  />
                  <label className="mt-2 block text-xs text-neutral-500">Notes (relance, promesse…)</label>
                  <textarea
                    className={fsInputClass("mt-1 min-h-[72px] w-full resize-y")}
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={metaMut.isPending || !canPay}
                    onClick={() => metaMut.mutate()}
                    className="mt-2 w-full rounded-xl bg-neutral-800 py-2 text-xs font-bold text-white disabled:opacity-50 dark:bg-neutral-200 dark:text-neutral-900"
                  >
                    Enregistrer échéance / notes
                  </button>
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-600">Historique des paiements</p>
                  <ul className="mt-2 space-y-2">
                    {(sale.sale_payments ?? [])
                      .slice()
                      .sort((a, b) => a.created_at.localeCompare(b.created_at))
                      .map((p) => (
                        <li
                          key={p.id}
                          className="flex justify-between rounded-xl border border-black/8 px-3 py-2 text-xs dark:border-white/10"
                        >
                          <span>
                            {format(new Date(p.created_at), "dd/MM/yyyy HH:mm", { locale: fr })} —{" "}
                            {paymentMethodLabel(p.method)}
                          </span>
                          <span className="font-bold">{formatCurrency(p.amount)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-600">Articles</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {(sale.sale_items ?? []).map((it) => (
                      <li key={it.id} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">{it.product?.name ?? it.product_id}</span>
                        <span>
                          ×{it.quantity} {formatCurrency(it.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                {canPay && remainingTotal(sale) > CREDIT_AMOUNT_EPS ? (
                  <button
                    type="button"
                    onClick={() => setPayOpen(true)}
                    className="w-full rounded-xl bg-fs-accent py-3 text-sm font-bold text-white"
                  >
                    Enregistrer un paiement
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
      <CreditQuickPayDialog
        sale={sale as CreditSaleRow | null}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onPaid={async () => {
          await qc.invalidateQueries({ queryKey: cq });
          await q.refetch();
        }}
      />
    </>
  );
}
