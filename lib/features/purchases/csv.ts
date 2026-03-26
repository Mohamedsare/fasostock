import { escapeCsv } from "@/lib/utils/csv";
import type { PurchaseListItem } from "./types";

export function purchasesToCsv(rows: PurchaseListItem[]): string {
  const header = [
    "Date",
    "Boutique",
    "Fournisseur",
    "Référence",
    "Statut",
    "Total",
  ];

  const lines = rows.map((r) =>
    [
      new Date(r.createdAt).toLocaleString("fr-FR"),
      r.storeName,
      r.supplierName,
      r.reference ?? "",
      r.status,
      String(r.total),
    ].map(escapeCsv),
  );

  return [header.map(escapeCsv).join(","), ...lines.map((l) => l.join(","))].join(
    "\n",
  );
}

