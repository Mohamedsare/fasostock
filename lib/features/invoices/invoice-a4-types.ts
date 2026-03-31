import type { Store } from "@/lib/features/stores/types";

export type InvoiceLineData = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

/** Une ligne de règlement — `InvoicePaymentLineData` (Flutter). */
export type InvoicePaymentLineData = {
  label: string;
  amount: number;
  /** Espèces, mobile money, etc. `false` = crédit (`other`). */
  isImmediateEncaisse: boolean;
};

/** Données pour générer une facture A4 (équivalent `InvoiceA4Data` Flutter). */
export type InvoiceA4Data = {
  store: Store;
  saleNumber: string;
  date: Date;
  items: InvoiceLineData[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  /** Ancien mode si [paymentLines] absent : montant encaissé agrégé. */
  depositAmount?: number | null;
  /** Détail paiements : encaisse partiel, crédit, etc. */
  paymentLines?: InvoicePaymentLineData[] | null;
  amountInWords?: string | null;
  logoBytes?: Uint8Array | null;
};
