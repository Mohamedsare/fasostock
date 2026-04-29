"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminDeleteNewsletterSubscriber,
  adminListNewsletterSubscribers,
} from "@/lib/features/admin/api";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MdDeleteOutline, MdEmail } from "react-icons/md";

export function AdminNewsletterScreen() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-newsletter-subscribers"] as const,
    queryFn: adminListNewsletterSubscribers,
  });

  const delMut = useMutation({
    mutationFn: adminDeleteNewsletterSubscriber,
    onSuccess: async () => {
      toast.success("Abonné supprimé.");
      await qc.invalidateQueries({ queryKey: ["admin-newsletter-subscribers"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="Newsletter"
        description="Gestion des abonnés newsletter collectés depuis la landing."
      />

      <AdminCard>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">Abonnés</h3>
          <span className="inline-flex h-8 items-center rounded-full bg-slate-100 px-3 text-xs font-bold text-slate-700">
            {(q.data ?? []).length} total
          </span>
        </div>

        {q.isLoading ? (
          <p className="mt-3 text-sm text-slate-500">Chargement…</p>
        ) : q.isError ? (
          <p className="mt-3 text-sm font-semibold text-red-600">
            {(q.error as Error)?.message ?? "Erreur de chargement"}
          </p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun abonné pour le moment.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-b-0">
                {(q.data ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                        <MdEmail className="h-4 w-4 text-slate-500" />
                        {row.email}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.source}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => delMut.mutate(row.id)}
                        disabled={delMut.isPending}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-red-600 disabled:opacity-50"
                        title="Supprimer"
                        aria-label={`Supprimer ${row.email}`}
                      >
                        <MdDeleteOutline className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}

