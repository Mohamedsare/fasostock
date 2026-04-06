"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminListCompanies, adminUpdateCompany } from "@/lib/features/admin/api";
import type { AdminCompany } from "@/lib/features/admin/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MdHomeWork, MdRefresh, MdStorefront, MdToggleOn } from "react-icons/md";

const QK = ["admin-company-features"] as const;

export function AdminFeaturesScreen() {
  const qc = useQueryClient();
  const [quotaDraft, setQuotaDraft] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: QK,
    queryFn: adminListCompanies,
  });

  const mut = useMutation({
    mutationFn: async (p: {
      id: string;
      warehouseFeatureEnabled?: boolean;
      aiPredictionsEnabled?: boolean;
      storeQuotaIncreaseEnabled?: boolean;
      storeQuota?: number;
    }) => {
      const { id, ...patch } = p;
      await adminUpdateCompany(id, patch);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK });
      toast.success("Enregistré");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  function quotaDisplay(c: AdminCompany): string {
    return quotaDraft[c.id] ?? String(c.storeQuota);
  }

  function commitQuota(c: AdminCompany) {
    const raw = quotaDisplay(c).trim();
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Quota invalide (entier ≥ 1).");
      return;
    }
    if (n > c.storeQuota && !c.storeQuotaIncreaseEnabled) {
      toast.error(
        "L'augmentation du quota est désactivée pour cette entreprise. Activez d'abord la colonne « Augmenter le quota ».",
      );
      return;
    }
    if (n === c.storeQuota) {
      setQuotaDraft((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      return;
    }
    mut.mutate({ id: c.id, storeQuota: n });
    setQuotaDraft((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
  }

  if (q.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="p-8">
        <p className="text-red-600">{(q.error as Error).message}</p>
      </div>
    );
  }

  const companies = q.data ?? [];

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AdminPageHeader
          title="Fonctionnalités"
          description="Activez ou désactivez des modules pour chaque entreprise (Magasin, prédictions IA, possibilité d’augmenter le quota de boutiques)."
        />
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <MdRefresh className="h-5 w-5" aria-hidden />
          Rafraîchir
        </button>
      </div>

      <AdminCard padding="p-0" className="overflow-x-auto">
        <table className="min-w-[920px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="p-3">Entreprise</th>
              <th className="p-3">
                <span className="inline-flex items-center gap-1">
                  <MdHomeWork className="h-4 w-4 text-slate-500" aria-hidden />
                  Magasin
                </span>
              </th>
              <th className="p-3">
                <span className="inline-flex items-center gap-1">
                  <MdToggleOn className="h-4 w-4 text-slate-500" aria-hidden />
                  IA
                </span>
              </th>
              <th className="p-3">
                <span className="inline-flex items-center gap-1">
                  <MdStorefront className="h-4 w-4 text-slate-500" aria-hidden />
                  Augmenter quota
                </span>
              </th>
              <th className="p-3">Quota boutiques</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="p-3 font-medium text-slate-900">{c.name}</td>
                <td className="p-3">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={c.warehouseFeatureEnabled}
                      disabled={mut.isPending}
                      onChange={() =>
                        mut.mutate({ id: c.id, warehouseFeatureEnabled: !c.warehouseFeatureEnabled })
                      }
                    />
                    <span className="text-slate-600">{c.warehouseFeatureEnabled ? "Activé" : "Désactivé"}</span>
                  </label>
                </td>
                <td className="p-3">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={c.aiPredictionsEnabled}
                      disabled={mut.isPending}
                      onChange={() =>
                        mut.mutate({ id: c.id, aiPredictionsEnabled: !c.aiPredictionsEnabled })
                      }
                    />
                    <span className="text-slate-600">{c.aiPredictionsEnabled ? "Activé" : "Désactivé"}</span>
                  </label>
                </td>
                <td className="p-3">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={c.storeQuotaIncreaseEnabled}
                      disabled={mut.isPending}
                      onChange={() =>
                        mut.mutate({
                          id: c.id,
                          storeQuotaIncreaseEnabled: !c.storeQuotaIncreaseEnabled,
                        })
                      }
                    />
                    <span className="text-slate-600">
                      {c.storeQuotaIncreaseEnabled ? "Autorisé" : "Bloqué"}
                    </span>
                  </label>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-slate-900"
                      value={quotaDisplay(c)}
                      disabled={mut.isPending}
                      onChange={(e) =>
                        setQuotaDraft((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      onBlur={() => commitQuota(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                    />
                    <span className="text-xs text-slate-500">boutiques max.</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {companies.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Aucune entreprise.</p>
        ) : null}
      </AdminCard>
    </div>
  );
}
