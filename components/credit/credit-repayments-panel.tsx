"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  subDays,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  MdChevronLeft,
  MdChevronRight,
  MdCreditScore,
  MdDownload,
  MdInfoOutline,
  MdPayments,
  MdRefresh,
  MdSearch,
} from "react-icons/md";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import {
  listCreditRepaymentsForRange,
  listCreditsGrantedForRange,
} from "@/lib/features/credit/api";
import { exportCreditRangeXlsx } from "@/lib/features/credit/credit-range-export";
import { useAppContext } from "@/lib/features/common/app-context";
import { paymentMethodLabel } from "@/lib/features/receipt/build-receipt-ticket-data";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
function todayYmd(): string {
  return ymd(new Date());
}
function hhmm(iso: string): string {
  try {
    return format(parseISO(iso), "HH:mm");
  } catch {
    return "—";
  }
}
/** Date courte « 05/08 » pour les listes multi-jours. */
function ddmm(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM");
  } catch {
    return "—";
  }
}

type SubView = "granted" | "repaid";
type RangePreset = "today" | "7d" | "30d" | "month" | "custom";

const PRESETS: Array<{ key: Exclude<RangePreset, "custom">; label: string }> = [
  { key: "today", label: "Aujourd'hui" },
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "month", label: "Ce mois" },
];

function presetRange(preset: Exclude<RangePreset, "custom">): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  switch (preset) {
    case "today":
      return { from: to, to };
    case "7d":
      return { from: ymd(subDays(now, 6)), to };
    case "30d":
      return { from: ymd(subDays(now, 29)), to };
    case "month":
      return { from: ymd(startOfMonth(now)), to };
  }
}

