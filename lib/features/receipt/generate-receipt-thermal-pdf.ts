"use client";

import type { ReceiptTicketData } from "./receipt-ticket-types";
import { fetchReceiptThermalPdfBlob } from "@/lib/features/pdf/pdf-api-client";

export async function generateReceiptThermalPdfBlob(
  data: ReceiptTicketData,
  opts?: { paperWidthMm?: 58 | 80 },
): Promise<Blob> {
  return fetchReceiptThermalPdfBlob(data, opts);
}
