"use client";

import { useMemo } from "react";
import { FsCard } from "@/components/ui/fs-screen-primitives";
import {
  computeBalanceSheet,
  computeIncomeStatement,
  type AccountBalance,
  type StatementLine,
} from "@/lib/features/accounting/reports";

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

function LineList({ lines }: { lines: StatementLine[] }) {
  if (lines.length === 0) {
    return <p className="px-4 py-3 text-sm text-neutral-400">—</p>;
  }
  return (
    <ul className="divide-y divide-black/[0.04]">
      {lines.map((l) => (
        <li key={l.code} className="flex items-center gap-3 px-4 py-2 text-sm">
          <span className="w-14 shrink-0 font-mono text-xs font-semibold text-neutral-500">{l.code}</span>
          <span className="min-w-0 flex-1 truncate text-neutral-700">{l.label}</span>
          <span className="shrink-0 tabular-nums text-fs-text">{fmt(l.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bilan + Compte de résultat SYSCOHADA calculés depuis les soldes de la période. */
export function FinancialStatements({ rows }: { rows: AccountBalance[] }) {
  const income = useMemo(() => computeIncomeStatement(rows), [rows]);
  const balance = useMemo(() => computeBalanceSheet(rows), [rows]);
  const profit = income.resultatNet >= 0;

  return (
    <div className="space-y-5">
      {/* Compte de résultat */}
      <section>
        <h3 className="mb-2 px-1 text-sm font-bold text-fs-text">Compte de résultat</h3>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <FsCard padding="p-0">
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-neutral-600">Charges</span>
              <span className="text-sm font-bold tabular-nums text-red-600">{fmt(income.totalCharges)}</span>
            </div>
            <LineList lines={income.charges} />
          </FsCard>
          <FsCard padding="p-0">
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-neutral-600">Produits</span>
              <span className="text-sm font-bold tabular-nums text-green-700">{fmt(income.totalProduits)}</span>
            </div>
            <LineList lines={income.produits} />
            {income.haoNet !== 0 ? (
              <div className="flex items-center justify-between border-t border-black/6 px-4 py-2 text-sm">
                <span className="text-neutral-600">Résultat HAO (net)</span>
                <span className="tabular-nums text-fs-text">{fmt(income.haoNet)}</span>
              </div>
            ) : null}
          </FsCard>
        </div>
        <div
          className={
            "mt-2 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-bold " +
            (profit ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")
          }
        >
          <span>Résultat net de l&apos;exercice ({profit ? "bénéfice" : "perte"})</span>
          <span className="tabular-nums">{fmt(income.resultatNet)} FCFA</span>
        </div>
      </section>

      {/* Bilan */}
      <section>
        <h3 className="mb-2 px-1 text-sm font-bold text-fs-text">Bilan</h3>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <FsCard padding="p-0">
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-neutral-600">Actif</span>
              <span className="text-sm font-bold tabular-nums text-fs-text">{fmt(balance.totalActif)}</span>
            </div>
            <LineList lines={balance.actif} />
          </FsCard>
          <FsCard padding="p-0">
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-neutral-600">Passif</span>
              <span className="text-sm font-bold tabular-nums text-fs-text">{fmt(balance.totalPassif)}</span>
            </div>
            <LineList lines={balance.passif} />
            <div className="flex items-center justify-between border-t border-black/6 px-4 py-2 text-sm">
              <span className="font-semibold text-neutral-700">Résultat net de l&apos;exercice</span>
              <span className="tabular-nums text-fs-text">{fmt(balance.resultatNet)}</span>
            </div>
          </FsCard>
        </div>
        <p className="mt-2 px-1 text-xs text-neutral-500">
          {Math.round(balance.totalActif) === Math.round(balance.totalPassif)
            ? "Bilan équilibré ✓ (Actif = Passif)."
            : `Écart Actif / Passif : ${fmt(balance.totalActif - balance.totalPassif)} FCFA.`}
        </p>
      </section>
    </div>
  );
}
