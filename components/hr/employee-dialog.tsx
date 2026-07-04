"use client";

import { useState } from "react";
import { MdClose } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { upsertEmployee } from "@/lib/features/hr/api";
import type { ContractType, HrEmployee } from "@/lib/features/hr/types";
import { messageFromUnknownError, toast } from "@/lib/toast";

const CONTRACT_TYPES: Array<{ value: ContractType; label: string }> = [
  { value: "cdi", label: "CDI" },
  { value: "cdd", label: "CDD" },
  { value: "stage", label: "Stage" },
  { value: "interim", label: "Intérim" },
];

export function EmployeeDialog({
  companyId,
  employee,
  onClose,
  onSaved,
}: {
  companyId: string;
  employee: HrEmployee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<HrEmployee>>(
    employee ?? { contractType: "cdi", paymentMethod: "cash", dependents: 0, baseSalary: 0, isActive: true },
  );
  const [saving, setSaving] = useState(false);

  const set = (p: Partial<HrEmployee>) => setForm((f) => ({ ...f, ...p }));
  const canSave =
    !saving && (form.firstName ?? "").trim().length > 0 && (form.lastName ?? "").trim().length > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await upsertEmployee(companyId, { ...form, id: employee?.id });
      toast.success(employee ? "Employé modifié" : "Employé ajouté");
      onSaved();
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, node: React.ReactNode, span = false) => (
    <label className={"block" + (span ? " sm:col-span-2" : "")}>
      <span className="mb-1 block text-xs font-semibold text-neutral-600">{label}</span>
      {node}
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={employee ? "Modifier l'employé" : "Nouvel employé"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-fs-card shadow-xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/6 px-4 py-3">
          <h2 className="text-base font-bold text-fs-text">{employee ? "Modifier l'employé" : "Nouvel employé"}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/8 text-neutral-700 disabled:opacity-50"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("Prénom", <input className={fsInputClass()} value={form.firstName ?? ""} onChange={(e) => set({ firstName: e.target.value })} />)}
            {field("Nom", <input className={fsInputClass()} value={form.lastName ?? ""} onChange={(e) => set({ lastName: e.target.value })} />)}
            {field("Matricule", <input className={fsInputClass()} value={form.matricule ?? ""} onChange={(e) => set({ matricule: e.target.value })} />)}
            {field(
              "Sexe",
              <select className={fsInputClass()} value={form.gender ?? ""} onChange={(e) => set({ gender: (e.target.value || null) as "M" | "F" | null })}>
                <option value="">—</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>,
            )}
            {field("Poste", <input className={fsInputClass()} value={form.jobTitle ?? ""} onChange={(e) => set({ jobTitle: e.target.value })} />)}
            {field("Catégorie / échelon", <input className={fsInputClass()} value={form.category ?? ""} onChange={(e) => set({ category: e.target.value })} />)}
            {field(
              "Type de contrat",
              <select className={fsInputClass()} value={form.contractType ?? "cdi"} onChange={(e) => set({ contractType: e.target.value as ContractType })}>
                {CONTRACT_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>,
            )}
            {field("Date d'embauche", <input type="date" className={fsInputClass()} value={form.hireDate ?? ""} onChange={(e) => set({ hireDate: e.target.value })} />)}
            {field("Salaire de base (FCFA)", <input type="number" min={0} className={fsInputClass()} value={form.baseSalary ?? 0} onChange={(e) => set({ baseSalary: Number(e.target.value) })} />)}
            {field("Charges de famille", <input type="number" min={0} className={fsInputClass()} value={form.dependents ?? 0} onChange={(e) => set({ dependents: Number(e.target.value) })} />)}
            {field("N° CNSS", <input className={fsInputClass()} value={form.cnssNumber ?? ""} onChange={(e) => set({ cnssNumber: e.target.value })} />)}
            {field(
              "Mode de paiement",
              <select className={fsInputClass()} value={form.paymentMethod ?? "cash"} onChange={(e) => set({ paymentMethod: e.target.value })}>
                <option value="cash">Espèces</option>
                <option value="mobile_money">Mobile money</option>
                <option value="bank">Virement bancaire</option>
              </select>,
            )}
            {field("Téléphone", <input className={fsInputClass()} value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />)}
            {field("Email", <input type="email" className={fsInputClass()} value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} />)}
            {field("Adresse", <input className={fsInputClass()} value={form.address ?? ""} onChange={(e) => set({ address: e.target.value })} />, true)}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-black/6 px-4 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-fs-text disabled:opacity-50">
            Annuler
          </button>
          <button type="button" onClick={save} disabled={!canSave} className="rounded-xl bg-fs-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