export function CreditRepaymentsPanel({
  companyId,
  storeId,
  onOpenSaleDetail,
}: {
  companyId: string;
  storeId: string | null;
  onOpenSaleDetail: (saleId: string) => void;
}) {
  const ctx = useAppContext();
  const companyName = ctx.data?.companyName ?? "";
  const storeLabel = storeId
    ? ctx.data?.stores.find((s) => s.id === storeId)?.name ?? "Boutique"
    : "Toutes boutiques";

  const today = todayYmd();
  const [from, setFrom] = useState<string>(() => today);
  const [to, setTo] = useState<string>(() => today);
  const [preset, setPreset] = useState<RangePreset>("today");
  const [search, setSearch] = useState("");
  const [sub, setSub] = useState<SubView>("repaid");
  const [exporting, setExporting] = useState(false);

  const grantedQ = useQuery({
    queryKey: ["credit-granted", companyId, storeId, from, to],
    queryFn: () => listCreditsGrantedForRange({ companyId, storeId, from, to }),
    enabled: !!companyId && !!from && !!to,
    staleTime: 15_000,
  });
  const repaidQ = useQuery({
    queryKey: ["credit-repayments", companyId, storeId, from, to],
    queryFn: () => listCreditRepaymentsForRange({ companyId, storeId, from, to }),
    enabled: !!companyId && !!from && !!to,
    staleTime: 15_000,
  });

  const grantedRows = useMemo(() => grantedQ.data ?? [], [grantedQ.data]);
  const repaidRows = useMemo(() => repaidQ.data ?? [], [repaidQ.data]);

  const grantedTotals = useMemo(() => {
    let credit = 0;
    let downPayments = 0;
    for (const r of grantedRows) {
      credit += r.creditGranted;
      downPayments += r.paidAtSale;
    }
    return { credit, downPayments };
  }, [grantedRows]);
  const repaidTotals = useMemo(() => {
    let total = 0,
      old = 0,
      sameRange = 0;
    for (const r of repaidRows) {
      total += r.amount;
      if (r.isOldCredit) old += r.amount;
      else sameRange += r.amount;
    }
    return { total, old, sameRange };
  }, [repaidRows]);
  const netEncours = grantedTotals.credit - repaidTotals.total;
  const cashedIn = repaidTotals.total + grantedTotals.downPayments;

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

  const isSingleDay = from === to;
  const rangeLabel = (() => {
    try {
      if (isSingleDay) return format(parseISO(from), "EEEE d MMMM yyyy", { locale: fr });
      return `Du ${format(parseISO(from), "d MMM yyyy", { locale: fr })} au ${format(
        parseISO(to),
        "d MMM yyyy",
        { locale: fr },
      )}`;
    } catch {
      return `${from} → ${to}`;
    }
  })();
  const periodWord = isSingleDay ? "ce jour" : "sur la période";

  const applyPreset = (key: Exclude<RangePreset, "custom">) => {
    const r = presetRange(key);
    setFrom(r.from);
    setTo(r.to);
    setPreset(key);
  };
  /** Décale la fenêtre entière d'une longueur de période (navigation jour par jour / semaine…). */
  const shiftRange = (direction: -1 | 1) => {
    try {
      const f = parseISO(from);
      const t = parseISO(to);
      const span = differenceInCalendarDays(t, f) + 1;
      const nf = addDays(f, direction * span);
      const nt = addDays(t, direction * span);
      if (direction > 0 && ymd(nf) > today) return;
      setFrom(ymd(nf));
      setTo(ymd(nt) > today ? today : ymd(nt));
      setPreset("custom");
    } catch {
      /* ignore */
    }
  };
  const canGoForward = to < today;

  const loading = sub === "granted" ? grantedQ.isLoading : repaidQ.isLoading;
  const fetching = grantedQ.isFetching || repaidQ.isFetching;
  const nothingToExport = grantedRows.length === 0 && repaidRows.length === 0;

  async function onExport() {
    setExporting(true);
    try {
      await exportCreditRangeXlsx({
        from,
        to,
        rangeLabel,
        companyName,
        storeLabel,
        granted: grantedRows,
        repaid: repaidRows,
      });
      toast.success("Export Excel enregistré.");
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Export Excel impossible."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-6">
      {/* Sélecteur de période */}
      <FsCard padding="p-3 sm:p-3.5" className="rounded-md sm:rounded-md">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className={cn(
                "inline-flex h-9 items-center rounded-md px-3 text-xs font-bold",
                preset === p.key
                  ? "bg-fs-accent text-white"
                  : "border border-black/10 bg-fs-surface-container text-neutral-700 dark:border-white/10 dark:text-neutral-200",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftRange(-1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-black/10 bg-fs-surface-container dark:border-white/10"
            aria-label="Période précédente"
            title="Période précédente"
          >
            <MdChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <input
            type="date"
            value={from}
            max={to || today}
            onChange={(e) => {
              setFrom(e.target.value || today);
              setPreset("custom");
            }}
            className={fsInputClass("h-10 w-auto")}
            aria-label="Date de début"
          />
          <span className="text-xs text-neutral-500">au</span>
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => {
              setTo(e.target.value || today);
              setPreset("custom");
            }}
            className={fsInputClass("h-10 w-auto")}
            aria-label="Date de fin"
          />
          <button
            type="button"
            onClick={() => shiftRange(1)}
            disabled={!canGoForward}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-black/10 bg-fs-surface-container disabled:opacity-40 dark:border-white/10"
            aria-label="Période suivante"
            title="Période suivante"
          >
            <MdChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onExport()}
              disabled={exporting || nothingToExport}
              title="Exporter la période en Excel (accordés + remboursés)"
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-50"
            >
              <MdDownload className={cn("h-4 w-4", exporting && "animate-pulse")} aria-hidden />
              {exporting ? "Export…" : "Excel"}
            </button>
            <button
              type="button"
              onClick={() => {
                void grantedQ.refetch();
                void repaidQ.refetch();
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-black/10 bg-fs-surface-container px-3 text-xs font-semibold dark:border-white/10"
            >
              <MdRefresh className={cn("h-4 w-4", fetching && "animate-spin")} aria-hidden />
              Actualiser
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs capitalize text-neutral-500">{rangeLabel}</p>
      </FsCard>

      {/* Deux totaux de la période */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FsCard className="rounded-md sm:rounded-md border-2 border-sky-500/30" padding="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-sky-600">
              <MdCreditScore className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">Crédits accordés {periodWord}</p>
              <p className="text-2xl font-bold text-sky-700 dark:text-sky-400">
                {formatCurrency(grantedTotals.credit)}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                {grantedRows.length} vente{grantedRows.length > 1 ? "s" : ""} à crédit
                {grantedTotals.downPayments > 0
                  ? ` · acomptes à la vente ${formatCurrency(grantedTotals.downPayments)}`
                  : ""}
              </p>
            </div>
          </div>
        </FsCard>
        <FsCard className="rounded-md sm:rounded-md border-2 border-emerald-500/30" padding="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600">
              <MdPayments className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">Crédits remboursés {periodWord}</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(repaidTotals.total)}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                {repaidRows.length} remboursement{repaidRows.length > 1 ? "s" : ""}
                {repaidTotals.total > 0
                  ? ` · anciens ${formatCurrency(repaidTotals.old)} · ${
                      isSingleDay ? "du jour" : "de la période"
                    } ${formatCurrency(repaidTotals.sameRange)}`
                  : ""}
              </p>
            </div>
          </div>
        </FsCard>
      </div>

      {/* Réconciliation avec le KPI « Déjà encaissé » */}
      <FsCard className="rounded-md sm:rounded-md mt-3" padding="p-3">
        <div className="flex items-start gap-2">
          <MdInfoOutline className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          <div className="min-w-0 text-xs text-neutral-600">
            <p>
              Total encaissé {periodWord} sur les ventes à crédit :{" "}
              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(cashedIn)}
              </span>{" "}
              = remboursements {formatCurrency(repaidTotals.total)} + acomptes encaissés à la vente{" "}
              {formatCurrency(grantedTotals.downPayments)}.
            </p>
            <p className="mt-1 text-neutral-500">
              {grantedTotals.downPayments <= 0 && repaidTotals.total > 0
                ? "Les acomptes de ces crédits ont été encaissés le jour de leur vente, donc hors de cette période : ils restent comptés dans le KPI « Déjà encaissé » en haut de page (cliquez-le pour voir quelles ventes)."
                : "Un acompte encaissé pendant la vente n'est pas un remboursement de crédit : il ne figure pas dans la liste ci-dessous, mais bien dans le KPI « Déjà encaissé » en haut de page."}
            </p>
            <p className="mt-1">
              Variation de l&apos;encours crédit :{" "}
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
          </div>
        </div>
      </FsCard>

      {/* Sous-onglet + recherche + liste */}
      <FsCard className="rounded-md sm:rounded-md mt-4 overflow-hidden p-0" padding="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/6 p-3 dark:border-white/10">
          <div className="flex rounded-md border border-black/10 p-0.5 dark:border-white/10">
            <button
              type="button"
              onClick={() => setSub("granted")}
              className={cn(
                "min-h-[38px] rounded-md px-3 py-1.5 text-xs font-bold",
                sub === "granted" ? "bg-sky-600 text-white" : "text-neutral-600",
              )}
            >
              Accordés ({grantedRows.length})
            </button>
            <button
              type="button"
              onClick={() => setSub("repaid")}
              className={cn(
                "min-h-[38px] rounded-md px-3 py-1.5 text-xs font-bold",
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
              <p className="text-sm text-neutral-600">
                Aucun crédit accordé {periodWord}.
              </p>
            </div>
          ) : (
            <FsHorizontalScroll>
              <table className="w-full min-w-[720px] border-collapse text-left text-[13px] [&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap">
                <thead>
                  <tr className="border-b border-black/10 bg-fs-surface-low/80 dark:border-white/10">
                    <th className="px-3 py-3 font-bold">{isSingleDay ? "Heure" : "Date"}</th>
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
                      <td className="px-3 py-2.5 font-semibold tabular-nums">
                        {isSingleDay ? hhmm(r.createdAt) : `${ddmm(r.createdAt)} ${hhmm(r.createdAt)}`}
                      </td>
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
                          className="whitespace-nowrap rounded-md bg-fs-accent/15 px-2 py-1 text-xs font-bold text-fs-accent"
                        >
                          Voir la vente
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black/10 bg-fs-surface-low/80 font-bold dark:border-white/10">
                    <td className="px-3 py-2.5" colSpan={4}>
                      TOTAL ({grantedFiltered.length})
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(grantedFiltered.reduce((n, r) => n + r.paidAtSale, 0))}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-sky-700 dark:text-sky-400">
                      {formatCurrency(grantedFiltered.reduce((n, r) => n + r.creditGranted, 0))}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </FsHorizontalScroll>
          )
        ) : repaidFiltered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <MdPayments className="h-10 w-10 text-neutral-300" aria-hidden />
            <p className="text-sm text-neutral-600">
              Aucun remboursement de crédit {periodWord}.
            </p>
          </div>
        ) : (
          <FsHorizontalScroll>
            <table className="w-full min-w-[720px] border-collapse text-left text-[13px] [&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-black/10 bg-fs-surface-low/80 dark:border-white/10">
                  <th className="px-3 py-3 font-bold">{isSingleDay ? "Heure" : "Date"}</th>
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
                    <td className="px-3 py-2.5 font-semibold tabular-nums">
                      {isSingleDay ? hhmm(r.paidAt) : `${ddmm(r.paidAt)} ${hhmm(r.paidAt)}`}
                    </td>
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
                        {r.isOldCredit
                          ? "Ancien crédit"
                          : isSingleDay
                            ? "Crédit du jour"
                            : "Crédit de la période"}
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
                        className="whitespace-nowrap rounded-md bg-fs-accent/15 px-2 py-1 text-xs font-bold text-fs-accent"
                      >
                        Voir la vente
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black/10 bg-fs-surface-low/80 font-bold dark:border-white/10">
                  <td className="px-3 py-2.5" colSpan={5}>
                    TOTAL ({repaidFiltered.length} remboursement
                    {repaidFiltered.length > 1 ? "s" : ""})
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(repaidFiltered.reduce((n, r) => n + r.amount, 0))}
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </FsHorizontalScroll>
        )}
      </FsCard>
    </div>
  );
}
