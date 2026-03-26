"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminDeleteStore,
  adminListCompanies,
  adminListStores,
  adminUpdateStore,
} from "@/lib/features/admin/api";
import type { AdminStore } from "@/lib/features/admin/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MdDelete, MdPowerSettingsNew } from "react-icons/md";

export function AdminStoresScreen() {
  const qc = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState("");

  const q = useQuery({
    queryKey: ["admin-stores"] as const,
    queryFn: async () => {
      const [companies, stores] = await Promise.all([adminListCompanies(), adminListStores()]);
      return { companies, stores };
    },
  });

  const companyById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of q.data?.companies ?? []) m.set(c.id, c.name);
    return m;
  }, [q.data?.companies]);

  const filteredStores = useMemo(() => {
    let s = q.data?.stores ?? [];
    if (companyFilter) s = s.filter((x) => x.companyId === companyFilter);
    return s;
  }, [q.data?.stores, companyFilter]);

  const mut = useMutation({
    mutationFn: async (p: { id: string; isActive: boolean }) => adminUpdateStore(p.id, p.isActive),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-stores"] });
      toast.success("Boutique mise à jour");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminDeleteStore(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-stores"] });
      toast.success("Supprimé définitivement");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  function confirmDelete(s: AdminStore) {
    if (!window.confirm(`Supprimer « ${s.name} » ? Irréversible.`)) return;
    del.mutate(s.id);
  }

  if (q.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader title="Boutiques" description="Toutes les boutiques de la plateforme" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Filtrer par entreprise :</span>
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
        >
          <option value="">Toutes</option>
          {(q.data?.companies ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <AdminCard padding="p-0" className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="p-3">Entreprise</th>
              <th className="p-3">Boutique</th>
              <th className="p-3">Code</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Principale</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStores.map((s) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="p-3 text-slate-800">{companyById.get(s.companyId) ?? s.companyId}</td>
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 text-slate-600">{s.code ?? "—"}</td>
                <td className="p-3">
                  <span className={s.isActive ? "text-emerald-600" : "text-slate-500"}>
                    {s.isActive ? "Actif" : "Inactif"}
                  </span>
                </td>
                <td className="p-3">{s.isPrimary ? "Oui" : "—"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded-lg p-2 hover:bg-slate-100"
                      onClick={() => mut.mutate({ id: s.id, isActive: !s.isActive })}
                    >
                      <MdPowerSettingsNew className="h-5 w-5 text-slate-700" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-2 hover:bg-red-50"
                      onClick={() => confirmDelete(s)}
                    >
                      <MdDelete className="h-5 w-5 text-red-600" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredStores.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Aucune boutique.</p>
        ) : null}
      </AdminCard>
    </div>
  );
}
