"use client";

import { useState } from "react";
import { MdClose } from "react-icons/md";
import { LcCard, lcInputClass } from "./ui";
import {
  ALLOCATION_OPTIONS,
  CHARGE_KINDS,
  chargeKindLabel,
} from "@/lib/features/landed-cost/labels";
import { parseAmount } from "@/lib/features/landed-cost/format";
import type {
  AllocationMethod,
  ChargeKind,
  CostBatchCharge,
} from "@/lib/features/landed-cost/types";
import { cn } from "@/lib/utils/cn";

/**
 * Saisie d'un frais d'approche.
 *
 * Le choix de la NATURE (transport, douane…) pré-remplit le libellé ET propose la clé
 * de répartition qui va avec : le camion au poids, la douane à la valeur. Le commerçant
 * n'a donc pas à comprendre la théorie pour obtenir un résultat juste — il peut toujours
 * changer la clé s'il sait mieux.
 *
 * Monté seulement à l'ouverture (l'appelant le rend sous condition, avec une `key`) :
 * l'état de départ vient donc directement des props, sans effet de synchronisation.
 */
export function ChargeFormDialog({
  editing,
  batchAllocation,
  currencyCode,
  busy,
  onClose,
  onSubmit,
}: {
  editing: CostBatchCharge | null;
  /** Clé de répartition du lot — celle qui s'applique si on n'en choisit pas. */
  batchAllocation: AllocationMethod;
  currencyCode: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: {
    label: string;
    kind: ChargeKind;
    amount: number;
    allocationMethod: AllocationMethod | null;
  }) => void;
}) {
  const [kind, setKind] = useState<ChargeKind>(editing?.kind ?? "transport");
  const [label, setLabel] = useState(editing?.label ?? "Transport");
  const [amount, setAmount] = useState(
    editing && editing.amount > 0 ? String(editing.amount) : "",
  );
  const [allocation, setAllocation] = useState<AllocationMethod | "">(
    editing ? (editing.allocationMethod ?? "") : "weight",
  );
  const [error, setError] = useState<string | null>(null);

  /** Changer de nature ne doit jamais écraser un libellé écrit à la main. */
  function pickKind(next: ChargeKind) {
    const previousLabel = chargeKindLabel(kind);
    setKind(next);
    if (label.trim() === "" || label.trim() === previousLabel) {
      setLabel(chargeKindLabel(next));
    }
    if (!editing) {
      setAllocation(CHARGE_KINDS.find((k) => k.key === next)?.suggested ?? "");
    }
  }

  function submit() {
    const value = parseAmount(amount);
    if (label.trim() === "") {
      setError("Donnez un nom à ce frais (« Camion Lomé–Ouaga », « Dédouanement »…).");
      return;
    }
    if (value <= 0) {
      setError("Indiquez le montant payé pour ce frais.");
      return;
    }
    onSubmit({
      label: label.trim(),
      kind,
      amount: value,
      allocationMethod: allocation === "" ? null : allocation,
    });
  }

  const effective = allocation === "" ? batchAllocation : allocation;
  const effectiveHint = ALLOCATION_OPTIONS.find((o) => o.key === effective)?.hint ?? "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Modifier le frais" : "Ajouter un frais"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <LcCard
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none shadow-xl sm:rounded-md"
        padding="p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-fs-text">
            {editing ? "Modifier le frais" : "Ajouter un frais"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
            className="fs-touch-target -mr-1 -mt-1 rounded-md p-1 text-neutral-500 hover:bg-black/5"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-1 text-xs leading-relaxed text-neutral-600">
          Tout ce qui s&apos;ajoute à la facture du fournisseur avant que la marchandise
          n&apos;arrive en rayon.
        </p>

        <label className="mt-4 block text-xs font-semibold text-neutral-700">Nature</label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CHARGE_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => pickKind(k.key)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                kind === k.key
                  ? "border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] font-semibold text-fs-accent"
                  : "border-black/[0.08] bg-fs-card text-neutral-700",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        <label htmlFor="charge-label" className="mt-4 block text-xs font-semibold text-neutral-700">
          Libellé
        </label>
        <input
          id="charge-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Camion Lomé–Ouaga"
          className={lcInputClass("mt-1.5")}
        />

        <label htmlFor="charge-amount" className="mt-4 block text-xs font-semibold text-neutral-700">
          Montant payé ({currencyCode})
        </label>
        <input
          id="charge-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="150000"
          className={lcInputClass("mt-1.5 font-semibold")}
        />

        <label htmlFor="charge-alloc" className="mt-4 block text-xs font-semibold text-neutral-700">
          Réparti sur les articles
        </label>
        <select
          id="charge-alloc"
          value={allocation}
          onChange={(e) => setAllocation(e.target.value as AllocationMethod | "")}
          className={lcInputClass("mt-1.5")}
        >
          <option value="">
            Comme l&apos;arrivage (
            {ALLOCATION_OPTIONS.find((o) => o.key === batchAllocation)?.label ?? batchAllocation})
          </option>
          {ALLOCATION_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        {effectiveHint ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-600">{effectiveHint}</p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter le frais"}
          </button>
        </div>
      </LcCard>
    </div>
  );
}
