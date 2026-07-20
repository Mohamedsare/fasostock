"use client";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { appendSalePayment } from "@/lib/features/credit/api";
import { getEngineSaleDetail } from "@/lib/features/engine-sales/api";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/** Tolérance arrondis monnaie (FCFA), alignée sur la page Crédit. */
const EPS = 0.005;
function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

export type EngineCollectTarget = {
  saleId: string;
  saleNumber: string;
  total: number;
  /** Reste à payer connu à l'ouverture (revalidé côté serveur avant l'encaissement). */
  remaining: number;
};

type BackendMethod = "cash" | "mobile_money" | "card" | "transfer";

/**
 * Encaissement d'un paiement sur une vente d'engin partiellement / non réglée.
 * Calqué sur `CreditRecordPaymentDialog` + `CreditQuickPayDialog` (page Crédit) :
 * réutilise le RPC `append_sale_payment` (via `appendSalePayment`), impute au solde,
 * gère la monnaie à rendre en espèces et revalide le reste dû avant d'envoyer.
 */
export function EngineCollectPaymentDialog({
  target,
  open,
  onClose,
  onPaid,
}: {
  target: EngineCollectTarget | null;
  open: boolean;
  onClose: () => void;
  onPaid: () => void | Promise<void>;
}) {
  const qc = useQueryClient();
  type PaymentModeUi =
    | "cash"
    | "orange_money"
    | "moov_money"
    | "wave"
    | "card"
    | "transfer";
  const [method, setMethod] = useState<PaymentModeUi>("cash");
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");

  const payMut = useMutation({
    mutationFn: (vars: {
      saleId: string;
      method: BackendMethod;
      amount: number;
      reference: string | null;
      /** Montant réellement remis (espèces) — pour la monnaie à rendre. */
      tendered: number;
    }) =>
      appendSalePayment({
        saleId: vars.saleId,
        method: vars.method,
        amount: vars.amount,
        reference: vars.reference,
      }),
    onSuccess: async (_res, vars) => {
      const change =
        vars.method === "cash"
          ? Math.max(0, roundMoney(vars.tendered - vars.amount))
          : 0;
      if (change > EPS) {
        toast.success(`Paiement encaissé. Monnaie à rendre : ${formatCurrency(change)}.`);
      } else {
        toast.success("Paiement encaissé.");
      }
      reset();
      onClose();
      // La vente d'engin à crédit est aussi rattachée à un client → refléter le
      // nouvel encaissement dans la page Crédit et les ventes.
      await qc.invalidateQueries({ queryKey: ["credit-sales"] });
      await qc.invalidateQueries({ queryKey: ["sales"] });
      await onPaid();
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  if (!open || !target) return null;

  const rest = Math.max(0, target.remaining);
  const tendered = Math.max(0, parseFloat(amountStr.replace(",", ".") || "0") || 0);

  const mobileProviderLabel =
    method === "orange_money"
      ? "Orange money"
      : method === "moov_money"
        ? "Moov money"
        : method === "wave"
          ? "Wave"
          : null;
  const backendMethod: BackendMethod =
    method === "orange_money" || method === "moov_money" || method === "wave"
      ? "mobile_money"
      : method;

  const isCash = backendMethod === "cash";
  const applied = isCash ? roundMoney(Math.min(tendered, rest)) : roundMoney(tendered);
  const changeDue = isCash ? Math.max(0, roundMoney(tendered - applied)) : 0;
  const nonCashOver = !isCash && tendered > rest + EPS && tendered > EPS;

  const canSubmit = isCash
    ? tendered > EPS && applied > EPS && rest > EPS
    : tendered > EPS && tendered <= rest + EPS && rest > EPS;

  function reset() {
    setMethod("cash");
    setAmountStr("");
    setNote("");
  }

  function submit() {
    if (!target) return;
    void (async () => {
      try {
        // Reste frais côté serveur : évite un sur-encaissement si le solde a bougé
        // (paiement concurrent, autre appareil) — le RPC refuserait de toute façon.
        const fresh = await getEngineSaleDetail(target.saleId);
        const freshRest = fresh
          ? Math.max(
              0,
              roundMoney(fresh.total - fresh.payments.reduce((s, p) => s + p.amount, 0)),
            )
          : rest;

        if (freshRest <= EPS) {
          toast.info("Cette vente est déjà soldée. La liste a été actualisée.");
          reset();
          onClose();
          await onPaid();
          return;
        }
        if (!isCash && tendered > freshRest + EPS) {
          toast.error(
            `Le montant ne peut pas dépasser le reste à payer (${formatCurrency(freshRest)}) pour ce mode de paiement.`,
          );
          return;
        }
        const amount = isCash ? roundMoney(Math.min(tendered, freshRest)) : roundMoney(tendered);
        if (amount <= EPS) {
          toast.error("Montant reçu insuffisant ou invalide.");
          return;
        }
        payMut.mutate({
          saleId: target.saleId,
          method: backendMethod,
          amount,
          reference: mobileProviderLabel
            ? [mobileProviderLabel, note.trim()].filter(Boolean).join(" — ")
            : note.trim() || null,
          tendered,
        });
      } catch (e) {
        toast.error(messageFromUnknownError(e));
      }
    })();
  }

  const busy = payMut.isPending;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Fermer"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-black/10 bg-fs-card p-4 shadow-2xl sm:rounded-2xl dark:border-white/10">
        <h3 className="text-lg font-bold text-fs-text">Encaisser un paiement</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-600">{target.saleNumber}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold",
              "border-[#F97316]/35 bg-[#FFEDD5] text-[#C2410C]",
              "dark:border-orange-400/40 dark:bg-orange-950/40 dark:text-orange-200",
            )}
          >
            Reste : {formatCurrency(rest)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Mode</label>
            <select
              className={fsInputClass("w-full")}
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentModeUi)}
            >
              <option value="cash">Espèces</option>
              <option value="orange_money">Orange money</option>
              <option value="moov_money">Moov money</option>
              <option value="wave">Wave</option>
              <option value="card">Carte</option>
              <option value="transfer">Virement</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              {isCash ? "Montant reçu (espèces)" : "Montant encaissé"}
            </label>
            <input
              className={fsInputClass("w-full")}
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={rest > 0 ? formatCurrency(rest) : "0"}
            />
            {isCash && tendered > EPS ? (
              <p className="mt-1 text-xs text-neutral-600">
                Imputé au solde :{" "}
                <span className="font-semibold text-fs-text">{formatCurrency(applied)}</span>
                {changeDue > EPS ? (
                  <>
                    {" "}
                    · Monnaie à rendre :{" "}
                    <span className="font-bold text-[#F97316]">{formatCurrency(changeDue)}</span>
                  </>
                ) : null}
              </p>
            ) : null}
            {nonCashOver ? (
              <p className="mt-1 text-xs font-medium text-red-600">
                Le montant ne peut pas dépasser le reste à payer ({formatCurrency(rest)}) pour ce mode
                de paiement.
              </p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Note / référence</label>
            <input
              className={fsInputClass("w-full")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reçu, n° transaction…"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
            className="flex-1 rounded-xl border border-black/10 py-2.5 text-sm font-semibold disabled:opacity-50 dark:border-white/15"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={submit}
            className={cn(
              "flex-1 rounded-xl bg-fs-accent py-2.5 text-sm font-bold text-white",
              "disabled:opacity-50",
            )}
          >
            {busy ? "…" : "Valider l'encaissement"}
          </button>
        </div>
      </div>
    </div>
  );
}
