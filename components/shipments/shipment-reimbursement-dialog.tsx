"use client";

/**
 * « Le client m'a rendu le transport. »
 *
 * Le geste est court et se fait souvent au téléphone : le montant est pré-rempli avec
 * le reste entier (le cas courant — on rend les 4 500 F d'un coup), et le moyen de
 * paiement tient en boutons. Le mobile money est mis en avant : un client de province
 * ne rembourse pas en espèces, il envoie.
 */

import { useState } from "react";
import { MdCheck, MdClose } from "react-icons/md";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import type { Shipment } from "@/lib/features/shipments/types";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, toNumber } from "@/lib/utils/currency";

/**
 * Les valeurs sont celles de l'enum `payment_method` de PostgreSQL. L'opérateur
 * (Orange, Moov, Wave) part dans `reference` — même convention que `sale_payments`.
 */
const METHODS = [
  { value: "mobile_money", label: "Orange Money", reference: "Orange Money" },
  { value: "mobile_money", label: "Moov Money", reference: "Moov Money" },
  { value: "mobile_money", label: "Wave", reference: "Wave" },
  { value: "cash", label: "Espèces", reference: null },
  { value: "transfer", label: "Virement", reference: null },
] as const;

export function ShipmentReimbursementDialog({
  shipment,
  busy,
  onClose,
  onSubmit,
}: {
  shipment: Shipment;
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: {
    amount: number;
    method: string;
    reference: string | null;
    note: string | null;
  }) => void;
}) {
  const [amountText, setAmountText] = useState(
    String(Math.round(shipment.shippingRemaining)),
  );
  const [methodIndex, setMethodIndex] = useState(0);
  const [note, setNote] = useState("");

  const amount = Math.max(0, toNumber(amountText));
  const tooMuch = amount > shipment.shippingRemaining + 0.005;
  const canSubmit = amount > 0 && !tooMuch && !busy;
  const method = METHODS[methodIndex] ?? METHODS[0]!;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Frais de transport remboursés"
    >
      <button type="button" className="absolute inset-0 -z-0" aria-label="Fermer" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg bg-fs-surface shadow-2xl sm:max-h-[88vh] sm:max-w-md sm:rounded-lg">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-neutral-300 sm:hidden" />

        <div className="flex items-start gap-3 border-b border-black/6 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fs-accent">
              {shipment.shipmentNumber}
            </p>
            <h2 className="truncate text-sm font-bold text-fs-text">
              {shipment.recipientName} · {shipment.destination}
            </h2>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              Transport avancé : {formatCurrency(shipment.shippingCost)} · reste{" "}
              {formatCurrency(shipment.shippingRemaining)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-black/5"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
              htmlFor="shipment-reimb-amount"
            >
              Montant rendu
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="shipment-reimb-amount"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                inputMode="numeric"
                autoFocus
                className={fsInputClass("min-w-0 flex-1 text-right text-lg font-bold tabular-nums")}
              />
              <button
                type="button"
                onClick={() => setAmountText(String(Math.round(shipment.shippingRemaining)))}
                className="shrink-0 rounded-md border border-black/10 bg-fs-card px-3 text-xs font-semibold text-neutral-800"
              >
                Tout
              </button>
            </div>
            {tooMuch ? (
              <p className="mt-1 text-xs font-semibold text-red-600">
                Il ne reste que {formatCurrency(shipment.shippingRemaining)} de frais à
                rembourser.
              </p>
            ) : (
              <p className="mt-1 text-xs text-neutral-500">
                Après ce versement, il restera{" "}
                <span className="font-semibold tabular-nums">
                  {formatCurrency(Math.max(0, shipment.shippingRemaining - amount))}
                </span>
                .
              </p>
            )}
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Reçu par
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {METHODS.map((m, i) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => setMethodIndex(i)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    methodIndex === i
                      ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                      : "border-black/10 bg-fs-card text-neutral-700",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
              htmlFor="shipment-reimb-note"
            >
              Note
            </label>
            <input
              id="shipment-reimb-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex. envoyé avec le règlement de la facture"
              maxLength={200}
              className={fsInputClass("mt-1.5 w-full")}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-black/6 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-md border border-black/10 bg-fs-card text-sm font-semibold text-neutral-800"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                amount,
                method: method.value,
                reference: method.reference,
                note: note.trim() || null,
              })
            }
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-fs-accent text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <MdCheck className="h-5 w-5" aria-hidden />
            )}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
