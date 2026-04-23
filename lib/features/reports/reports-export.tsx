"use client";

import type { ReportsPageData } from "@/lib/features/dashboard/types";
import { fetchReportsPdfBlob } from "@/lib/features/pdf/pdf-api-client";
import { downloadProWorkbook } from "@/lib/utils/spreadsheet-export-pro";

export async function downloadReportsPdfBlob(
  data: ReportsPageData,
  meta: { title: string; subtitle: string },
): Promise<Blob> {
  return fetchReportsPdfBlob(data, meta);
}

export function downloadReportsPdf(
  data: ReportsPageData,
  meta: { title: string; subtitle: string },
): void {
  void downloadReportsPdfBlob(data, meta).then((blob) => {
    const name = `rapports_${new Date().toISOString().slice(0, 10)}.pdf`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  });
}

export async function downloadReportsExcel(data: ReportsPageData): Promise<void> {
  const summaryRows = [
    ["CA ventes", data.salesSummary.totalAmount],
    ["Nb ventes", data.salesSummary.count],
    ["Articles vendus", data.salesSummary.itemsSold],
    ["Marge", data.salesSummary.margin],
    ["Taux marge %", data.marginRatePercent],
    ["Panier moyen", data.ticketAverage],
    ["Achats", data.purchasesSummary.totalAmount],
    ["Nb commandes achats", data.purchasesSummary.count],
    ["Valeur stock", data.stockValue.totalValue],
    ["Nb produits stock", data.stockValue.productCount],
    ["Alertes stock (périmètre)", data.lowStockCount],
  ];

  const topRows = data.topProducts.map((p) => [
    p.productName,
    p.quantitySold,
    p.revenue,
    p.margin,
  ]);

  const leastRows = data.leastProducts.map((p) => [
    p.productName,
    p.quantitySold,
    p.revenue,
    p.margin,
  ]);

  const catRows = data.salesByCategory.map((c) => [c.categoryName, c.revenue, c.quantity]);

  const dayRows = data.salesByDay.map((d) => [d.date, d.total, d.count]);

  const sheets: {
    name: string;
    headers: string[];
    rows: (string | number)[][];
  }[] = [
    { name: "Synthèse", headers: ["Indicateur", "Valeur"], rows: summaryRows },
    { name: "Top produits", headers: ["Produit", "Qté", "CA", "Marge"], rows: topRows },
    { name: "Moins vendus", headers: ["Produit", "Qté", "CA", "Marge"], rows: leastRows },
    { name: "Catégories", headers: ["Catégorie", "CA", "Qté"], rows: catRows },
    { name: "CA par jour", headers: ["Date", "CA", "Nb ventes"], rows: dayRows },
  ];

  if (data.stockReport) {
    const sr = data.stockReport;
    const stockSummary = [
      ["Entrées (mouv.)", sr.entries],
      ["Sorties (mouv.)", sr.exits],
      ["Net", sr.net],
      ["Produits en stock", sr.currentStockCount],
    ];
    sheets.push({
      name: "Stock boutique",
      headers: ["Indicateur", "Valeur"],
      rows: stockSummary,
    });
    const lowRows = sr.lowStock.map((x) => [x.productName, x.quantity, x.threshold]);
    sheets.push({
      name: "Alertes stock",
      headers: ["Produit", "Qté", "Seuil"],
      rows: lowRows,
    });
    const outRows = sr.outOfStock.map((x) => [x.productName, x.quantity, x.threshold]);
    sheets.push({
      name: "Ruptures",
      headers: ["Produit", "Qté", "Seuil"],
      rows: outRows,
    });
  }

  await downloadProWorkbook(`rapports_${new Date().toISOString().slice(0, 10)}.xlsx`, sheets);
}
