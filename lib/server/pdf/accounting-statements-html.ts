import { escapeHtml } from "./escape-html";
import {
  computeBalanceSheet,
  computeIncomeStatement,
  type AccountBalance,
} from "@/lib/features/accounting/reports";

export type AccountingStatementsData = {
  companyName: string;
  fromLabel: string;
  toLabel: string;
  rows: AccountBalance[];
  generatedAtLabel: string;
};

const fmt = (n: number) => `${Math.round(n).toLocaleString("fr-FR")}`;

function twoColTable(title: string, left: { head: string; total: number; lines: { code: string; label: string; amount: number }[] }, right: { head: string; total: number; lines: { code: string; label: string; amount: number }[]; extra?: { label: string; amount: number } }): string {
  const rowsFor = (lines: { code: string; label: string; amount: number }[]) =>
    lines.length === 0
      ? `<tr><td colspan="2" class="muted">—</td></tr>`
      : lines.map((l) => `<tr><td>${escapeHtml(l.code)} · ${escapeHtml(l.label)}</td><td class="num">${fmt(l.amount)}</td></tr>`).join("");
  return `
  <h2>${escapeHtml(title)}</h2>
  <div class="cols">
    <div class="col">
      <div class="colhead">${escapeHtml(left.head)}<span class="num">${fmt(left.total)}</span></div>
      <table>${rowsFor(left.lines)}</table>
    </div>
    <div class="col">
      <div class="colhead">${escapeHtml(right.head)}<span class="num">${fmt(right.total)}</span></div>
      <table>${rowsFor(right.lines)}${right.extra ? `<tr class="strong"><td>${escapeHtml(right.extra.label)}</td><td class="num">${fmt(right.extra.amount)}</td></tr>` : ""}</table>
    </div>
  </div>`;
}

export function renderAccountingStatementsHtml(d: AccountingStatementsData): string {
  const income = computeIncomeStatement(d.rows);
  const balance = computeBalanceSheet(d.rows);
  const sortedBalance = [...d.rows].sort((a, b) => a.code.localeCompare(b.code));

  const balanceTableRows = sortedBalance
    .map((r) => {
      const bal = r.debit - r.credit;
      return `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.label)}</td><td class="num">${fmt(r.debit)}</td><td class="num">${fmt(r.credit)}</td><td class="num">${bal > 0 ? fmt(bal) : ""}</td><td class="num">${bal < 0 ? fmt(-bal) : ""}</td></tr>`;
    })
    .join("");
  const totD = sortedBalance.reduce((s, r) => s + r.debit, 0);
  const totC = sortedBalance.reduce((s, r) => s + r.credit, 0);

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111827; margin: 0; font-size: 11px; }
  .doc { padding: 2px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 12px; }
  .company { font-size: 17px; font-weight: 800; }
  .title { text-align: right; }
  .title h1 { font-size: 15px; margin: 0; color: #F97316; }
  .period { color: #6b7280; margin-top: 2px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #374151; margin: 16px 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 3px 6px; border-bottom: 1px solid #f3f4f6; text-align: left; }
  th { color: #6b7280; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.strong td, tfoot td { font-weight: 800; background: #f9fafb; }
  .muted { color: #9ca3af; }
  .cols { display: flex; gap: 16px; }
  .col { flex: 1; }
  .colhead { display: flex; justify-content: space-between; font-weight: 800; background: #111827; color: #fff; padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; }
  .resultat { margin-top: 8px; display: flex; justify-content: space-between; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 8px 12px; font-weight: 800; color: #065f46; }
  .foot { margin-top: 16px; color: #6b7280; font-size: 9px; display: flex; justify-content: space-between; }
</style></head>
<body><div class="doc">
  <div class="head">
    <div class="company">${escapeHtml(d.companyName)}</div>
    <div class="title"><h1>ÉTATS FINANCIERS</h1><div class="period">Période du ${escapeHtml(d.fromLabel)} au ${escapeHtml(d.toLabel)}</div></div>
  </div>

  ${twoColTable(
    "Compte de résultat",
    { head: "Charges", total: income.totalCharges, lines: income.charges },
    { head: "Produits", total: income.totalProduits, lines: income.produits },
  )}
  <div class="resultat"><span>Résultat net de l'exercice (${income.resultatNet >= 0 ? "bénéfice" : "perte"})</span><span>${fmt(income.resultatNet)} FCFA</span></div>

  ${twoColTable(
    "Bilan",
    { head: "Actif", total: balance.totalActif, lines: balance.actif },
    { head: "Passif", total: balance.totalPassif, lines: balance.passif, extra: { label: "Résultat net de l'exercice", amount: balance.resultatNet } },
  )}

  <h2>Balance générale</h2>
  <table>
    <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th class="num">Solde débit</th><th class="num">Solde crédit</th></tr></thead>
    <tbody>${balanceTableRows || `<tr><td colspan="6" class="muted">Aucune écriture.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="2">Totaux</td><td class="num">${fmt(totD)}</td><td class="num">${fmt(totC)}</td><td colspan="2" class="num">${Math.round(totD) === Math.round(totC) ? "Équilibrée" : "Déséquilibre"}</td></tr></tfoot>
  </table>

  <div class="foot"><span>Document généré par FasoStock — Comptabilité SYSCOHADA</span><span>${escapeHtml(d.generatedAtLabel)}</span></div>
</div></body></html>`;
}
