/** Aligné `kInvoiceUnits` (`app/lib/features/pos/pos_models.dart`). */
export const INVOICE_UNITS = [
  "pce",
  "m",
  "m²",
  "kg",
  "carton",
  "paquet",
  "lot",
  "boite",
  "sachet",
] as const;

export type InvoiceUnit = (typeof INVOICE_UNITS)[number];

export function defaultInvoiceUnitForProduct(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase();
  if (!u) return "pce";
  const found = INVOICE_UNITS.find((x) => x.toLowerCase() === u);
  return (found as string | undefined) ?? "pce";
}

/**
 * Unité lue sur un document (« cartons », « Boîte », « pièces », « u ») ramenée à
 * l'une des unités de facture. Rien de reconnu → `fallback` (l'unité du produit),
 * jamais une valeur libre : la colonne « Unité » du tableau est un menu fermé, une
 * unité inventée n'y serait tout simplement pas sélectionnable.
 */
export function invoiceUnitFromLabel(
  raw: string | null | undefined,
  fallback: string | null | undefined,
): string {
  const u = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/s$/, "");
  if (!u) return defaultInvoiceUnitForProduct(fallback);
  const direct = INVOICE_UNITS.find((x) => x.toLowerCase() === u);
  if (direct) return direct;
  const aliases: Record<string, string> = {
    piece: "pce",
    pc: "pce",
    p: "pce",
    u: "pce",
    unite: "pce",
    kilo: "kg",
    kilogramme: "kg",
    metre: "m",
    ml: "m",
    "m2": "m²",
    metrecarre: "m²",
    ctn: "carton",
    crt: "carton",
    pqt: "paquet",
    pack: "paquet",
    bte: "boite",
    boit: "boite",
    sachet: "sachet",
    sac: "sachet",
  };
  const mapped = aliases[u.replace(/[^a-z0-9]/g, "")];
  return mapped ?? defaultInvoiceUnitForProduct(fallback);
}
