import type {
  ReceiptTicketData,
  ReceiptTicketItem,
} from "./receipt-ticket-types";
import type { Store } from "@/lib/features/stores/types";

export type QuickPaymentMethod = "cash" | "mobile_money" | "card";

export type PosReceiptSnap = {
  cart: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  quickPayment: QuickPaymentMethod;
  amountReceivedValue: number;
  change: number;
};

function quickPaymentLabel(m: QuickPaymentMethod): string {
  if (m === "cash") return "Espèces";
  if (m === "card") return "Carte";
  return "Mobile money";
}

/** Aligné sur `_paymentLabels` / `_reprintReceipt` (Flutter `sale_detail_dialog.dart`). */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile money",
  card: "Carte",
  transfer: "Virement",
  other: "Autre",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export function paymentMethodsLabel(
  payments: Array<{ method: string }>,
): string {
  if (!payments.length) return "—";
  const labels = [
    ...new Set(
      payments.map((p) => paymentMethodLabel(p.method)),
    ),
  ];
  return labels.join(", ");
}

type SaleLikeForReceipt = {
  sale_number: string;
  created_at: string;
  subtotal: number;
  discount: number;
  total: number;
  sale_items: Array<{
    quantity: number;
    unit_price: number;
    total: number;
    product?: { name: string | null } | null;
  }>;
  sale_payments: Array<{ method: string }>;
  customer?: { name: string | null; phone: string | null } | null;
};

/** Réimpression historique — comme `ReceiptTicketData` dans `_reprintReceipt` (Flutter). */
export function buildReceiptTicketDataFromSale(
  store: Store,
  sale: SaleLikeForReceipt,
  saleId?: string | null,
): ReceiptTicketData {
  const items: ReceiptTicketItem[] = sale.sale_items.map((it) => ({
    name: it.product?.name ?? "—",
    quantity: it.quantity,
    unitPrice: it.unit_price,
    total: it.total,
  }));
  return {
    storeName: store.name,
    storeLogoUrl: store.logo_url ?? null,
    storeAddress: store.address ?? null,
    storePhone: store.phone ?? null,
    saleNumber: sale.sale_number,
    saleId: saleId ?? null,
    items,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    paymentMethod: paymentMethodsLabel(sale.sale_payments),
    amountReceived: null,
    change: null,
    date: new Date(sale.created_at),
    customerName: sale.customer?.name ?? null,
    customerPhone: sale.customer?.phone ?? null,
  };
}

export function buildReceiptTicketData(
  store: Store,
  saleNumber: string,
  snap: PosReceiptSnap,
  date: Date,
  saleId?: string | null,
): ReceiptTicketData {
  const items: ReceiptTicketItem[] = snap.cart.map((c) => ({
    name: c.name,
    quantity: c.quantity,
    unitPrice: c.unitPrice,
    total: c.quantity * c.unitPrice,
  }));

  const isCash = snap.quickPayment === "cash";
  const ar = isCash ? snap.amountReceivedValue : 0;
  const showMoney = isCash && ar > 0;

  return {
    storeName: store.name,
    storeLogoUrl: store.logo_url ?? null,
    storeAddress: store.address ?? null,
    storePhone: store.phone ?? null,
    saleNumber,
    saleId: saleId ?? null,
    items,
    subtotal: snap.subtotal,
    discount: snap.discount,
    total: snap.total,
    paymentMethod: quickPaymentLabel(snap.quickPayment),
    amountReceived: showMoney ? ar : null,
    change: showMoney && snap.change >= 0 ? snap.change : null,
    date,
    customerName: null,
    customerPhone: null,
  };
}
