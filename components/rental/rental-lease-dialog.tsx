"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdAssignmentTurnedIn } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  RentalDialogShell,
  RentalField,
  RentalSubmitButton,
} from "@/components/rental/rental-dialog-shell";
import { saveRentalLease } from "@/lib/features/rental/api";
import { toIsoDate } from "@/lib/features/rental/rental-format";
import {
  RENTAL_FREQUENCY_LABELS,
  type RentalFrequency,
  type RentalLease,
  type RentalTenant,
  type RentalUnit,
} from "@/lib/features/rental/types";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

const FREQUENCIES: RentalFrequency[] = ["monthly", "quarterly", "yearly"];

/**
 * Création / modification d'un bail. À la création, seuls les lots LIBRES sont
 * proposés : un lot ne peut pas être loué à deux personnes à la fois (garanti
 * aussi côté base par un index unique).
 */
export function RentalLeaseDialog({
  companyId,
  storeId,
  units,
  tenants,
  editing,
  presetUnitId,
  onClose,
  onSaved,
  onCreateTenant,
}: {
  companyId: string;
  storeId: string;
  units: RentalUnit[];
  tenants: RentalTenant[];
  editing: RentalLease | null;
  presetUnitId?: string | null;
  onClose: () => void;
  onSaved: (leaseId: string, isNew: boolean) => void;
  /** Ouvre le dialogue « nouveau locataire » sans perdre la saisie en cours. */
  onCreateTenant: () => void;
}) {
  const [unitId, setUnitId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [startDate, setStartDate] = useState(() => toIsoDate(new Date()));
  const [endDate, setEndDate] = useState("");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [frequency, setFrequency] = useState<RentalFrequency>("monthly");
  const [graceDays, setGraceDays] = useState("0");
  const [notes, setNotes] = useState("");

  // Lots proposables : les libres, plus celui du bail en cours de modification.
  const availableUnits = useMemo(
    () =>
      units.filter(
        (u) =>
          (u.isActive && !u.activeLeaseId) ||
          u.id === editing?.unitId ||
          u.id === presetUnitId,
      ),
    [units, editing?.unitId, presetUnitId],
  );

  useEffect(() => {
    const initialUnit = editing?.unitId ?? presetUnitId ?? "";
    setUnitId(initialUnit);
    setTenantId(editing?.tenantId ?? "");
    setStartDate(editing?.startDate ?? toIsoDate(new Date()));
    setEndDate(editing?.endDate ?? "");
    setFrequency(editing?.frequency ?? "monthly");
    setGraceDays(String(editing?.graceDays ?? 0));
    setNotes(editing?.notes ?? "");
    if (editing) {
      setRent(String(Math.round(editing.rentAmount)));
      setDeposit(String(Math.round(editing.depositAmount)));
    } else {
      const u = units.find((x) => x.id === initialUnit);
      setRent(u ? String(Math.round(u.baseRent)) : "");
      setDeposit(u ? String(Math.round(u.baseDeposit)) : "");
    }
  }, [editing, presetUnitId, units]);

  // Choix d'un lot en création : pré-remplir loyer et caution de référence.
  function pickUnit(id: string) {
    setUnitId(id);
    if (editing) return;
    const u = units.find((x) => x.id === id);
    if (!u) return;
    setRent(String(Math.round(u.baseRent)));
    setDeposit(String(Math.round(u.baseDeposit)));
  }

  const rentValue = Math.round(toNumber(rent));
  const canSubmit = unitId !== "" && tenantId !== "" && startDate !== "" && rentValue > 0;

  const mut = useMutation({
    mutationFn: () =>
      saveRentalLease({
        id: editing?.id ?? null,
        companyId,
        storeId,
        unitId,
        tenantId,
        startDate,
        rentAmount: rentValue,
        depositAmount: Math.round(toNumber(deposit)),
        endDate: endDate || null,
        frequency,
        graceDays: Math.max(0, Math.min(28, Math.trunc(toNumber(graceDays)))),
        notes: notes.trim() || null,
      }),
    onSuccess: (id) => {
      toast.success(editing ? "Bail mis à jour." : "Bail créé — échéances générées.");
      onSaved(id, !editing);
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  const selectedUnit = units.find((u) => u.id === unitId) ?? null;

  return (
    <RentalDialogShell
      title={editing ? "Modifier le bail" : "Nouveau bail"}
      subtitle={
        editing
          ? `${editing.leaseNumber} · ${editing.tenantName}`
          : "Installer un locataire dans un lot"
      }
      icon={<MdAssignmentTurnedIn className="h-5 w-5 text-indigo-600" aria-hidden />}
      onClose={onClose}
      busy={mut.isPending}
      maxWidth="max-w-xl"
      footer={
        <>
          <RentalSubmitButton
            label={editing ? "Enregistrer le bail" : "Créer le bail"}
            disabled={!canSubmit}
            busy={mut.isPending}
            onClick={() => mut.mutate()}
          />
          <p className="mt-2 text-center text-[11px] text-neutral-500">
            Les échéances de loyer sont générées automatiquement depuis la date de début.
          </p>
        </>
      }
    >
      <RentalField
        label="Lot loué"
        hint={editing ? "Le lot d'un bail existant ne peut pas être changé." : undefined}
      >
        <select
          className={fsInputClass()}
          value={unitId}
          disabled={editing !== null}
          onChange={(e) => pickUnit(e.target.value)}
        >
          <option value="">— Choisir un lot libre —</option>
          {availableUnits.map((u) => (
            <option key={u.id} value={u.id}>
              {u.propertyName} — {u.label}
              {u.baseRent > 0 ? ` (${Math.round(u.baseRent)} F)` : ""}
            </option>
          ))}
        </select>
      </RentalField>

      {availableUnits.length === 0 && !editing ? (
        <p className="-mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          Aucun lot libre. Ajoutez un bien et ses lots dans l&apos;onglet « Biens », ou
          clôturez un bail existant.
        </p>
      ) : null}

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-neutral-600">Locataire</span>
          <button
            type="button"
            onClick={onCreateTenant}
            className="text-xs font-bold text-fs-accent hover:underline"
          >
            + Nouveau locataire
          </button>
        </div>
        <select
          className={fsInputClass()}
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
        >
          <option value="">— Choisir un locataire —</option>
          {tenants
            .filter((t) => t.isActive || t.id === editing?.tenantId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
                {t.phone ? ` — ${t.phone}` : ""}
              </option>
            ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField label="Loyer (FCFA / période)">
          <input
            className={fsInputClass("text-lg font-bold tabular-nums")}
            inputMode="numeric"
            value={rent}
            onChange={(e) => setRent(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="50000"
          />
        </RentalField>
        <RentalField label="Caution convenue (FCFA)" hint="Montant total, pas un nombre de mois">
          <input
            className={fsInputClass("tabular-nums")}
            inputMode="numeric"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="100000"
          />
        </RentalField>
      </div>

      {selectedUnit && !editing && rentValue > 0 && rentValue !== Math.round(selectedUnit.baseRent) ? (
        <p className="-mt-2 text-[11px] text-neutral-500">
          Loyer de référence du lot : {formatCurrency(selectedUnit.baseRent)} — vous appliquez{" "}
          {formatCurrency(rentValue)}.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField
          label="Début du bail"
          hint="Les périodes sont calées sur ce jour (ex. le 15 → 15/03, 15/04…)"
        >
          <input
            type="date"
            className={fsInputClass()}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </RentalField>
        <RentalField label="Fin prévue (optionnel)" hint="Vide = reconduction tacite">
          <input
            type="date"
            className={fsInputClass()}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </RentalField>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-neutral-600">Périodicité</p>
        <div className="flex flex-wrap gap-1.5">
          {FREQUENCIES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                frequency === f
                  ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                  : "border-black/10 text-neutral-600 hover:bg-black/[0.04] dark:border-white/10 dark:text-neutral-300",
              )}
            >
              {RENTAL_FREQUENCY_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <RentalField
        label="Jours de tolérance"
        hint="Nombre de jours après le début de période avant de compter le retard"
      >
        <input
          className={fsInputClass("tabular-nums")}
          inputMode="numeric"
          value={graceDays}
          onChange={(e) => setGraceDays(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="0"
        />
      </RentalField>

      <RentalField label="Notes du bail (optionnel)">
        <textarea
          className={fsInputClass("min-h-16")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Conditions particulières, état des lieux, garant…"
        />
      </RentalField>
    </RentalDialogShell>
  );
}
