import { getActiveCurrency } from "@/lib/utils/currency";
import type { ProgressivePlanStatus } from "./types";

/**
 * Données de la facture proforma A4 d'un dossier d'achat progressif.
 *
 * Source unique : RPC `progressive_quote_data` — l'aperçu à l'écran et le PDF
 * serveur lisent la même ligne, donc le papier ne peut pas diverger de l'écran,
 * et aucun montant n'est falsifiable depuis le navigateur.
 */
export type ProgressiveQuoteLine = {
  label: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ProgressiveQuoteData = {
  planId: string;
  planNumber: string;
  status: ProgressivePlanStatus;
  createdAt: Date;

  clientName: string;
  clientPhone: string | null;
  clientIdType: string | null;
  clientIdNumber: string | null;
  clientAddress: string | null;
  notes: string | null;

  lines: ProgressiveQuoteLine[];
  /** Total de la sélection (= montant à atteindre). */
  selectionTotal: number;
  /** Objectif du dossier — égal au total dès qu'une sélection existe. */
  targetAmount: number | null;
  totalDeposited: number;
  /** Épargne disponible aujourd'hui. */
  balance: number;

  companyName: string;
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  storeLogoUrl: string | null;
  storeActivity: string | null;
  storeSlogan: string | null;
  storeFooterText: string | null;
  storePrimaryColor: string | null;
  signerName: string | null;
  businessTypeSlug: string | null;
  /**
   * Devise d'impression. Le rendu PDF est partagé entre requêtes : il n'a aucune
   * devise ambiante, l'appelant la fournit (repli : devise de la boutique).
   */
  currencyCode: string | null;
};

function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Mappe une ligne du RPC `progressive_quote_data`. */
export function mapProgressiveQuoteRow(
  row: Record<string, unknown>,
  opts?: { currencyCode?: string | null },
): ProgressiveQuoteData {
  const created = new Date(String(row.created_at ?? ""));
  const rawLines = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : [];
  return {
    planId: String(row.plan_id ?? ""),
    planNumber: String(row.plan_number ?? ""),
    status: String(row.status ?? "open") as ProgressivePlanStatus,
    createdAt: Number.isNaN(created.getTime()) ? new Date() : created,

    clientName: String(row.client_name ?? ""),
    clientPhone: str(row.client_phone),
    clientIdType: str(row.client_id_type),
    clientIdNumber: str(row.client_id_number),
    clientAddress: str(row.client_address),
    notes: str(row.notes),

    lines: rawLines.map((l) => ({
      label: String(l.label ?? ""),
      quantity: Math.max(1, Math.trunc(num(l.quantity))),
      unitPrice: num(l.unit_price),
      lineTotal: num(l.line_total),
    })),
    selectionTotal: num(row.selection_total),
    targetAmount: row.target_amount != null ? num(row.target_amount) : null,
    totalDeposited: num(row.total_deposited),
    balance: num(row.balance),

    companyName: String(row.company_name ?? ""),
    storeName: String(row.store_name ?? ""),
    storeAddress: str(row.store_address),
    storePhone: str(row.store_phone),
    storeLogoUrl: str(row.store_logo_url),
    storeActivity: str(row.store_activity),
    storeSlogan: str(row.store_slogan),
    storeFooterText: str(row.store_footer_text),
    storePrimaryColor: str(row.store_primary_color),
    signerName: str(row.signer_name),
    businessTypeSlug: str(row.business_type_slug),
    currencyCode: opts?.currencyCode ?? str(row.currency),
  };
}

/** Devise à imprimer : réglage actif du navigateur, sinon celui de la boutique. */
export function activeCurrencyForQuote(): string | null {
  return getActiveCurrency();
}
