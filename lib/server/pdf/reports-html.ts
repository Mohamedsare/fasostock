import type { ReportsPageData } from "@/lib/features/dashboard/types";
import { sanitizeForPdf } from "@/lib/features/invoices/invoice-a4-helpers";
import { formatCurrency } from "@/lib/utils/currency";
import { escapeHtml } from "./escape-html";

function tx(s: string): string {
  return escapeHtml(sanitizeForPdf(s));
}

const ACCENT = "#F97316";
const ACCENT_DARK = "#EA580C";
const HEADER_BG = "#FFF7ED";
const BORDER = "#E5E7EB";
const TEXT_MUTED = "#6B7280";

export function renderReportsHtml(
  data: ReportsPageData,
  meta: { title: string; subtitle: string },
): string {
  const s = data.salesSummary;

  const kpiRows = [
    ["Chiffre d'affaires", formatCurrency(s.totalAmount)],
    ["Nombre de ventes", String(s.count)],
    ["Articles vendus", String(s.itemsSold)],
    ["Marge", formatCurrency(s.margin)],
    ["Taux de marge", `${data.marginRatePercent.toFixed(1)} %`],
    ["Panier moyen", formatCurrency(data.ticketAverage)],
    ["Achats (période)", formatCurrency(data.purchasesSummary.totalAmount)],
    ["Commandes achats", String(data.purchasesSummary.count)],
    ["Valeur stock", formatCurrency(data.stockValue.totalValue)],
    ["Produits en stock", String(data.stockValue.productCount)],
    ["Alertes stock", String(data.lowStockCount)],
  ];

  const kpiTable = `
    <table class="data">
      <thead>
        <tr><th colspan="2">Synthèse</th></tr>
      </thead>
      <tbody>
        ${kpiRows
          .map(
            ([lab, val]) =>
              `<tr><td class="lab">${tx(lab)}</td><td class="num">${tx(val)}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>`;

  const top = data.topProducts.slice(0, 15);
  const topTable =
    top.length === 0
      ? `<p class="muted">Aucun produit sur la période.</p>`
      : `<table class="data">
      <thead>
        <tr>
          <th>Produit</th>
          <th class="num">Qté</th>
          <th class="num">CA</th>
          <th class="num">Marge</th>
        </tr>
      </thead>
      <tbody>
        ${top
          .map(
            (p, idx) =>
              `<tr class="${idx % 2 === 1 ? "zebra" : ""}">
            <td>${tx(p.productName)}</td>
            <td class="num">${escapeHtml(String(p.quantitySold))}</td>
            <td class="num">${tx(formatCurrency(p.revenue))}</td>
            <td class="num">${tx(formatCurrency(p.margin))}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;

  const cat = data.salesByCategory.slice(0, 12);
  const catTable =
    cat.length === 0
      ? ""
      : `<h2>Ventes par catégorie</h2>
    <table class="data">
      <thead>
        <tr><th>Catégorie</th><th class="num">CA</th><th class="num">Qté</th></tr>
      </thead>
      <tbody>
        ${cat
          .map(
            (c, idx) =>
              `<tr class="${idx % 2 === 1 ? "zebra" : ""}">
            <td>${tx(c.categoryName)}</td>
            <td class="num">${tx(formatCurrency(c.revenue))}</td>
            <td class="num">${escapeHtml(String(c.quantity))}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;

  const days = data.salesByDay.slice(0, 20);
  const dayTable =
    days.length === 0
      ? ""
      : `<h2>CA par jour</h2>
    <table class="data">
      <thead>
        <tr><th>Date</th><th class="num">CA</th><th class="num">Ventes</th></tr>
      </thead>
      <tbody>
        ${days
          .map(
            (d, idx) =>
              `<tr class="${idx % 2 === 1 ? "zebra" : ""}">
            <td>${tx(d.date)}</td>
            <td class="num">${tx(formatCurrency(d.total))}</td>
            <td class="num">${escapeHtml(String(d.count))}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 9.5px;
    margin: 0;
    padding: 28px 32px 36px;
    color: #111827;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .brand-bar {
    height: 4px;
    background: linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%);
    margin: -28px -32px 16px -32px;
    border-radius: 0 0 2px 2px;
  }
  h1 {
    font-size: 17px;
    font-weight: 800;
    margin: 0 0 4px;
    letter-spacing: -0.02em;
    color: #0f172a;
  }
  .sub { font-size: 9.5px; color: ${TEXT_MUTED}; margin-bottom: 18px; line-height: 1.35; }
  h2 {
    font-size: 11px;
    font-weight: 700;
    margin: 16px 0 8px;
    color: ${ACCENT_DARK};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  table.data {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 4px;
    border: 1px solid ${BORDER};
    border-radius: 6px;
    overflow: hidden;
  }
  table.data thead th {
    background: ${ACCENT};
    color: #fff;
    font-weight: 700;
    text-align: left;
    padding: 7px 10px;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid ${ACCENT_DARK};
  }
  table.data thead th.num { text-align: right; }
  table.data tbody td {
    padding: 6px 10px;
    border-bottom: 1px solid ${BORDER};
    vertical-align: top;
  }
  table.data tbody tr:last-child td { border-bottom: none; }
  table.data tbody tr.zebra td { background: ${HEADER_BG}; }
  table.data td.lab { font-weight: 500; color: #374151; width: 58%; }
  table.data td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .muted { color: ${TEXT_MUTED}; font-size: 9px; margin: 8px 0; }
  .footer {
    margin-top: 22px;
    padding-top: 10px;
    border-top: 1px solid ${BORDER};
    font-size: 8px;
    color: ${TEXT_MUTED};
  }
</style></head><body>
  <div class="brand-bar"></div>
  <h1>${tx(meta.title)}</h1>
  <div class="sub">${tx(meta.subtitle)}</div>
  ${kpiTable}
  <h2>Top produits</h2>
  ${topTable}
  ${catTable}
  ${dayTable}
  <div class="footer">FasoStock · Document généré automatiquement · Données indicatives sur la période sélectionnée.</div>
</body></html>`;
}
