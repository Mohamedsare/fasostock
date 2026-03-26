import { escapeCsv } from "@/lib/utils/csv";
import type { DashboardData, ReportsPageData } from "@/lib/features/dashboard/types";

export function reportsPageToCsv(data: ReportsPageData): string {
  const rows: string[][] = [];
  rows.push(["Section", "Indicateur", "Valeur"]);
  rows.push(["Synthèse", "CA ventes", String(data.salesSummary.totalAmount)]);
  rows.push(["Synthèse", "Nb ventes", String(data.salesSummary.count)]);
  rows.push(["Synthèse", "Articles vendus", String(data.salesSummary.itemsSold)]);
  rows.push(["Synthèse", "Marge", String(data.salesSummary.margin)]);
  rows.push(["Synthèse", "Taux marge %", String(data.marginRatePercent)]);
  rows.push(["Synthèse", "Panier moyen", String(data.ticketAverage)]);
  rows.push(["Synthèse", "Achats", String(data.purchasesSummary.totalAmount)]);
  rows.push(["Synthèse", "Nb commandes achats", String(data.purchasesSummary.count)]);
  rows.push(["Synthèse", "Valeur stock", String(data.stockValue.totalValue)]);
  rows.push(["Synthèse", "Nb produits stock", String(data.stockValue.productCount)]);
  rows.push(["Synthèse", "Alertes stock (périmètre)", String(data.lowStockCount)]);

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
  rows.push(["Moins vendus", "Produit", "CA", "Qté", "Marge"]);
  for (const p of data.leastProducts) {
    rows.push([
      "Moins vendus",
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
  if (data.stockReport) {
    rows.push(["Stock boutique", "Entrées (mouv.)", String(data.stockReport.entries)]);
    rows.push(["Stock boutique", "Sorties (mouv.)", String(data.stockReport.exits)]);
    rows.push(["Stock boutique", "Net", String(data.stockReport.net)]);
    rows.push(["Stock boutique", "Produits en stock", String(data.stockReport.currentStockCount)]);
  }
  return rows.map((r) => r.map((v) => escapeCsv(v)).join(",")).join("\n");
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

