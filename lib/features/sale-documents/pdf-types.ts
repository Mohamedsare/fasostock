import { getActiveCurrency } from "@/lib/utils/currency";
import type { SaleDocumentKind, SaleDocumentStatus } from "./types";

/**
 * Données d'impression d'un devis / d'une facture.
 *
 * Source unique : le RPC `sale_document_pdf_data`. Le navigateur n'envoie que
 * l'identifiant du document — lignes, montants et en-tête sont relus de la base.
 * Un total imprimé ne peut donc pas être fabriqué depuis la console du navigateur,
 * et l'écran ne peut pas diverger du papier.
 */
export type SaleDocumentPdfLine = {
  label: string;
  description: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  total: number;
};

export type SaleDocumentPdfData = {
  documentId: string;
  kind: SaleDocumentKind;
  number: string;
  status: SaleDocumentStatus;

  issueDate: string;
  validUntil: string | null;
  dueDate: string | null;

  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  customerTaxId: string | null;

  subject: string | null;
  clientReference: string | null;

  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  paidAmount: number;

  notes: string | null;
  terms: string | null;
  sourceDocumentNumber: string | null;

  companyName: string;
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  storeLogoUrl: string | null;
  storeSlogan: string | null;
  storeActivity: string | null;
  storeFooterText: string | null;
  storeLegalInfo: string | null;
  storeTaxNumber: string | null;
  storePaymentTerms: string | null;
  storePrimaryColor: string | null;
  signerTitle: string | null;
  signerName: string | null;
  authorName: string | null;

  lines: SaleDocumentPdfLine[];

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

/** Mappe une ligne du RPC `sale_document_pdf_data`. */
export function mapSaleDocumentPdfRow(
  row: Record<string, unknown>,
  opts?: { currencyCode?: string | null },
): SaleDocumentPdfData {
  const rawLines = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : [];
  return {
    documentId: String(row.document_id ?? ""),
    kind: row.kind === "quote" ? "quote" : "invoice",
    number: String(row.number ?? ""),
    status: String(row.status ?? "draft") as SaleDocumentStatus,

    issueDate: String(row.issue_date ?? ""),
    validUntil: row.valid_until == null ? null : String(row.valid_until),
    dueDate: row.due_date == null ? null : String(row.due_date),

    customerName: String(row.customer_name ?? ""),
    customerPhone: str(row.customer_phone),
    customerEmail: str(row.customer_email),
    customerAddress: str(row.customer_address),
    customerTaxId: str(row.customer_tax_id),

    subject: str(row.subject),
    clientReference: str(row.client_reference),

    subtotal: num(row.subtotal),
    discount: num(row.discount),
    taxRate: num(row.tax_rate),
    tax: num(row.tax),
    total: num(row.total),
    paidAmount: num(row.paid_amount),

    notes: str(row.notes),
    terms: str(row.terms),
    sourceDocumentNumber: str(row.source_document_number),

    companyName: String(row.company_name ?? ""),
    storeName: String(row.store_name ?? ""),
    storeAddress: str(row.store_address),
    storePhone: str(row.store_phone),
    storeLogoUrl: str(row.store_logo_url),
    storeSlogan: str(row.store_slogan),
    storeActivity: str(row.store_activity),
    storeFooterText: str(row.store_footer_text),
    storeLegalInfo: str(row.store_legal_info),
    storeTaxNumber: str(row.store_tax_number),
    storePaymentTerms: str(row.store_payment_terms),
    storePrimaryColor: str(row.store_primary_color),
    signerTitle: str(row.signer_title),
    signerName: str(row.signer_name),
    authorName: str(row.author_name),

    lines: rawLines.map((l) => ({
      label: String(l.label ?? ""),
      description: str(l.description),
      unit: String(l.unit ?? "u"),
      quantity: num(l.quantity),
      unitPrice: num(l.unit_price),
      discountPercent: num(l.discount_percent),
      total: num(l.total),
    })),

    currencyCode: opts?.currencyCode ?? str(row.store_currency),
  };
}

/** Devise à imprimer : réglage actif du navigateur, sinon celui de la boutique. */
export function activeCurrencyForSaleDocument(): string | null {
  return getActiveCurrency();
}
