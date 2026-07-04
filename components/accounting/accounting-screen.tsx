"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAccountBalance,
  MdAdd,
  MdAssessment,
  MdDelete,
  MdDownload,
  MdListAlt,
  MdMenuBook,
  MdPictureAsPdf,
  MdReceiptLong,
  MdSettings,
} from "react-icons/md";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { ModuleLockedCard } from "@/components/modules/module-locked-card";
import { ManualEntryDialog } from "@/components/accounting/manual-entry-dialog";
import { FinancialStatements } from "@/components/accounting/financial-statements";
import { AccountingSettingsTab } from "@/components/accounting/accounting-settings-tab";
import { computeBalanceSheet, computeIncomeStatement } from "@/lib/features/accounting/reports";
import { downloadProWorkbook } from "@/lib/utils/spreadsheet-export-pro";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  deleteAccountingEntry,
  downloadAccountingStatementsPdf,
  listAccountingAccounts,
  listAccountingEntries,
  listAccountingJournals,
  seedAccounting,
} from "@/lib/features/accounting/api";
import type { AccountingEntry } from "@/lib/features/accounting/types";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

function yearBounds(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const CLASS_LABELS: Record<number, string> = {
  1: "Classe 1 — Ressources durables",
  2: "Classe 2 — Actif immobilisé",
  3: "Classe 3 — Stocks",
  4: "Classe 4 — Tiers",
  5: "Classe 5 — Trésorerie",
  6: "Classe 6 — Charges",
  7: "Classe 7 — Produits",
  8: "Classe 8 — Autres charges et produits (HAO)",
  9: "Classe 9 — Comptabilité analytique",
};

type Tab = "entries" | "accounts" | "ledger" | "balance" | "states" | "settings";

export function AccountingScreen() {
  const qc = useQueryClient();
  const { data: ctx, isLoading: permLoading, helpers } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const canManage = helpers?.canManageAccounting ?? false;

  const [tab, setTab] = useState<Tab>("entries");
  const [{ from, to }, setPeriod] = useState(yearBounds);
  const [journalFilter, setJournalFilter] = useState<string>("");
  const [accountSearch, setAccountSearch] = useState("");
  const [ledgerAccount, setLedgerAccount] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const accountsQ = useQuery({
    queryKey: queryKeys.accountingAccounts(companyId),
    queryFn: () => listAccountingAccounts(companyId),
    enabled: Boolean(companyId) && Boolean(ctx?.accountingModuleEnabled),
  });
  const journalsQ = useQuery({
    queryKey: queryKeys.accountingJournals(companyId),
    queryFn: () => listAccountingJournals(companyId),
    enabled: Boolean(companyId) && Boolean(ctx?.accountingModuleEnabled),
  });
  const entriesQ = useQuery({
    queryKey: queryKeys.accountingEntries({ companyId, from, to, journalId: null }),
    queryFn: () => listAccountingEntries({ companyId, from, to, journalId: null }),
    enabled: Boolean(companyId) && Boolean(ctx?.accountingModuleEnabled),
  });

  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const journals = journalsQ.data ?? [];
  const entries = useMemo(() => entriesQ.data ?? [], [entriesQ.data]);

  const seedMut = useMutation({
    mutationFn: () => seedAccounting(companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounting", companyId] });
      toast.success("Comptabilité initialisée");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAccountingEntry(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounting", companyId] });
      toast.success("Écriture supprimée");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  // ----- Balance générale (agrégat par compte sur la période) -----
  const balanceRows = useMemo(() => {
    const map = new Map<string, { code: string; label: string; debit: number; credit: number }>();
    for (const e of entries) {
      for (const l of e.lines) {
        const key = l.accountCode || "?";
        const cur = map.get(key) ?? { code: l.accountCode, label: l.accountLabel, debit: 0, credit: 0 };
        cur.debit += l.debit;
        cur.credit += l.credit;
        map.set(key, cur);
      }
    }
    return [...map.values()]
      .map((r) => ({ ...r, balance: r.debit - r.credit }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [entries]);

  const balanceTotals = useMemo(
    () =>
      balanceRows.reduce(
        (acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }),
        { debit: 0, credit: 0 },
      ),
    [balanceRows],
  );

  // ----- Grand livre (mouvements d'un compte + solde progressif) -----
  const ledgerLines = useMemo(() => {
    if (!ledgerAccount) return [];
    const rows: Array<{
      date: string;
      journal: string;
      label: string;
      debit: number;
      credit: number;
      running: number;
    }> = [];
    const chronological = [...entries].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
    let running = 0;
    for (const e of chronological) {
      for (const l of e.lines) {
        if (l.accountCode !== ledgerAccount) continue;
        running += l.debit - l.credit;
        rows.push({
          date: e.entryDate,
          journal: e.journalCode,
          label: l.label || e.label,
          debit: l.debit,
          credit: l.credit,
          running,
        });
      }
    }
    return rows;
  }, [entries, ledgerAccount]);

  const filteredEntries = useMemo(
    () => (journalFilter ? entries.filter((e) => e.journalCode === journalFilter) : entries),
    [entries, journalFilter],
  );

  function exportWorkbook() {
    if (entries.length === 0 && balanceRows.length === 0) {
      toast.error("Aucune donnée à exporter sur la période.");
      return;
    }
    const income = computeIncomeStatement(balanceRows);
    const balance = computeBalanceSheet(balanceRows);
    const journalRows = entries.flatMap((e) =>
      e.lines.map((l) => [e.entryDate, e.journalCode, e.reference ?? "", e.label, l.accountCode, l.label ?? l.accountLabel, l.debit, l.credit]),
    );
    void downloadProWorkbook(`comptabilite-${from}_${to}`, [
      {
        name: "Journal",
        headers: ["Date", "Journal", "Réf.", "Libellé", "Compte", "Détail", "Débit", "Crédit"],
        rows: journalRows,
      },
      {
        name: "Balance",
        headers: ["Compte", "Libellé", "Débit", "Crédit", "Solde débit", "Solde crédit"],
        rows: balanceRows.map((r) => [r.code, r.label, r.debit, r.credit, r.balance > 0 ? r.balance : "", r.balance < 0 ? -r.balance : ""]),
      },
      {
        name: "Compte de résultat",
        headers: ["Type", "Compte", "Libellé", "Montant"],
        rows: [
          ...income.produits.map((l) => ["Produit", l.code, l.label, l.amount]),
          ...income.charges.map((l) => ["Charge", l.code, l.label, l.amount]),
          ["Résultat net", "", income.resultatNet >= 0 ? "Bénéfice" : "Perte", income.resultatNet],
        ],
      },
      {
        name: "Bilan",
        headers: ["Masse", "Compte", "Libellé", "Montant"],
        rows: [
          ...balance.actif.map((l) => ["Actif", l.code, l.label, l.amount]),
          ...balance.passif.map((l) => ["Passif", l.code, l.label, l.amount]),
          ["Passif", "", "Résultat net de l'exercice", balance.resultatNet],
        ],
      },
    ]);
  }

  async function exportStatementsPdf() {
    setPdfBusy(true);
    try {
      await downloadAccountingStatementsPdf({ companyId, from, to });
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    } finally {
      setPdfBusy(false);
    }
  }

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    const list = q
      ? accounts.filter((a) => a.code.toLowerCase().includes(q) || a.label.toLowerCase().includes(q))
      : accounts;
    const byClass = new Map<number, typeof list>();
    for (const a of list) {
      const arr = byClass.get(a.accountClass) ?? [];
      arr.push(a);
      byClass.set(a.accountClass, arr);
    }
    return [...byClass.entries()].sort((a, b) => a[0] - b[0]);
  }, [accounts, accountSearch]);

  // ----- Gardes -----
  if (permLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }
  if (ctx?.accountingModuleEnabled === false) {
    return (
      <ModuleLockedCard
        title="Comptabilité"
        heading="Module non activé"
        message="Le module Comptabilité (SYSCOHADA) n'est pas activé pour votre entreprise. Contactez l'administrateur de la plateforme pour l'activer."
      />
    );
  }
  if (!helpers?.canAccounting) {
    return (
      <ModuleLockedCard
        title="Comptabilité"
        heading="Accès réservé"
        message="Ce module est réservé au propriétaire ou aux utilisateurs disposant du droit « Comptabilité »."
      />
    );
  }

  const anyError = accountsQ.isError || journalsQ.isError || entriesQ.isError;
  const loading = accountsQ.isLoading || journalsQ.isLoading || entriesQ.isLoading;

  const TABS: Array<{ id: Tab; label: string; icon: typeof MdListAlt }> = [
    { id: "entries", label: "Écritures", icon: MdReceiptLong },
    { id: "accounts", label: "Plan comptable", icon: MdMenuBook },
    { id: "ledger", label: "Grand livre", icon: MdListAlt },
    { id: "balance", label: "Balance", icon: MdAccountBalance },
    { id: "states", label: "États financiers", icon: MdAssessment },
    { id: "settings", label: "Paramètres", icon: MdSettings },
  ];

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title="Comptabilité"
          subtitle="Plan comptable SYSCOHADA, journaux et écritures en partie double."
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportWorkbook}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 px-3 py-2 text-sm font-semibold text-fs-text hover:bg-fs-surface-container"
          >
            <MdDownload className="h-5 w-5" aria-hidden />
            Exporter (Excel)
          </button>
          <button
            type="button"
            onClick={exportStatementsPdf}
            disabled={pdfBusy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 px-3 py-2 text-sm font-semibold text-fs-text hover:bg-fs-surface-container disabled:opacity-50"
          >
            <MdPictureAsPdf className="h-5 w-5" aria-hidden />
            {pdfBusy ? "Génération…" : "États (PDF)"}
          </button>
          {canManage ? (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              disabled={journals.length === 0 || accounts.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-fs-accent px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              <MdAdd className="h-5 w-5" aria-hidden />
              Nouvelle écriture
            </button>
          ) : null}
        </div>
      </div>

      {/* Période */}
      <FsCard className="mt-1" padding="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-600">Du</span>
            <input
              type="date"
              className={fsInputClass("w-auto")}
              value={from}
              onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-600">Au</span>
            <input
              type="date"
              className={fsInputClass("w-auto")}
              value={to}
              onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
            />
          </label>
        </div>
      </FsCard>

      {/* Onglets */}
      <div className="mt-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <FsFilterChip
            key={t.id}
            icon={t.icon}
            label={t.label}
            selected={tab === t.id}
            onClick={() => setTab(t.id)}
          />
        ))}
      </div>

      <div className="mt-3">
        {anyError ? (
          <FsQueryErrorPanel
            error={accountsQ.error || journalsQ.error || entriesQ.error}
            onRetry={() => {
              void accountsQ.refetch();
              void journalsQ.refetch();
              void entriesQ.refetch();
            }}
          />
        ) : loading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          </div>
        ) : accounts.length === 0 ? (
          <FsCard>
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <MdMenuBook className="h-12 w-12 text-neutral-400" aria-hidden />
              <p className="text-base font-bold text-fs-text">Comptabilité non initialisée</p>
              <p className="max-w-md text-sm text-neutral-600">
                Le plan comptable n&apos;a pas encore été créé pour cette entreprise.
              </p>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => seedMut.mutate()}
                  disabled={seedMut.isPending}
                  className="mt-1 rounded-xl bg-fs-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {seedMut.isPending ? "Initialisation…" : "Initialiser la comptabilité"}
                </button>
              ) : null}
            </div>
          </FsCard>
        ) : tab === "entries" ? (
          <EntriesTab
            entries={filteredEntries}
            journals={journals.map((j) => j.code)}
            journalFilter={journalFilter}
            onJournalFilter={setJournalFilter}
            canManage={canManage}
            onDelete={(id) => deleteMut.mutate(id)}
            deleting={deleteMut.isPending}
          />
        ) : tab === "accounts" ? (
          <div className="space-y-4">
            <input
              type="text"
              className={fsInputClass()}
              placeholder="Rechercher un compte (code ou libellé)…"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
            />
            {filteredAccounts.map(([cls, list]) => (
              <FsCard key={cls} padding="p-0">
                <div className="border-b border-black/6 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-neutral-600">
                  {CLASS_LABELS[cls] ?? `Classe ${cls}`}
                </div>
                <ul className="divide-y divide-black/[0.04]">
                  {list.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-14 shrink-0 font-mono text-sm font-semibold text-fs-text">{a.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">{a.label}</span>
                      {!a.isActive ? (
                        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">
                          Inactif
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </FsCard>
            ))}
          </div>
        ) : tab === "ledger" ? (
          <div className="space-y-3">
            <select
              className={fsInputClass()}
              value={ledgerAccount}
              onChange={(e) => setLedgerAccount(e.target.value)}
            >
              <option value="">Choisir un compte…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.code} — {a.label}
                </option>
              ))}
            </select>
            {!ledgerAccount ? (
              <p className="px-1 text-sm text-neutral-500">
                Sélectionnez un compte pour afficher son grand livre.
              </p>
            ) : ledgerLines.length === 0 ? (
              <p className="px-1 text-sm text-neutral-500">Aucun mouvement sur ce compte pour la période.</p>
            ) : (
              <FsCard padding="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-black/6 bg-fs-surface/50 text-xs font-bold uppercase text-neutral-500">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Jrnl</th>
                        <th className="px-3 py-2">Libellé</th>
                        <th className="px-3 py-2 text-right">Débit</th>
                        <th className="px-3 py-2 text-right">Crédit</th>
                        <th className="px-3 py-2 text-right">Solde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerLines.map((l, i) => (
                        <tr key={i} className="border-b border-black/[0.04]">
                          <td className="whitespace-nowrap px-3 py-2 text-neutral-600">{l.date}</td>
                          <td className="px-3 py-2 text-neutral-600">{l.journal}</td>
                          <td className="px-3 py-2 text-neutral-800">{l.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{l.debit ? fmt(l.debit) : ""}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{l.credit ? fmt(l.credit) : ""}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(l.running)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </FsCard>
            )}
          </div>
        ) : tab === "balance" ? (
          <FsCard padding="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-black/6 bg-fs-surface/50 text-xs font-bold uppercase text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Compte</th>
                    <th className="px-3 py-2">Libellé</th>
                    <th className="px-3 py-2 text-right">Débit</th>
                    <th className="px-3 py-2 text-right">Crédit</th>
                    <th className="px-3 py-2 text-right">Solde débit</th>
                    <th className="px-3 py-2 text-right">Solde crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceRows.map((r) => (
                    <tr key={r.code} className="border-b border-black/[0.04]">
                      <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-fs-text">{r.code}</td>
                      <td className="px-3 py-2 text-neutral-700">{r.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(r.debit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(r.credit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.balance > 0 ? fmt(r.balance) : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.balance < 0 ? fmt(-r.balance) : ""}</td>
                    </tr>
                  ))}
                  {balanceRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-neutral-500">
                        Aucune écriture sur la période.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {balanceRows.length > 0 ? (
                  <tfoot>
                    <tr className="border-t-2 border-black/10 font-bold text-fs-text">
                      <td className="px-3 py-2.5" colSpan={2}>
                        Totaux
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(balanceTotals.debit)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(balanceTotals.credit)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" colSpan={2}>
                        {balanceTotals.debit === balanceTotals.credit ? "Équilibrée ✓" : "Déséquilibre !"}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </FsCard>
        ) : tab === "states" ? (
          <FinancialStatements rows={balanceRows} />
        ) : (
          <AccountingSettingsTab
            companyId={companyId}
            period={{ from, to }}
            canManage={canManage}
          />
        )}
      </div>

      {dialogOpen ? (
        <ManualEntryDialog
          companyId={companyId}
          journals={journals}
          accounts={accounts}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            void qc.invalidateQueries({ queryKey: ["accounting", companyId] });
          }}
        />
      ) : null}
    </FsPage>
  );
}

function EntriesTab({
  entries,
  journals,
  journalFilter,
  onJournalFilter,
  canManage,
  onDelete,
  deleting,
}: {
  entries: AccountingEntry[];
  journals: string[];
  journalFilter: string;
  onJournalFilter: (code: string) => void;
  canManage: boolean;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const sourceLabel: Record<string, string> = {
    manual: "Manuelle",
    sale: "Vente",
    purchase: "Achat",
    expense: "Dépense",
    payslip: "Paie",
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onJournalFilter("")}
          className={
            "rounded-lg border px-3 py-1.5 text-xs font-semibold " +
            (journalFilter === "" ? "border-fs-accent/40 bg-fs-accent/10 text-fs-accent" : "border-black/10 text-neutral-700")
          }
        >
          Tous
        </button>
        {journals.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onJournalFilter(code)}
            className={
              "rounded-lg border px-3 py-1.5 text-xs font-semibold " +
              (journalFilter === code ? "border-fs-accent/40 bg-fs-accent/10 text-fs-accent" : "border-black/10 text-neutral-700")
            }
          >
            {code}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <FsCard>
          <p className="px-2 py-8 text-center text-sm text-neutral-500">
            Aucune écriture pour cette période.
          </p>
        </FsCard>
      ) : (
        entries.map((e) => (
          <FsCard key={e.id} padding="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/6 px-4 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-fs-surface-container px-1.5 py-0.5 text-[11px] font-bold text-neutral-600">
                    {e.journalCode}
                  </span>
                  <span className="text-sm font-semibold text-fs-text">{e.label}</span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {e.entryDate}
                  {e.reference ? ` · Réf. ${e.reference}` : ""} · {sourceLabel[e.sourceType] ?? e.sourceType}
                </div>
              </div>
              {canManage && e.sourceType === "manual" ? (
                <button
                  type="button"
                  onClick={() => onDelete(e.id)}
                  disabled={deleting}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40"
                  aria-label="Supprimer l'écriture"
                >
                  <MdDelete className="h-[18px] w-[18px]" aria-hidden />
                </button>
              ) : null}
            </div>
            <table className="w-full text-left text-sm">
              <tbody>
                {e.lines.map((l) => (
                  <tr key={l.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="w-16 py-1.5 pl-4 pr-2 align-top font-mono text-xs font-semibold text-neutral-600">
                      {l.accountCode}
                    </td>
                    <td className="py-1.5 pr-2 align-top text-neutral-700">
                      {l.label || l.accountLabel}
                    </td>
                    <td className="w-28 py-1.5 pr-2 text-right align-top tabular-nums text-neutral-800">
                      {l.debit ? fmt(l.debit) : ""}
                    </td>
                    <td className="w-28 py-1.5 pr-4 text-right align-top tabular-nums text-neutral-800">
                      {l.credit ? fmt(l.credit) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-fs-surface/40 text-xs font-bold text-neutral-600">
                  <td className="py-1.5 pl-4 pr-2" colSpan={2}>
                    Total {e.totalDebit === e.totalCredit ? "(équilibré)" : "(déséquilibré)"}
                  </td>
                  <td className="w-28 py-1.5 pr-2 text-right tabular-nums">{fmt(e.totalDebit)}</td>
                  <td className="w-28 py-1.5 pr-4 text-right tabular-nums">{fmt(e.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </FsCard>
        ))
      )}
    </div>
  );
}
