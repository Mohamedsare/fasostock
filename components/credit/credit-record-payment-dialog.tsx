"use client";

import { useState } from "react";
import {
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import type { CreditSaleRow } from "@/lib/features/credit/types";
import { CREDIT_AMOUNT_EPS, remainingTotal } from "@/lib/features/credit/credit-math";

function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

export function CreditRecordPaymentDialog({
  sale,
  open,
  onClose,
  onSubmit,
  busy,
}: {
  sale: CreditSaleRow | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (p: {
    method: "cash" | "mobile_money" | "card" | "transfer";
    /** En espèces : montant réellement remis ; autrement : montant imputé au solde. */
    tendered: number;
    reference: string | null;
  }) => void;
  busy: boolean;
}) {
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

  if (!open || !sale) return null;

  const rest = remainingTotal(sale);
  const tendered = Math.max(0, parseFloat(amountStr.replace(",", ".") || "0") || 0);

  const mobileProviderLabel =
    method === "orange_money"
      ? "Orange money"
      : method === "moov_money"
        ? "Moov money"
        : method === "wave"
          ? "Wave"
          : null;
  const backendMethod: "cash" | "mobile_money" | "card" | "transfer" =
    method === "orange_money" || method === "moov_money" || method === "wave"
      ? "mobile_money"
      : method;

  const isCash = backendMethod === "cash";
  const applied = isCash ? roundMoney(Math.min(tendered, rest)) : roundMoney(tendered);
  const changeDue =
    isCash ? Math.max(0, roundMoney(tendered - applied)) : 0;

  const nonCashOver =
    !isCash && tendered > rest + CREDIT_AMOUNT_EPS && tendered > CREDIT_AMOUNT_EPS;

  const canSubmit = isCash
    ? tendered > CREDIT_AMOUNT_EPS &&
      applied > CREDIT_AMOUNT_EPS &&
      rest > CREDIT_AMOUNT_EPS
    : tendered > CREDIT_AMOUNT_EPS &&
      tendered <= rest + CREDIT_AMOUNT_EPS &&
      rest > CREDIT_AMOUNT_EPS;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Fermer" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-black/10 bg-fs-card p-4 shadow-2xl sm:rounded-2xl dark:border-white/10">
        <h3 className="text-lg font-bold text-fs-text">Enregistrer un paiement</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-600">{sale.sale_number}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold",
              "border-[#F97316]/35 bg-[#FFEDD5] text-[#C2410C]",
              "dark:border-orange-400/40 dark:bg-orange-950/40 dark:text-orange-200",
            )}
          >
            Reste: {formatCurrency(rest)}
          </span>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Mode</label>
            <select
              className={fsInputClass("w-full")}
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
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
            {isCash && tendered > CREDIT_AMOUNT_EPS ? (
              <p className="mt-1 text-xs text-neutral-600">
                Imputé au solde :{" "}
                <span className="font-semibold text-fs-text">{formatCurrency(applied)}</span>
                {changeDue > CREDIT_AMOUNT_EPS ? (
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
                Le montant ne peut pas dépasser le reste à payer ({formatCurrency(rest)}) pour ce mode de
                paiement.
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
            onClick={onClose}
            className="flex-1 rounded-xl border border-black/10 py-2.5 text-sm font-semibold dark:border-white/15"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() =>
              onSubmit({
                method: backendMethod,
                tendered,
                reference: mobileProviderLabel
                  ? [mobileProviderLabel, note.trim()].filter(Boolean).join(" — ")
                  : note.trim() || null,
              })
            }
            className={cn(
              "flex-1 rounded-xl bg-fs-accent py-2.5 text-sm font-bold text-white",
              "disabled:opacity-50",
            )}
          >
            {busy ? "…" : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}
