"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MdCalendarToday,
  MdEventBusy,
  MdInventory2,
  MdLock,
  MdRefresh,
  MdSearch,
  MdStorefront,
  MdWarningAmber,
} from "react-icons/md";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  FsSectionLabel,
  FsStickyMobileActions,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  EXPIRY_SOON_DAYS,
  fetchExpiryList,
  type ExpiryListItem,
} from "@/lib/features/products/batches-api";
import { cn } from "@/lib/utils/cn";

type ExpiryFilter = "all" | "expired" | "d7" | "d30" | "d90" | "ok";

const FILTERS: { key: ExpiryFilter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "expired", label: "Périmés" },
  { key: "d7", label: "≤ 7 jours" },
  { key: "d30", label: "≤ 30 jours" },
  { key: "d90", label: `≤ ${EXPIRY_SOON_DAYS} jours` },
  { key: "ok", label: "Valides" },
];

/** Date "YYYY-MM-DD" → "JJ/MM/AAAA". */
function formatExpiryDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Tonalité visuelle d'un lot selon les jours restants. */
function toneForDays(daysLeft: number): {
  badge: string;
  dot: string;
  text: string;
} {
  if (daysLeft < 0)
    return {
      badge: "bg-red-100 text-red-700",
      dot: "bg-red-500",
      text: "Périmé",
    };
  if (daysLeft <= 7)
    return {
      badge: "bg-red-100 text-red-700",
      dot: "bg-red-500",
      text: `J-${daysLeft}`,
    };
  if (daysLeft <= 30)
    return {
      badge: "bg-amber-100 text-amber-700",
      dot: "bg-amber-500",
      text: `J-${daysLeft}`,
    };
  if (daysLeft <= EXPIRY_SOON_DAYS)
    return {
      badge: "bg-yellow-100 text-yellow-700",
      dot: "bg-yellow-500",
      text: `J-${daysLeft}`,
    };
  return {
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    text: `J-${daysLeft}`,
  };
}

function matchesFilter(item: ExpiryListItem, filter: ExpiryFilter): boolean {
  const d = item.daysLeft;
  switch (filter) {
    case "all":
      return true;
    case "expired":
      return d < 0;
    case "d7":
      return d >= 0 && d <= 7;
    case "d30":
      return d >= 0 && d <= 30;
    case "d90":
      return d >= 0 && d <= EXPIRY_SOON_DAYS;
    case "ok":
      return d > EXPIRY_SOON_DAYS;
    default:
      return true;
  }
}

