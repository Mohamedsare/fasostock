import { getActiveCurrency } from "@/lib/utils/currency";
import type { ProgressiveLedgerKind, ProgressivePaymentMethod } from "./types";

/**
 * Données d'un ticket d'achat progressif (versement ou remboursement).
 * Source unique : RPC `progressive_ticket_data` — le client comme le serveur PDF
 * lisent la même ligne, donc l'aperçu à l'écran et le papier sont identiques et
 * aucun montant ne peut être falsifié depuis le navigateur.
 */
export type ProgressiveTicketData = {
  /**
   * Devise de l'entreprise (code ISO), renseignée par le client : la génération PDF est
   * partagée entre requêtes et ne peut pas avoir de devise ambiante. Absente, le ticket
   * s'imprime en francs CFA — comportement d'origine.
   */
  currencyCode?: string | null;
  ledgerId: string;
  kind: ProgressiveLedgerKind;
  amount: number;
  method: ProgressivePaymentMethod | null;
  reference: string | null;
  note: string | null;
  receiptNumber: string;
  createdAt: Date;
  cashierName: string | null;

  planId: string;
  planNumber: string;
  clientName: string;
  clientPhone: string | null;
  targetProductName: string | null;
  targetAmount: number | null;
  /** Solde du dossier juste après ce mouvement. */
  balanceAfter: number;
  /** Cumul des versements jusqu'à ce mouvement (inclus). */
  totalDeposited: number;

  companyName: string;
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  storeLogoUrl: string | null;
  /** Largeur configurée pour la boutique (`null` => 80 mm par défaut). */
  paperWidthMm: 58 | 80 | null;
  /** Activité de l'entreprise — adapte le vocabulaire du ticket (engin / article / produit). */
  businessTypeSlug: string | null;
};

function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Mappe une ligne du RPC `progressive_ticket_data`. */
export function mapProgressiveTicketRow(
  row: Record<string, unknown>,
): ProgressiveTicketData {
  const width = Number(row.paper_width_mm ?? 0);
  const created = new Date(String(row.created_at ?? ""));
  return {
    // Transmise au serveur avec le ticket : lui n'a aucune devise ambiante.
    currencyCode: getActiveCurrency(),
    ledgerId: String(row.ledger_id ?? ""),
    kind: String(row.kind ?? "deposit") as ProgressiveLedgerKind,
    amount: num(row.amount),
    method: (str(row.method) as ProgressivePaymentMethod | null) ?? null,
    reference: str(row.reference),
    note: str(row.note),
    receiptNumber: String(row.receipt_number ?? ""),
    createdAt: Number.isNaN(created.getTime()) ? new Date() : created,
    cashierName: str(row.cashier_name),
    planId: String(row.plan_id ?? ""),
    planNumber: String(row.plan_number ?? ""),
    clientName: String(row.client_name ?? ""),
    clientPhone: str(row.client_phone),
    targetProductName: str(row.target_product_name),
    targetAmount: row.target_amount != null ? num(row.target_amount) : null,
    balanceAfter: num(row.balance_after),
    totalDeposited: num(row.total_deposited),
    companyName: String(row.company_name ?? ""),
    storeName: String(row.store_name ?? ""),
    storeAddress: str(row.store_address),
    storePhone: str(row.store_phone),
    storeLogoUrl: str(row.store_logo_url),
    paperWidthMm: width === 58 ? 58 : width === 80 ? 80 : null,
    businessTypeSlug: str(row.business_type_slug),
  };
}

/** Intitulé du ticket selon la nature du mouvement. */
export function progressiveTicketTitle(kind: ProgressiveLedgerKind): string {
  if (kind === "refund") return "REMBOURSEMENT";
  if (kind === "settlement") return "REMISE AU CLIENT";
  return "RECU DE VERSEMENT";
}

/** Contenu du QR : contrôle rapide du ticket par le gérant (dossier + montant + solde). */
export function buildProgressiveQrPayload(data: ProgressiveTicketData): string {
  const d = data.createdAt;
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    "FASOSTOCK",
    "Achat progressif",
    `Dossier: ${data.planNumber}`,
    `Recu: ${data.receiptNumber}`,
    `Montant: ${Math.round(data.amount)} CFA`,
    `Solde: ${Math.round(data.balanceAfter)} CFA`,
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
  ].join("\n");
}
