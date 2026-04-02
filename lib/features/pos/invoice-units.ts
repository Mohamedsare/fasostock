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
