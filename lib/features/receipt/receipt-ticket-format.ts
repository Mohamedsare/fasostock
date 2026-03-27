import { formatCurrencyFlutter } from "@/lib/utils/currency";
import type { ReceiptTicketData } from "./receipt-ticket-types";

/** Aligné sur `ReceiptTicketLayout` Flutter (`receipt_ticket_layout.dart`). */
export const RECEIPT_SEP_LONG =
  "------------------------------------------";
export const RECEIPT_SEP_MID = "--------------------------------";
export const RECEIPT_SEP_TOTAL = "--------------------------------";

/** @deprecated utiliser RECEIPT_SEP_LONG */
export const RECEIPT_SCREEN_DASH_LINE = RECEIPT_SEP_LONG;
export const RECEIPT_THERMAL_PDF_DASH_LINE = RECEIPT_SEP_LONG;

/** @deprecated — l’écran utilise RECEIPT_SEP_TOTAL avant le TOTAL (Flutter). */
export const RECEIPT_SCREEN_DOUBLE_LINE = "==============================";

export const RECEIPT_THERMAL_PDF_MAX_NAME_LEN = 22;
export const RECEIPT_SCREEN_MAX_NAME_LEN = 20;

export function stripTelPrefix(s: string | null | undefined): string {
  if (!s?.trim()) return "";
  return s.trim().replace(/^Tel\s*:\s*/i, "").trim();
}

export function telLine(storePhone: string | null | undefined): string {
  const p = stripTelPrefix(storePhone);
  if (!p) return "";
  return `Tel: ${p}`;
}

export function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}.`;
}

export function formatDateStrFr(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatTimeStrFr(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function metaFactureDateHeureLine(saleNumber: string, d: Date): string {
  return `Facture ${saleNumber} ${formatDateStrFr(d)} ${formatTimeStrFr(d)}`;
}

export function formatReceiptDateTime(d: Date): {
  dateStr: string;
  timeStr: string;
} {
  return { dateStr: formatDateStrFr(d), timeStr: formatTimeStrFr(d) };
}

/** Équivalent `ReceiptTicketLayout.intAmount` (Flutter). */
export function receiptIntAmount(n: number): string {
  return `${Math.round(Number.isFinite(n) ? n : 0)} CFA`;
}

export function paymentUppercase(method: string): string {
  const t = method.trim().toLowerCase();
  if (t.includes("esp")) return "ESPECES";
  if (t.includes("carte") || t === "card") return "CARTE";
  if (t.includes("mobile") || t.includes("money")) return "MOBILE MONEY";
  if (t.includes("virement") || t.includes("transfer")) return "VIREMENT";
  return method.trim().toUpperCase();
}

export function headerMonoLine(): string {
  const n = "Produit".padEnd(13);
  const q = "Qté".padStart(2);
  const p = "PU(CFA)".padStart(12);
  const t = "Total".padStart(12);
  return `${n} ${q} ${p} ${t}`;
}

export function productNumericLine(
  qty: number,
  pu: number,
  lineTotal: number,
): string {
  const q = String(qty).padStart(2);
  const p = String(Math.round(pu)).padStart(12);
  const t = String(Math.round(lineTotal)).padStart(12);
  return `${q} ${p} ${t}`;
}

export function receiptPaymentLabel(data: ReceiptTicketData): string {
  return data.paymentMethod;
}

/** Montants ailleurs (PDF A4, etc.) — FCFA avec espaces insécables. */
export function formatCurrencyReceipt(n: number): string {
  return formatCurrencyFlutter(n);
}

function formatQrDateTimeLine(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

/** Même contenu que `ReceiptTicketData.buildQrPayload` (Flutter). */
export function buildReceiptQrPayload(data: ReceiptTicketData): string {
  const lines = [
    "FASOSTOCK",
    `Ticket: ${data.saleNumber}`,
    `Total: ${receiptIntAmount(data.total)}`,
    formatQrDateTimeLine(data.date),
  ];
  if (data.saleId?.trim()) {
    lines.push(`id:${data.saleId.trim()}`);
  }
  return lines.join("\n");
}
