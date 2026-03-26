import { escapeCsv } from "@/lib/utils/csv";
import type { Supplier } from "./types";

export function suppliersToCsv(rows: Supplier[]): string {
  const header = ["Nom", "Contact", "Téléphone", "Email", "Adresse", "Notes"];
  const lines = rows.map((s) =>
    [
      s.name,
      s.contact ?? "",
      s.phone ?? "",
      s.email ?? "",
      s.address ?? "",
      s.notes ?? "",
    ].map(escapeCsv),
  );

  return [header.map(escapeCsv).join(","), ...lines.map((l) => l.join(","))].join(
    "\n",
  );
}

