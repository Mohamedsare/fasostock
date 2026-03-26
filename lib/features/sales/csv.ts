import type { SaleItem } from "./types";
import { escapeCsv } from "@/lib/utils/csv";

export function salesToCsv(sales: SaleItem[]): string {
  const headers = [
    "numero",
    "date",
    "boutique",
    "client",
    "statut",
    "sous_total",
    "remise",
    "tva",
    "total",
  ];
  const rows = sales.map((s) => {
    const date = s.created_at?.slice(0, 19) ?? "";
    return [
      escapeCsv(s.sale_number ?? ""),
      escapeCsv(date),
      escapeCsv(s.store?.name ?? ""),
      escapeCsv(s.customer?.name ?? ""),
      escapeCsv(s.status ?? ""),
      String(s.subtotal ?? 0),
      String(s.discount ?? 0),
      String(s.tax ?? 0),
      String(s.total ?? 0),
    ].join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}
