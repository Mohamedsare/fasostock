/** Aligné sur `ReceiptTicketData` Flutter (`receipt_ticket_dialog.dart`). */
export type ReceiptTicketItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type ReceiptTicketData = {
  storeName: string;
  /** `stores.logo_url` — centré en tête (Flutter `ReceiptTicketData.storeLogoUrl`). */
  storeLogoUrl?: string | null;
  storeAddress: string | null;
  storePhone: string | null;
  saleNumber: string;
  /** UUID vente (QR / traçabilité) — aligné Flutter `ReceiptTicketData.saleId`. */
  saleId?: string | null;
  items: ReceiptTicketItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  amountReceived?: number | null;
  change?: number | null;
  date: Date;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Vente à crédit — montant encaissé au comptoir (acompte). */
  creditPaid?: number | null;
  /** Vente à crédit — reste dû par le client (> 0 ⇒ bloc crédit imprimé). */
  creditRemaining?: number | null;
  /** Échéance déjà formatée (ex. « 31/08/2026 ») — évite de transporter une `Date`. */
  creditDueLabel?: string | null;
};
