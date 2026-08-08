import type {
  ReceiptTicketData,
  ReceiptTicketItem,
} from "./receipt-ticket-types";
import type { Store } from "@/lib/features/stores/types";
import {
  mobileMoneyProviderLabel,
  salePaymentsLabel,
  type MobileMoneyProvider,
} from "@/lib/features/payments/payment-display";

/** `credit` = vente à crédit en caisse rapide (réglage entreprise, cf. `quick-pos-credit.ts`). */
export type QuickPaymentMethod = "cash" | "mobile_money" | "card" | "credit";

export type PosReceiptSnap = {
  cart: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    /** Total exact de la ligne (conditionnement) ; sinon qté × PU. */
    lineTotal?: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  quickPayment: QuickPaymentMethod;
  /** Mobile money : opérateur choisi en caisse — imprimé tel quel sur le ticket. */
  mobileProvider?: MobileMoneyProvider | null;
  amountReceivedValue: number;
  change: number;
  /** Client associé à la vente (facultatif au comptant, obligatoire à crédit). */
  customerName?: string | null;
  /** Vente à crédit : acompte encaissé au comptoir. */
  creditPaid?: number;
  /** Vente à crédit : reste dû (total − acompte). */
  creditRemaining?: number;
  /** Vente à crédit : échéance formatée (ex. « 31/08/2026 »), si saisie. */
  creditDueLabel?: string | null;
};

function quickPaymentLabel(
  m: QuickPaymentMethod,
  provider?: MobileMoneyProvider | null,
): string {
  if (m === "cash") return "Espèces";
  if (m === "card") return "Carte";
  if (m === "credit") return "À crédit";
  return provider ? mobileMoneyProviderLabel(provider) : "Mobile money";
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
  sale_payments: Array<{ method: string; reference?: string | null }>;
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
    // Réimpression : l'opérateur mobile money est relu depuis la référence du paiement.
    paymentMethod: salePaymentsLabel(sale.sale_payments, { includeCredit: true }),
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
    total: c.lineTotal ?? c.quantity * c.unitPrice,
  }));

  const isCash = snap.quickPayment === "cash";
  const ar = isCash ? snap.amountReceivedValue : 0;
  const showMoney = isCash && ar > 0;
  const isCredit = snap.quickPayment === "credit";

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
    paymentMethod: quickPaymentLabel(snap.quickPayment, snap.mobileProvider),
    amountReceived: showMoney ? ar : null,
    change: showMoney && snap.change >= 0 ? snap.change : null,
    date,
    customerName: snap.customerName ?? null,
    customerPhone: null,
    creditPaid: isCredit ? (snap.creditPaid ?? 0) : null,
    creditRemaining: isCredit ? (snap.creditRemaining ?? 0) : null,
    creditDueLabel: isCredit ? (snap.creditDueLabel ?? null) : null,
  };
}
