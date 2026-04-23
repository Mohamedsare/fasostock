import { escapeCsv } from "@/lib/utils/csv";
import type { ProSheetCell } from "@/lib/utils/spreadsheet-export-pro";
import type { InventoryRow } from "./types";

const INVENTORY_HEADERS = [
  "Produit",
  "SKU",
  "Catégorie",
  "Marque",
  "Qté",
  "Unité",
  "Seuil",
  "Statut",
  "Achat",
  "Vente",
] as const;

export function inventoryRowsToSpreadsheetMatrix(rows: InventoryRow[]): {
  headers: string[];
  rows: ProSheetCell[][];
} {
  const data = rows.map((r) => {
    const statut = r.status === "out" ? "Rupture" : r.status === "low" ? "Alerte" : "OK";
    return [
      r.name,
      r.sku ?? "",
      r.categoryName ?? "",
      r.brandName ?? "",
      Number(r.availableQuantity),
      r.unit,
      Number(r.alertThreshold),
      statut,
      Number(r.purchasePrice),
      Number(r.salePrice),
    ] as ProSheetCell[];
  });
  return { headers: [...INVENTORY_HEADERS], rows: data };
}

export function inventoryRowsToCsv(inventoryRows: InventoryRow[]): string {
  const { headers, rows: matrix } = inventoryRowsToSpreadsheetMatrix(inventoryRows);
  const lines = matrix.map((line) => line.map((v) => escapeCsv(String(v ?? ""))).join(","));
  return [headers.map(escapeCsv).join(","), ...lines].join("\n");
}

