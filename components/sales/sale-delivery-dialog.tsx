"use client";

import { useState } from "react";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { saleDelivery } from "@/lib/features/sales/sale-delivery";
import type { SaleDeliveryState, SaleItem } from "@/lib/features/sales/types";
import { formatCurrency } from "@/lib/utils/currency";
import { toIsoDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { MdInventory2, MdTaskAlt } from "react-icons/md";

/**
 * Deux gestes, une seule fenêtre :
 *
 *  • « Le client a payé et laisse la marchandise »  → date annoncée + précision, tout
 *    facultatif : au comptoir, on n'a pas toujours le temps, et un formulaire long ne
 *    serait pas rempli plus soigneusement — il ne serait pas rempli du tout.
 *  • « Le client est venu chercher »                → confirmation, parce que l'inverse
 *    (marquer remis ce qui est encore là) est exactement l'erreur qui fait perdre la
 *    marchandise. On rappelle donc ce qui était attendu avant de valider.
 */
export function SaleDeliveryDialog({
  sale,
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  sale: SaleItem;
  /** État visé par le geste en cours. */
  target: SaleDeliveryState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (values: { dueAt: string | null; note: string | null }) => void;
}) {
  const current = saleDelivery(sale);
  const [dueAt, setDueAt] = useState(current.dueAt ?? "");
  const [note, setNote] = useState(current.note ?? "");
  const pending = target === "pending";

  const submit = () => {
    if (busy) return;
    onConfirm({ dueAt: dueAt || null, note: note.trim() || null });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={pending ? "Marquer à retirer" : "Confirmer la remise"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <FsCard
        className="w-full max-w-md rounded-t-[22px] shadow-xl sm:rounded-[22px]"
        padding="p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              pending
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {pending ? (
              <MdInventory2 className="h-6 w-6" aria-hidden />
            ) : (
              <MdTaskAlt className="h-6 w-6" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-fs-text">
              {pending ? "Payé, pas encore emporté" : "Marchandise remise ?"}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              {pending
                ? "La vente reste complétée et encaissée. Elle apparaîtra dans « À retirer » jusqu'à ce que le client vienne chercher."
                : "Confirmez que le client a bien récupéré sa marchandise. Votre nom et l'heure seront enregistrés."}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-fs-surface-container px-3 py-2 text-sm">
          <p className="font-semibold text-fs-text">
            {sale.sale_number}{" "}
            <span className="font-normal text-neutral-600">
              — {formatCurrency(sale.total)}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            {sale.customer?.name?.trim() || "Client de passage"}
            {sale.customer?.phone ? ` · ${sale.customer.phone}` : ""}
          </p>
        </div>

        {pending ? (
          <>
            <div className="mt-4">
              <label
                htmlFor="fs-delivery-due"
                className="mb-1.5 block text-xs font-medium text-neutral-600"
              >
                Le client vient chercher le (facultatif)
              </label>
              <input
                id="fs-delivery-due"
                type="date"
                value={dueAt}
                min={toIsoDate(new Date())}
                onChange={(e) => setDueAt(e.target.value)}
                className={cn(fsInputClass(), "min-h-12 rounded-[6px] sm:min-h-11")}
              />
            </div>
            <div className="mt-3">
              <label
                htmlFor="fs-delivery-note"
                className="mb-1.5 block text-xs font-medium text-neutral-600"
              >
                Précision (facultatif)
              </label>
              <input
                id="fs-delivery-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={140}
                placeholder="Ex. : 3 sacs mis de côté au magasin, son frère passera"
                className={cn(fsInputClass(), "min-h-12 rounded-[6px] sm:min-h-11")}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-neutral-500">
              Le stock ne change pas : ces articles sont déjà vendus. Mettez-les de côté —
              au comptage d&apos;inventaire, ils ne font plus partie du stock de la boutique.
            </p>
          </>
        ) : (
          <div className="mt-4 space-y-1.5 text-sm text-neutral-700">
            {current.note ? (
              <p>
                <span className="font-semibold text-fs-text">À remettre :</span>{" "}
                {current.note}
              </p>
            ) : null}
            {current.waitingDays !== null ? (
              <p className="text-neutral-600">
                En attente depuis{" "}
                {current.waitingDays === 0
                  ? "aujourd'hui"
                  : `${current.waitingDays} jour${current.waitingDays > 1 ? "s" : ""}`}
                .
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60",
              pending ? "bg-amber-600" : "bg-emerald-600",
            )}
          >
            {busy ? "…" : pending ? "Marquer à retirer" : "Confirmer la remise"}
          </button>
        </div>
      </FsCard>
    </div>
  );
}
