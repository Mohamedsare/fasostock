"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAutorenew,
  MdCheckCircle,
  MdHourglassTop,
  MdLock,
  MdPictureAsPdf,
  MdWorkspacePremium,
} from "react-icons/md";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
} from "@/components/ui/fs-screen-primitives";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  createSubscriptionRequest,
  fetchMyApprovedRequests,
  fetchMyLatestRequest,
  fetchMySubscription,
  fetchPaidPlans,
} from "@/lib/features/subscription/api";
import {
  SUBSCRIPTION_STATUS_LABELS,
  subscriptionPaymentLabel,
  type SubscriptionStatus,
} from "@/lib/features/subscription/types";
import { SubscribeFlowDialog } from "@/components/subscription/subscribe-flow-dialog";
import { InvoicePreviewDialog } from "@/components/subscription/invoice-preview-dialog";
import { formatCurrency } from "@/lib/utils/currency";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

function formatDmy(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      timeZone: getActiveTimeZone(),
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / 86_400_000);
}

function statusTone(status: SubscriptionStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-700";
    case "trialing":
      return "bg-blue-100 text-blue-700";
    case "past_due":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-red-100 text-red-700";
  }
}

export function SubscriptionScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h } = usePermissions();
  const companyId = ctx.data?.companyId ?? "";
  const isOwner = h?.isOwner ?? false;

  const [flowOpen, setFlowOpen] = useState(false);

  const subQ = useQuery({
    queryKey: ["company-subscription", companyId],
    queryFn: () => fetchMySubscription(companyId),
    enabled: !!companyId && isOwner && !permLoading,
    staleTime: 30_000,
  });

  const plansQ = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: fetchPaidPlans,
    enabled: !!companyId && isOwner,
    staleTime: 5 * 60_000,
  });

  const reqQ = useQuery({
    queryKey: ["subscription-request", companyId],
    queryFn: () => fetchMyLatestRequest(companyId),
    enabled: !!companyId && isOwner && !permLoading,
    staleTime: 15_000,
  });

  const invoicesQ = useQuery({
    queryKey: ["subscription-invoices", companyId],
    queryFn: () => fetchMyApprovedRequests(companyId),
    enabled: !!companyId && isOwner && !permLoading,
    staleTime: 30_000,
  });
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);

  const [previewId, setPreviewId] = useState<string | null>(null);

  const sub = subQ.data;
  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);
  const monthlyPrice = useMemo(
    () => plans.find((p) => p.interval === "month")?.priceCents ?? null,
    [plans],
  );
  const latestReq = reqQ.data;
  const hasPending = latestReq?.status === "pending";

  const submitMut = useMutation({
    mutationFn: (input: Parameters<typeof createSubscriptionRequest>[1]) =>
      createSubscriptionRequest(companyId, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["subscription-request", companyId] });
      toast.success("Demande envoyée");
    },
    onError: (e) => toastMutationError("subscription", e),
  });

  // ---------- Accès réservé (owner uniquement) ----------
  if (!permLoading && !isOwner) {
    return (
      <FsPage>
        <FsScreenHeader title="Abonnement" subtitle="Votre formule FasoStock" />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              Seul le propriétaire de l&apos;entreprise peut gérer l&apos;abonnement.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const dleft = daysLeft(sub?.currentPeriodEnd ?? null);
  const expSoon = dleft != null && dleft >= 0 && dleft <= 7;
  const expired = dleft != null && dleft < 0;

  return (
    <FsPage>
      <FsScreenHeader
        title="Abonnement"
        subtitle="Consultez votre formule, sa date de renouvellement, et souscrivez en quelques étapes."
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
      />

      {subQ.isError ? (
        <FsQueryErrorPanel error={subQ.error} onRetry={() => subQ.refetch()} />
      ) : subQ.isLoading || permLoading ? (
        <FsCard padding="p-8">
          <p className="text-center text-sm text-neutral-500">Chargement…</p>
        </FsCard>
      ) : (
        <>
          {/* Carte plan courant */}
          <FsCard className="mb-4 overflow-hidden" padding="p-0">
            <div className="bg-[color-mix(in_srgb,var(--fs-accent)_8%,transparent)] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fs-accent/15">
                    <MdWorkspacePremium className="h-7 w-7 text-fs-accent" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-fs-text">
                      {sub?.plan?.name ?? "Aucun plan"}
                    </p>
                    {sub?.plan ? (
                      <p className="text-sm text-neutral-600">
                        {formatCurrency(sub.plan.priceCents)} /{" "}
                        {sub.plan.interval === "year" ? "an" : "mois"}
                      </p>
                    ) : null}
                  </div>
                </div>
                {sub ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                      statusTone(sub.status),
                    )}
                  >
                    {SUBSCRIPTION_STATUS_LABELS[sub.status] ?? sub.status}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-1 divide-y divide-black/[0.05] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="p-4 sm:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  {sub?.cancelAtPeriodEnd ? "Fin de l'abonnement" : "Renouvellement"}
                </p>
                <p
                  className={cn(
                    "mt-1 text-base font-bold",
                    expired ? "text-red-600" : expSoon ? "text-amber-600" : "text-fs-text",
                  )}
                >
                  {formatDmy(sub?.currentPeriodEnd ?? null)}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Temps restant
                </p>
                <p
                  className={cn(
                    "mt-1 text-base font-bold",
                    expired ? "text-red-600" : expSoon ? "text-amber-600" : "text-fs-text",
                  )}
                >
                  {dleft == null
                    ? "—"
                    : expired
                      ? "Expiré"
                      : `${dleft} jour${dleft > 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
          </FsCard>

          {/* Bandeau : demande en attente */}
          {hasPending ? (
            <FsCard className="mb-4 border-amber-200 bg-amber-50/80" padding="p-4">
              <div className="flex gap-3">
                <MdHourglassTop className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-amber-900">
                    Demande en attente de validation
                  </p>
                  <p className="mt-1 text-amber-800/90">
                    {latestReq
                      ? `${formatCurrency(latestReq.amountCents)} · ${
                          latestReq.billingInterval === "year" ? "annuel" : "mensuel"
                        } · ${subscriptionPaymentLabel(latestReq.paymentMethod)}`
                      : null}
                    . Votre abonnement sera activé après vérification du paiement.
                  </p>
                </div>
              </div>
            </FsCard>
          ) : latestReq?.status === "rejected" ? (
            <FsCard className="mb-4 border-red-200 bg-red-50/80" padding="p-4">
              <p className="text-sm font-semibold text-red-800">
                Votre dernière demande a été refusée.
              </p>
              {latestReq.reviewNote ? (
                <p className="mt-1 text-sm text-red-900/90">Motif : {latestReq.reviewNote}</p>
              ) : null}
            </FsCard>
          ) : null}

          {/* CTA */}
          <button
            type="button"
            onClick={() => setFlowOpen(true)}
            disabled={hasPending || plans.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-fs-accent px-5 py-4 text-base font-bold text-white shadow-sm transition-transform active:scale-[0.99] disabled:opacity-60 sm:w-auto"
          >
            <MdAutorenew className="h-5 w-5" aria-hidden />
            {hasPending
              ? "Demande en cours…"
              : expired || sub?.status === "expired"
                ? "Réactiver mon abonnement"
                : "Souscrire / Renouveler"}
          </button>

          {/* Aperçu des formules */}
          {plans.length > 0 ? (
            <div className="mt-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Nos formules
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {plans.map((p) => (
                  <FsCard key={p.id} padding="p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-fs-text">{p.name}</p>
                      <p className="text-lg font-bold text-fs-accent">
                        {formatCurrency(p.priceCents)}
                      </p>
                    </div>
                    <p className="text-xs text-neutral-500">
                      par {p.interval === "year" ? "an" : "mois"}
                      {p.interval === "year" && monthlyPrice
                        ? ` · soit ${formatCurrency(Math.round(p.priceCents / 12))}/mois`
                        : ""}
                    </p>
                    {p.description ? (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-neutral-600">
                        <MdCheckCircle
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
                          aria-hidden
                        />
                        {p.description}
                      </p>
                    ) : null}
                  </FsCard>
                ))}
              </div>
            </div>
          ) : null}

          {/* Factures (demandes approuvées) */}
          {invoices.length > 0 ? (
            <div className="mt-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Mes factures
              </p>
              <FsCard padding="p-0">
                <ul className="divide-y divide-black/[0.05]">
                  {invoices.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-red-50">
                        <MdPictureAsPdf className="h-5 w-5 text-red-500" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-fs-text">
                          Abonnement {inv.billingInterval === "year" ? "annuel" : "mensuel"}
                          {" · "}
                          {formatCurrency(inv.amountCents)}
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          {formatDmy(inv.createdAt)} · Payé
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewId(inv.id)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-black/[0.12] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800 active:scale-[0.99] sm:text-sm"
                      >
                        <MdPictureAsPdf className="h-4 w-4" aria-hidden />
                        Voir / Télécharger
                      </button>
                    </li>
                  ))}
                </ul>
              </FsCard>
            </div>
          ) : null}
        </>
      )}

      <SubscribeFlowDialog
        open={flowOpen}
        onClose={() => setFlowOpen(false)}
        plans={plans}
        monthlyEquivalent={monthlyPrice}
        onSubmit={async (input) => {
          await submitMut.mutateAsync(input);
        }}
      />

      <InvoicePreviewDialog
        open={previewId != null}
        requestId={previewId}
        fileName="facture-fasostock.pdf"
        onClose={() => setPreviewId(null)}
      />
    </FsPage>
  );
}
