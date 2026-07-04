"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  getPayrollSettings,
  listIutsBrackets,
  updatePayrollSettings,
} from "@/lib/features/hr/api";
import type { PayrollSettingsRow } from "@/lib/features/hr/types";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

const NUM_FIELDS: Array<{ key: keyof PayrollSettingsRow; label: string; step?: string }> = [
  { key: "cnssEmployeeRate", label: "Taux CNSS salarié (%)", step: "0.001" },
  { key: "cnssEmployerRate", label: "Taux CNSS patronal (%)", step: "0.001" },
  { key: "cnssCeiling", label: "Plafond CNSS mensuel (FCFA)" },
  { key: "iutsChargeReductionRate", label: "Réduction IUTS par charge (%)", step: "0.001" },
  { key: "iutsChargeReductionMax", label: "Nb max de charges (IUTS)" },
  { key: "transportNontaxableCap", label: "Transport non imposable (FCFA)" },
];

export function HrSettingsTab({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Partial<PayrollSettingsRow>>({});

  const settingsQ = useQuery({
    queryKey: queryKeys.hrPayrollSettings(companyId),
    queryFn: () => getPayrollSettings(companyId),
    enabled: Boolean(companyId),
  });
  const bracketsQ = useQuery({
    queryKey: queryKeys.hrIutsBrackets(companyId),
    queryFn: () => listIutsBrackets(companyId),
    enabled: Boolean(companyId),
  });

  const saveMut = useMutation({
    mutationFn: (patch: Partial<PayrollSettingsRow>) => updatePayrollSettings(companyId, patch),
    onSuccess: () => {
      setEdits({});
      void qc.invalidateQueries({ queryKey: queryKeys.hrPayrollSettings(companyId) });
      toast.success("Paramètres de paie enregistrés");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  if (settingsQ.isLoading || !settingsQ.data) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
      </div>
    );
  }

  const draft: PayrollSettingsRow = { ...settingsQ.data, ...edits };
  const dirty = Object.keys(edits).length > 0;

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ⚠️ Ces taux et le barème IUTS sont des valeurs par défaut. Faites-les valider par votre
        comptable et ajustez-les selon la réglementation du Burkina Faso en vigueur.
      </p>

      <FsCard>
        <h3 className="mb-3 text-sm font-bold text-fs-text">Cotisations & impôt</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NUM_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-600">{f.label}</span>
              <input
                type="number"
                min={0}
                step={f.step ?? "1"}
                className={fsInputClass()}
                value={draft[f.key]}
                disabled={!canManage}
                onChange={(e) => setEdits((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
        {canManage ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => saveMut.mutate(edits)}
              disabled={saveMut.isPending || !dirty}
              className="rounded-xl bg-fs-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        ) : null}
      </FsCard>

      <FsCard padding="p-0">
        <h3 className="border-b border-black/6 px-4 py-3 text-sm font-bold text-fs-text">Barème IUTS (mensuel)</h3>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/6 bg-fs-surface/50 text-xs font-bold uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">De (FCFA)</th>
              <th className="px-4 py-2">À (FCFA)</th>
              <th className="px-4 py-2 text-right">Taux</th>
            </tr>
          </thead>
          <tbody>
            {(bracketsQ.data ?? []).map((b) => (
              <tr key={b.id} className="border-b border-black/[0.04]">
                <td className="px-4 py-2 tabular-nums text-neutral-700">{fmt(b.lowerBound)}</td>
                <td className="px-4 py-2 tabular-nums text-neutral-700">{b.upperBound == null ? "et +" : fmt(b.upperBound)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-fs-text">{b.rate} %</td>
              </tr>
            ))}
            {(bracketsQ.data ?? []).length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-neutral-400">Aucune tranche.</td></tr>
            ) : null}
          </tbody>
        </table>
      </FsCard>
    </div>
  );
}
