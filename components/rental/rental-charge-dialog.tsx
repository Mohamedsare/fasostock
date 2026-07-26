"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdBuild } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  RentalDialogShell,
  RentalField,
  RentalSubmitButton,
} from "@/components/rental/rental-dialog-shell";
import { saveRentalCharge } from "@/lib/features/rental/api";
import { toIsoDate } from "@/lib/features/rental/rental-format";
import {
  RENTAL_CHARGE_CATEGORIES,
  RENTAL_CHARGE_CATEGORY_LABELS,
  RENTAL_METHODS,
  RENTAL_METHOD_LABELS,
  type RentalCharge,
  type RentalChargeCategory,
  type RentalPaymentMethod,
  type RentalProperty,
  type RentalUnit,
} from "@/lib/features/rental/types";
import { toNumber } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";

/** Dépense du bailleur sur un bien (réparation, eau, taxe…). */
export function RentalChargeDialog({
  properties,
  units,
  editing,
  onClose,
  onSaved,
}: {
  properties: RentalProperty[];
  units: RentalUnit[];
  editing: RentalCharge | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<RentalChargeCategory>("repair");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(() => toIsoDate(new Date()));
  const [method, setMethod] = useState<RentalPaymentMethod>("cash");
  const [note, setNote] = useState("");

  useEffect(() => {
    setPropertyId(editing?.propertyId ?? properties[0]?.id ?? "");
    setUnitId(editing?.unitId ?? "");
    setLabel(editing?.label ?? "");
    setCategory(editing?.category ?? "repair");
    setAmount(editing ? String(Math.round(editing.amount)) : "");
    setSpentOn(editing?.spentOn ?? toIsoDate(new Date()));
    setMethod(editing?.method ?? "cash");
    setNote(editing?.note ?? "");
  }, [editing, properties]);

  const propertyUnits = useMemo(
    () => units.filter((u) => u.propertyId === propertyId),
    [units, propertyId],
  );

  const value = Math.round(toNumber(amount));
  const canSubmit = propertyId !== "" && label.trim().length > 0 && value > 0;

  const mut = useMutation({
    mutationFn: () =>
      saveRentalCharge({
        id: editing?.id ?? null,
        propertyId,
        label: label.trim(),
        amount: value,
        category,
        spentOn,
        unitId: unitId || null,
        method,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      toast.success(editing ? "Charge mise à jour." : "Charge enregistrée.");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  return (
    <RentalDialogShell
      title={editing ? "Modifier la charge" : "Nouvelle charge"}
      subtitle="Dépense du bailleur sur un bien"
      icon={<MdBuild className="h-5 w-5 text-amber-600" aria-hidden />}
      onClose={onClose}
      busy={mut.isPending}
      footer={
        <RentalSubmitButton
          label={editing ? "Enregistrer" : "Enregistrer la charge"}
          disabled={!canSubmit}
          busy={mut.isPending}
          onClick={() => mut.mutate()}
        />
      }
    >
      <RentalField label="Bien concerné">
        <select
          className={fsInputClass()}
          value={propertyId}
          onChange={(e) => {
            setPropertyId(e.target.value);
            setUnitId("");
          }}
        >
          <option value="">— Choisir un bien —</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </RentalField>

      {propertyUnits.length > 0 ? (
        <RentalField label="Lot concerné (optionnel)" hint="Laissez vide si la charge porte sur tout le bien">
          <select
            className={fsInputClass()}
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">Tout le bien</option>
            {propertyUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </RentalField>
      ) : null}

      <RentalField label="Libellé">
        <input
          className={fsInputClass()}
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Réfection de la toiture"
        />
      </RentalField>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField label="Catégorie">
          <select
            className={fsInputClass()}
            value={category}
            onChange={(e) => setCategory(e.target.value as RentalChargeCategory)}
          >
            {RENTAL_CHARGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {RENTAL_CHARGE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </RentalField>
        <RentalField label="Montant (FCFA)">
          <input
            className={fsInputClass("text-lg font-bold tabular-nums")}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="25000"
          />
        </RentalField>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField label="Date de la dépense">
          <input
            type="date"
            className={fsInputClass()}
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
          />
        </RentalField>
        <RentalField label="Payée par">
          <select
            className={fsInputClass()}
            value={method}
            onChange={(e) => setMethod(e.target.value as RentalPaymentMethod)}
          >
            {RENTAL_METHODS.map((m) => (
              <option key={m} value={m}>
                {RENTAL_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </RentalField>
      </div>

      <RentalField label="Note (optionnel)">
        <textarea
          className={fsInputClass("min-h-16")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Prestataire, facture n°…"
        />
      </RentalField>
    </RentalDialogShell>
  );
}