export function ExpiryScreen() {
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h } = usePermissions();
  const companyId = ctx.data?.companyId ?? "";
  const stores = ctx.data?.stores;
  const storeName = useMemo(() => {
    const map = new Map((stores ?? []).map((s) => [s.id, s.name] as const));
    return (id: string | null) => (id ? (map.get(id) ?? null) : null);
  }, [stores]);

  const [filter, setFilter] = useState<ExpiryFilter>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const canExpiry = h?.canExpiry ?? false;

  const listQ = useQuery({
    queryKey: ["expiry-list", companyId],
    queryFn: () => fetchExpiryList(companyId),
    enabled: !!companyId && canExpiry,
    staleTime: 30_000,
  });

  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);

  const counts = useMemo(() => {
    let expired = 0;
    let d30 = 0;
    let d90 = 0;
    let riskQty = 0;
    for (const it of rows) {
      if (it.daysLeft < 0) {
        expired += 1;
        riskQty += it.quantity;
      } else if (it.daysLeft <= 30) {
        d30 += 1;
        riskQty += it.quantity;
      } else if (it.daysLeft <= EXPIRY_SOON_DAYS) {
        d90 += 1;
      }
    }
    return { expired, d30, d90, total: rows.length, riskQty };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return rows.filter((it) => {
      if (!matchesFilter(it, filter)) return false;
      if (!q) return true;
      return (
        it.productName.toLowerCase().includes(q) ||
        (it.lotNumber ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, deferredSearch]);

  // ----- Accès réservé (non owner et sans droit délégué) -----
  if (!permLoading && (!h || !canExpiry)) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Péremptions"
          subtitle="Suivi des dates limites (DLC/DLUO)"
        />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              Vous n&apos;avez pas accès à cette section.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
        <FsScreenHeader
          className="mb-0"
          title="Péremptions"
          subtitle="Repérez les produits périmés ou proches de leur date limite."
          titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
        />
        <button
          type="button"
          onClick={() => listQ.refetch()}
          disabled={listQ.isFetching}
          className="fs-touch-target inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-black/[0.08] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:bg-fs-surface-container disabled:opacity-60 sm:text-sm"
        >
          <MdRefresh
            className={cn("h-4 w-4", listQ.isFetching && "animate-spin")}
            aria-hidden
          />
          Actualiser
        </button>
      </div>

      {/* KPI */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 min-[900px]:grid-cols-4">
        <KpiTile
          label="Périmés"
          value={counts.expired}
          tone="red"
          icon={<MdEventBusy className="h-4 w-4" aria-hidden />}
        />
        <KpiTile
          label="Proches (≤ 30 j)"
          value={counts.d30}
          tone="amber"
          icon={<MdWarningAmber className="h-4 w-4" aria-hidden />}
        />
        <KpiTile
          label={`À surveiller (≤ ${EXPIRY_SOON_DAYS} j)`}
          value={counts.d90}
          tone="yellow"
          icon={<MdCalendarToday className="h-4 w-4" aria-hidden />}
        />
        <KpiTile
          label="Lots suivis"
          value={counts.total}
          tone="neutral"
          icon={<MdInventory2 className="h-4 w-4" aria-hidden />}
        />
      </div>

      {/* Filtres + recherche */}
      <FsStickyMobileActions className="mb-3">
        <div className="space-y-2.5">
          <div className="relative">
            <MdSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit ou un n° de lot…"
              className={fsInputClass("pl-9")}
            />
          </div>
          <div>
            <FsSectionLabel className="mb-1.5">Filtrer</FsSectionLabel>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <FsFilterChip
                  key={f.key}
                  icon={MdCalendarToday}
                  label={f.label}
                  selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                />
              ))}
            </div>
          </div>
        </div>
      </FsStickyMobileActions>

      {/* Contenu */}
      {listQ.isError ? (
        <FsQueryErrorPanel error={listQ.error} onRetry={() => listQ.refetch()} />
      ) : listQ.isLoading || permLoading ? (
        <FsCard padding="p-8">
          <p className="text-center text-sm text-neutral-500">Chargement…</p>
        </FsCard>
      ) : filtered.length === 0 ? (
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <MdEventBusy className="h-10 w-10 text-neutral-400" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              {rows.length === 0
                ? "Aucun lot daté en stock. Ajoutez des dates de péremption depuis la fiche produit ou la réception d'achat."
                : "Aucun lot ne correspond à ce filtre ou à cette recherche."}
            </p>
          </div>
        </FsCard>
      ) : (
        <FsCard padding="p-0">
          <ul className="divide-y divide-black/[0.05]">
            {filtered.map((it) => {
              const tone = toneForDays(it.daysLeft);
              const store = storeName(it.storeId);
              return (
                <li
                  key={it.batchId}
                  className="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3"
                >
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fs-text">
                      {it.productName}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500">
                      {it.lotNumber ? <span>Lot {it.lotNumber}</span> : null}
                      <span className="inline-flex items-center gap-1">
                        <MdCalendarToday className="h-3 w-3" aria-hidden />
                        {formatExpiryDate(it.expiryDate)}
                      </span>
                      {store ? (
                        <span className="inline-flex items-center gap-1">
                          <MdStorefront className="h-3 w-3" aria-hidden />
                          {store}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        tone.badge,
                      )}
                    >
                      {tone.text}
                    </span>
                    <span className="text-[11px] font-medium text-neutral-500">
                      {it.quantity} u.
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </FsCard>
      )}

      {filtered.length > 0 ? (
        <p className="mt-3 text-center text-[11px] text-neutral-400">
          {filtered.length} lot(s) affiché(s) · {counts.riskQty} unité(s) à risque
        </p>
      ) : null}
    </FsPage>
  );
}

function KpiTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "yellow" | "neutral";
  icon: React.ReactNode;
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "yellow"
          ? "border-yellow-200 bg-yellow-50 text-yellow-700"
          : "border-black/[0.06] bg-fs-surface-container text-neutral-700";
  return (
    <div className={cn("rounded-xl border p-3", toneClass)}>
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-2xl font-bold leading-none">{value}</p>
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-fs-text">{label}</p>
    </div>
  );
}
