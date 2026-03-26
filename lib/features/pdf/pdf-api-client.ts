import type { ReportsPageData } from "@/lib/features/dashboard/types";
import type { InvoiceA4Data } from "@/lib/features/invoices/invoice-a4-types";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function invoicePayloadJson(data: InvoiceA4Data): string {
  return JSON.stringify({
    ...data,
    date: data.date instanceof Date ? data.date.toISOString() : data.date,
    logoBytes:
      data.logoBytes && data.logoBytes.length > 0
        ? uint8ToBase64(data.logoBytes)
        : null,
  });
}

export function receiptPayloadJson(data: ReceiptTicketData): string {
  return JSON.stringify({
    ...data,
    date: data.date instanceof Date ? data.date.toISOString() : data.date,
  });
}

async function postPdf(path: string, body: string): Promise<Blob> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

export async function fetchInvoicePdfBlob(data: InvoiceA4Data): Promise<Blob> {
  return postPdf("/api/pdf/invoice", invoicePayloadJson(data));
}

export async function fetchReceiptThermalPdfBlob(
  data: ReceiptTicketData,
): Promise<Blob> {
  return postPdf("/api/pdf/receipt-thermal", receiptPayloadJson(data));
}

export async function fetchReportsPdfBlob(
  data: ReportsPageData,
  meta: { title: string; subtitle: string },
): Promise<Blob> {
  return postPdf(
    "/api/pdf/reports",
    JSON.stringify({ data, meta }),
  );
}
