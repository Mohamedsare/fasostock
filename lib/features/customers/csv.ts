import { escapeCsv } from "@/lib/utils/csv";
import type { Customer } from "./types";

export function customersToCsv(rows: Customer[]): string {
  const header = ["Nom", "Type", "Téléphone", "Email", "Adresse", "Notes"];
  const lines = rows.map((c) =>
    [
      c.name,
      c.type === "company" ? "Entreprise" : "Particulier",
      c.phone ?? "",
      c.email ?? "",
      c.address ?? "",
      c.notes ?? "",
    ].map(escapeCsv),
  );

  return [header.map(escapeCsv).join(","), ...lines.map((l) => l.join(","))].join(
    "\n",
  );
}

