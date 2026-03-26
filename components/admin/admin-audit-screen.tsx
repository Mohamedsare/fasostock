"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminListAuditLogs, adminListCompanies } from "@/lib/features/admin/api";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export function AdminAuditScreen() {
  const [companyId, setCompanyId] = useState<string | null>(null);

  const companiesQ = useQuery({
    queryKey: ["admin-companies-audit"] as const,
    queryFn: () => adminListCompanies(),
  });

  const logsQ = useQuery({
    queryKey: ["admin-audit", companyId] as const,
    queryFn: () => adminListAuditLogs(companyId, 100),
  });

  const companies = companiesQ.data ?? [];

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="Journal d'audit"
        description="Activité de toutes les entreprises (vue plateforme)"
      />

      <AdminCard>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Entreprise
            <select
              className="mt-1 block w-full min-w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={companyId ?? ""}
              onChange={(e) => setCompanyId(e.target.value || null)}
            >
              <option value="">Toutes les entreprises</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => logsQ.refetch()}
          >
            Actualiser
          </button>
        </div>
      </AdminCard>

      {logsQ.isLoading ? (
        <div className="flex justify-center p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        </div>
      ) : logsQ.isError ? (
        <p className="text-red-600">{(logsQ.error as Error).message}</p>
      ) : (
        <AdminCard padding="p-0" className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-600">
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">Action</th>
                <th className="p-2">Entité</th>
                <th className="p-2">User</th>
              </tr>
            </thead>
            <tbody>
              {(logsQ.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap p-2 text-slate-600">
                    {new Date(row.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="p-2 font-medium text-slate-900">{row.action}</td>
                  <td className="p-2">
                    {row.entityType}
                    {row.entityId ? ` · ${row.entityId.slice(0, 8)}…` : ""}
                  </td>
                  <td className="p-2 font-mono text-slate-600">{row.userId?.slice(0, 8) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminCard>
      )}
    </div>
  );
}
