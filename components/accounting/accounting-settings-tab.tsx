"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  backfillAccounting,
  getAccountingSettings,
  listAccountingFiscalYears,
  updateAccountingSettings,
} from "@/lib/features/accounting/api";
import type { AccountingSettings } from "@/lib/features/accounting/types";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";

const ACCOUNT_FIELDS: Array<{ key: keyof AccountingSettings; label: string }> = [
  { key: "accountClient", label: "Clients (411)" },
  { key: "accountSupplier", label: "Fournisseurs (401)" },
  { key: "accountSales", label: "Ventes (701)" },
  { key: "accountPurchases", label: "Achats (601)" },
  { key: "accountVatCollected", label: "TVA collectée (4431)" },
  { key: "accountVatDeductible", label: "TVA déductible (4452)" },
  { key: "accountCash", label: "Caisse (571)" },
  { key: "accountBank", label: "Banque (521)" },
  { key: "accountMobileMoney", label: "Mobile money (551)" },
];

export function AccountingSettingsTab({
  companyId,
  period,
  canManage,
}: {
  companyId: string;
  period: { from: string; to: string };
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Partial<AccountingSettings>>({});

  const settingsQ = useQuery({
    queryKey: queryKeys.accountingSetup(companyId),
    queryFn: () => getAccountingSettings(companyId),
    enabled: Boolean(companyId),
  });
  const fyQ = useQuery({
    queryKey: queryKeys.accountingFiscalYears(companyId),
    queryFn: () => listAccountingFiscalYears(companyId),
    enabled: Boolean(companyId),
  });

  const saveMut = useMutation({
    mutationFn: (patch: Partial<AccountingSettings>) => updateAccountingSettings(companyId, patch),
    onSuccess: () => {
      setEdits({});
      void qc.invalidateQueries({ queryKey: queryKeys.accountingSetup(companyId) });
      toast.success("Paramètres enregistrés");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const backfillMut = useMutation({
    mutationFn: () => backfillAccounting(companyId, period.from, period.to),
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: ["accounting", companyId] });
      toast.success(`${n} document(s) reportés en comptabilité`);
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

  const draft: AccountingSettings = { ...settingsQ.data, ...edits };
  const patch = (p: Partial<AccountingSettings>) => setEdits((prev) => ({ ...prev, ...p }));
  const dirty = Object.keys(edits).length > 0;

  return (
    <div className="space-y-4">
      {/* TVA */}
      <FsCard>
        <h3 className="mb-3 text-sm font-bold text-fs-text">Taxe sur la valeur ajoutée (TVA)</h3>
        <div className="flex flex-wrap items-end gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-black/20"
              checked={draft.vatEnabled}
              disabled={!canManage}
              onChange={(e) => patch({ vatEnabled: e.target.checked })}
            />
            <span className="text-sm text-neutral-700">TVA applicable</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-600">Taux (%)</span>
            <input
              type="number"
              min={0}
              step="0.001"
              className={fsInputClass("w-28")}
              value={draft.vatRate}
              disabled={!canManage || !draft.vatEnabled}
              onChange={(e) => patch({ vatRate: Number(e.target.value) })}
            />
          </label>
        </div>
      </FsCard>

      {/* Comptes par défaut (auto-génération) */}
      <FsCard>
        <h3 className="mb-1 text-sm font-bold text-fs-text">Comptes par défaut</h3>
        <p className="mb-3 text-xs text-neutral-500">
          Comptes utilisés pour générer automatiquement les écritures depuis les ventes, achats et dépenses.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACCOUNT_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-600">{f.label}</span>
              <input
                type="text"
                className={fsInputClass()}
                value={String(draft[f.key] ?? "")}
                disabled={!canManage}
                onChange={(e) => patch({ [f.key]: e.target.value } as Partial<AccountingSettings>)}
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
              {saveMut.isPending ? "Enregistrement…" : "Enregistrer les paramètres"}
            </button>
          </div>
        ) : null}
      </FsCard>

      {/* Exercices */}
      <FsCard padding="p-0">
        <h3 className="border-b border-black/6 px-4 py-3 text-sm font-bold text-fs-text">Exercices comptables</h3>
        <ul className="divide-y divide-black/[0.04]">
          {(fyQ.data ?? []).map((fy) => (
            <li key={fy.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-semibold text-fs-text">{fy.code}</span>
              <span className="text-neutral-600">
                {fy.startDate} → {fy.endDate}
              </span>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-xs " +
                  (fy.status === "open" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500")
                }
              >
                {fy.status === "open" ? "Ouvert" : "Clôturé"}
              </span>
            </li>
          ))}
          {(fyQ.data ?? []).length === 0 ? (
            <li className="px-4 py-3 text-sm text-neutral-400">Aucun exercice.</li>
          ) : null}
        </ul>
      </FsCard>

      {/* Backfill */}
      {canManage ? (
        <FsCard>
          <h3 className="mb-1 text-sm font-bold text-fs-text">Reprise des écritures</h3>
          <p className="mb-3 text-xs text-neutral-500">
            Régénère les écritures automatiques des ventes, achats et dépenses de la période sélectionnée
            (du {period.from} au {period.to}). Utile après l&apos;activation du module.
          </p>
          <button
            type="button"
            onClick={() => backfillMut.mutate()}
            disabled={backfillMut.isPending}
            className="rounded-xl border border-fs-accent/40 bg-fs-accent/10 px-4 py-2 text-sm font-semibold text-fs-accent disabled:opacity-50"
          >
            {backfillMut.isPending ? "Reprise en cours…" : "Reprendre la période"}
          </button>
        </FsCard>
      ) : null}
    </div>
  );
}
