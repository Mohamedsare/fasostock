"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { MdClose, MdInfoOutline, MdSearch } from "react-icons/md";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  CREDIT_AMOUNT_EPS,
  downPaymentTotal,
  paidTotal,
  remainingTotal,
  repaidAfterSaleTotal,
} from "@/lib/features/credit/credit-math";
import type { CreditSaleRow } from "@/lib/features/credit/types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

type Tab = "down" | "repaid";

function dayLabel(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yy", { locale: fr });
  } catch {
    return "—";
  }
}

/**
 * Décompose le KPI « Déjà encaissé » : acomptes encaissés PENDANT la vente vs remboursements
 * encaissés APRÈS. Répond à « quelles ventes ont été accomptées ? » et explique pourquoi
 * « Crédits remboursés » est toujours ≤ « Déjà encaissé ».
 */
export function CreditCashedInDialog({
  open,
  rows,
  legacyPaidTotal,
  periodLabel,
  onClose,
  onOpenSaleDetail,
}: {
  open: boolean;
  /** Ventes à crédit de la période filtrée (mêmes lignes que le KPI). */
  rows: CreditSaleRow[];
  /** Versements sur crédits hérités : comptés comme remboursements, sans vente rattachée. */
  legacyPaidTotal: number;
  periodLabel: string;
  onClose: () => void;
  onOpenSaleDetail: (saleId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("down");
  const [search, setSearch] = useState("");

  const data = useMemo(() => {
    const down: Array<{ sale: CreditSaleRow; amount: number }> = [];
    const repaid: Array<{ sale: CreditSaleRow; amount: number }> = [];
    let downTotal = 0;
    let repaidTotal = 0;
    for (const s of rows) {
      const d = downPaymentTotal(s);
      const r = repaidAfterSaleTotal(s);
      if (d > CREDIT_AMOUNT_EPS) {
        down.push({ sale: s, amount: d });
        downTotal += d;
      }
      if (r > CREDIT_AMOUNT_EPS) {
        repaid.push({ sale: s, amount: r });
        repaidTotal += r;
      }
    }
    down.sort((a, b) => b.amount - a.amount);
    repaid.sort((a, b) => b.amount - a.amount);
    return { down, repaid, downTotal, repaidTotal: repaidTotal + legacyPaidTotal };
  }, [rows, legacyPaidTotal]);

  const q = search.trim().toLowerCase();
  const qNum = q.replace(/\s/g, "");
  const list = useMemo(() => {
    const base = tab === "down" ? data.down : data.repaid;
    if (!q) return base;
    return base.filter(
      ({ sale }) =>
        (sale.customer?.name ?? "").toLowerCase().includes(q) ||
        (sale.sale_number ?? "").toLowerCase().includes(q) ||
        (sale.customer?.phone ?? "").replace(/\s/g, "").includes(qNum),
    );
  }, [tab, data, q, qNum]);

  if (!open) return null;

  const grandTotal = data.downTotal + data.repaidTotal;
  const listTotal = list.reduce((n, r) => n + r.amount, 0);

  return (
    <div
      className="fixed inset-0 z-58 flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-label="Détail des encaissements"
    >
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-fs-surface shadow-2xl sm:max-w-3xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-black/6 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-fs-text">Détail des encaissements</p>
            <p className="truncate text-xs text-neutral-500">{periodLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="-mr-2 p-2" aria-label="Fermer">
            <MdClose className="h-6 w-6" />
          </button>
        </div>

        {/* Décomposition : total = acomptes + remboursements */}
        <div className="border-b border-black/6 px-4 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border-2 border-black/10 px-3 py-2 dark:border-white/10">
              <p className="text-[11px] text-neutral-500">Déjà encaissé</p>
              <p className="text-lg font-bold text-fs-text">{formatCurrency(grandTotal)}</p>
            </div>
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2">
              <p className="text-[11px] text-neutral-600">dont acomptes à la vente</p>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-300">
                {formatCurrency(data.downTotal)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-3 py-2">
              <p className="text-[11px] text-neutral-600">dont remboursements</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(data.repaidTotal)}
              </p>
            </div>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-neutral-500">
            <MdInfoOutline className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              L&apos;acompte est encaissé <strong>pendant</strong> la vente : il n&apos;est pas un
              remboursement de crédit et n&apos;apparaît donc jamais dans « Crédits remboursés ».
            </span>
          </p>
        </div>

        {/* Onglets + recherche */}
        <div className="flex flex-wrap items-center gap-2 border-b border-black/6 px-4 py-2.5">
          <div className="flex rounded-xl border border-black/10 p-0.5 dark:border-white/10">
            <button
              type="button"
              onClick={() => setTab("down")}
              className={cn(
                "min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold",
                tab === "down" ? "bg-amber-500 text-white" : "text-neutral-600",
              )}
            >
              Ventes accomptées ({data.down.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("repaid")}
              className={cn(
                "min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold",
                tab === "repaid" ? "bg-emerald-600 text-white" : "text-neutral-600",
              )}
            >
              Ventes remboursées ({data.repaid.length})
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <p className="py-14 text-center text-sm text-neutral-500">
              {tab === "down"
                ? "Aucune vente à crédit avec acompte sur la période."
                : "Aucun remboursement sur la période."}
            </p>
          ) : (
            <FsHorizontalScroll>
              <table className="w-full min-w-[640px] border-collapse text-left text-[13px] [&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap">
                <thead className="sticky top-0 z-1">
                  <tr className="border-b border-black/10 bg-fs-surface-low dark:border-white/10">
                    <th className="px-3 py-2.5 font-bold">Date</th>
                    <th className="px-3 py-2.5 font-bold">Client</th>
                    <th className="px-3 py-2.5 font-bold">Réf.</th>
                    <th className="px-3 py-2.5 text-right font-bold">Total vente</th>
                    <th className="px-3 py-2.5 text-right font-bold">
                      {tab === "down" ? "Acompte" : "Remboursé"}
                    </th>
                    <th className="px-3 py-2.5 text-right font-bold">Reste dû</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(({ sale, amount }) => {
                    const rest = remainingTotal(sale);
                    return (
                      <tr
                        key={sale.id}
                        className="cursor-pointer border-b border-black/6 hover:bg-black/2 dark:border-white/6 dark:hover:bg-white/5"
                        onClick={() => {
                          onClose();
                          onOpenSaleDetail(sale.id);
                        }}
                      >
                        <td className="px-3 py-2.5 tabular-nums">{dayLabel(sale.created_at)}</td>
                        <td className="max-w-[180px] truncate px-3 py-2.5">
                          {sale.customer?.name ?? "—"}
                          {sale.customer?.phone ? (
                            <span className="mt-0.5 block text-[11px] text-neutral-500">
                              {sale.customer.phone}
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[7rem] truncate px-3 py-2.5 font-mono text-xs">
                          {sale.sale_number}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatCurrency(Number(sale.total))}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-bold tabular-nums",
                            tab === "down"
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-emerald-700 dark:text-emerald-400",
                          )}
                        >
                          {formatCurrency(amount)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right tabular-nums",
                            rest > CREDIT_AMOUNT_EPS ? "font-bold text-fs-accent" : "text-neutral-400",
                          )}
                        >
                          {rest > CREDIT_AMOUNT_EPS ? formatCurrency(rest) : "Soldé"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black/10 bg-fs-surface-low font-bold dark:border-white/10">
                    <td className="px-3 py-2.5" colSpan={4}>
                      TOTAL ({list.length})
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        tab === "down"
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {formatCurrency(listTotal)}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </FsHorizontalScroll>
          )}
          {tab === "repaid" && legacyPaidTotal > CREDIT_AMOUNT_EPS ? (
            <p className="px-4 py-2 text-[11px] text-neutral-500">
              + {formatCurrency(legacyPaidTotal)} de versements sur crédits hérités (sans vente
              rattachée), inclus dans le total « dont remboursements ».
            </p>
          ) : null}
        </div>

        <div className="border-t border-black/6 px-4 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg bg-fs-accent px-4 text-sm font-bold text-white"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
