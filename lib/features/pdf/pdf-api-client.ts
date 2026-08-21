import type { ReportsPageData } from "@/lib/features/dashboard/types";
import type { InvoiceA4Data } from "@/lib/features/invoices/invoice-a4-types";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import type { CreditRepaymentReceiptData } from "@/lib/features/credit/credit-repayment-receipt-types";
import { getActiveCurrency } from "@/lib/utils/currency";

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export type InvoicePdfRequestMeta = {
  saleId?: string | null;
  warehouseDispatchId?: string | null;
  previewOnly?: boolean;
};

export function invoicePayloadJson(
  data: InvoiceA4Data,
  meta?: InvoicePdfRequestMeta,
): string {
  return JSON.stringify({
    ...data,
    date: data.date instanceof Date ? data.date.toISOString() : data.date,
    logoBytes:
      data.logoBytes && data.logoBytes.length > 0
        ? uint8ToBase64(data.logoBytes)
        : null,
    ...(meta?.saleId ? { saleId: meta.saleId } : {}),
    ...(meta?.warehouseDispatchId
      ? { warehouseDispatchId: meta.warehouseDispatchId }
      : {}),
    ...(meta?.previewOnly ? { previewOnly: true } : {}),
  });
}

export function receiptPayloadJson(
  data: ReceiptTicketData,
  opts?: { paperWidthMm?: 58 | 80 },
): string {
  return JSON.stringify({
    ...data,
    date: data.date instanceof Date ? data.date.toISOString() : data.date,
    paperWidthMm: opts?.paperWidthMm === 58 ? 58 : 80,
  });
}

export function creditRepaymentReceiptPayloadJson(
  data: CreditRepaymentReceiptData,
): string {
  return JSON.stringify({
    ...data,
    issuedAt: data.issuedAt instanceof Date ? data.issuedAt.toISOString() : data.issuedAt,
    dueAt: data.dueAt instanceof Date ? data.dueAt.toISOString() : data.dueAt ?? null,
  });
}

async function postPdf(path: string, body: string): Promise<Blob> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try {
      const j = JSON.parse(t) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* texte brut */
    }
    throw new Error(
      msg || `Échec PDF (${res.status})`,
    );
  }
  return res.blob();
}

export async function fetchInvoicePdfBlob(
  data: InvoiceA4Data,
  meta?: InvoicePdfRequestMeta,
): Promise<Blob> {
  return postPdf("/api/pdf/invoice", invoicePayloadJson(data, meta));
}

export async function fetchReceiptThermalPdfBlob(
  data: ReceiptTicketData,
  opts?: { paperWidthMm?: 58 | 80 },
): Promise<Blob> {
  return postPdf("/api/pdf/receipt-thermal", receiptPayloadJson(data, opts));
}

export async function fetchReportsPdfBlob(
  data: ReportsPageData,
  meta: { title: string; subtitle: string },
  scope: { companyId: string } | { asPlatformAdmin: true },
): Promise<Blob> {
  // Le serveur n'a pas de devise ambiante : on la joint au document.
  const metaWithCurrency = { ...meta, currencyCode: getActiveCurrency() };
  const payload =
    "asPlatformAdmin" in scope
      ? { data, meta: metaWithCurrency, companyId: null, asPlatformAdmin: true as const }
      : {
          data,
          meta: metaWithCurrency,
          companyId: scope.companyId,
          asPlatformAdmin: false as const,
        };
  return postPdf("/api/pdf/reports", JSON.stringify(payload));
}

export async function fetchCreditRepaymentReceiptPdfBlob(
  data: CreditRepaymentReceiptData,
): Promise<Blob> {
  return postPdf(
    "/api/pdf/credit-repayment-receipt",
    creditRepaymentReceiptPayloadJson(data),
  );
}

/**
 * Devis / facture A4 du module « Devis & Factures ».
 *
 * Seul l'identifiant part : le serveur relit lignes et montants de la base. La devise
 * accompagne la demande — le rendu PDF est partagé entre requêtes et n'en a aucune.
 */
export async function fetchSaleDocumentPdfBlob(documentId: string): Promise<Blob> {
  return postPdf(
    "/api/pdf/sale-document",
    JSON.stringify({ documentId, currencyCode: getActiveCurrency() }),
  );
}

export async function fetchSubscriptionInvoicePdfBlob(
  requestId: string,
): Promise<Blob> {
  return postPdf("/api/pdf/subscription-invoice", JSON.stringify({ requestId }));
}

/**
 * Feuille de vérification des conditionnements. Les lignes partent telles qu'elles
 * sont affichées (filtres compris) : le document doit montrer ce que l'utilisateur
 * avait sous les yeux, pas une autre lecture de la base.
 */
export async function fetchPackagingsPdfBlob(data: {
  companyId: string;
  companyName: string;
  companyLogoUrl?: string | null;
  storeName: string;
  scopeLabel: string;
  items: unknown[];
}): Promise<Blob> {
  return postPdf(
    "/api/pdf/packagings",
    JSON.stringify({
      ...data,
      generatedAtIso: new Date().toISOString(),
      // Le rendu serveur est partagé entre requêtes : il n'a aucune devise ambiante.
      currencyCode: getActiveCurrency(),
    }),
  );
}

export async function fetchStoreProductsPdfBlob(data: {
  companyId: string;
  storeId?: string | null;
  companyName: string;
  companyLogoUrl?: string | null;
  storeName: string;
  generatedAtIso: string;
  items: Array<{ name: string; imageUrl: string | null }>;
}): Promise<Blob> {
  return postPdf("/api/pdf/store-products", JSON.stringify(data));
}
