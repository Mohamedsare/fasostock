"use client";

import { AdminCard } from "@/components/admin/admin-page-header";
import {
  adminListCompanies,
  adminListStores,
  adminSetStoreRental,
} from "@/lib/features/admin/api";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

/**
 * Activation du module « Location » (gestion locative immobilière), boutique par
 * boutique. Le module est indépendant du commerce : tant qu'il n'est pas activé,
 * la page reste invisible et les RPC refusent toute écriture.
 */
export function AdminRentalModuleCard() {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("");
  const [search, setSearch] = useState("");

  const companiesQ = useQuery({
    queryKey: ["admin-companies"] as const,
    queryFn: () => adminListCompanies(),
    staleTime: 60_000,
  });

  const storesQ = useQuery({
    queryKey: ["admin-stores", companyId || null] as const,
    queryFn: () => adminListStores(companyId || null),
    staleTime: 30_000,
  });

  const mut = useMutation({
    mutationFn: (p: { id: string; enabled: boolean }) => adminSetStoreRental(p.id, p.enabled),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ["admin-stores"] });
      void qc.invalidateQueries({ queryKey: ["app-context"] });
      toast.success(
        v.enabled
          ? "Module Location activé pour cette boutique."
          : "Module Location désactivé pour cette boutique.",
      );
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const companyNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companiesQ.data ?? []) m.set(c.id, c.name);
    return m;
  }, [companiesQ.data]);

  const stores = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = storesQ.data ?? [];
    if (!q) return rows;
    return rows.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (companyNameById.get(s.companyId) ?? "").toLowerCase().includes(q),
    );
  }, [storesQ.data, search, companyNameById]);

  const activeCount = (storesQ.data ?? []).filter((s) => s.rentalModuleEnabled).length;

  return (
    <AdminCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Module Location</h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Gestion locative immobilière : biens, lots, locataires, baux, échéances de
            loyer et quittances thermiques 58 / 80 mm. Module indépendant du stock et de
            la caisse — activez-le uniquement pour les boutiques concernées.
          </p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
          {activeCount} boutique{activeCount > 1 ? "s" : ""} activée{activeCount > 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="">Toutes les entreprises</option>
          {(companiesQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Rechercher une boutique…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {storesQ.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Chargement des boutiques…</p>
      ) : stores.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Aucune boutique pour ce filtre.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {stores.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{s.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {companyNameById.get(s.companyId) ?? "—"}
                  {s.code ? ` · ${s.code}` : ""}
                  {s.isActive ? "" : " · boutique inactive"}
                </p>
              </div>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-600"
                  checked={s.rentalModuleEnabled}
                  disabled={mut.isPending}
                  onChange={() => mut.mutate({ id: s.id, enabled: !s.rentalModuleEnabled })}
                />
                <span className="text-xs font-medium text-slate-600">
                  {s.rentalModuleEnabled ? "Activé" : "Désactivé"}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  );
}
