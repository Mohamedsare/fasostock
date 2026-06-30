"use client";

import { useQuery } from "@tanstack/react-query";
import { MdEventBusy, MdReceiptLong } from "react-icons/md";
import { createClient } from "@/lib/supabase/client";
import {
  EXPIRY_SOON_DAYS,
  fetchExpirySummary,
} from "@/lib/features/products/batches-api";
import { activityConfig } from "@/lib/features/activity/activity-config";
import { activityUiTerms } from "@/lib/features/activity/activity-profiles";
import { formatCurrency } from "@/lib/utils/currency";
import { FsCard } from "@/components/ui/fs-screen-primitives";

type Props = {
  companyId: string;
  businessTypeSlug: string | null | undefined;
  storeId: string | null;
  fromDate: string;
  toDate: string;
};

type PrescriptionStats = { count: number; total: number };

async function fetchPrescriptionSales(
  companyId: string,
  storeId: string | null,
  fromDate: string,
  toDate: string,
): Promise<PrescriptionStats> {
  const supabase = createClient();
  let query = supabase
    .from("sales")
    .select("total")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .not("prescription_number", "is", null)
    .gte("created_at", fromDate)
    .lte("created_at", `${toDate}T23:59:59.999`);
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Array<{ total?: unknown }>;
  const total = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
  return { count: rows.length, total };
}

/**
 * Section « Rapports pharmacie » : péremption (état du stock) + ventes sur
 * ordonnance (période sélectionnée). Rend `null` hors pharmacie.
 */
export function PharmacyReportsCard({
  companyId,
  businessTypeSlug,
  storeId,
  fromDate,
  toDate,
}: Props) {
  const config = activityConfig(businessTypeSlug);
  const terms = activityUiTerms(businessTypeSlug);
  const enabled = !!companyId && config.expiryDashboard;

  const expiryQ = useQuery({
    queryKey: ["expiry-summary", companyId],
    queryFn: () => fetchExpirySummary(companyId),
    enabled,
    staleTime: 60_000,
  });

  const prescQ = useQuery({
    queryKey: ["prescription-sales", companyId, storeId, fromDate, toDate],
    queryFn: () => fetchPrescriptionSales(companyId, storeId, fromDate, toDate),
    enabled: enabled && config.prescriptionReports,
    staleTime: 60_000,
  });

  if (!enabled) return null;

  const expiry = expiryQ.data;
  const presc = prescQ.data;

  return (
    <FsCard className="mb-6" padding="p-4 sm:p-5">
      <h2 className="flex items-center gap-1.5 text-base font-bold text-fs-text">
        <MdEventBusy className="h-5 w-5 text-fs-accent" aria-hidden />
        {terms.expiryReportsTitle ?? "Suivi des péremptions"}
      </h2>

      <div
        className={`mt-3 grid grid-cols-1 gap-3 ${
          config.prescriptionReports
            ? "min-[640px]:grid-cols-3"
            : "min-[640px]:grid-cols-2"
        }`}
      >
        <Tile
          label={terms.expiredItemsLabel ?? "Produits périmés"}
          value={expiry ? String(expiry.expiredCount) : "—"}
          sub={expiry ? `${expiry.expiredQuantity} unité(s)` : ""}
          tone="red"
        />
        <Tile
          label={`Proches péremption (≤ ${EXPIRY_SOON_DAYS} j)`}
          value={expiry ? String(expiry.expiringSoonCount) : "—"}
          sub={expiry ? `${expiry.expiringSoonQuantity} unité(s)` : ""}
          tone="amber"
        />
        {config.prescriptionReports ? (
          <Tile
            label="Ventes sur ordonnance (période)"
            value={presc ? String(presc.count) : "—"}
            sub={presc ? formatCurrency(presc.total) : ""}
            tone="accent"
            icon
          />
        ) : null}
      </div>

      {expiry && expiry.items.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-neutral-600">
            Lots les plus urgents
          </p>
          <ul className="divide-y divide-black/[0.05] rounded-lg border border-black/[0.06]">
            {expiry.items.map((it, i) => (
              <li
                key={`${it.productId}-${i}`}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-fs-text">
                  {it.productName}
                  {it.lotNumber ? (
                    <span className="text-neutral-500"> · lot {it.lotNumber}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-neutral-500">{it.expiryDate}</span>
                <span
                  className={
                    it.daysLeft < 0
                      ? "shrink-0 rounded-md bg-red-100 px-1.5 py-0.5 font-semibold text-red-700"
                      : "shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700"
                  }
                >
                  {it.daysLeft < 0 ? "Périmé" : `J-${it.daysLeft}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </FsCard>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "red" | "amber" | "accent";
  icon?: boolean;
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-fs-accent/30 bg-fs-accent/[0.06] text-fs-accent";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1">
        {icon ? <MdReceiptLong className="h-4 w-4" aria-hidden /> : null}
        <p className="text-2xl font-bold leading-none">{value}</p>
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-fs-text">{label}</p>
      {sub ? <p className="text-[10px] text-neutral-500">{sub}</p> : null}
    </div>
  );
}
