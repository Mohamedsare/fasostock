import { escapeCsv } from "@/lib/utils/csv";
import type { DashboardData, ReportsPageData } from "@/lib/features/dashboard/types";
import type { ProSheetCell } from "@/lib/utils/spreadsheet-export-pro";

const REPORTS_WIDE_HEADERS = [
  "Section",
  "Indicateur",
  "Valeur",
  "Complément 1",
  "Complément 2",
] as const;

function padRow(cells: ProSheetCell[], len: number): ProSheetCell[] {
  const a = [...cells];
  while (a.length < len) a.push("");
  return a.slice(0, len);
}

function buildReportsPageRows(data: ReportsPageData, width: number): ProSheetCell[][] {
  const rows: ProSheetCell[][] = [];
  rows.push(padRow(["Synthèse", "CA ventes", data.salesSummary.totalAmount, "", ""], width));
  rows.push(padRow(["Synthèse", "Nb ventes", data.salesSummary.count, "", ""], width));
  rows.push(padRow(["Synthèse", "Articles vendus", data.salesSummary.itemsSold, "", ""], width));
  rows.push(padRow(["Synthèse", "Marge", data.salesSummary.margin, "", ""], width));
  rows.push(padRow(["Synthèse", "Taux marge %", data.marginRatePercent, "", ""], width));
  rows.push(padRow(["Synthèse", "Panier moyen", data.ticketAverage, "", ""], width));
  rows.push(padRow(["Synthèse", "Achats", data.purchasesSummary.totalAmount, "", ""], width));
  rows.push(padRow(["Synthèse", "Nb commandes achats", data.purchasesSummary.count, "", ""], width));
  rows.push(padRow(["Synthèse", "Valeur stock", data.stockValue.totalValue, "", ""], width));
  rows.push(padRow(["Synthèse", "Nb produits stock", data.stockValue.productCount, "", ""], width));
  rows.push(padRow(["Synthèse", "Alertes stock (périmètre)", data.lowStockCount, "", ""], width));

  for (const p of data.topProducts) {
    rows.push(padRow(["Top produits", p.productName, p.revenue, p.quantitySold, p.margin], width));
  }
  for (const p of data.leastProducts) {
    rows.push(padRow(["Moins vendus", p.productName, p.revenue, p.quantitySold, p.margin], width));
  }
  for (const c of data.salesByCategory) {
    rows.push(padRow(["Catégories", c.categoryName, c.revenue, c.quantity, ""], width));
  }
  for (const d of data.salesByDay) {
    rows.push(padRow(["Ventes par jour", d.date, d.total, d.count, ""], width));
  }
  if (data.stockReport) {
    rows.push(padRow(["Stock boutique", "Entrées (mouv.)", data.stockReport.entries, "", ""], width));
    rows.push(padRow(["Stock boutique", "Sorties (mouv.)", data.stockReport.exits, "", ""], width));
    rows.push(padRow(["Stock boutique", "Net", data.stockReport.net, "", ""], width));
    rows.push(
      padRow(["Stock boutique", "Produits en stock", data.stockReport.currentStockCount, "", ""], width),
    );
  }
  return rows;
}

export function reportsPageToSpreadsheetMatrix(data: ReportsPageData): {
  headers: string[];
  rows: ProSheetCell[][];
} {
  const width = REPORTS_WIDE_HEADERS.length;
  return {
    headers: [...REPORTS_WIDE_HEADERS],
    rows: buildReportsPageRows(data, width),
  };
}

export function reportsPageToCsv(data: ReportsPageData): string {
  const { headers, rows } = reportsPageToSpreadsheetMatrix(data);
  const esc = (v: ProSheetCell) =>
    typeof v === "number" ? String(v) : escapeCsv(String(v ?? ""));
  const lines = rows.map((r) => r.map(esc).join(","));
  return [headers.map(escapeCsv).join(","), ...lines].join("\n");
}

export function reportsToCsv(data: DashboardData): string {
  const rows: string[][] = [];

  rows.push(["Section", "Indicateur", "Valeur"]);
  rows.push(["Synthèse", "CA ventes", String(data.salesSummary.totalAmount)]);
  rows.push(["Synthèse", "Nb ventes", String(data.salesSummary.count)]);
  rows.push(["Synthèse", "Articles vendus", String(data.salesSummary.itemsSold)]);
  rows.push(["Synthèse", "Marge", String(data.salesSummary.margin)]);
  rows.push(["Synthèse", "Panier moyen", String(data.ticketAverage)]);
  rows.push(["Synthèse", "Achats", String(data.purchasesSummary.totalAmount)]);
  rows.push(["Synthèse", "Valeur stock", String(data.stockValue.totalValue)]);
  rows.push(["Synthèse", "Alertes stock", String(data.lowStockCount)]);

  rows.push(["Top produits", "Produit", "CA", "Qté", "Marge"]);
  for (const p of data.topProducts) {
    rows.push([
      "Top produits",
      p.productName,
      String(p.revenue),
      String(p.quantitySold),
      String(p.margin),
    ]);
  }

  rows.push(["Catégories", "Catégorie", "CA", "Qté"]);
  for (const c of data.salesByCategory) {
    rows.push(["Catégories", c.categoryName, String(c.revenue), String(c.quantity)]);
  }

  rows.push(["Ventes par jour", "Date", "CA", "Nb ventes"]);
  for (const d of data.salesByDay) {
    rows.push(["Ventes par jour", d.date, String(d.total), String(d.count)]);
  }

  return rows.map((r) => r.map((v) => escapeCsv(v)).join(",")).join("\n");
}
