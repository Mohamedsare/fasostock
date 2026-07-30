import type { Store } from "@/lib/features/stores/types";
import type { SaleItem } from "@/lib/features/sales/types";
import { buildInvoiceA4Data } from "./build-invoice-a4-data";
import type { InvoiceA4Data } from "./invoice-a4-types";
import { paymentLinesFromSalePayments } from "./invoice-a4-payment-lines";

type SaleDetailRow = SaleItem & {
  sale_items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
    total: number;
    product?: { id: string; name: string; sku: string | null; unit: string } | null;
  }>;
  sale_payments: Array<{
    id: string;
    method: string;
    amount: number;
    reference: string | null;
  }>;
};

/** Échéance crédit « 31/08/2026 » — même format que le ticket thermique. */
export function creditDueLabelFromIso(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function buildInvoiceA4FromSaleDetail(
  sale: SaleDetailRow,
  store: Store,
  logoBytes: Uint8Array | null,
): InvoiceA4Data {
  const lines = (sale.sale_items ?? []).map((it) => ({
    name: it.product?.name ?? "—",
    quantity: it.quantity,
    unit: it.product?.unit ?? "u",
    unitPrice: it.unit_price,
  }));
  const payLines = paymentLinesFromSalePayments(sale.sale_payments ?? []);
  const depositFallback =
    payLines.length === 0
      ? (sale.sale_payments ?? []).reduce((s, p) => s + p.amount, 0)
      : null;
  return buildInvoiceA4Data({
    store,
    saleNumber: sale.sale_number,
    date: new Date(sale.created_at),
    lines,
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    customerName: sale.customer?.name,
    customerPhone: sale.customer?.phone,
    customerAddress: null,
    depositAmount: depositFallback,
    paymentLines: payLines.length > 0 ? payLines : null,
    creditDueLabel: creditDueLabelFromIso(sale.credit_due_at),
    logoBytes,
  });
}
