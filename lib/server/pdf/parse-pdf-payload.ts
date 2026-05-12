import type { InvoiceA4Data } from "@/lib/features/invoices/invoice-a4-types";
import type { ReportsPageData } from "@/lib/features/dashboard/types";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import type { CreditRepaymentReceiptData } from "@/lib/features/credit/credit-repayment-receipt-types";

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

export function parseReceiptThermalPaperWidth(json: unknown): 58 | 80 {
  if (!json || typeof json !== "object") return 80;
  const o = json as Record<string, unknown>;
  return o.paperWidthMm === 58 ? 58 : 80;
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

/** Corps route PDF rapports : périmètre entreprise ou export super admin. */
export function parseReportsPdfRouteBody(json: unknown): {
  data: ReportsPageData;
  meta: { title: string; subtitle: string };
  companyId: string | null;
  asPlatformAdmin: boolean;
} {
  const base = parseReportsPayload(json);
  const o = json as Record<string, unknown>;
  const asPlatformAdmin = o.asPlatformAdmin === true;
  const raw = o.companyId;
  const companyId =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  return { ...base, companyId, asPlatformAdmin };
}

export function parseCreditRepaymentReceiptPayload(
  json: unknown,
): CreditRepaymentReceiptData {
  if (!json || typeof json !== "object") {
    throw new Error("Corps JSON invalide");
  }
  const o = json as Record<string, unknown>;
  const issuedAt = new Date(
    typeof o.issuedAt === "string" ? o.issuedAt : String(o.issuedAt),
  );
  if (Number.isNaN(issuedAt.getTime())) throw new Error("issuedAt invalide");
  let dueAt: Date | null = null;
  if (typeof o.dueAt === "string" && o.dueAt.trim()) {
    const d = new Date(o.dueAt);
    if (!Number.isNaN(d.getTime())) dueAt = d;
  }
  const { issuedAt: _i, dueAt: _d, ...rest } = o;
  const base = rest as Omit<CreditRepaymentReceiptData, "issuedAt" | "dueAt">;
  const cn =
    typeof base.companyName === "string" && base.companyName.trim().length > 0
      ? base.companyName.trim()
      : typeof base.storeName === "string" && base.storeName.trim().length > 0
        ? base.storeName.trim()
        : "Entreprise";
  return {
    ...base,
    companyName: cn,
    issuedAt,
    dueAt,
  };
}
