import type { InvoiceA4Data } from "@/lib/features/invoices/invoice-a4-types";
import type { ReportsPageData } from "@/lib/features/dashboard/types";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";

export function parseInvoiceA4Payload(json: unknown): InvoiceA4Data {
  if (!json || typeof json !== "object") throw new Error("Corps JSON invalide");
  const o = json as Record<string, unknown>;
  const ds = o.date;
  const date = new Date(typeof ds === "string" ? ds : String(ds));
  if (Number.isNaN(date.getTime())) throw new Error("date invalide");
  let logoBytes: Uint8Array | null = null;
  const lb = o.logoBytes;
  if (typeof lb === "string" && lb.length > 0) {
    logoBytes = Uint8Array.from(Buffer.from(lb, "base64"));
  }
  const { date: _d, logoBytes: _l, ...rest } = o;
  return {
    ...(rest as Omit<InvoiceA4Data, "date" | "logoBytes">),
    date,
    logoBytes,
  };
}

export function parseReceiptThermalPayload(json: unknown): ReceiptTicketData {
  if (!json || typeof json !== "object") throw new Error("Corps JSON invalide");
  const o = json as Record<string, unknown>;
  const date = new Date(typeof o.date === "string" ? o.date : String(o.date));
  if (Number.isNaN(date.getTime())) throw new Error("date invalide");
  const { date: _d, ...rest } = o;
  return { ...(rest as Omit<ReceiptTicketData, "date">), date };
}

export function parseReportsPayload(json: unknown): {
  data: ReportsPageData;
  meta: { title: string; subtitle: string };
} {
  if (!json || typeof json !== "object") throw new Error("Corps JSON invalide");
  const o = json as Record<string, unknown>;
  if (!o.data || typeof o.data !== "object") throw new Error("data manquant");
  if (!o.meta || typeof o.meta !== "object") throw new Error("meta manquant");
  const meta = o.meta as { title?: unknown; subtitle?: unknown };
  return {
    data: o.data as ReportsPageData,
    meta: {
      title: String(meta.title ?? ""),
      subtitle: String(meta.subtitle ?? ""),
    },
  };
}
