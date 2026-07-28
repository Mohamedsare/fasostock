"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MdReceiptLong } from "react-icons/md";
import {
  SupplierDialogError,
  SupplierDialogShell,
  SupplierField,
  SupplierSubmitButton,
  supplierInputClass,
} from "@/components/suppliers/supplier-dialog-shell";
import { defaultDueDate, dueLabel, todayIso } from "@/lib/features/suppliers/payables-math";
import type { SupplierAccount, SupplierInvoice } from "@/lib/features/suppliers/types";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

export type SupplierDebtValue = {
  supplierId: string;
  invoiceNumber: string;
  label: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  notes: string;
};

function num(s: string): number {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Saisie d'une dette fournisseur : la facture papier qu'on vient de recevoir,
 * ou l'ardoise convenue de vive voix. L'échéance est pré-remplie depuis le
 * délai accordé par le fournisseur — l'utilisateur n'a qu'à confirmer.
 */
export function SupplierDebtDialog({
  open,
  onClose,
  suppliers,
  editing,
  presetSupplierId,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: SupplierAccount[];
  editing: SupplierInvoice | null;
  presetSupplierId?: string | null;
  onSubmit: (value: SupplierDebtValue) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [label, setLabel] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `suppliers` change d'identité à chaque rafraîchissement des données : sans
  // ce garde-fou, une saisie en cours serait effacée sous les doigts de
  // l'utilisateur. On n'initialise donc qu'à l'ouverture.
  const initedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      initedRef.current = false;
      return;
    }
    if (initedRef.current) return;
    initedRef.current = true;
    setBusy(false);
    setError(null);
    setDueTouched(Boolean(editing));
    if (editing) {
      setSupplierId(editing.supplierId);
      setInvoiceNumber(editing.invoiceNumber ?? "");
      setLabel(editing.label ?? "");
      setInvoiceDate(editing.invoiceDate);
      setDueDate(editing.dueDate);
      setAmount(String(editing.amount));
      setNotes(editing.notes ?? "");
    } else {
      const first = presetSupplierId ?? suppliers.find((s) => s.is_active)?.id ?? "";
      setSupplierId(first);
      setInvoiceNumber("");
      setLabel("");
      setInvoiceDate(todayIso());
      setDueDate(todayIso());
      setAmount("");
      setNotes("");
    }
  }, [open, editing, presetSupplierId, suppliers]);

  const supplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  // Tant que l'utilisateur n'a pas fixé l'échéance lui-même, on la déduit du
  // délai accordé par le fournisseur : c'est juste dans 95 % des cas.
  useEffect(() => {
    if (!open || dueTouched || !supplier) return;
    setDueDate(defaultDueDate(supplier.payment_terms_days, invoiceDate));
  }, [open, dueTouched, supplier, invoiceDate]);

  if (!open) return null;

  const value = num(amount);
  const isEdit = Boolean(editing);

  async function submit() {
    setError(null);
    if (!supplierId) {
      setError("Choisissez un fournisseur.");
      return;
    }
    if (value <= 0) {
      setError("Le montant de la dette doit être supérieur à 0.");
      return;
    }
    try {
      setBusy(true);
      await onSubmit({
        supplierId,
        invoiceNumber,
        label,
        invoiceDate,
        dueDate,
        amount: value,
        notes,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SupplierDialogShell
      title={isEdit ? "Modifier la dette" : "Nouvelle dette fournisseur"}
      subtitle={
        isEdit ? editing?.supplierName : "Facture reçue, bon de livraison, ardoise…"
      }
      icon={<MdReceiptLong className="h-5 w-5 text-red-600" aria-hidden />}
      onClose={onClose}
      busy={busy}
      footer={
        <SupplierSubmitButton
          label={isEdit ? "Enregistrer" : "Enregistrer la dette"}
          onClick={submit}
          busy={busy}
          disabled={value <= 0 || !supplierId}
        />
      }
    >
      <SupplierDialogError message={error} />

      <SupplierField label="Fournisseur *">
        <select
          className={supplierInputClass}
          value={supplierId}
          onChange={(e) => {
            setSupplierId(e.target.value);
            setDueTouched(false);
          }}
          disabled={isEdit}
        >
          <option value="">— Choisir —</option>
          {suppliers
            .filter((s) => s.is_active || s.id === supplierId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.stats.balance > 0 ? ` · dette ${formatCurrency(s.stats.balance)}` : ""}
              </option>
            ))}
        </select>
      </SupplierField>

      <SupplierField label="Montant dû *">
        <input
          className={cn(supplierInputClass, "text-lg font-bold")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          autoFocus={!isEdit}
        />
        {value > 0 ? (
          <span className="mt-1 block text-sm font-bold text-red-600">
            {formatCurrency(value)}
          </span>
        ) : null}
      </SupplierField>

      <div className="grid grid-cols-2 gap-3">
        <SupplierField label="Date de la facture">
          <input
            type="date"
            className={supplierInputClass}
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </SupplierField>
        <SupplierField
          label="Échéance"
          hint={
            supplier && !dueTouched && supplier.payment_terms_days > 0
              ? `${supplier.payment_terms_days} j accordés`
              : dueDate
                ? dueLabel(dueDate)
                : undefined
          }
        >
          <input
            type="date"
            className={supplierInputClass}
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              setDueTouched(true);
            }}
          />
        </SupplierField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SupplierField label="N° de pièce">
          <input
            className={supplierInputClass}
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="FA-2026-014"
          />
        </SupplierField>
        <SupplierField label="Libellé">
          <input
            className={supplierInputClass}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Livraison ciment"
          />
        </SupplierField>
      </div>

      <SupplierField label="Notes">
        <textarea
          className={cn(supplierInputClass, "min-h-[70px] resize-none")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Détail, conditions, litige…"
        />
      </SupplierField>

      {supplier && supplier.credit_limit > 0 ? (
        <p
          className={cn(
            "rounded-xl border px-3 py-2 text-xs",
            supplier.stats.balance + value > supplier.credit_limit
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              : "border-black/[0.08] bg-fs-surface-container text-neutral-600",
          )}
        >
          Encours après saisie : {formatCurrency(supplier.stats.balance + value)} · plafond{" "}
          {formatCurrency(supplier.credit_limit)}
        </p>
      ) : null}
    </SupplierDialogShell>
  );
}
