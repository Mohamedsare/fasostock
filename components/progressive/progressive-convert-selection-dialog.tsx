"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { MdClose, MdShoppingCart } from "react-icons/md";
import {
  convertProgressiveSelection,
  listProgressivePlanItems,
} from "@/lib/features/progressive/api";
import type { ProgressiveTerms } from "@/lib/features/progressive/progressive-terms";
import type { ProgressivePlan } from "@/lib/features/progressive/types";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";

/**
 * Remise de TOUTE la sélection : une seule vente multi-lignes (déstockage de
 * chaque article + règlements ventilés par moyen de paiement), l'épargne est
 * consommée et le dossier clôturé.
 */
export function ProgressiveConvertSelectionDialog({
  plan,
  terms,
  onClose,
  onConverted,
}: {
  plan: ProgressivePlan;
  terms: ProgressiveTerms;
  onClose: () => void;
  onConverted: (saleId: string, residual: number) => void;
}) {
  const itemsQ = useQuery({
    queryKey: queryKeys.progressivePlanItems(plan.id),
    queryFn: () => listProgressivePlanItems(plan.id),
    staleTime: 10_000,
  });
  const items = itemsQ.data ?? [];
  const total = items.reduce((acc, it) => acc + it.lineTotal, 0);
  const residual = Math.max(0, Math.round(plan.balance - total));
  const covered = items.length > 0 && plan.balance + 0.5 >= total;

  const mut = useMutation({
    mutationFn: () => convertProgressiveSelection(plan.id),
    onSuccess: (res) => {
      toast.success(`Vente ${res.saleNumber} enregistrée — sélection remise au client.`);
      onConverted(res.saleId, res.residual);
    },
    onError: (e) =>
      toast.error(
        messageFromUnknownError(
          e,
          "La remise de la sélection n'a pas pu être enregistrée. Réessayez ; si le problème persiste, contactez le support.",
        ),
      ),
  });

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 p-0 min-[560px]:items-center min-[560px]:p-4"
      role="presentation"
      onClick={() => (mut.isPending ? null : onClose())}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-fs-card shadow-2xl min-[560px]:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Remettre toute la sélection"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-fs-text">
              <MdShoppingCart className="h-5 w-5 text-emerald-600" aria-hidden />
              Remettre toute la sélection
            </h2>
            <p className="truncate text-xs text-neutral-500">
              {plan.planNumber} · {plan.clientName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5 text-fs-text" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {itemsQ.isLoading ? (
            <div className="flex min-h-[120px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] dark:divide-white/10">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="shrink-0 text-xs font-bold text-neutral-600 dark:text-neutral-300">
                      {it.quantity}×
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fs-text">
                      {it.label}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-fs-text">
                      {formatCurrency(it.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-1">
                <Line label="Total de la sélection" value={formatCurrency(total)} strong />
                <Line label="Épargne du client" value={formatCurrency(plan.balance)} />
                <Line
                  label="Reliquat après remise"
                  value={formatCurrency(residual)}
                  hint={residual > 0 ? "à rembourser au client" : undefined}
                />
              </div>

              <p className="text-xs leading-relaxed text-neutral-600">
                La vente sera enregistrée avec déstockage de chaque {terms.singular} et les
                règlements ventilés selon les moyens de paiement réellement encaissés. Le
                dossier passera en « {terms.handedOverStatus.toLowerCase()} » et ne pourra
                plus recevoir de versement.
              </p>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-black/[0.07] p-4 dark:border-white/10">
          <button
            type="button"
            disabled={mut.isPending || !covered}
            onClick={() => mut.mutate()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm disabled:opacity-50"
          >
            {mut.isPending ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            {covered
              ? "Confirmer la remise au client"
              : `Épargne insuffisante (${formatCurrency(Math.max(0, total - plan.balance))} manquants)`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  hint,
}: {
  label: string;
  value: string;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-neutral-600">
        {label}
        {hint ? <span className="ml-1 text-[11px] text-amber-700">({hint})</span> : null}
      </span>
      <span
        className={
          strong
            ? "text-base font-extrabold tabular-nums text-fs-text"
            : "text-sm font-semibold tabular-nums text-fs-text"
        }
      >
        {value}
      </span>
    </div>
  );
}
