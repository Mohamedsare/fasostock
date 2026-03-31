import type { InvoicePaymentLineData } from "./invoice-a4-types";

/** Aligné `InvoiceA4PdfService.paymentMethodLabelFr` (Flutter). */
export function invoicePaymentMethodLabelFr(method: string): string {
  switch (method) {
    case "cash":
      return "Espèces";
    case "mobile_money":
      return "Mobile money";
    case "card":
      return "Carte bancaire";
    case "transfer":
      return "Virement";
    case "other":
      return "À crédit";
    default:
      return method;
  }
}

function paymentLineLabel(method: string, reference: string | null | undefined): string {
  const base = invoicePaymentMethodLabelFr(method);
  const ref = reference?.trim();
  if (ref && ref.length > 0 && ref.toLowerCase() !== base.toLowerCase()) {
    return `${base} — ${ref}`;
  }
  return base;
}

/** Aligné `paymentLinesFromSalePayments` (Flutter) — `other` = pas d’encaissement immédiat. */
export function paymentLinesFromSalePayments(
  payments: Array<{ method: string; amount: number; reference?: string | null }>,
): InvoicePaymentLineData[] {
  const out: InvoicePaymentLineData[] = [];
  for (const p of payments) {
    if (p.amount <= 0) continue;
    out.push({
      label: paymentLineLabel(p.method, p.reference ?? null),
      amount: p.amount,
      isImmediateEncaisse: p.method !== "other",
    });
  }
  return out;
}
