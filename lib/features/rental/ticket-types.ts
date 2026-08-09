import { getActiveCurrency } from "@/lib/utils/currency";
import { RENTAL_RECEIPT_TITLES, type RentalPaymentKind, type RentalPaymentMethod } from "./types";

/**
 * Données d'un ticket de quittance locative.
 * Source unique : RPC `rental_receipt_data` — le navigateur (aperçu) et le serveur
 * (PDF) lisent la même ligne : le papier est fidèle à l'écran et aucun montant ne
 * peut être falsifié depuis le client.
 */
export type RentalReceiptData = {
  /**
   * Devise de l'entreprise (code ISO), renseignée par le client : la génération PDF est
   * partagée entre requêtes et ne peut pas avoir de devise ambiante. Absente, la
   * quittance s'imprime en francs CFA — comportement d'origine.
   */
  currencyCode?: string | null;
  paymentId: string;
  kind: RentalPaymentKind;
  amount: number;
  method: RentalPaymentMethod | null;
  paidAt: Date;
  reference: string | null;
  note: string | null;
  receiptNumber: string;
  cashierName: string | null;

  leaseId: string;
  leaseNumber: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyName: string;
  propertyAddress: string | null;
  unitLabel: string;
  rentAmount: number;
  /** Solde du bail juste après ce règlement (> 0 : reste dû). */
  balanceAfter: number;
  /** Mois soldés par CE règlement (ex. « Juillet 2026, Août 2026 »). */
  periodsCovered: string | null;
  /** Fin de la dernière période intégralement payée. */
  paidThrough: string | null;
  nextDueDate: string | null;

  companyName: string;
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  storeLogoUrl: string | null;
  /** Largeur configurée pour la boutique (`null` => 80 mm par défaut). */
  paperWidthMm: 58 | 80 | null;
};

function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Mappe une ligne du RPC `rental_receipt_data`. */
export function mapRentalReceiptRow(row: Record<string, unknown>): RentalReceiptData {
  const width = Number(row.paper_width_mm ?? 0);
  const paid = new Date(String(row.paid_at ?? ""));
  return {
    // Transmise au serveur avec la quittance : lui n'a aucune devise ambiante.
    currencyCode: getActiveCurrency(),
    paymentId: String(row.payment_id ?? ""),
    kind: (String(row.kind ?? "rent") as RentalPaymentKind),
    amount: num(row.amount),
    method: (str(row.method) as RentalPaymentMethod | null) ?? null,
    paidAt: Number.isNaN(paid.getTime()) ? new Date() : paid,
    reference: str(row.reference),
    note: str(row.note),
    receiptNumber: String(row.receipt_number ?? ""),
    cashierName: str(row.cashier_name),
    leaseId: String(row.lease_id ?? ""),
    leaseNumber: String(row.lease_number ?? ""),
    tenantName: String(row.tenant_name ?? ""),
    tenantPhone: str(row.tenant_phone),
    propertyName: String(row.property_name ?? ""),
    propertyAddress: str(row.property_address),
    unitLabel: String(row.unit_label ?? ""),
    rentAmount: num(row.rent_amount),
    balanceAfter: num(row.balance_after),
    periodsCovered: str(row.periods_covered),
    paidThrough: str(row.paid_through),
    nextDueDate: str(row.next_due_date),
    companyName: String(row.company_name ?? ""),
    storeName: String(row.store_name ?? ""),
    storeAddress: str(row.store_address),
    storePhone: str(row.store_phone),
    storeLogoUrl: str(row.store_logo_url),
    paperWidthMm: width === 58 ? 58 : width === 80 ? 80 : null,
  };
}

/** Intitulé imprimé en tête du ticket. */
export function rentalReceiptTitle(kind: RentalPaymentKind): string {
  return RENTAL_RECEIPT_TITLES[kind] ?? RENTAL_RECEIPT_TITLES.other;
}

/** Contenu du QR : contrôle rapide de la quittance (bail + montant + solde). */
export function buildRentalQrPayload(data: RentalReceiptData): string {
  const d = data.paidAt;
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    "FASOSTOCK",
    "Quittance de location",
    `Bail: ${data.leaseNumber}`,
    `Recu: ${data.receiptNumber}`,
    `Locataire: ${data.tenantName}`,
    `Montant: ${Math.round(data.amount)} CFA`,
    `Solde: ${Math.round(data.balanceAfter)} CFA`,
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
  ].join("\n");
}
