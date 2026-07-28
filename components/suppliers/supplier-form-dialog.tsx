"use client";

import { useEffect, useState } from "react";
import { MdBusinessCenter, MdInfoOutline, MdPayments } from "react-icons/md";
import {
  SupplierDialogError,
  SupplierDialogShell,
  SupplierField,
  SupplierSubmitButton,
  supplierInputClass,
} from "@/components/suppliers/supplier-dialog-shell";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

export type SupplierFormValue = {
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  code: string;
  city: string;
  taxId: string;
  bankDetails: string;
  category: string;
  isActive: boolean;
  paymentTermsDays: string;
  creditLimit: string;
  openingBalance: string;
};

const EMPTY: SupplierFormValue = {
  name: "",
  contact: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  code: "",
  city: "",
  taxId: "",
  bankDetails: "",
  category: "",
  isActive: true,
  paymentTermsDays: "0",
  creditLimit: "",
  openingBalance: "",
};

const TERM_PRESETS = [0, 7, 15, 30, 45, 60, 90];

function num(s: string): number {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fiche fournisseur. Deux volets : l'identité (qui c'est, comment le joindre)
 * et les conditions commerciales — le délai de paiement pilote tout
 * l'échéancier de la dette, c'est le champ qui fait vivre la page.
 */
export function SupplierFormDialog({
  open,
  onClose,
  variant = "create",
  initialValue,
  /** Solde de départ verrouillé une fois des règlements imputés dessus. */
  openingLocked = false,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  variant?: "create" | "edit";
  initialValue?: Partial<SupplierFormValue> | null;
  openingLocked?: boolean;
  onSubmit: (value: SupplierFormValue) => Promise<void> | void;
}) {
  const title = variant === "edit" ? "Modifier le fournisseur" : "Nouveau fournisseur";
  const [tab, setTab] = useState<"identity" | "terms">("identity");
  const [v, setV] = useState<SupplierFormValue>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setV({ ...EMPTY, ...(initialValue ?? {}) });
    setTab("identity");
    setBusy(false);
    setError(null);
  }, [open, initialValue]);

  if (!open) return null;

  const set = <K extends keyof SupplierFormValue>(k: K, val: SupplierFormValue[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  async function submit() {
    setError(null);
    const name = v.name.trim();
    if (name.length < 2) {
      setTab("identity");
      setError("Nom requis (2 caractères minimum).");
      return;
    }
    try {
      setBusy(true);
      await onSubmit({ ...v, name });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SupplierDialogShell
      title={title}
      subtitle={variant === "edit" ? v.name : "Carnet fournisseurs & conditions de paiement"}
      icon={<MdBusinessCenter className="h-5 w-5 text-fs-accent" aria-hidden />}
      onClose={onClose}
      busy={busy}
      footer={
        <SupplierSubmitButton
          label={variant === "edit" ? "Enregistrer" : "Créer le fournisseur"}
          onClick={submit}
          busy={busy}
        />
      }
    >
      <div className="flex gap-2">
        {(
          [
            { key: "identity", label: "Identité", icon: MdInfoOutline },
            { key: "terms", label: "Conditions", icon: MdPayments },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold",
              tab === t.key
                ? "border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-fs-accent"
                : "border-black/[0.08] bg-fs-card text-neutral-700",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      <SupplierDialogError message={error} />

      {tab === "identity" ? (
        <div className="space-y-3">
          <SupplierField label="Nom *">
            <input
              className={supplierInputClass}
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Nom du fournisseur"
              autoCapitalize="words"
              autoComplete="organization"
              autoFocus
            />
          </SupplierField>

          <div className="grid grid-cols-2 gap-3">
            <SupplierField label="Code" hint="Ex. FRN-001">
              <input
                className={supplierInputClass}
                value={v.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="FRN-001"
              />
            </SupplierField>
            <SupplierField label="Catégorie" hint="Boissons, textile…">
              <input
                className={supplierInputClass}
                value={v.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Catégorie"
              />
            </SupplierField>
          </div>

          <SupplierField label="Personne de contact">
            <input
              className={supplierInputClass}
              value={v.contact}
              onChange={(e) => set("contact", e.target.value)}
              placeholder="Nom du contact"
              autoComplete="name"
            />
          </SupplierField>

          <div className="grid grid-cols-2 gap-3">
            <SupplierField label="Téléphone">
              <input
                className={supplierInputClass}
                value={v.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+226 …"
                inputMode="tel"
                autoComplete="tel"
              />
            </SupplierField>
            <SupplierField label="Ville">
              <input
                className={supplierInputClass}
                value={v.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Ouagadougou"
              />
            </SupplierField>
          </div>

          <SupplierField label="Email">
            <input
              className={supplierInputClass}
              value={v.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="email@exemple.com"
              type="email"
              inputMode="email"
              autoComplete="email"
            />
          </SupplierField>

          <SupplierField label="Adresse">
            <textarea
              className={cn(supplierInputClass, "min-h-[70px] resize-none")}
              value={v.address}
              onChange={(e) => set("address", e.target.value)}
              rows={2}
              placeholder="Adresse"
            />
          </SupplierField>

          <SupplierField label="Notes">
            <textarea
              className={cn(supplierInputClass, "min-h-[70px] resize-none")}
              value={v.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="Notes internes…"
            />
          </SupplierField>
        </div>
      ) : (
        <div className="space-y-3">
          <SupplierField
            label="Délai de paiement accordé"
            hint="Sert à calculer automatiquement l'échéance de chaque dette. 0 = comptant."
          >
            <div className="mb-2 flex flex-wrap gap-1.5">
              {TERM_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set("paymentTermsDays", String(d))}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-semibold",
                    num(v.paymentTermsDays) === d
                      ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-fs-accent"
                      : "border-black/[0.08] bg-fs-card text-neutral-700",
                  )}
                >
                  {d === 0 ? "Comptant" : `${d} j`}
                </button>
              ))}
            </div>
            <input
              className={supplierInputClass}
              value={v.paymentTermsDays}
              onChange={(e) => set("paymentTermsDays", e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="0"
            />
          </SupplierField>

          <SupplierField
            label="Encours maximum (plafond)"
            hint="Alerte quand la dette envers ce fournisseur dépasse ce montant. Vide = pas de plafond."
          >
            <input
              className={supplierInputClass}
              value={v.creditLimit}
              onChange={(e) => set("creditLimit", e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
            {num(v.creditLimit) > 0 ? (
              <span className="mt-1 block text-[11px] font-semibold text-fs-accent">
                {formatCurrency(num(v.creditLimit))}
              </span>
            ) : null}
          </SupplierField>

          <SupplierField
            label="Dette de départ"
            hint={
              openingLocked
                ? "Verrouillé : des règlements sont déjà imputés sur ce solde."
                : "Ce que vous lui deviez déjà avant d'utiliser FasoStock. Créé comme dette « Solde de départ »."
            }
          >
            <input
              className={cn(supplierInputClass, openingLocked && "opacity-60")}
              value={v.openingBalance}
              onChange={(e) => set("openingBalance", e.target.value)}
              inputMode="decimal"
              placeholder="0"
              disabled={openingLocked}
            />
            {num(v.openingBalance) > 0 ? (
              <span className="mt-1 block text-[11px] font-semibold text-red-600">
                {formatCurrency(num(v.openingBalance))} de dette initiale
              </span>
            ) : null}
          </SupplierField>

          <SupplierField label="Coordonnées bancaires / Mobile Money" hint="Utile au moment de payer.">
            <textarea
              className={cn(supplierInputClass, "min-h-[70px] resize-none")}
              value={v.bankDetails}
              onChange={(e) => set("bankDetails", e.target.value)}
              rows={2}
              placeholder="Banque, IBAN, numéro Orange Money…"
            />
          </SupplierField>

          <SupplierField label="IFU / N° fiscal">
            <input
              className={supplierInputClass}
              value={v.taxId}
              onChange={(e) => set("taxId", e.target.value)}
              placeholder="IFU"
            />
          </SupplierField>

          <label className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-fs-surface-container px-3 py-2.5">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--fs-accent)]"
              checked={v.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-fs-text">Fournisseur actif</span>
              <span className="block text-[11px] text-neutral-500">
                Un fournisseur inactif reste dans l&apos;historique mais sort des listes de saisie.
              </span>
            </span>
          </label>
        </div>
      )}
    </SupplierDialogShell>
  );
}
