"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MdAdd, MdClose, MdDelete } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  getPayrollSettings,
  listIutsBrackets,
  listPayslipLines,
  savePayslipRubriques,
} from "@/lib/features/hr/api";
import { computePayslip, type PayrollRubrique } from "@/lib/features/hr/payroll/compute";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";

type DraftRubrique = PayrollRubrique & { key: string };

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

export function PayslipEditorDialog({
  companyId,
  payslipId,
  employeeName,
  baseSalary,
  dependents,
  periodLabel,
  onClose,
  onSaved,
}: {
  companyId: string;
  payslipId: string;
  employeeName: string;
  baseSalary: number;
  dependents: number;
  periodLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rubriques, setRubriques] = useState<DraftRubrique[] | null>(null);
  const [saving, setSaving] = useState(false);

  const settingsQ = useQuery({
    queryKey: queryKeys.hrPayrollSettings(companyId),
    queryFn: () => getPayrollSettings(companyId),
  });
  const bracketsQ = useQuery({
    queryKey: queryKeys.hrIutsBrackets(companyId),
    queryFn: () => listIutsBrackets(companyId),
  });
  const linesQ = useQuery({
    queryKey: ["hr", companyId, "payslip-lines", payslipId],
    queryFn: () => listPayslipLines(payslipId),
  });

  // Initialise l'état local depuis les lignes chargées (une seule fois).
  const initial = linesQ.data;
  if (rubriques === null && initial) {
    setRubriques(
      initial.map((l) => ({
        key: l.id,
        kind: l.kind,
        label: l.label,
        amount: l.amount,
        taxable: l.taxable,
        cnssBase: l.cnssBase,
      })),
    );
  }

  const list = useMemo(() => rubriques ?? [], [rubriques]);

  const preview = useMemo(() => {
    if (!settingsQ.data || !bracketsQ.data) return null;
    return computePayslip({
      baseSalary,
      dependents,
      rubriques: list.map((r) => ({ kind: r.kind, label: r.label, amount: r.amount, taxable: r.taxable, cnssBase: r.cnssBase })),
      settings: {
        cnssEmployeeRate: settingsQ.data.cnssEmployeeRate,
        cnssEmployerRate: settingsQ.data.cnssEmployerRate,
        cnssCeiling: settingsQ.data.cnssCeiling,
        iutsChargeReductionRate: settingsQ.data.iutsChargeReductionRate,
        iutsChargeReductionMax: settingsQ.data.iutsChargeReductionMax,
        transportNontaxableCap: settingsQ.data.transportNontaxableCap,
      },
      brackets: bracketsQ.data.map((b) => ({ lowerBound: b.lowerBound, upperBound: b.upperBound, rate: b.rate })),
    });
  }, [settingsQ.data, bracketsQ.data, baseSalary, dependents, list]);

  const patch = (key: string, p: Partial<DraftRubrique>) =>
    setRubriques((prev) => (prev ?? []).map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = (kind: "earning" | "deduction") =>
    setRubriques((prev) => [
      ...(prev ?? []),
      { key: Math.random().toString(36).slice(2), kind, label: "", amount: 0, taxable: kind === "earning", cnssBase: kind === "earning" },
    ]);

  async function save() {
    setSaving(true);
    try {
      await savePayslipRubriques({
        companyId,
        payslipId,
        baseSalary,
        dependents,
        rubriques: list.map((r) => ({ kind: r.kind, label: r.label, amount: Math.max(0, Math.round(r.amount)), taxable: r.taxable, cnssBase: r.cnssBase })),
      });
      toast.success("Bulletin recalculé");
      onSaved();
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    } finally {
      setSaving(false);
    }
  }

  const RubriqueList = ({ kind }: { kind: "earning" | "deduction" }) => (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-500">
          {kind === "earning" ? "Gains / primes" : "Retenues"}
        </span>
        <button type="button" onClick={() => add(kind)} className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs font-semibold text-fs-text hover:bg-fs-surface-container">
          <MdAdd className="h-4 w-4" aria-hidden /> Ajouter
        </button>
      </div>
      <div className="space-y-2">
        {list.filter((r) => r.kind === kind).map((r) => (
          <div key={r.key} className="rounded-xl border border-black/[0.06] bg-fs-surface/40 p-2">
            <div className="flex gap-2">
              <input className={fsInputClass("text-sm")} placeholder={kind === "earning" ? "Ex. Prime de transport" : "Ex. Avance sur salaire"} value={r.label} onChange={(e) => patch(r.key, { label: e.target.value })} />
              <input type="number" min={0} className={fsInputClass("w-32 text-sm")} placeholder="Montant" value={r.amount || ""} onChange={(e) => patch(r.key, { amount: Number(e.target.value) })} />
              <button type="button" onClick={() => setRubriques((prev) => (prev ?? []).filter((x) => x.key !== r.key))} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" aria-label="Supprimer">
                <MdDelete className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {kind === "earning" ? (
              <div className="mt-1.5 flex gap-4 pl-1 text-xs text-neutral-600">
                <label className="inline-flex cursor-pointer items-center gap-1">
                  <input type="checkbox" className="h-3.5 w-3.5" checked={r.taxable} onChange={(e) => patch(r.key, { taxable: e.target.checked })} /> Imposable (IUTS)
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1">
                  <input type="checkbox" className="h-3.5 w-3.5" checked={r.cnssBase} onChange={(e) => patch(r.key, { cnssBase: e.target.checked })} /> Soumis CNSS
                </label>
              </div>
            ) : null}
          </div>
        ))}
        {list.filter((r) => r.kind === kind).length === 0 ? (
          <p className="px-1 text-xs text-neutral-400">Aucune ligne.</p>
        ) : null}
      </div>
    </div>
  );

  const loading = settingsQ.isLoading || bracketsQ.isLoading || linesQ.isLoading || rubriques === null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Rubriques du bulletin"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-fs-card shadow-xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/6 px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-fs-text">Rubriques — {employeeName}</h2>
            <p className="text-xs text-neutral-500">{periodLabel} · base {fmt(baseSalary)} FCFA</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/8 text-neutral-700 disabled:opacity-50" aria-label="Fermer">
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex min-h-[20vh] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <RubriqueList kind="earning" />
              <RubriqueList kind="deduction" />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-black/6 px-4 py-3">
          {preview ? (
            <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <span className="text-neutral-600">Brut : <b className="text-fs-text">{fmt(preview.gross)}</b></span>
              <span className="text-neutral-600">CNSS : <b className="text-fs-text">{fmt(preview.cnssEmployee)}</b></span>
              <span className="text-neutral-600">IUTS : <b className="text-fs-text">{fmt(preview.iuts)}</b></span>
              <span className="text-green-700">Net : <b>{fmt(preview.netPay)}</b></span>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-fs-text disabled:opacity-50">Annuler</button>
            <button type="button" onClick={save} disabled={saving || loading} className="rounded-xl bg-fs-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {saving ? "Enregistrement…" : "Recalculer & enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
