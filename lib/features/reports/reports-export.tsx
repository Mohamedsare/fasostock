"use client";

import * as XLSX from "xlsx";
import type { ReportsPageData } from "@/lib/features/dashboard/types";
import { fetchReportsPdfBlob } from "@/lib/features/pdf/pdf-api-client";

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

export function downloadReportsExcel(data: ReportsPageData): void {
  const wb = XLSX.utils.book_new();

  const summary = [
    ["Indicateur", "Valeur"],
    ["CA ventes", data.salesSummary.totalAmount],
    ["Nb ventes", data.salesSummary.count],
    ["Panier moyen", data.ticketAverage],
    ["Marge", data.salesSummary.margin],
    ["Taux marge %", data.marginRatePercent],
    ["Achats", data.purchasesSummary.totalAmount],
    ["Valeur stock", data.stockValue.totalValue],
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(summary),
    "Synthèse",
  );

  const top = [
    ["Produit", "Qté", "CA", "Marge"],
    ...data.topProducts.map((p) => [
      p.productName,
      p.quantitySold,
      p.revenue,
      p.margin,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(top), "Top produits");

  const cat = [
    ["Catégorie", "CA", "Qté"],
    ...data.salesByCategory.map((c) => [
      c.categoryName,
      c.revenue,
      c.quantity,
    ]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(cat),
    "Catégories",
  );

  const day = [
    ["Date", "CA", "Nb ventes"],
    ...data.salesByDay.map((d) => [d.date, d.total, d.count]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(day),
    "CA par jour",
  );

  XLSX.writeFile(wb, `rapports_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
