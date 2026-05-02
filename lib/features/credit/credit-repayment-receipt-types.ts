export type CreditRepaymentReceiptData = {
  companyId: string;
  storeId: string;
  customerId: string;
  creditId: string;
  paymentId?: string | null;
  receiptNumber: string;
  issuedAt: Date;
  storeName: string;
  storeLogoUrl?: string | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  customerName: string;
  customerPhone?: string | null;
  creditTitle: string;
  paymentMethodLabel: string;
  paymentMethodCode: "cash" | "mobile_money" | "card" | "transfer";
  paymentReference?: string | null;
  amountPaid: number;
  /** Espèces uniquement : montant réellement remis si billet > solde (sinon null). */
  amountTendered?: number | null;
  /** Espèces uniquement : monnaie à rendre (affichée sur le reçu). */
  changeDue?: number | null;
  previousBalance: number;
  newBalance: number;
  currency: string;
  dueAt?: Date | null;
  note?: string | null;
  settled: boolean;
};
