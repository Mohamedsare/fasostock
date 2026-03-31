import type { Store } from "@/lib/features/stores/types";
import type { InvoiceA4Data, InvoiceLineData, InvoicePaymentLineData } from "./invoice-a4-types";

export function buildInvoiceA4Data(params: {
  store: Store;
  saleNumber: string;
  date: Date;
  lines: Array<{
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  /** Montant encaissé si pas de [paymentLines] (rétrocompat). */
  depositAmount?: number | null;
  paymentLines?: InvoicePaymentLineData[] | null;
  logoBytes?: Uint8Array | null;
  amountInWords?: string | null;
}): InvoiceA4Data {
  const items: InvoiceLineData[] = params.lines.map((c) => ({
    description: c.name,
    quantity: Math.trunc(c.quantity),
    unit: c.unit || "u",
    unitPrice: c.unitPrice,
    total: c.quantity * c.unitPrice,
  }));
  return {
    store: params.store,
    saleNumber: params.saleNumber,
    date: params.date,
    items,
    subtotal: params.subtotal,
    discount: params.discount,
    tax: params.tax,
    total: params.total,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    customerAddress: params.customerAddress,
    depositAmount: params.depositAmount ?? null,
    paymentLines: params.paymentLines ?? null,
    logoBytes: params.logoBytes ?? null,
    amountInWords: params.amountInWords ?? null,
  };
}
