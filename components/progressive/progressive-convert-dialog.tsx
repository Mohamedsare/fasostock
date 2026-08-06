"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdClose, MdInventory2 } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  completeConvertedEngineDetails,
  convertProgressivePlan,
} from "@/lib/features/progressive/api";
import type { ProgressiveTerms } from "@/lib/features/progressive/progressive-terms";
import type {
  ProgressiveEligibleItem,
  ProgressivePlan,
} from "@/lib/features/progressive/types";
import { amountToFrenchWordsCFA } from "@/lib/utils/number-to-french-words";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";

/**
 * Remise de l'article au client : transforme l'épargne en vente réelle
 * (déstockage + règlements ventilés par moyen de paiement) et clôture le dossier.
 *
 * Les champs engin (châssis, moteur, couleur) n'apparaissent que pour les
 * boutiques ayant le module Vente Engins — ailleurs la remise est directe.
 */
export function ProgressiveConvertDialog({
  plan,
  item,
  terms,
  engineModuleOn,
  onClose,
  onConverted,
}: {
  plan: ProgressivePlan;
  item: ProgressiveEligibleItem;
  terms: ProgressiveTerms;
  /** La boutique a le module Vente Engins → facture A4 + fiche engin. */
  engineModuleOn: boolean;
  onClose: () => void;
  onConverted: (saleId: string, residual: number) => void;
}) {
  const [chassis, setChassis] = useState("");
  const [motor, setMotor] = useState("");
  const [color, setColor] = useState("");

  const residual = Math.max(0, Math.round(plan.balance - item.price));

  const mut = useMutation({
    mutationFn: async () => {
      const res = await convertProgressivePlan({
        planId: plan.id,
        productId: item.productId,
        quantity: 1,
      });
      if (engineModuleOn) {
        // Best-effort : la vente existe déjà, la fiche engin reste éditable ensuite.
        try {
          await completeConvertedEngineDetails({
            saleId: res.saleId,
            amountInWords: amountToFrenchWordsCFA(res.total),
            chassis,
            motor,
            color,
          });
        } catch {
          /* la facture reste générable ; détails complétables dans Vente Engins */
        }
      }
      return res;
    },
    onSuccess: (res) => {
      toast.success(`Vente ${res.saleNumber} enregistrée — ${terms.singular} remis au client.`);
      onConverted(res.saleId, res.residual);
    },
    onError: (e) =>
      toast.error(
        messageFromUnknownError(
          e,
          "La remise de l'article n'a pas pu être enregistrée. Réessayez ; si le problème persiste, contactez le support.",
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
        aria-label={`${terms.handOverAction} au client`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-fs-text">
              <MdInventory2 className="h-5 w-5 text-emerald-600" aria-hidden />
              {terms.handOverAction}
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
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
            <p className="text-sm font-bold text-fs-text">{item.name}</p>
            <div className="mt-2 space-y-1 text-sm">
              <Line label={`Prix ${terms.ofSingular}`} value={formatCurrency(item.price)} strong />
              <Line label="Épargne du client" value={formatCurrency(plan.balance)} />
              <Line
                label="Reliquat après remise"
                value={formatCurrency(residual)}
                hint={residual > 0 ? "à rembourser au client" : undefined}
              />
            </div>
          </div>

          {engineModuleOn ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600">N° châssis</label>
                <input
                  className={fsInputClass()}
                  value={chassis}
                  onChange={(e) => setChassis(e.target.value)}
                  placeholder="Optionnel"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600">N° moteur</label>
                <input
                  className={fsInputClass()}
                  value={motor}
                  onChange={(e) => setMotor(e.target.value)}
                  placeholder="Optionnel"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600">Couleur</label>
                <input
                  className={fsInputClass()}
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="Optionnel"
                />
              </div>
            </div>
          ) : null}

          <p className="text-xs leading-relaxed text-neutral-600">
            La vente sera enregistrée avec déstockage et les règlements ventilés selon les moyens
            de paiement réellement encaissés. Le dossier passera en «{" "}
            {terms.handedOverStatus.toLowerCase()} » et ne pourra plus recevoir de versement.
          </p>
        </div>

        <div className="shrink-0 border-t border-black/[0.07] p-4 dark:border-white/10">
          <button
            type="button"
            disabled={mut.isPending}
            onClick={() => mut.mutate()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm disabled:opacity-50"
          >
            {mut.isPending ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            Confirmer la remise au client
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
