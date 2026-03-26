import { formatCurrencyFlutter } from "@/lib/utils/currency";
import type { ReceiptTicketData } from "./receipt-ticket-types";

/** Écran : `ReceiptTicketWidget` (Flutter). */
export const RECEIPT_SCREEN_MAX_NAME_LEN = 20;
/** PDF thermique : `ReceiptThermalPrintService` (Flutter). */
export const RECEIPT_THERMAL_PDF_MAX_NAME_LEN = 22;

/** Ligne pointillée écran (`_dashedLine`). */
export const RECEIPT_SCREEN_DASH_LINE =
  "- - - - - - - - - - - - - - - - - - - -";
/** Ligne PDF thermique (ASCII uniquement — les tirets longs U+2014 ne sont pas dans le subset Noto latin). */
export const RECEIPT_THERMAL_PDF_DASH_LINE =
  "- - - - - - - - - - - - - - - - - - - -";
/** Double ligne avant TOTAL TTC écran uniquement. */
export const RECEIPT_SCREEN_DOUBLE_LINE = "==============================";

export function stripTelPrefix(s: string | null | undefined): string {
  if (!s?.trim()) return "";
  return s.trim().replace(/^Tel\s*:\s*/i, "").trim();
}

export function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}.`;
}

export function formatReceiptDateTime(d: Date): { dateStr: string; timeStr: string } {
  const dateStr = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const timeStr = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return { dateStr, timeStr };
}

export function receiptPaymentLabel(data: ReceiptTicketData): string {
  return data.paymentMethod;
}

export function formatCurrencyReceipt(n: number): string {
  return formatCurrencyFlutter(n);
}
