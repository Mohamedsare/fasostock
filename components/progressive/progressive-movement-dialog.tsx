"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdClose, MdPayments, MdUndo } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  addProgressiveDeposit,
  addProgressiveRefund,
} from "@/lib/features/progressive/api";
import { planGoal } from "@/lib/features/progressive/progressive-math";
import {
  PROGRESSIVE_METHOD_LABELS,
  type ProgressivePaymentMethod,
  type ProgressivePlan,
} from "@/lib/features/progressive/types";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

const METHODS: ProgressivePaymentMethod[] = ["cash", "mobile_money", "card", "transfer", "other"];
const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 25000, 50000];

/**
 * Enregistre un versement (avance) ou un remboursement, puis remonte l'id du
 * mouvement pour imprimer immédiatement le ticket du client.
 */
export function ProgressiveMovementDialog({
  plan,
  mode,
  onClose,
  onDone,
}: {
  plan: ProgressivePlan;
  mode: "deposit" | "refund";
  onClose: () => void;
  /** Mouvement enregistré → ouvrir le ticket. */
  onDone: (ledgerId: string) => void;
}) {
  const isRefund = mode === "refund";
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ProgressivePaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setAmount(isRefund ? String(Math.round(plan.balance)) : "");
    setMethod("cash");
    setReference("");
    setNote("");
  }, [isRefund, plan.id, plan.balance]);

  const value = Math.round(toNumber(amount));
  const goal = planGoal(plan);
  const newBalance = isRefund
    ? Math.max(0, plan.balance - value)
    : plan.balance + value;
  const remainingToGoal = goal != null ? Math.max(0, goal - newBalance) : null;
  const ratio = goal != null && goal > 0 ? Math.min(1, newBalance / goal) : 0;

  const tooMuch = isRefund && value > plan.balance + 0.5;
  const canSubmit = value > 0 && !tooMuch;

  const mut = useMutation({
    mutationFn: () => {
      const params = {
        planId: plan.id,
        amount: value,
        method,
        reference: reference.trim() || null,
        note: note.trim() || null,
      };
      return isRefund ? addProgressiveRefund(params) : addProgressiveDeposit(params);
    },
    onSuccess: (res) => {
      toast.success(
        isRefund
          ? `Remboursement enregistré (${res.receiptNumber}).`
          : `Versement enregistré (${res.receiptNumber}).`,
      );
      onDone(res.ledgerId);
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  const quick = useMemo(
    () => (isRefund ? [] : QUICK_AMOUNTS),
    [isRefund],
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 min-[560px]:items-center min-[560px]:p-4"
      role="presentation"
      onClick={() => (mut.isPending ? null : onClose())}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-fs-card shadow-2xl min-[560px]:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={isRefund ? "Rembourser le client" : "Nouveau versement"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-fs-text">
              {isRefund ? (
                <MdUndo className="h-5 w-5 text-amber-600" aria-hidden />
              ) : (
                <MdPayments className="h-5 w-5 text-emerald-600" aria-hidden />
              )}
              {isRefund ? "Rembourser le client" : "Nouveau versement"}
            </h2>
            <p className="truncate text-xs text-neutral-500">
              {plan.planNumber} · {plan.clientName}
              {plan.clientPhone ? ` · ${plan.clientPhone}` : ""}
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
          <div className="rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_8%,transparent)] p-3">
            <p className="text-xs text-neutral-600">Épargne actuelle</p>
            <p className="text-xl font-extrabold tabular-nums text-fs-text">
              {formatCurrency(plan.balance)}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-600">
              {isRefund ? "Montant à rendre (FCFA)" : "Montant versé (FCFA)"}
            </label>
            <input
              className={fsInputClass("text-2xl font-extrabold tabular-nums")}
              inputMode="numeric"
              autoFocus
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            />
            {tooMuch ? (
              <p className="mt-1 text-xs font-semibold text-red-600">
                Supérieur à l&apos;épargne disponible ({formatCurrency(plan.balance)}).
              </p>
            ) : null}
            {quick.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {quick.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmount(String(value + q))}
                    className="rounded-lg border border-black/10 bg-fs-surface-container px-2.5 py-1.5 text-xs font-bold text-neutral-700 transition-colors hover:border-fs-accent hover:text-fs-accent dark:border-white/10 dark:text-neutral-200"
                  >
                    +{q.toLocaleString("fr-FR")}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmount("")}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-neutral-500 hover:underline"
                >
                  Effacer
                </button>
              </div>
            ) : null}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-600">Moyen de paiement</p>
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                    method === m
                      ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                      : "border-black/10 text-neutral-600 hover:bg-black/[0.04] dark:border-white/10 dark:text-neutral-300",
                  )}
                >
                  {PROGRESSIVE_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">
                Référence (optionnel)
              </label>
              <input
                className={fsInputClass()}
                placeholder="N° transaction Mobile Money…"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">
                Note (optionnel)
              </label>
              <input
                className={fsInputClass()}
                placeholder="Ex. versé par son frère"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {value > 0 ? (
            <div className="rounded-xl border border-black/[0.07] bg-fs-surface-container/60 p-3 dark:border-white/10">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-neutral-600">Nouvelle épargne</span>
                <span className="text-lg font-extrabold tabular-nums text-emerald-600">
                  {formatCurrency(newBalance)}
                </span>
              </div>
              {goal != null ? (
                <>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-fs-accent transition-[width] duration-300"
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-neutral-600">
                    {remainingToGoal === 0
                      ? "Objectif atteint 🎉"
                      : `Reste ${formatCurrency(remainingToGoal ?? 0)} sur un objectif de ${formatCurrency(goal)}`}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-black/[0.07] p-4 dark:border-white/10">
          <button
            type="button"
            disabled={!canSubmit || mut.isPending}
            onClick={() => mut.mutate()}
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-50",
              isRefund ? "bg-amber-600" : "bg-fs-accent",
            )}
          >
            {mut.isPending ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            {isRefund ? "Rembourser et imprimer le reçu" : "Encaisser et imprimer le ticket"}
          </button>
          <p className="mt-2 text-center text-[11px] text-neutral-500">
            Le ticket s&apos;ouvre juste après pour l&apos;impression thermique (58 ou 80 mm).
          </p>
        </div>
      </div>
    </div>
  );
}
