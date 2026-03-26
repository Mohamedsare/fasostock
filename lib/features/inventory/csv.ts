import { escapeCsv } from "@/lib/utils/csv";
import type { InventoryRow } from "./types";

export function inventoryRowsToCsv(rows: InventoryRow[]): string {
  const header = [
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
  ];

  const lines = rows.map((r) => {
    const statut = r.status === "out" ? "Rupture" : r.status === "low" ? "Alerte" : "OK";
    return [
      r.name,
      r.sku ?? "",
      r.categoryName ?? "",
      r.brandName ?? "",
      String(r.availableQuantity),
      r.unit,
      String(r.alertThreshold),
      statut,
      String(r.purchasePrice),
      String(r.salePrice),
    ].map(escapeCsv);
  });

  return [header.map(escapeCsv).join(","), ...lines.map((l) => l.join(","))].join("\n");
}

