import { escapeCsv } from "@/lib/utils/csv";
import type { ProSheetCell } from "@/lib/utils/spreadsheet-export-pro";
import type { Customer } from "./types";

const CUSTOMER_HEADERS = ["Nom", "Type", "Téléphone", "Email", "Adresse", "Notes"] as const;

export function customersToSpreadsheetMatrix(rows: Customer[]): {
  headers: string[];
  rows: ProSheetCell[][];
} {
  const data: ProSheetCell[][] = rows.map((c) => [
    c.name,
    c.type === "company" ? "Entreprise" : "Particulier",
    c.phone ?? "",
    c.email ?? "",
    c.address ?? "",
    c.notes ?? "",
  ]);
  return { headers: [...CUSTOMER_HEADERS], rows: data };
}

export function customersToCsv(customers: Customer[]): string {
  const { headers, rows: matrix } = customersToSpreadsheetMatrix(customers);
  const lines = matrix.map((line) => line.map((v) => escapeCsv(String(v ?? ""))).join(","));
  return [headers.map(escapeCsv).join(","), ...lines].join("\n");
}

