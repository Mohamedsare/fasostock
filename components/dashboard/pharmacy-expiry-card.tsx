"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { MdWarningAmber, MdEventBusy } from "react-icons/md";
import {
  EXPIRY_SOON_DAYS,
  fetchExpirySummary,
} from "@/lib/features/products/batches-api";
import { activityConfig } from "@/lib/features/activity/activity-config";
import { ROUTES } from "@/lib/config/routes";
import { cn } from "@/lib/utils/cn";

type Props = {
  companyId: string;
  businessTypeSlug: string | null | undefined;
};

/**
 * Bloc d'alerte péremption du tableau de bord — affiché uniquement pour les
 * métiers à suivi de lots (pharmacie). Invisible (rend `null`) sinon, donc
 * aucun impact sur les autres types d'entreprise.
 */
export function PharmacyExpiryCard({ companyId, businessTypeSlug }: Props) {
  const enabled =
    !!companyId && activityConfig(businessTypeSlug).expiryDashboard;

  const q = useQuery({
    queryKey: ["expiry-summary", companyId],
    queryFn: () => fetchExpirySummary(companyId),
    enabled,
    staleTime: 60_000,
  });

  if (!enabled) return null;

  const summary = q.data;
  const hasAlerts =
    !!summary && (summary.expiredCount > 0 || summary.expiringSoonCount > 0);

  return (
    <section className="mb-3 rounded-xl border border-black/[0.06] bg-fs-card p-3 shadow-sm sm:rounded-2xl sm:p-4 min-[900px]:mb-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-fs-text">
          <MdEventBusy className="h-5 w-5 text-fs-accent" aria-hidden />
          Péremptions
        </h2>
        <Link
          href={ROUTES.products}
          className="text-xs font-semibold text-fs-accent hover:underline"
        >
          Gérer les médicaments
        </Link>
      </div>

      {q.isLoading ? (
        <p className="mt-2 text-xs text-neutral-500">Chargement…</p>
      ) : !hasAlerts ? (
        <p className="mt-2 text-xs text-neutral-500">
          Aucun lot périmé ou proche de péremption (≤ {EXPIRY_SOON_DAYS} jours).
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <StatTile
              label="Périmés"
              value={summary!.expiredCount}
              sub={`${summary!.expiredQuantity} unité(s)`}
              tone="red"
            />
            <StatTile
              label={`Proches (≤ ${EXPIRY_SOON_DAYS} j)`}
              value={summary!.expiringSoonCount}
              sub={`${summary!.expiringSoonQuantity} unité(s)`}
              tone="amber"
            />
          </div>

          {summary!.items.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {summary!.items.map((it, i) => {
                const tone =
                  it.daysLeft < 0
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700";
                return (
                  <li
                    key={`${it.productId}-${i}`}
                    className="flex items-center gap-2 rounded-lg bg-fs-surface-container px-2.5 py-1.5"
                  >
                    <MdWarningAmber
                      className={cn(
                        "h-4 w-4 shrink-0",
                        it.daysLeft < 0 ? "text-red-600" : "text-amber-600",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-fs-text">
                      {it.productName}
                      {it.lotNumber ? (
                        <span className="text-neutral-500"> · lot {it.lotNumber}</span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        tone,
                      )}
                    >
                      {it.daysLeft < 0 ? `Périmé` : `J-${it.daysLeft}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "red" | "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5",
        tone === "red"
          ? "border-red-200 bg-red-50"
          : "border-amber-200 bg-amber-50",
      )}
    >
      <p
        className={cn(
          "text-2xl font-bold leading-none",
          tone === "red" ? "text-red-700" : "text-amber-700",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold text-fs-text">{label}</p>
      <p className="text-[10px] text-neutral-500">{sub}</p>
    </div>
  );
}
