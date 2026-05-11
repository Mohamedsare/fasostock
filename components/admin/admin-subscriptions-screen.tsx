"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import {
  adminListCompanySubscriptions,
  adminListSubscriptionPlansLite,
  adminUpsertCompanySubscription,
} from "@/lib/features/admin/api";
import type { AdminCompanySubscriptionRow } from "@/lib/features/admin/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useMemo, useState } from "react";

type EditState = Record<
  string,
  {
    planId: string;
    status: AdminCompanySubscriptionRow["status"];
    start: string;
    end: string;
    cancelAtPeriodEnd: boolean;
  }
>;

function toDateInput(v: string | null): string {
  if (!v) return "";
  try {
    return format(new Date(v), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

export function AdminSubscriptionsScreen() {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<EditState>({});

  const q = useQuery({
    queryKey: ["admin-company-subscriptions"] as const,
    queryFn: async () => {
      const [rows, plans] = await Promise.all([adminListCompanySubscriptions(), adminListSubscriptionPlansLite()]);
      return { rows, plans };
    },
  });

  const saveMut = useMutation({
    mutationFn: async (p: {
      companyId: string;
      planId: string;
      status: AdminCompanySubscriptionRow["status"];
      start: string;
      end: string;
      cancelAtPeriodEnd: boolean;
    }) => {
      await adminUpsertCompanySubscription({
        companyId: p.companyId,
        planId: p.planId,
        status: p.status,
        currentPeriodStart: p.start ? `${p.start}T00:00:00.000Z` : null,
        currentPeriodEnd: p.end ? `${p.end}T23:59:59.999Z` : null,
        cancelAtPeriodEnd: p.cancelAtPeriodEnd,
      });
    },
    onSuccess: () => {
      toast.success("Abonnement mis a jour");
      void qc.invalidateQueries({ queryKey: ["admin-company-subscriptions"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const plans = q.data?.plans ?? [];
  const defaultPlanId = useMemo(() => plans[0]?.id ?? "", [plans]);

  function getRowEdit(r: AdminCompanySubscriptionRow) {
    return (
      edits[r.companyId] ?? {
        planId: r.planId ?? defaultPlanId,
        status: r.status,
        start: toDateInput(r.currentPeriodStart),
        end: toDateInput(r.currentPeriodEnd),
        cancelAtPeriodEnd: r.cancelAtPeriodEnd,
      }
    );
  }

  function setRowEdit(companyId: string, patch: Partial<EditState[string]>) {
    setEdits((prev) => {
      const row = prev[companyId];
      return {
        ...prev,
        [companyId]: {
          ...(row ?? {
            planId: defaultPlanId,
            status: "trialing",
            start: "",
            end: "",
            cancelAtPeriodEnd: false,
          }),
          ...patch,
        },
      };
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

  const rows = q.data?.rows ?? [];

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="Abonnement"
        description="Gestion des abonnements des entreprises"
      />

      <AdminCard className="bg-orange-50/70">
        <p className="text-sm text-slate-700">
          Regles appliquees via migration: ELOF MULTI SERVICES et RAMADAN TELECOM actifs, entreprises existantes en essai 7 jours, nouvelles entreprises en essai 14 jours par defaut.
        </p>
      </AdminCard>

      <AdminCard padding="p-0">
        <FsHorizontalScroll>
          <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="p-3">Entreprise</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Debut</th>
              <th className="p-3">Fin</th>
              <th className="p-3">Resiliation fin periode</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = getRowEdit(r);
              return (
                <tr key={r.companyId} className="border-b border-slate-100">
                  <td className="p-3 font-medium text-slate-900">{r.companyName}</td>
                  <td className="p-3">
                    <select
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                      value={e.planId}
                      onChange={(ev) => setRowEdit(r.companyId, { planId: ev.target.value })}
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.slug})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <select
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                      value={e.status}
                      onChange={(ev) =>
                        setRowEdit(r.companyId, {
                          status: ev.target.value as AdminCompanySubscriptionRow["status"],
                        })
                      }
                    >
                      <option value="trialing">Essai</option>
                      <option value="active">Actif</option>
                      <option value="past_due">Impayee</option>
                      <option value="canceled">Annule</option>
                      <option value="expired">Expire</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      type="date"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                      value={e.start}
                      onChange={(ev) => setRowEdit(r.companyId, { start: ev.target.value })}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="date"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                      value={e.end}
                      onChange={(ev) => setRowEdit(r.companyId, { end: ev.target.value })}
                    />
                  </td>
                  <td className="p-3">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={e.cancelAtPeriodEnd}
                        onChange={(ev) => setRowEdit(r.companyId, { cancelAtPeriodEnd: ev.target.checked })}
                      />
                      Oui
                    </label>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                      disabled={!e.planId || saveMut.isPending}
                      onClick={() =>
                        saveMut.mutate({
                          companyId: r.companyId,
                          planId: e.planId,
                          status: e.status,
                          start: e.start,
                          end: e.end,
                          cancelAtPeriodEnd: e.cancelAtPeriodEnd,
                        })
                      }
                    >
                      Enregistrer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </FsHorizontalScroll>
      </AdminCard>
    </div>
  );
}
