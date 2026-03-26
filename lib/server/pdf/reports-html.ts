import type { ReportsPageData } from "@/lib/features/dashboard/types";
import { sanitizeForPdf } from "@/lib/features/invoices/invoice-a4-helpers";
import { formatCurrency } from "@/lib/utils/currency";
import { escapeHtml } from "./escape-html";

function tx(s: string): string {
  return escapeHtml(sanitizeForPdf(s));
}

export function renderReportsHtml(
  data: ReportsPageData,
  meta: { title: string; subtitle: string },
): string {
  const s = data.salesSummary;
  const rows = data.topProducts.slice(0, 10).map(
    (p) =>
      `<div class="row"><span class="lab">${tx(p.productName)}</span><span class="val">${tx(formatCurrency(p.revenue))}</span></div>`,
  );
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, "Segoe UI", Roboto, sans-serif; font-size: 9px; margin: 0; padding: 36px; color: #000; }
  h1 { font-size: 15px; font-weight: 700; margin: 0 0 6px; }
  .sub { font-size: 9px; color: #444; margin-bottom: 14px; }
  .sec { margin-top: 10px; margin-bottom: 4px; font-size: 10px; font-weight: 700; }
  .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .lab { flex: 1; }
  .val { width: 120px; text-align: right; }
</style></head><body>
  <h1>${tx(meta.title)}</h1>
  <div class="sub">${tx(meta.subtitle)}</div>
  <div class="sec">Synthèse ventes</div>
  <div class="row"><span class="lab">Chiffre d'affaires</span><span class="val">${tx(formatCurrency(s.totalAmount))}</span></div>
  <div class="row"><span class="lab">Nombre de ventes</span><span class="val">${escapeHtml(String(s.count))}</span></div>
  <div class="row"><span class="lab">Ticket moyen</span><span class="val">${tx(formatCurrency(data.ticketAverage))}</span></div>
  <div class="row"><span class="lab">Marge</span><span class="val">${tx(formatCurrency(s.margin))}</span></div>
  <div class="row"><span class="lab">Achats (période)</span><span class="val">${tx(formatCurrency(data.purchasesSummary.totalAmount))}</span></div>
  <div class="row"><span class="lab">Valeur stock</span><span class="val">${tx(formatCurrency(data.stockValue.totalValue))}</span></div>
  <div class="sec">Top produits</div>
  ${rows.join("")}
</body></html>`;
}
