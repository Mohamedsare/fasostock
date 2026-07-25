"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  MdChevronLeft,
  MdChevronRight,
  MdCreditScore,
  MdPayments,
  MdRefresh,
  MdSearch,
} from "react-icons/md";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import {
  listCreditRepaymentsForDay,
  listCreditsGrantedForDay,
} from "@/lib/features/credit/api";
import { paymentMethodLabel } from "@/lib/features/receipt/build-receipt-ticket-data";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

function todayYmd(): string {
  return format(new Date(), "yyyy-MM-dd");
}
function hhmm(iso: string): string {
  try {
    return format(parseISO(iso), "HH:mm");
  } catch {
    return "—";
  }
}

type SubView = "granted" | "repaid";

export function CreditRepaymentsPanel({
  companyId,
  storeId,
  onOpenSaleDetail,
}: {
  companyId: string;
  storeId: string | null;
  onOpenSaleDetail: (saleId: string) => void;
}) {
  const today = todayYmd();
  const [day, setDay] = useState<string>(() => today);
  const [search, setSearch] = useState("");
  const [sub, setSub] = useState<SubView>("granted");

  const grantedQ = useQuery({
    queryKey: ["credit-granted", companyId, storeId, day],
    queryFn: () => listCreditsGrantedForDay({ companyId, storeId, day }),
    enabled: !!companyId && !!day,
    staleTime: 15_000,
  });
  const repaidQ = useQuery({
    queryKey: ["credit-repayments", companyId, storeId, day],
    queryFn: () => listCreditRepaymentsForDay({ companyId, storeId, day }),
    enabled: !!companyId && !!day,
    staleTime: 15_000,
  });

  const grantedRows = useMemo(() => grantedQ.data ?? [], [grantedQ.data]);
  const repaidRows = useMemo(() => repaidQ.data ?? [], [repaidQ.data]);

  const grantedTotal = useMemo(
    () => grantedRows.reduce((s, r) => s + r.creditGranted, 0),
    [grantedRows],
  );
  const repaidTotals = useMemo(() => {
    let total = 0, old = 0, sameDay = 0;
    for (const r of repaidRows) {
      total += r.amount;
      if (r.isOldCredit) old += r.amount;
      else sameDay += r.amount;
    }
    return { total, old, sameDay };
  }, [repaidRows]);
  const netEncours = grantedTotal - repaidTotals.total;

  const s = search.trim().toLowerCase();
  const num = s.replace(/\s/g, "");
  const grantedFiltered = useMemo(() => {
    if (!s) return grantedRows;
    return grantedRows.filter(
      (r) =>
        (r.customerName ?? "").toLowerCase().includes(s) ||
        (r.saleNumber ?? "").toLowerCase().includes(s) ||
        (r.customerPhone ?? "").replace(/\s/g, "").includes(num),
    );
  }, [grantedRows, s, num]);
  const repaidFiltered = useMemo(() => {
    if (!s) return repaidRows;
    return repaidRows.filter(
      (r) =>
        (r.customerName ?? "").toLowerCase().includes(s) ||
        (r.saleNumber ?? "").toLowerCase().includes(s) ||
        (r.customerPhone ?? "").replace(/\s/g, "").includes(num),
    );
  }, [repaidRows, s, num]);

  const dayLabel = (() => {
    try {
      return format(parseISO(day), "EEEE d MMMM yyyy", { locale: fr });
    } catch {
      return day;
    }
  })();
  const shiftDay = (n: number) => {
    try {
      setDay(format(addDays(parseISO(day), n), "yyyy-MM-dd"));
    } catch {
      /* ignore */
    }
  };
  const isToday = day === today;
  const loading = sub === "granted" ? grantedQ.isLoading : repaidQ.isLoading;
  const fetching = grantedQ.isFetching || repaidQ.isFetching;

  return (
    <div className="mt-6">
      {/* Sélecteur de date */}
      <FsCard padding="p-3 sm:p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-fs-surface-container dark:border-white/10"
            aria-label="Jour précédent"
          >
            <MdChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <input
            type="date"
            value={day}
            max={today}
            onChange={(e) => setDay(e.target.value || today)}
            className={fsInputClass("h-10 w-auto")}
          />
          <button
            type="button"
            onClick={() => shiftDay(1)}
            disabled={isToday}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-fs-surface-container disabled:opacity-40 dark:border-white/10"
            aria-label="Jour suivant"
          >
            <MdChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setDay(today)}
            className={cn(
              "inline-flex h-10 items-center rounded-lg px-3 text-xs font-bold",
              isToday
                ? "bg-fs-accent text-white"
                : "border border-black/10 bg-fs-surface-container text-neutral-700 dark:border-white/10 dark:text-neutral-200",
            )}
          >
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={() => {
              void grantedQ.refetch();
              void repaidQ.refetch();
            }}
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg border border-black/10 bg-fs-surface-container px-3 text-xs font-semibold dark:border-white/10"
          >
            <MdRefresh className={cn("h-4 w-4", fetching && "animate-spin")} aria-hidden />
            Actualiser
          </button>
        </div>
        <p className="mt-2 text-xs capitalize text-neutral-500">{dayLabel}</p>
      </FsCard>

      {/* Deux totaux du jour */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FsCard className="border-2 border-sky-500/30" padding="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600">
              <MdCreditScore className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">Crédits accordés ce jour</p>
              <p className="text-2xl font-bold text-sky-700 dark:text-sky-400">
                {formatCurrency(grantedTotal)}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                {grantedRows.length} vente{grantedRows.length > 1 ? "s" : ""} à crédit
              </p>
            </div>
          </div>
        </FsCard>
        <FsCard className="border-2 border-emerald-500/30" padding="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
              <MdPayments className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">Crédits remboursés ce jour</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(repaidTotals.total)}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                {repaidRows.length} remboursement{repaidRows.length > 1 ? "s" : ""}
                {repaidTotals.total > 0
                  ? ` · anciens ${formatCurrency(repaidTotals.old)} · du jour ${formatCurrency(repaidTotals.sameDay)}`
                  : ""}
              </p>
            </div>
          </div>
        </FsCard>
      </div>

      {/* Variation de l'encours */}
      <FsCard className="mt-3" padding="p-3">
        <p className="text-xs text-neutral-600">
          Variation de l&apos;encours crédit ce jour :{" "}
          <span
            className={cn(
              "font-bold",
              netEncours > 0
                ? "text-red-600"
                : netEncours < 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-neutral-600",
            )}
          >
            {netEncours > 0 ? "+" : ""}
            {formatCurrency(netEncours)}
          </span>{" "}
          {netEncours > 0
            ? "(plus de crédits accordés que remboursés)"
            : netEncours < 0
              ? "(plus remboursé qu'accordé — l'encours baisse)"
              : "(équilibre)"}
        </p>
      </FsCard>

      {/* Sous-onglet + recherche + liste */}
      <FsCard className="mt-4 overflow-hidden p-0" padding="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/6 p-3 dark:border-white/10">
          <div className="flex rounded-xl border border-black/10 p-0.5 dark:border-white/10">
            <button
              type="button"
              onClick={() => setSub("granted")}
              className={cn(
                "min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold",
                sub === "granted" ? "bg-sky-600 text-white" : "text-neutral-600",
              )}
            >
              Accordés ({grantedRows.length})
            </button>
            <button
              type="button"
              onClick={() => setSub("repaid")}
              className={cn(
                "min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold",
                sub === "repaid" ? "bg-emerald-600 text-white" : "text-neutral-600",
              )}
            >
              Remboursés ({repaidRows.length})
            </button>
          </div>
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <MdSearch
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              className={fsInputClass("h-10 w-full pl-10 text-sm")}
              placeholder="Client, téléphone, référence…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Rechercher"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
          </div>
        ) : sub === "granted" ? (
          grantedFiltered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <MdCreditScore className="h-10 w-10 text-neutral-300" aria-hidden />
              <p className="text-sm text-neutral-600">Aucun crédit accordé ce jour.</p>
            </div>
          ) : (
            <FsHorizontalScroll>
              <table className="w-full min-w-[720px] border-collapse text-left text-[13px] [&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap">
                <thead>
                  <tr className="border-b border-black/10 bg-fs-surface-low/80 dark:border-white/10">
                    <th className="px-3 py-3 font-bold">Heure</th>
                    <th className="px-3 py-3 font-bold">Client</th>
                    <th className="px-3 py-3 font-bold">Réf. vente</th>
                    <th className="px-3 py-3 text-right font-bold">Total vente</th>
                    <th className="px-3 py-3 text-right font-bold">Payé à la vente</th>
                    <th className="px-3 py-3 text-right font-bold">Crédit accordé</th>
                    <th className="px-3 py-3 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grantedFiltered.map((r) => (
                    <tr
                      key={r.saleId}
                      className="cursor-pointer border-b border-black/6 hover:bg-black/2 dark:border-white/6 dark:hover:bg-white/5"
                      onClick={() => onOpenSaleDetail(r.saleId)}
                    >
                      <td className="px-3 py-2.5 font-semibold tabular-nums">{hhmm(r.createdAt)}</td>
                      <td className="max-w-[180px] truncate px-3 py-2.5">
                        {r.customerName ?? "—"}
                        {r.customerPhone ? (
                          <span className="mt-0.5 block text-[11px] text-neutral-500">{r.customerPhone}</span>
                        ) : null}
                      </td>
                      <td className="max-w-[8rem] truncate px-3 py-2.5 font-mono text-xs">{r.saleNumber}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(r.saleTotal)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(r.paidAtSale)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-sky-700 dark:text-sky-400">
                        {formatCurrency(r.creditGranted)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenSaleDetail(r.saleId);
                          }}
                          className="whitespace-nowrap rounded-lg bg-fs-accent/15 px-2 py-1 text-xs font-bold text-fs-accent"
                        >
                          Voir la vente
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FsHorizontalScroll>
          )
        ) : repaidFiltered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <MdPayments className="h-10 w-10 text-neutral-300" aria-hidden />
            <p className="text-sm text-neutral-600">Aucun remboursement de crédit ce jour.</p>
          </div>
        ) : (
          <FsHorizontalScroll>
            <table className="w-full min-w-[720px] border-collapse text-left text-[13px] [&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-black/10 bg-fs-surface-low/80 dark:border-white/10">
                  <th className="px-3 py-3 font-bold">Heure</th>
                  <th className="px-3 py-3 font-bold">Client</th>
                  <th className="px-3 py-3 font-bold">Réf. vente</th>
                  <th className="px-3 py-3 font-bold">Origine</th>
                  <th className="px-3 py-3 font-bold">Mode</th>
                  <th className="px-3 py-3 text-right font-bold">Montant</th>
                  <th className="px-3 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {repaidFiltered.map((r) => (
                  <tr
                    key={r.paymentId}
                    className="cursor-pointer border-b border-black/6 hover:bg-black/2 dark:border-white/6 dark:hover:bg-white/5"
                    onClick={() => onOpenSaleDetail(r.saleId)}
                  >
                    <td className="px-3 py-2.5 font-semibold tabular-nums">{hhmm(r.paidAt)}</td>
                    <td className="max-w-[180px] truncate px-3 py-2.5">
                      {r.customerName ?? "—"}
                      {r.customerPhone ? (
                        <span className="mt-0.5 block text-[11px] text-neutral-500">{r.customerPhone}</span>
                      ) : null}
                    </td>
                    <td className="max-w-[8rem] truncate px-3 py-2.5 font-mono text-xs">{r.saleNumber}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
                          r.isOldCredit
                            ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                            : "bg-amber-500/15 text-amber-800 dark:text-amber-200",
                        )}
                      >
                        {r.isOldCredit ? "Ancien crédit" : "Crédit du jour"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{paymentMethodLabel(r.method)}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      +{formatCurrency(r.amount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSaleDetail(r.saleId);
                        }}
                        className="whitespace-nowrap rounded-lg bg-fs-accent/15 px-2 py-1 text-xs font-bold text-fs-accent"
                      >
                        Voir la vente
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FsHorizontalScroll>
        )}
      </FsCard>
    </div>
  );
}
