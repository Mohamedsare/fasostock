"use client";

import type { CreditRepaymentReceiptData } from "./credit-repayment-receipt-types";
import { fetchCreditRepaymentReceiptPdfBlob } from "@/lib/features/pdf/pdf-api-client";

export async function generateCreditRepaymentReceiptPdfBlob(
  data: CreditRepaymentReceiptData,
): Promise<Blob> {
  return fetchCreditRepaymentReceiptPdfBlob(data);
}

export function downloadCreditRepaymentReceiptPdf(
  blob: Blob,
  receiptNumber: string,
): void {
  const name = `recu_remboursement_credit_${receiptNumber.replace(/[^\w.\-]/g, "_")}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
