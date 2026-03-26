"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminDeleteCompany,
  adminDeleteStore,
  adminListCompanies,
  adminListStores,
  adminUpdateCompany,
  adminUpdateStore,
} from "@/lib/features/admin/api";
import type { AdminCompany, AdminStore } from "@/lib/features/admin/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { MdDelete, MdExpandMore, MdChevronRight, MdAutoAwesome, MdPowerSettingsNew } from "react-icons/md";

export function AdminCompaniesScreen() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin-companies"] as const,
    queryFn: async () => {
      const [companies, stores] = await Promise.all([adminListCompanies(), adminListStores()]);
      return { companies, stores };
    },
  });

  const storesByCompany = useMemo(() => {
    const m = new Map<string, AdminStore[]>();
    for (const s of q.data?.stores ?? []) {
      const arr = m.get(s.companyId) ?? [];
      arr.push(s);
      m.set(s.companyId, arr);
    }
    return m;
  }, [q.data?.stores]);

  const mutCompany = useMutation({
    mutationFn: async (p: { id: string; isActive?: boolean; aiPredictionsEnabled?: boolean }) => {
      await adminUpdateCompany(p.id, { isActive: p.isActive, aiPredictionsEnabled: p.aiPredictionsEnabled });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Entreprise mise à jour");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const mutStore = useMutation({
    mutationFn: async (p: { id: string; isActive: boolean }) => adminUpdateStore(p.id, p.isActive),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Boutique mise à jour");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const mutDelCompany = useMutation({
    mutationFn: (id: string) => adminDeleteCompany(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Supprimé définitivement");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const mutDelStore = useMutation({
    mutationFn: (id: string) => adminDeleteStore(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Supprimé définitivement");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  function confirmDeleteCompany(c: AdminCompany) {
    if (!window.confirm(`Supprimer l'entreprise « ${c.name} » ? Irréversible.`)) return;
    mutDelCompany.mutate(c.id);
  }

  function confirmDeleteStore(s: AdminStore) {
    if (!window.confirm(`Supprimer la boutique « ${s.name} » ? Irréversible.`)) return;
    mutDelStore.mutate(s.id);
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

  const companies = q.data!.companies;

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="Entreprises"
        description="Gestion des entreprises et de leurs boutiques"
      />

      <AdminCard padding="p-0" className="overflow-x-auto">
        <table className="min-w-[800px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="w-10 p-3" />
              <th className="p-3">Nom</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Préd. IA</th>
              <th className="p-3">Quota</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const subs = storesByCompany.get(c.id) ?? [];
              const isOpen = expanded === c.id;
              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-slate-100">
                    <td className="p-2">
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                        disabled={subs.length === 0}
                        onClick={() => setExpanded(isOpen ? null : c.id)}
                      >
                        {subs.length === 0 ? null : isOpen ? (
                          <MdExpandMore className="h-5 w-5" />
                        ) : (
                          <MdChevronRight className="h-5 w-5" />
                        )}
                      </button>
                    </td>
                    <td className="p-3 font-medium text-slate-900">{c.name}</td>
                    <td className="p-3 text-slate-600">{c.slug ?? "—"}</td>
                    <td className="p-3">
                      <span className={c.isActive ? "text-emerald-600" : "text-slate-500"}>
                        {c.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={c.aiPredictionsEnabled ? "text-emerald-600" : "text-slate-500"}>
                        {c.aiPredictionsEnabled ? "Oui" : "Non"}
                      </span>
                    </td>
                    <td className="p-3">{c.storeQuota}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-2 hover:bg-slate-100"
                          title={c.isActive ? "Désactiver" : "Activer"}
                          onClick={() => mutCompany.mutate({ id: c.id, isActive: !c.isActive })}
                        >
                          <MdPowerSettingsNew className="h-5 w-5 text-slate-700" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 hover:bg-slate-100"
                          title={c.aiPredictionsEnabled ? "Désactiver IA" : "Activer IA"}
                          onClick={() =>
                            mutCompany.mutate({ id: c.id, aiPredictionsEnabled: !c.aiPredictionsEnabled })
                          }
                        >
                          <MdAutoAwesome className="h-5 w-5 text-slate-700" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 hover:bg-red-50"
                          title="Supprimer"
                          onClick={() => confirmDeleteCompany(c)}
                        >
                          <MdDelete className="h-5 w-5 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen
                    ? subs.map((s) => (
                        <tr key={s.id} className="bg-slate-50">
                          <td />
                          <td colSpan={5} className="px-3 py-2 pl-10 text-slate-700">
                            <span className="font-semibold">{s.name}</span>
                            {s.isPrimary ? (
                              <span className="ml-2 text-xs text-slate-500">Principale</span>
                            ) : null}
                          </td>
                          <td className="p-2">
                            <div className="flex justify-end gap-1">
                              <span className={s.isActive ? "text-emerald-600" : "text-slate-500"}>
                                {s.isActive ? "Actif" : "Inactif"}
                              </span>
                              <button
                                type="button"
                                className="rounded p-1 hover:bg-white"
                                onClick={() => mutStore.mutate({ id: s.id, isActive: !s.isActive })}
                              >
                                <MdPowerSettingsNew className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 hover:bg-red-50"
                                onClick={() => confirmDeleteStore(s)}
                              >
                                <MdDelete className="h-4 w-4 text-red-600" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </AdminCard>
    </div>
  );
}
