"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminGetSalesByCompany, adminGetStats } from "@/lib/features/admin/api";
import { formatCurrency } from "@/lib/utils/currency";
import { useQuery } from "@tanstack/react-query";
import { MdShoppingCart, MdTrendingUp } from "react-icons/md";

export function AdminReportsScreen() {
  const q = useQuery({
    queryKey: ["admin-reports"] as const,
    queryFn: async () => {
      const [stats, byCompany] = await Promise.all([adminGetStats(), adminGetSalesByCompany()]);
      return { stats, byCompany };
    },
  });

  if (q.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (q.isError) {
    return <div className="p-8 text-red-600">{(q.error as Error).message}</div>;
  }

  const { stats, byCompany } = q.data!;

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="Rapports"
        description="Vue d'ensemble des ventes et du CA par entreprise"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AdminCard>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100">
              <MdShoppingCart className="h-7 w-7 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Ventes totales (complétées)</p>
              <p className="text-2xl font-bold text-slate-900">{stats.salesCount}</p>
            </div>
          </div>
        </AdminCard>
        <AdminCard>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
              <MdTrendingUp className="h-7 w-7 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">CA total plateforme</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.salesTotalAmount)}</p>
            </div>
          </div>
        </AdminCard>
      </div>

      <h3 className="text-base font-bold text-slate-900">CA par entreprise</h3>
      <AdminCard padding="p-0" className="overflow-x-auto">
        <table className="min-w-[480px] w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="p-3 text-left">Entreprise</th>
              <th className="p-3 text-right">Nb ventes</th>
              <th className="p-3 text-right">CA</th>
            </tr>
          </thead>
          <tbody>
            {byCompany.map((r) => (
              <tr key={r.companyId} className="border-b border-slate-100">
                <td className="p-3 font-medium">{r.companyName}</td>
                <td className="p-3 text-right">{r.salesCount}</td>
                <td className="p-3 text-right font-semibold">{formatCurrency(r.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </div>
  );
}
