/** Aligné sur `ReceiptTicketData` Flutter (`receipt_ticket_dialog.dart`). */
export type ReceiptTicketItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type ReceiptTicketData = {
  storeName: string;
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
};
