"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdPayments } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  RentalDialogShell,
  RentalField,
  RentalSubmitButton,
} from "@/components/rental/rental-dialog-shell";
import { addRentalPayment } from "@/lib/features/rental/api";
import { formatDateFr, toIsoDate } from "@/lib/features/rental/rental-format";
import {
  RENTAL_METHODS,
  RENTAL_METHOD_LABELS,
  RENTAL_PAYMENT_KIND_LABELS,
  type RentalLease,
  type RentalPaymentKind,
  type RentalPaymentMethod,
} from "@/lib/features/rental/types";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

const KINDS: RentalPaymentKind[] = ["rent", "deposit", "charge", "deposit_refund", "other"];

/**
 * Encaissement d'un règlement locatif. Pensé pour le geste réel du bailleur :
 * le locataire arrive, on choisit « 1 mois / 2 mois / solde total », on encaisse,
 * la quittance s'ouvre pour impression.
 */
export function RentalPaymentDialog({
  lease,
  onClose,
  onDone,
}: {
  lease: RentalLease;
  onClose: () => void;
  /** Encaissement enregistré → ouvrir la quittance. */
  onDone: (paymentId: string) => void;
}) {
  const [kind, setKind] = useState<RentalPaymentKind>("rent");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<RentalPaymentMethod>("cash");
  const [paidOn, setPaidOn] = useState(() => toIsoDate(new Date()));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  // Ouverture : proposer le geste le plus fréquent — solder ce qui est dû, ou
  // à défaut un mois de loyer.
  useEffect(() => {
    const due = Math.max(0, Math.round(lease.balance));
    setKind("rent");
    setAmount(String(due > 0 ? due : Math.round(lease.rentAmount)));
    setMethod("cash");
    setPaidOn(toIsoDate(new Date()));
    setReference("");
    setNote("");
  }, [lease.id, lease.balance, lease.rentAmount]);

  const value = Math.round(toNumber(amount));
  const isRent = kind === "rent";
  const newBalance = isRent ? lease.balance - value : lease.balance;
  const monthsCovered =
    isRent && lease.rentAmount > 0 ? Math.floor((value + 0.5) / lease.rentAmount) : 0;
  const canSubmit = value > 0;

  const quick = useMemo(() => {
    if (!isRent || lease.rentAmount <= 0) return [];
    const due = Math.max(0, Math.round(lease.balance));
    const items: { label: string; value: number }[] = [
      { label: "1 mois", value: Math.round(lease.rentAmount) },
      { label: "2 mois", value: Math.round(lease.rentAmount * 2) },
      { label: "3 mois", value: Math.round(lease.rentAmount * 3) },
      { label: "6 mois", value: Math.round(lease.rentAmount * 6) },
    ];
    if (due > 0) items.unshift({ label: "Tout le dû", value: due });
    return items;
  }, [isRent, lease.rentAmount, lease.balance]);

  const mut = useMutation({
    mutationFn: () =>
      addRentalPayment({
        leaseId: lease.id,
        amount: value,
        method,
        kind,
        // Une date sans heure serait interprétée à minuit UTC : on ancre à midi
        // local pour que le jour imprimé sur la quittance soit toujours le bon.
        paidAt: new Date(`${paidOn}T12:00:00`).toISOString(),
        reference: reference.trim() || null,
        note: note.trim() || null,
      }),
    onSuccess: (res) => {
      toast.success(`Encaissement enregistré (${res.receiptNumber}).`);
      onDone(res.paymentId);
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Encaissement impossible.")),
  });

  return (
    <RentalDialogShell
      title="Encaisser un règlement"
      subtitle={`${lease.tenantName} · ${lease.propertyName} — ${lease.unitLabel}`}
      icon={<MdPayments className="h-5 w-5 text-emerald-600" aria-hidden />}
      onClose={onClose}
      busy={mut.isPending}
      footer={
        <>
          <RentalSubmitButton
            label="Encaisser et imprimer la quittance"
            tone="emerald"
            disabled={!canSubmit}
            busy={mut.isPending}
            onClick={() => mut.mutate()}
          />
          <p className="mt-2 text-center text-[11px] text-neutral-500">
            La quittance s&apos;ouvre juste après pour l&apos;impression thermique (58 ou 80 mm).
          </p>
        </>
      }
    >
      {/* Situation du bail, pour décider en un coup d'œil. */}
      <div
        className={cn(
          "rounded-xl p-3",
          lease.balance > 0.5
            ? "bg-red-500/10"
            : lease.balance < -0.5
              ? "bg-sky-500/10"
              : "bg-emerald-500/10",
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs text-neutral-600">
            {lease.balance > 0.5
              ? "Reste dû à ce jour"
              : lease.balance < -0.5
                ? "Avance déjà versée"
                : "Compte à jour"}
          </span>
          <span className="text-xl font-extrabold tabular-nums text-fs-text">
            {formatCurrency(Math.abs(lease.balance))}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          Loyer {formatCurrency(lease.rentAmount)} ·{" "}
          {lease.paidThrough
            ? `à jour jusqu'au ${formatDateFr(lease.paidThrough)}`
            : "aucune période soldée"}
          {lease.nextDueDate ? ` · prochaine échéance ${formatDateFr(lease.nextDueDate)}` : ""}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-neutral-600">Nature du règlement</p>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                kind === k
                  ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                  : "border-black/10 text-neutral-600 hover:bg-black/[0.04] dark:border-white/10 dark:text-neutral-300",
              )}
            >
              {RENTAL_PAYMENT_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {!isRent ? (
          <p className="mt-1.5 text-[11px] text-neutral-500">
            Ce montant n&apos;entre pas dans le solde de loyer
            {kind === "deposit" ? " : il est comptabilisé comme caution détenue." : "."}
          </p>
        ) : null}
      </div>

      <RentalField label="Montant reçu (FCFA)">
        <input
          className={fsInputClass("text-2xl font-extrabold tabular-nums")}
          inputMode="numeric"
          autoFocus
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
        />
      </RentalField>

      {quick.length > 0 ? (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setAmount(String(q.value))}
              className="rounded-lg border border-black/10 bg-fs-surface-container px-2.5 py-1.5 text-xs font-bold text-neutral-700 transition-colors hover:border-fs-accent hover:text-fs-accent dark:border-white/10 dark:text-neutral-200"
            >
              {q.label}
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

      <div>
        <p className="mb-1.5 text-xs font-semibold text-neutral-600">Moyen de paiement</p>
        <div className="flex flex-wrap gap-1.5">
          {RENTAL_METHODS.map((m) => (
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
              {RENTAL_METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField label="Date du paiement">
          <input
            type="date"
            className={fsInputClass()}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </RentalField>
        <RentalField label="Référence (optionnel)">
          <input
            className={fsInputClass()}
            placeholder="N° transaction Mobile Money…"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </RentalField>
      </div>

      <RentalField label="Note (optionnel)">
        <input
          className={fsInputClass()}
          placeholder="Ex. remis par son fils"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </RentalField>

      {value > 0 && isRent ? (
        <div className="rounded-xl border border-black/[0.07] bg-fs-surface-container/60 p-3 dark:border-white/10">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-neutral-600">Après ce règlement</span>
            <span
              className={cn(
                "text-lg font-extrabold tabular-nums",
                newBalance > 0.5 ? "text-red-600" : "text-emerald-600",
              )}
            >
              {newBalance > 0.5
                ? `${formatCurrency(newBalance)} restants`
                : newBalance < -0.5
                  ? `${formatCurrency(Math.abs(newBalance))} d'avance`
                  : "Compte à jour"}
            </span>
          </div>
          {monthsCovered > 0 ? (
            <p className="mt-1 text-[11px] text-neutral-500">
              Couvre environ {monthsCovered} mois de loyer.
            </p>
          ) : null}
        </div>
      ) : null}
    </RentalDialogShell>
  );
}
