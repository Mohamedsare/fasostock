"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import {
  adminListCompanySubscriptions,
  adminListSubscriptionPlansLite,
  adminListSubscriptionRequests,
  adminReviewSubscriptionRequest,
  adminUpsertCompanySubscription,
} from "@/lib/features/admin/api";
import type { AdminCompanySubscriptionRow } from "@/lib/features/admin/types";
import { subscriptionPaymentLabel } from "@/lib/features/subscription/types";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";
import { operationYmd } from "@/lib/utils/operation-datetime";

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
    return operationYmd(v);
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

  const reqQ = useQuery({
    queryKey: ["admin-subscription-requests"] as const,
    queryFn: () => adminListSubscriptionRequests(true),
  });

  const reviewMut = useMutation({
    mutationFn: (p: { requestId: string; approve: boolean }) =>
      adminReviewSubscriptionRequest(p),
    onSuccess: (_d, p) => {
      toast.success(p.approve ? "Abonnement activé" : "Demande refusée");
      void qc.invalidateQueries({ queryKey: ["admin-subscription-requests"] });
      void qc.invalidateQueries({ queryKey: ["admin-company-subscriptions"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const pendingRequests = useMemo(() => reqQ.data ?? [], [reqQ.data]);

  const plans = useMemo(() => q.data?.plans ?? [], [q.data?.plans]);
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

      {/* Demandes d'abonnement en attente (soumises par les owners) */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900">
            Demandes d&apos;abonnement
          </h2>
          {pendingRequests.length > 0 ? (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-500 px-2 text-xs font-bold text-white">
              {pendingRequests.length}
            </span>
          ) : null}
          <span className="ml-1 text-xs text-slate-500">en attente de validation</span>
        </div>

        {reqQ.isLoading ? (
          <AdminCard>
            <p className="text-sm text-slate-500">Chargement…</p>
          </AdminCard>
        ) : pendingRequests.length === 0 ? (
          <AdminCard>
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <svg className="h-6 w-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <p className="text-sm font-medium text-slate-600">
                Aucune demande en attente. Tout est à jour.
              </p>
            </div>
          </AdminCard>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {pendingRequests.map((r) => {
              const busy =
                reviewMut.isPending && reviewMut.variables?.requestId === r.id;
              return (
                <div
                  key={r.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3 border-l-4 border-orange-500 bg-orange-50/40 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-slate-900">
                        {r.companyName ?? "Entreprise"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.planName ?? "Pro"} ·{" "}
                        {r.billingInterval === "year" ? "Annuel" : "Mensuel"} ·{" "}
                        {new Date(r.createdAt).toLocaleDateString("fr-FR", { timeZone: getActiveTimeZone() })}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-xl bg-slate-900 px-3 py-1.5 text-right">
                      <p className="text-sm font-extrabold leading-none text-white">
                        {formatCurrency(r.amountCents)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3.5">
                    <Field label="Demandeur" value={`${r.firstName} ${r.lastName}`.trim() || "—"} />
                    <Field label="Téléphone" value={r.phone || "—"} />
                    <Field label="Ville" value={r.city || "—"} />
                    <Field label="Paiement" value={subscriptionPaymentLabel(r.paymentMethod)} />
                    <div className="col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        ID transaction
                      </p>
                      <p className="mt-0.5 break-all rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-800">
                        {r.transactionId || "— (paiement en espèces)"}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 border-t border-slate-100 p-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => reviewMut.mutate({ requestId: r.id, approve: true })}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {busy ? (
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
                      ) : null}
                      Approuver &amp; activer
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Refuser cette demande d'abonnement ?")) {
                          reviewMut.mutate({ requestId: r.id, approve: false });
                        }
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
